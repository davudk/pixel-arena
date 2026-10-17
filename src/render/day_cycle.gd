class_name DayCycle
extends Node3D
## Sun, moon, sky and ambient light driven by a time of day in hours (0-24).
## FIXED holds the time; CYCLE advances it so a full day takes `day_length` seconds.

enum Mode { FIXED, CYCLE }

const SUNRISE_COLOR := Color(1.0, 0.62, 0.38)
const NOON_COLOR := Color(1.0, 0.97, 0.9)
const DAY_SKY_TOP := Color(0.32, 0.55, 0.85)
const DAY_SKY_HORIZON := Color(0.72, 0.82, 0.92)
const DUSK_SKY_HORIZON := Color(0.95, 0.6, 0.4)
const NIGHT_SKY_TOP := Color(0.02, 0.03, 0.08)
const NIGHT_SKY_HORIZON := Color(0.06, 0.08, 0.16)
## Tilt of the sun's path away from straight overhead, so noon shadows still have direction.
const PATH_TILT := deg_to_rad(35.0)

var mode := Mode.FIXED
var time_of_day := 10.0
var day_length := 600.0

var sun: DirectionalLight3D
var moon: DirectionalLight3D
var environment: Environment
var _sky: ProceduralSkyMaterial


func _init() -> void:
	name = "DayCycle"
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL
	sun.shadow_blur = 0.0
	add_child(sun)

	moon = DirectionalLight3D.new()
	moon.name = "Moon"
	moon.light_color = Color(0.55, 0.65, 1.0)
	add_child(moon)

	_sky = ProceduralSkyMaterial.new()
	_sky.sun_angle_max = 10.0
	var sky := Sky.new()
	sky.sky_material = _sky
	environment = Environment.new()
	environment.background_mode = Environment.BG_SKY
	environment.sky = sky
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var world_env := WorldEnvironment.new()
	world_env.name = "WorldEnvironment"
	world_env.environment = environment
	add_child(world_env)


func _ready() -> void:
	apply()


func _process(delta: float) -> void:
	if mode == Mode.CYCLE and day_length > 0.0:
		time_of_day = fposmod(time_of_day + delta * 24.0 / day_length, 24.0)
		apply()


## Shadow range should cover what the camera sees; CameraRig distance changes with zoom.
func set_shadow_distance(distance: float) -> void:
	sun.directional_shadow_max_distance = distance


func apply() -> void:
	# 6:00 sunrise in the east (+X), 12:00 highest, 18:00 sunset in the west.
	var angle := (time_of_day / 24.0 - 0.25) * TAU
	var height := sin(angle)
	var sun_pos := Vector3(cos(angle), height * cos(PATH_TILT), height * sin(PATH_TILT)).normalized()
	sun.transform.basis = Basis.looking_at(-sun_pos, Vector3.UP if absf(sun_pos.y) < 0.99 else Vector3.FORWARD)
	moon.transform.basis = Basis.looking_at(sun_pos, Vector3.UP if absf(sun_pos.y) < 0.99 else Vector3.FORWARD)

	var day := smoothstep(-0.12, 0.2, height)
	var low_sun := 1.0 - smoothstep(0.0, 0.45, absf(height))
	sun.light_energy = day * 1.25
	sun.light_color = NOON_COLOR.lerp(SUNRISE_COLOR, low_sun)
	sun.visible = day > 0.001
	moon.light_energy = (1.0 - day) * 0.45
	moon.visible = day < 0.999

	var horizon := DAY_SKY_HORIZON.lerp(DUSK_SKY_HORIZON, low_sun * day)
	_sky.sky_top_color = NIGHT_SKY_TOP.lerp(DAY_SKY_TOP, day)
	_sky.sky_horizon_color = NIGHT_SKY_HORIZON.lerp(horizon, day)
	_sky.ground_horizon_color = _sky.sky_horizon_color
	_sky.ground_bottom_color = NIGHT_SKY_TOP.lerp(Color(0.2, 0.18, 0.16), day)
	environment.ambient_light_energy = lerpf(0.6, 1.0, day)
