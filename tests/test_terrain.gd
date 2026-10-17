extends TestCase

var doc: MapDocument


func before_each() -> void:
	doc = MapDocument.new()


func _apply(ops: Array[Dictionary]) -> void:
	for op in ops:
		doc.apply_op(op)


func test_untouched_terrain_is_implicit() -> void:
	check_eq(TerrainEdit.height_at(doc, 1000, -1000), 0.0)
	check_eq(doc.terrain.size(), 0)


func test_interior_sample_touches_one_chunk() -> void:
	var ops := TerrainEdit.height_ops(doc, Rect2i(5, 5, 1, 1), func(_x, _z, _o): return 2.0)
	check_eq(ops.size(), 1)
	_apply(ops)
	check_eq(TerrainEdit.height_at(doc, 5, 5), 2.0)


func test_corner_sample_written_to_all_four_chunks() -> void:
	var ops := TerrainEdit.height_ops(doc, Rect2i(32, 32, 1, 1), func(_x, _z, _o): return 3.0)
	check_eq(ops.size(), 4)
	_apply(ops)
	var n := TerrainChunk.SAMPLES
	check_eq(doc.terrain[Vector2i(0, 0)].heights[n * n - 1], 3.0)
	check_eq(doc.terrain[Vector2i(1, 1)].heights[0], 3.0)
	check_eq(doc.terrain[Vector2i(0, 1)].heights[32], 3.0)
	check_eq(doc.terrain[Vector2i(1, 0)].heights[32 * n], 3.0)


func test_negative_border_samples() -> void:
	_apply(TerrainEdit.height_ops(doc, Rect2i(-32, 0, 1, 1), func(_x, _z, _o): return 1.0))
	check_eq(TerrainEdit.height_at(doc, -32, 0), 1.0)
	check(doc.terrain.has(Vector2i(-1, 0)))
	check(doc.terrain.has(Vector2i(-2, 0)))


func test_unchanged_values_produce_no_ops() -> void:
	check(TerrainEdit.height_ops(doc, Rect2i(0, 0, 4, 4), func(_x, _z, o): return o).is_empty())


func test_chunk_dropped_when_back_to_default() -> void:
	_apply(TerrainEdit.height_ops(doc, Rect2i(5, 5, 1, 1), func(_x, _z, _o): return 2.0))
	check_eq(doc.terrain.size(), 1)
	_apply(TerrainEdit.height_ops(doc, Rect2i(5, 5, 1, 1), func(_x, _z, _o): return 0.0))
	check_eq(doc.terrain.size(), 0)


func test_material_paint_across_chunks() -> void:
	_apply(TerrainEdit.material_ops(doc, Rect2i(30, 0, 4, 1), func(_x, _z, _o): return 7))
	check_eq(doc.terrain.size(), 2)
	for x in range(30, 34):
		check_eq(TerrainEdit.material_at(doc, x, 0), 7)
	check_eq(TerrainEdit.material_at(doc, 34, 0), 0)


func test_terrain_op_records_prev() -> void:
	_apply(TerrainEdit.height_ops(doc, Rect2i(1, 1, 2, 1), func(_x, _z, _o): return 1.0))
	var ops := TerrainEdit.height_ops(doc, Rect2i(1, 1, 2, 1), func(x, _z, _o): return float(x) * 2.0)
	var applied := doc.apply_op(ops[0])
	check_eq(applied.prev, PackedFloat32Array([1.0, 1.0]))
	check_eq(TerrainEdit.height_at(doc, 2, 1), 4.0)


func test_invalid_rect_rejected() -> void:
	var bad := Ops.terrain(Vector2i.ZERO, TerrainChunk.MATERIAL, Rect2i(31, 0, 2, 1), PackedByteArray([1, 1]))
	check(doc.apply_op(bad).is_empty())
