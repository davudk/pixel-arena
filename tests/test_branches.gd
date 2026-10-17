extends TestCase

var s: MapSession


func before_each() -> void:
	s = MapSession.new()


func _place(pos: Vector3) -> String:
	s.begin("Place")
	var id := s.create_object("prop", {"prop": "core:tree", "position": pos})
	s.commit()
	return id


func _set_value(id: String, path: String, value: Variant) -> void:
	s.edit("Set " + path, func() -> void: s.set_prop(id, path, value))


func _raise(rect: Rect2i, h: float) -> void:
	s.begin("Raise")
	for op in TerrainEdit.height_ops(s.doc, rect, func(_x, _z, _o): return h):
		s.apply(op)
	s.commit()


func _check_doc_matches_history() -> void:
	var live := s.doc
	var replayed := s._materialize(s.current_branch)
	check(Merge.diff(live, replayed).is_empty(), "live doc diverged from replayed history")


func test_fork_switch_and_back() -> void:
	var a := _place(Vector3.ZERO)
	var b := s.fork("Experiment")
	_set_value(a, "variant", "red")
	var c := _place(Vector3(100, 0, 0))
	s.switch_branch(MapSession.MAIN)
	check_eq(s.doc.get_prop(a, "variant"), null)
	check(not s.doc.has_object(c))
	s.switch_branch(b)
	check_eq(s.doc.get_prop(a, "variant"), "red")
	check(s.doc.has_object(c))
	_check_doc_matches_history()


func test_switch_emits_reset() -> void:
	_place(Vector3.ZERO)
	s.fork("x")
	var resets := [0]
	s.doc.reset.connect(func() -> void: resets[0] += 1)
	s.switch_branch(MapSession.MAIN)
	check_eq(resets[0], 1)


func test_discard_branch() -> void:
	var a := _place(Vector3.ZERO)
	var b := s.fork("Throwaway")
	s.edit("Delete", func() -> void: s.delete_object(a))
	var nested := s.fork("Nested")
	check(s.discard_branch(b))
	check_eq(s.current_branch, MapSession.MAIN)
	check(not s.branches.has(b))
	check(not s.branches.has(nested))
	check(s.doc.has_object(a))
	check(not s.discard_branch(MapSession.MAIN))


func test_undo_works_across_fork_point() -> void:
	var a := _place(Vector3.ZERO)
	s.fork("x")
	s.undo()
	check(not s.doc.has_object(a))
	s.switch_branch(MapSession.MAIN)
	check(s.doc.has_object(a), "main unaffected")


func test_merge_without_conflicts() -> void:
	var a := _place(Vector3.ZERO)
	var b := s.fork("Feature")
	_set_value(a, "variant", "red")
	var created := _place(Vector3(64, 0, 0))
	_raise(Rect2i(0, 0, 3, 3), 2.0)
	s.switch_branch(MapSession.MAIN)
	_set_value(a, "scale", 2.0)
	var plan := s.merge_plan(b)
	check_eq(plan.conflicts.size(), 0)
	var txn := s.merge_branch(b)
	check(txn != null)
	check_eq(s.current_branch, MapSession.MAIN)
	check(not s.branches.has(b))
	check_eq(s.doc.get_prop(a, "variant"), "red")
	check_eq(s.doc.get_prop(a, "scale"), 2.0)
	check(s.doc.has_object(created))
	check_eq(s.doc.get_prop(created, "position"), Vector3(64, 0, 0))
	check_eq(TerrainEdit.height_at(s.doc, 2, 2), 2.0)
	_check_doc_matches_history()


func test_merge_from_inside_branch() -> void:
	var b := s.fork("Feature")
	var created := _place(Vector3(1, 0, 1))
	s.merge_branch(b)
	check_eq(s.current_branch, MapSession.MAIN)
	check(s.doc.has_object(created))


func test_merge_is_one_undo_step() -> void:
	var a := _place(Vector3.ZERO)
	var b := s.fork("Feature")
	_set_value(a, "variant", "red")
	_place(Vector3(5, 0, 5))
	s.switch_branch(MapSession.MAIN)
	s.merge_branch(b)
	s.undo()
	check_eq(s.doc.get_prop(a, "variant"), null)
	check_eq(s.doc.occupied_chunks().size(), 1)
	check(s.doc.has_object(a))
	_check_doc_matches_history()


