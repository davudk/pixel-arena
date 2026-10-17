extends TestCase

var doc: MapDocument


func before_each() -> void:
	doc = MapDocument.new()
	doc.apply_op(Ops.create("b", "building"))


func _cell(level: int, i: int, j: int) -> void:
	doc.apply_op(Ops.set_prop("b", BuildingLayout.cell_path(level, Vector2i(i, j)), true))


func _layout() -> BuildingLayout:
	return BuildingLayout.from_object(doc.get_object("b"))


func test_single_cell_has_four_exterior_walls() -> void:
	_cell(0, 0, 0)
	var walls := _layout().walls(0)
	check_eq(walls.size(), 4)
	check_eq(walls["0,0,W"].side, "W")
	check_eq(walls["1,0,W"].side, "E")
	check_eq(walls["1,0,W"].host, Vector2i(0, 0))
	check_eq(walls["0,1,N"].side, "S")


func test_shared_edge_is_open_by_default() -> void:
	_cell(0, 0, 0)
	_cell(0, 1, 0)
	var walls := _layout().walls(0)
	check_eq(walls.size(), 6)
	check(not walls.has("1,0,W"), "no wall between the two cells")


func test_overrides_change_kind_or_open() -> void:
	_cell(0, 0, 0)
	_cell(0, 1, 0)
	doc.apply_op(Ops.set_prop("b", BuildingLayout.wall_path(0, "1,0,W"), "wall"))
	doc.apply_op(Ops.set_prop("b", BuildingLayout.wall_path(0, "0,0,W"), "door"))
	doc.apply_op(Ops.set_prop("b", BuildingLayout.wall_path(0, "0,0,N"), "open"))
	var layout := _layout()
	var walls := layout.walls(0)
	check_eq(walls["1,0,W"].kind, "wall", "interior wall")
	check_eq(walls["1,0,W"].host, Vector2i(1, 0))
	check_eq(walls["0,0,W"].kind, "door")
	check(not walls.has("0,0,N"), "opened")
	check_eq(layout.effective_kind(0, "0,0,N"), "")


func test_override_on_edge_without_cells_is_ignored() -> void:
	_cell(0, 0, 0)
	doc.apply_op(Ops.set_prop("b", BuildingLayout.wall_path(0, "5,5,W"), "wall"))
	check_eq(_layout().walls(0).size(), 4)


func test_levels_and_roof_groups() -> void:
	for i in 3:
		for j in 2:
			_cell(0, i, j)
	_cell(1, 0, 0)
	_cell(1, 0, 1)
	var layout := _layout()
	check_eq(layout.level_indices(), [0, 1] as Array[int])
	var roofs := layout.roof_groups()
	check_eq(roofs[1], [Rect2i(0, 0, 1, 2)] as Array[Rect2i])
	check_eq(roofs[0], [Rect2i(1, 0, 2, 2)] as Array[Rect2i])


func test_decompose_l_shape() -> void:
	var cells := {}
	for c in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(2, 0), Vector2i(0, 1), Vector2i(0, 2)]:
		cells[c] = true
	var rects := BuildingLayout.decompose(cells)
	check_eq(rects, [Rect2i(0, 0, 3, 1), Rect2i(0, 1, 1, 2)] as Array[Rect2i])
	var area := 0
	for r in rects:
		area += r.get_area()
	check_eq(area, 5)


func test_roof_style_default_and_set() -> void:
	_cell(0, 0, 0)
	check_eq(_layout().roof_style, "gable")
	doc.apply_op(Ops.set_prop("b", "roof/style", "hip"))
	check_eq(_layout().roof_style, "hip")


func test_builtin_kits_load() -> void:
	var lib := PropLibrary.new()
	lib.load_from(PropLibrary.BUILTIN_DIR)
	check_eq(lib.errors, [] as Array[String])
	var kit: KitDef = lib.kits.get("kenney_town:timber")
	check(kit != null)
	for role in KitDef.ROLES:
		check(lib.get_prop(kit.pieces[role]) != null, "piece exists: %s" % kit.pieces[role])
