extends TestCase

var doc: MapDocument


func before_each() -> void:
	doc = MapDocument.new()


func test_uuid_format() -> void:
	var a := Uuid.v4()
	check_eq(a.length(), 36)
	check_eq(a[14], "4")
	check_ne(a, Uuid.v4())


func test_settings_object_exists() -> void:
	check(doc.has_object(MapDocument.SETTINGS_ID))
	doc.apply_op(Ops.set_prop(MapDocument.SETTINGS_ID, "time_of_day", 0.5))
	check_eq(doc.get_setting("time_of_day"), 0.5)


func test_create_set_delete_restore() -> void:
	doc.apply_op(Ops.create("a", "prop"))
	var applied := doc.apply_op(Ops.set_prop("a", "position", Vector3(1, 0, 2)))
	check_eq(applied.prev, null)
	applied = doc.apply_op(Ops.set_prop("a", "position", Vector3(5, 0, 5)))
	check_eq(applied.prev, Vector3(1, 0, 2))
	doc.apply_op(Ops.delete("a"))
	check(not doc.has_object("a"))
	check(doc.get_object("a").deleted)
	check_eq(doc.get_prop("a", "position"), Vector3(5, 0, 5), "tombstone keeps props")
	doc.apply_op(Ops.restore("a"))
	check(doc.has_object("a"))


func test_set_null_removes_property() -> void:
	doc.apply_op(Ops.create("a", "prop"))
	doc.apply_op(Ops.set_prop("a", "variant", "red"))
	doc.apply_op(Ops.set_prop("a", "variant", null))
	check(not doc.get_object("a").props.has("variant"))


func test_stored_containers_are_copies() -> void:
	doc.apply_op(Ops.create("w", "water"))
	var poly := [Vector2(0, 0), Vector2(1, 0)]
	doc.apply_op(Ops.set_prop("w", "polygon", poly))
	poly.append(Vector2(9, 9))
	check_eq(doc.get_prop("w", "polygon").size(), 2)


func test_sparse_chunks_for_far_apart_objects() -> void:
	doc.apply_op(Ops.create("a", "prop"))
	doc.apply_op(Ops.set_prop("a", "position", Vector3(1, 0, 1)))
	doc.apply_op(Ops.create("b", "prop"))
	doc.apply_op(Ops.set_prop("b", "position", Vector3(3200, 0, 3200)))
	var chunks := doc.occupied_chunks()
	check_eq(chunks.size(), 2)
	check(Vector2i(0, 0) in chunks)
	check(Vector2i(100, 100) in chunks)


func test_negative_coordinates_chunk() -> void:
	check_eq(MapDocument.chunk_of(Vector3(-0.5, 0, -32.5)), Vector2i(-1, -2))


func test_index_follows_moves_and_deletes() -> void:
	doc.apply_op(Ops.create("a", "prop"))
	doc.apply_op(Ops.set_prop("a", "position", Vector3(1, 0, 1)))
	doc.apply_op(Ops.set_prop("a", "position", Vector3(40, 0, 1)))
	check_eq(doc.objects_in_chunk(Vector2i(0, 0)), [] as Array[String])
	check_eq(doc.objects_in_chunk(Vector2i(1, 0)), ["a"] as Array[String])
	doc.apply_op(Ops.delete("a"))
	check_eq(doc.occupied_chunks().size(), 0)
	doc.apply_op(Ops.restore("a"))
	check_eq(doc.objects_in_chunk(Vector2i(1, 0)), ["a"] as Array[String])


func test_changed_signal() -> void:
	var seen: Array = []
	doc.changed.connect(func(op: Dictionary) -> void: seen.append(op.op))
	doc.apply_op(Ops.create("a", "prop"))
	doc.apply_op(Ops.set_prop("a", "scale", 2.0))
	check_eq(seen, ["create", "set"])


func test_dict_round_trip() -> void:
	doc.apply_op(Ops.create("a", "prop"))
	doc.apply_op(Ops.set_prop("a", "position", Vector3(1.25, 2, -3)))
	doc.apply_op(Ops.set_prop("a", "prop", "core:campfire"))
	for op in TerrainEdit.height_ops(doc, Rect2i(0, 0, 2, 2), func(_x, _z, _o): return 1.5):
		doc.apply_op(op)
	var copy := MapDocument.from_dict(Codec.decode(Codec.encode(doc.to_dict())))
	check_eq(copy.map_id, doc.map_id)
	check(Merge.diff(doc, copy).is_empty(), "round trip changed state")
	check_eq(copy.objects_in_chunk(Vector2i(0, -1)), ["a"] as Array[String])