func test_conflicts_resolved_mine_and_theirs() -> void:
	var a := _place(Vector3.ZERO)
	var b := s.fork("Feature")
	_set_value(a, "variant", "red")
	_set_value(a, "scale", 3.0)
	s.switch_branch(MapSession.MAIN)
	_set_value(a, "variant", "blue")
	_set_value(a, "scale", 0.5)
	var plan := s.merge_plan(b)
	check_eq(plan.conflicts.size(), 2)
	var keys := {}
	for c in plan.conflicts:
		keys[c.path] = c.key
		if c.path == "variant":
			check_eq(c.mine, "blue")
			check_eq(c.theirs, "red")
	s.merge_branch(b, {keys["variant"]: Merge.MINE}, Merge.THEIRS)
	check_eq(s.doc.get_prop(a, "variant"), "blue")
	check_eq(s.doc.get_prop(a, "scale"), 3.0)


func test_same_change_on_both_sides_is_not_a_conflict() -> void:
	var a := _place(Vector3.ZERO)
	var b := s.fork("Feature")
	_set_value(a, "variant", "red")
	s.switch_branch(MapSession.MAIN)
	_set_value(a, "variant", "red")
	var plan := s.merge_plan(b)
	check_eq(plan.conflicts.size(), 0)
	check_eq(plan.changes.size(), 0)


func test_terrain_conflicts_are_per_cell() -> void:
	var b := s.fork("Feature")
	_raise(Rect2i(0, 0, 2, 1), 4.0)  # samples (0,0), (1,0)
	s.switch_branch(MapSession.MAIN)
	_raise(Rect2i(1, 0, 2, 1), 1.0)  # samples (1,0), (2,0)
	var plan := s.merge_plan(b)
	check_eq(plan.conflicts.size(), 1)
	s.merge_branch(b, {}, Merge.MINE)
	check_eq(TerrainEdit.height_at(s.doc, 0, 0), 4.0)
	check_eq(TerrainEdit.height_at(s.doc, 1, 0), 1.0)
	check_eq(TerrainEdit.height_at(s.doc, 2, 0), 1.0)
	_check_doc_matches_history()


func test_delete_in_branch_merges() -> void:
	var a := _place(Vector3.ZERO)
	var b := s.fork("Cleanup")
	s.edit("Delete", func() -> void: s.delete_object(a))
	s.merge_branch(b)
	check(not s.doc.has_object(a))
	check_eq(s.doc.occupied_chunks().size(), 0)


func test_nested_branch_materializes() -> void:
	var a := _place(Vector3.ZERO)
	s.fork("L1")
	_set_value(a, "scale", 2.0)
	s.fork("L2")
	_set_value(a, "variant", "green")
	var l2 := s.current_branch
	s.switch_branch(MapSession.MAIN)
	s.switch_branch(l2)
	check_eq(s.doc.get_prop(a, "scale"), 2.0)
	check_eq(s.doc.get_prop(a, "variant"), "green")


func test_cannot_merge_branch_with_children() -> void:
	var l1 := s.fork("L1")
	s.fork("L2")
	check(s.merge_branch(l1) == null)
	check(s.branches.has(l1))


func test_fork_at_earlier_point() -> void:
	var a := _place(Vector3.ZERO)
	_set_value(a, "variant", "red")
	_set_value(a, "variant", "blue")
	var b := s.fork_at("Back in time", MapSession.MAIN, 2)  # after place + red
	check_eq(s.current_branch, b)
	check_eq(s.doc.get_prop(a, "variant"), "red")
	check(not s.can_undo(), "fresh undo history")
	_set_value(a, "scale", 2.0)
	_check_doc_matches_history()
	s.switch_branch(MapSession.MAIN)
	check_eq(s.doc.get_prop(a, "variant"), "blue")
	check_eq(s.doc.get_prop(a, "scale"), null)


func test_history_lists_own_then_inherited() -> void:
	var a := _place(Vector3.ZERO)
	_set_value(a, "variant", "red")
	_set_value(a, "variant", "blue")
	s.fork_at("Alt", MapSession.MAIN, 2)
	_set_value(a, "scale", 3.0)
	var h := s.history(s.current_branch)
	check_eq(h.size(), 3)
	check_eq(h[0].txn.label, "Set scale")
	check(not h[0].inherited)
	check_eq(h[1].txn.label, "Set variant")
	check(h[1].inherited)
	check_eq(h[1].seq, 2)
	check_eq(h[2].txn.label, "Place")
	check_eq(s.history(s.current_branch, 2).size(), 2)


func test_rename_branch() -> void:
	var b := s.fork("x")
	s.rename_branch(b, "  Better name ")
	check_eq(s.branches[b].name, "Better name")
	s.rename_branch(b, "   ")
	check_eq(s.branches[b].name, "Better name")
