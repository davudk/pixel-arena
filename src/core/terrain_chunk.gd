class_name TerrainChunk
extends RefCounted
## One SIZE x SIZE meter square of terrain.
## Heights are sampled on the 1 m grid corners, SAMPLES per side, so samples on a border are
## duplicated in the neighbouring chunk. Materials are one palette index per 1 m cell.
## Chunks that are entirely default (height 0, material 0) are not stored.

const SIZE := 32
const SAMPLES := SIZE + 1
const HEIGHT := "height"
const MATERIAL := "material"

var coord: Vector2i
var heights := PackedFloat32Array()
var materials := PackedByteArray()


func _init(p_coord: Vector2i = Vector2i.ZERO) -> void:
	coord = p_coord
	heights.resize(SAMPLES * SAMPLES)
	materials.resize(SIZE * SIZE)


## Grid width of a layer.
static func side(layer: String) -> int:
	return SAMPLES if layer == HEIGHT else SIZE


static func default_values(layer: String, count: int) -> Variant:
	if layer == HEIGHT:
		var h := PackedFloat32Array()
		h.resize(count)
		return h
	var m := PackedByteArray()
	m.resize(count)
	return m


static func is_valid_rect(layer: String, rect: Rect2i) -> bool:
	if layer != HEIGHT and layer != MATERIAL:
		return false
	var n := side(layer)
	return rect.size.x > 0 and rect.size.y > 0 and Rect2i(0, 0, n, n).encloses(rect)


## Values inside `rect`, row-major.
func read(layer: String, rect: Rect2i) -> Variant:
	var out: Variant = default_values(layer, rect.get_area())
	var src: Variant = heights if layer == HEIGHT else materials
	var n := side(layer)
	var i := 0
	for z in range(rect.position.y, rect.end.y):
		for x in range(rect.position.x, rect.end.x):
			out[i] = src[z * n + x]
			i += 1
	return out


## Writes row-major `values` into `rect` and returns the values that were there before.
func write(layer: String, rect: Rect2i, values: Variant) -> Variant:
	var prev: Variant = read(layer, rect)
	var n := side(layer)
	var i := 0
	for z in range(rect.position.y, rect.end.y):
		for x in range(rect.position.x, rect.end.x):
			if layer == HEIGHT:
				heights[z * n + x] = values[i]
			else:
				materials[z * n + x] = values[i]
			i += 1
	return prev


func is_default() -> bool:
	for h in heights:
		if h != 0.0:
			return false
	for m in materials:
		if m != 0:
			return false
	return true


func to_dict() -> Dictionary:
	return {"coord": coord, "heights": heights, "materials": materials}


static func from_dict(d: Dictionary) -> TerrainChunk:
	var chunk := TerrainChunk.new(d.coord)
	chunk.heights = d.heights
	chunk.materials = d.materials
	return chunk
