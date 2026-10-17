class_name TerrainView
extends Node3D
## Renders edited terrain: one mesh per stored TerrainChunk (the flat Ground plane covers the
## rest). Terrain ops mark the chunk and its neighbours dirty (normals and material borders read
## across edges); dirty chunks rebuild once per frame.

signal chunks_changed(chunks: Array[Vector2i])

const SHADER := preload("res://src/render/shaders/terrain.gdshader")
const N := TerrainChunk.SIZE

var doc: MapDocument
var show_grid := true:
	set(v):
		show_grid = v
		for m: MeshInstance3D in _meshes.values():
			(m.material_override as ShaderMaterial).set_shader_parameter("show_grid", v)

var _meshes: Dictionary[Vector2i, MeshInstance3D] = {}
var _dirty := {}
var _keys_changed := false


func bind(p_doc: MapDocument) -> void:
	if doc != null:
		doc.changed.disconnect(_on_changed)
		doc.reset.disconnect(rebuild)
	doc = p_doc
	doc.changed.connect(_on_changed)
	doc.reset.connect(rebuild)
	rebuild()


func rebuild() -> void:
	for m in _meshes.values():
		m.queue_free()
	_meshes.clear()
	_dirty.clear()
	for c in doc.terrain:
		_dirty[c] = true
	_keys_changed = true
	_flush()


func _process(_delta: float) -> void:
	_flush()


func _on_changed(op: Dictionary) -> void:
	if op.op != Ops.TERRAIN:
		return
	for dz in range(-1, 2):
		for dx in range(-1, 2):
			_dirty[op.chunk + Vector2i(dx, dz)] = true
	_keys_changed = true


func _flush() -> void:
	for c: Vector2i in _dirty:
		var chunk: TerrainChunk = doc.terrain.get(c)
		if chunk == null:
			if _meshes.has(c):
				_meshes[c].queue_free()
				_meshes.erase(c)
		else:
			_build(chunk)
	_dirty.clear()
	if _keys_changed:
		_keys_changed = false
		var keys: Array[Vector2i] = []
		keys.assign(doc.terrain.keys())
		chunks_changed.emit(keys)


func _build(chunk: TerrainChunk) -> void:
	var mi: MeshInstance3D = _meshes.get(chunk.coord)
	if mi == null:
		mi = MeshInstance3D.new()
		mi.name = "Terrain_%d_%d" % [chunk.coord.x, chunk.coord.y]
		mi.position = Vector3(chunk.coord.x, 0, chunk.coord.y) * N
		var mat := ShaderMaterial.new()
		mat.shader = SHADER
		mat.set_shader_parameter("palette", TerrainPalette.texture())
		mat.set_shader_parameter("chunk_origin", Vector2(chunk.coord) * N)
		mat.set_shader_parameter("cliff_material", TerrainPalette.CLIFF)
		mat.set_shader_parameter("show_grid", show_grid)
		mi.material_override = mat
		add_child(mi)
		_meshes[chunk.coord] = mi
	mi.mesh = build_mesh(doc, chunk)
	(mi.material_override as ShaderMaterial).set_shader_parameter("materials", _material_texture(chunk.coord))


## Heightfield mesh for a chunk in chunk-local coordinates; normals use neighbouring chunks.
static func build_mesh(p_doc: MapDocument, chunk: TerrainChunk) -> ArrayMesh:
	var s := TerrainChunk.SAMPLES
	var base := chunk.coord * N
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	verts.resize(s * s)
	normals.resize(s * s)
	for z in s:
		for x in s:
			var i := z * s + x
			verts[i] = Vector3(x, chunk.heights[i], z)
			var wx := base.x + x
			var wz := base.y + z
			var dx := TerrainEdit.height_at(p_doc, wx + 1, wz) - TerrainEdit.height_at(p_doc, wx - 1, wz)
			var dz := TerrainEdit.height_at(p_doc, wx, wz + 1) - TerrainEdit.height_at(p_doc, wx, wz - 1)
			normals[i] = Vector3(-dx, 2.0, -dz).normalized()
	var indices := PackedInt32Array()
	indices.resize(N * N * 6)
	var k := 0
	for z in N:
		for x in N:
			var a := z * s + x
			var b := a + 1
			var c := a + s
			var d := c + 1
			for idx in [a, b, c, b, d, c]:
				indices[k] = idx
				k += 1
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh


## (N+2)^2 material indices: this chunk's cells plus a one-cell border from its neighbours.
func _material_texture(coord: Vector2i) -> ImageTexture:
	var img := Image.create(N + 2, N + 2, false, Image.FORMAT_R8)
	var base := coord * N
	for z in range(-1, N + 1):
		for x in range(-1, N + 1):
			var m := TerrainEdit.material_at(doc, base.x + x, base.y + z)
			if m != 0:
				img.set_pixel(x + 1, z + 1, Color8(m, 0, 0))
	return ImageTexture.create_from_image(img)
