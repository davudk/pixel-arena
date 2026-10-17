class_name CameraRig
extends Node3D
## Orbit camera around a focus point. Orthographic by default, perspective optional.
## `zoom` is the visible world height in meters at the focus point, for both projections.
## Yaw/pitch/zoom ease toward their targets; panning and zooming at the cursor apply instantly
## so the ground stays under the pointer.
##
## In orthographic pixel mode the camera is snapped to the texel grid (see PixelView).

signal moved

const MIN_ZOOM := 4.0
const MAX_ZOOM := 400.0
const MIN_PITCH := deg_to_rad(-89.9)
const MAX_PITCH := deg_to_rad(-8.0)
const ISO_PITCH := -0.6154797  # -atan(1 / sqrt(2)): true isometric
const SMOOTHING := 14.0
const PERSPECTIVE_FOV := 40.0

enum Preset { TOP_DOWN, ISOMETRIC, THREE_QUARTER }

var pixel_view: PixelView
var camera: Camera3D
## (origin, direction) -> Vector3 hit or null. Defaults to the y = 0 plane.
var ground_hit: Callable
var orthographic := true

var focus := Vector3.ZERO
var yaw := deg_to_rad(45.0)
var pitch := ISO_PITCH
var zoom := 40.0

var _yaw_target := yaw
var _pitch_target := pitch
var _zoom_target := zoom


func _init() -> void:
	camera = Camera3D.new()
	camera.name = "Camera"
	camera.fov = PERSPECTIVE_FOV
	add_child(camera)


func _process(delta: float) -> void:
	var k := 1.0 - exp(-delta * SMOOTHING)
	yaw = lerp_angle(yaw, _yaw_target, k)
	pitch = lerpf(pitch, _pitch_target, k)
	zoom = exp(lerpf(log(zoom), log(_zoom_target), k))
	apply()


# --- Controls --------------------------------------------------------------

## Drag the ground: the world point under `from` ends up under `to` (screen positions).
func pan_screen(from: Vector2, to: Vector2) -> void:
	var a: Variant = ground_point(from)
	var b: Variant = ground_point(to)
	if a != null and b != null:
		focus += a - b
		apply()


## Pan by a direction in screen space, scaled by zoom (keyboard / trackpad).
func pan_relative(dir: Vector2) -> void:
	var right := Vector3(cos(yaw), 0, -sin(yaw))
	var forward := Vector3(-sin(yaw), 0, -cos(yaw))
	focus += (right * dir.x - forward * dir.y) * zoom
	apply()


func orbit(d_yaw: float, d_pitch: float) -> void:
	_yaw_target += d_yaw
	_pitch_target = clampf(_pitch_target + d_pitch, MIN_PITCH, MAX_PITCH)
	yaw = _yaw_target
	pitch = _pitch_target
	apply()


## Eased yaw rotation (e.g. 45 degree steps).
func rotate_by(angle: float) -> void:
	_yaw_target += angle


## Multiplies zoom by `factor`, keeping the ground point under `screen_pos` fixed.
func zoom_at(factor: float, screen_pos: Vector2) -> void:
	var before: Variant = ground_point(screen_pos)
	_zoom_target = clampf(_zoom_target * factor, MIN_ZOOM, MAX_ZOOM)
	zoom = _zoom_target
	apply()
	var after: Variant = ground_point(screen_pos)
	if before != null and after != null:
		focus += before - after
		apply()


func set_preset(preset: Preset) -> void:
	match preset:
		Preset.TOP_DOWN:
			_pitch_target = MIN_PITCH
		Preset.ISOMETRIC:
			_pitch_target = ISO_PITCH
			_yaw_target = snappedf(_yaw_target - PI / 4, PI / 2) + PI / 4
		Preset.THREE_QUARTER:
			_pitch_target = deg_to_rad(-55.0)


func set_orthographic(value: bool) -> void:
	orthographic = value
	apply()


# --- Picking ---------------------------------------------------------------

## World-space ray (origin, direction) through a screen position.
func screen_ray(screen_pos: Vector2) -> Array[Vector3]:
	var vp := pixel_view.to_viewport(screen_pos)
	var origin := camera.project_ray_origin(vp)
	var dir := camera.project_ray_normal(vp)
	if orthographic:
		# Ortho rays are parallel: start well behind the near plane so terrain above it still hits.
		origin -= dir * 2000.0
	return [origin, dir]


## Where the ray through `screen_pos` hits the ground (terrain), or null.
func ground_point(screen_pos: Vector2) -> Variant:
	var ray := screen_ray(screen_pos)
	if ground_hit.is_valid():
		return ground_hit.call(ray[0], ray[1])
	return Plane(Vector3.UP, 0.0).intersects_ray(ray[0], ray[1])


# --- Transform -------------------------------------------------------------

func apply() -> void:
	if pixel_view == null:
		return
	var basis := Basis.from_euler(Vector3(pitch, yaw, 0.0))
	var dist: float
	if orthographic:
		camera.projection = Camera3D.PROJECTION_ORTHOGONAL
		camera.size = pixel_view.camera_size_for(zoom)
		dist = zoom * 2.0 + 50.0
		camera.near = 0.5
		camera.far = dist * 2.0 + zoom * 4.0
	else:
		camera.projection = Camera3D.PROJECTION_PERSPECTIVE
		dist = zoom * 0.5 / tan(deg_to_rad(PERSPECTIVE_FOV) * 0.5)
		camera.near = maxf(0.05, dist * 0.01)
		camera.far = dist * 20.0 + 500.0
	var pos := focus + basis.z * dist

	var offset := Vector2.ZERO
	if orthographic and pixel_view.pixel_size > 1:
		# Snap the camera's screen-plane position to whole texels; keep the remainder as an
		# image offset so motion stays smooth while the rendered pixels stay put.
		var t := pixel_view.texel_world_size(camera.size)
		var local := basis.transposed() * pos
		var snapped_local := Vector3(roundf(local.x / t) * t, roundf(local.y / t) * t, local.z)
		var rem := local - snapped_local
		pos = basis * snapped_local
		offset = Vector2(-rem.x / t, rem.y / t)
	pixel_view.subpixel_offset = offset
	camera.transform = Transform3D(basis, pos)
	moved.emit()
