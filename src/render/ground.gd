class_name Ground
extends MeshInstance3D
## Implicit terrain: a large flat plane at height 0 that follows the camera focus, drawn with
## the grid shader. Stored (edited) terrain chunks will render on top of it in M4.

const SIZE := 4096.0
const SHADER := preload("res://src/render/shaders/ground.gdshader")

var _material := ShaderMaterial.new()


func _init() -> void:
	name = "Ground"
	var plane := PlaneMesh.new()
	plane.size = Vector2(SIZE, SIZE)
	mesh = plane
	_material.shader = SHADER
	material_override = _material


func set_grid_visible(value: bool) -> void:
	_material.set_shader_parameter("show_grid", value)


## Re-center under `focus`, snapped to whole chunks so nothing visibly shifts.
func follow(focus: Vector3) -> void:
	var step := float(TerrainChunk.SIZE)
	position = Vector3(snappedf(focus.x, step), 0.0, snappedf(focus.z, step))
