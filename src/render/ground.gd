class_name Ground
extends MeshInstance3D
## Implicit terrain: a large flat plane at height 0 that follows the camera focus, drawn with
## the grid shader. Chunks with edited terrain are cut out of it via a hole mask, so the
## TerrainView chunk meshes show there instead.

const SIZE := 4096.0
## Hole mask covers this many chunks per side, centered on the plane.
const MASK_CHUNKS := 160
const SHADER := preload("res://src/render/shaders/ground.gdshader")

var _material := ShaderMaterial.new()
var _holes: Array[Vector2i] = []
var _center := Vector2i(1 << 30, 0)


func _init() -> void:
	name = "Ground"
	var plane := PlaneMesh.new()
	plane.size = Vector2(SIZE, SIZE)
	mesh = plane
	_material.shader = SHADER
	_material.set_shader_parameter("palette", TerrainPalette.texture())
	material_override = _material


func set_grid_visible(value: bool) -> void:
	_material.set_shader_parameter("show_grid", value)


## Re-center under `focus`, snapped to whole chunks so nothing visibly shifts.
func follow(focus: Vector3) -> void:
	var step := float(TerrainChunk.SIZE)
	position = Vector3(snappedf(focus.x, step), 0.0, snappedf(focus.z, step))
	var center := Vector2i(roundi(position.x / step), roundi(position.z / step))
	if center != _center:
		_center = center
		_update_mask()


## Chunks to cut out (those with edited terrain).
func set_holes(chunks: Array[Vector2i]) -> void:
	_holes = chunks
	_update_mask()


func _update_mask() -> void:
	var origin := _center - Vector2i.ONE * (MASK_CHUNKS / 2)
	var img := Image.create(MASK_CHUNKS, MASK_CHUNKS, false, Image.FORMAT_R8)
	for c in _holes:
		var t := c - origin
		if t.x >= 0 and t.y >= 0 and t.x < MASK_CHUNKS and t.y < MASK_CHUNKS:
			img.set_pixel(t.x, t.y, Color.WHITE)
	_material.set_shader_parameter("hole_mask", ImageTexture.create_from_image(img))
	_material.set_shader_parameter("hole_origin", origin)
