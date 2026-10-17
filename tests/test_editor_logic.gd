extends TestCase


func test_grid_axis_centers_odd_footprints() -> void:
	check_eq(Snapping.grid_axis(0.2, 1.0, 1.0), 0.5)
	check_eq(Snapping.grid_axis(-0.2, 1.0, 1.0), -0.5)
	check_eq(Snapping.grid_axis(4.4, 3.0, 3.0), 4.5)
	check_eq(Snapping.grid_axis(4.4, 3.0, 0.3), 4.5, "thin wall still occupies one cell")


func test_grid_axis_puts_even_footprints_on_lines() -> void:
	check_eq(Snapping.grid_axis(0.6, 1.0, 2.0), 1.0)
	check_eq(Snapping.grid_axis(4.4, 3.0, 6.0), 3.0)


func test_snap_modes() -> void:
	var p := Vector3(1.26, 2.0, -0.74)
	check_eq(Snapping.snap_position(p, "subgrid", 0.5, Vector2.ONE), Vector3(1.5, 2.0, -0.5))
	check_eq(Snapping.snap_position(p, "free", 0.5, Vector2.ONE), p)
	check_eq(Snapping.snap_position(p, "grid", 1.0, Vector2(1, 2)), Vector3(1.5, 2.0, -1.0))


func test_snap_yaw() -> void:
	check(is_equal_approx(Snapping.snap_yaw(deg_to_rad(50), 90), PI / 2))
	check(is_equal_approx(Snapping.snap_yaw(deg_to_rad(22), 15), deg_to_rad(15)))


func test_footprint_swaps_on_quarter_turns() -> void:
	var p := PropDef.new()
	p.footprint = Vector2(3, 1)
	check_eq(p.footprint_at(0.0), Vector2(3, 1))
	check_eq(p.footprint_at(PI / 2), Vector2(1, 3))
	check_eq(p.footprint_at(PI), Vector2(3, 1))
	check_eq(p.footprint_at(-PI / 2), Vector2(1, 3))


func test_with_descendants_follows_parent_chains() -> void:
	var doc := MapDocument.new()
	for id in ["table", "plate", "apple", "chair"]:
		doc.apply_op(Ops.create(id, "prop"))
	doc.apply_op(Ops.set_prop("plate", "parent", "table"))
	doc.apply_op(Ops.set_prop("apple", "parent", "plate"))
	var ids := Selection.with_descendants(doc, ["table"] as Array[String])
	ids.sort()
	check_eq(ids, ["apple", "plate", "table"] as Array[String])
	doc.apply_op(Ops.delete("apple"))
	check_eq(Selection.with_descendants(doc, ["plate"] as Array[String]).size(), 1)


func test_selection_drops_deleted_objects() -> void:
	var doc := MapDocument.new()
	doc.apply_op(Ops.create("a", "prop"))
	var sel := Selection.new()
	sel.bind(doc)
	sel.set_ids(["a"])
	doc.apply_op(Ops.delete("a"))
	check(sel.is_empty())
