extends TestCase

var s: MapSession


func before_each() -> void:
	s = MapSession.new("", "alice")


func _place(pos: Vector3) -> String:
	s.begin("Place")
	var id := s.create_object("prop", {"prop": "core:tree", "position": pos})
	s.commit()
	return id


func _move(id: String, pos: Vector3) -> void:
	s.edit("Move", func() -> void: s.set_prop(id, "position", pos))


func test_undo_redo_create() -> void:
	var id := _place(Vector3(1, 0, 1))
	check(s.can_undo())
	s.undo()
	check(not s.doc.has_object(id))
	check(s.can_redo())
	s.redo()
	check(s.doc.has_object(id))
	check_eq(s.doc.get_prop(id, "position"), Vector3(1, 0, 1))


func test_undo_multi_op_transaction_as_one_step() -> void:
	var id := _place(Vector3.ZERO)
	s.edit("Several", func() -> void:
		s.set_prop(id, "position", Vector3(1, 0, 0))
		s.set_prop(id, "position", Vector3(2, 0, 0))
		s.set_prop(id, "scale", 3.0))
	s.undo()
	check_eq(s.doc.get_prop(id, "position"), Vector3.ZERO)
	check_eq(s.doc.get_prop(id, "scale"), null)
	s.redo()
	check_eq(s.doc.get_prop(id, "position"), Vector3(2, 0, 0))
	check_eq(s.doc.get_prop(id, "scale"), 3.0)


func test_sequential_undo() -> void:
	var id := _place(Vector3.ZERO)
	_move(id, Vector3(1, 0, 0))
	_move(id, Vector3(2, 0, 0))
	s.undo()
	check_eq(s.doc.get_prop(id, "position"), Vector3(1, 0, 0))
	s.undo()
	check_eq(s.doc.get_prop(id, "position"), Vector3.ZERO)
	s.undo()
	check(not s.doc.has_object(id))
	check(not s.can_undo())
	check(s.undo() == null)


func test_new_edit_clears_redo() -> void:
	var id := _place(Vector3.ZERO)
	_move(id, Vector3(1, 0, 0))
	s.undo()
	_move(id, Vector3(5, 0, 0))
	check(not s.can_redo())


func test_undo_delete_restores() -> void:
	var id := _place(Vector3(4, 0, 4))
	s.edit("Delete", func() -> void: s.delete_object(id))
	check(not s.doc.has_object(id))
	s.undo()
	check(s.doc.has_object(id))
	check_eq(s.doc.objects_in_chunk(Vector2i.ZERO), [id] as Array[String])


func test_empty_transaction_not_recorded() -> void:
	check(s.edit("Nothing", func() -> void: pass) == null)
	check(not s.can_undo())


func test_cancel_reverts_open_transaction() -> void:
	var id := _place(Vector3.ZERO)
	s.begin("Drag")
	s.set_prop(id, "position", Vector3(9, 0, 9))
	s.create_object("prop", {"position": Vector3(50, 0, 50)})
	s.cancel()
	check_eq(s.doc.get_prop(id, "position"), Vector3.ZERO)
	check_eq(s.doc.occupied_chunks(), [Vector2i.ZERO] as Array[Vector2i])
	check_eq(s.branch().txns.size(), 1)


func test_undo_only_reverts_own_transactions() -> void:
	var a := _place(Vector3.ZERO)
	s.author_id = "bob"
	var b := _place(Vector3(2, 0, 0))
	s.author_id = "alice"
	s.undo()
	check(not s.doc.has_object(a), "alice's object undone")
	check(s.doc.has_object(b), "bob's object untouched")


func test_undo_skips_property_changed_by_someone_else() -> void:
	var id := _place(Vector3.ZERO)
	s.edit("Edit", func() -> void:
		s.set_prop(id, "position", Vector3(1, 0, 0))
		s.set_prop(id, "variant", "red"))
	s.author_id = "bob"
	_move(id, Vector3(7, 0, 7))
	s.author_id = "alice"
	var inv := s.undo()
	check_eq(inv.skipped, 1)
	check_eq(s.doc.get_prop(id, "position"), Vector3(7, 0, 7), "bob's later move wins")
	check_eq(s.doc.get_prop(id, "variant"), null, "alice's own change reverted")


func test_undo_leaves_object_deleted_by_someone_else_intact() -> void:
	var id := _place(Vector3(3, 0, 3))
	s.author_id = "bob"
	s.edit("Delete", func() -> void: s.delete_object(id))
	s.author_id = "alice"
	check(s.undo() == null, "nothing of alice's place can be reverted")
	check(not s.doc.has_object(id))
	s.author_id = "bob"
	s.undo()
	check(s.doc.has_object(id), "bob's delete is undoable")
	check_eq(s.doc.get_prop(id, "position"), Vector3(3, 0, 3), "props survived")


func test_terrain_undo_is_per_cell() -> void:
	s.begin("Raise")
	for op in TerrainEdit.height_ops(s.doc, Rect2i(0, 0, 2, 1), func(_x, _z, _o): return 1.0):
		s.apply(op)
	s.commit()
	s.author_id = "bob"
	s.begin("Raise more")
	for op in TerrainEdit.height_ops(s.doc, Rect2i(1, 0, 1, 1), func(_x, _z, _o): return 5.0):
		s.apply(op)
	s.commit()
	s.author_id = "alice"
	s.undo()
	check_eq(TerrainEdit.height_at(s.doc, 0, 0), 0.0)
	check_eq(TerrainEdit.height_at(s.doc, 1, 0), 5.0)
	s.redo()
	check_eq(TerrainEdit.height_at(s.doc, 0, 0), 1.0)
	check_eq(TerrainEdit.height_at(s.doc, 1, 0), 5.0)


func test_transactions_get_increasing_lamport() -> void:
	var id := _place(Vector3.ZERO)
	_move(id, Vector3.ONE)
	var txns := s.branch().txns
	check_eq(txns.size(), 2)
	check(txns[1].lamport > txns[0].lamport)
	check_eq(txns[0].author, "alice")
