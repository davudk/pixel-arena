extends SceneTree
## End-to-end smoke test of the editor tools, driven through their real code paths.
##   godot --headless --path . -s tests/smoke_editor.gd
## Exits non-zero on failure.

var failures := 0


func check(cond: bool, what: String) -> void:
	if not cond:
		failures += 1
		print("FAIL ", what)


func key(code: Key, cmd := false) -> InputEventKey:
	var e := InputEventKey.new()
	e.keycode = code
	e.pressed = true
	e.meta_pressed = cmd
	e.ctrl_pressed = cmd
	return e


func _initialize() -> void:
	# A script error stops this coroutine without quitting; fail instead of hanging.
	create_timer(120.0).timeout.connect(func() -> void:
		print("smoke: TIMEOUT (script error?)")
		quit(2))
	var main: EditorMain = load("res://src/main.tscn").instantiate()
	root.add_child(main)
	await process_frame
	var center := main.get_viewport_rect().size / 2.0 + Vector2(PropBrowser.WIDTH / 2, 0)
	main.cursor_screen = center
	var doc := main.session.doc
	var count := func() -> int: return doc.objects.values().filter(func(o): return not o.deleted and o.type == "prop").size()
	var click := InputEventMouseButton.new()

	# Place a stump (flat top) under the cursor.
	main.choose_prop(main.library.get_prop("kenney_nature:stump_square_detailed_wide"))
	check(main.tool is PlaceTool, "place tool active")
	main.tool.on_motion(center)
	main.tool.on_press(center, click)
	check(count.call() == 1, "stump placed")
	var stump: String = doc.objects.keys().filter(func(id): return id != MapDocument.SETTINGS_ID)[0]
	var pos: Vector3 = doc.get_prop(stump, "position")
	check(is_equal_approx(fposmod(pos.x, 0.5), 0.0) and is_equal_approx(fposmod(pos.z, 0.5), 0.0), "snapped to 0.5 m: %s" % pos)

	await physics_frame
	await physics_frame
	check(main.pick_object(center).get("id", "") == stump, "pick finds stump")

	# Select tool: click selects, R rotates by the prop's snap.
	main.set_tool(SelectTool.new())
	main.tool.on_press(center, click)
	main.tool.on_release(center, click)
	check(main.selection.list() == [stump], "click selects")
	main.tool.on_key(key(KEY_R))
	check(is_equal_approx(float(doc.get_prop(stump, "rotation")), deg_to_rad(15)), "R rotates 15 deg")
	main.undo()
	check(is_equal_approx(float(doc.get_prop(stump, "rotation")), 0.0), "undo rotation")

	# Drag-move.
	main.tool.on_press(center, click)
	main.tool.on_motion(center + Vector2(40, 0))
	main.tool.on_motion(center + Vector2(150, 0))
	main.tool.on_release(center + Vector2(150, 0), click)
	var moved: Vector3 = doc.get_prop(stump, "position")
	check(moved.distance_to(pos) > 1.0, "drag moved stump %s -> %s" % [pos, moved])
	await physics_frame
	await physics_frame

	# A pot placed on the stump's top becomes its child.
	var top: Vector2 = main.screen_position(moved + Vector3(0, 0.3, 0))
	main.choose_prop(main.library.get_prop("kenney_nature:pot_small"))
	main.cursor_screen = top
	main.tool.on_motion(top)
	main.tool.on_press(top, click)
	var pot := ""
	for id in doc.objects:
		if doc.get_prop(id, "prop") == "kenney_nature:pot_small":
			pot = id
	check(pot != "" and doc.get_prop(pot, "parent") == stump, "pot sits on stump")
	check(pot != "" and float(doc.get_prop(pot, "position").y) > 0.1, "pot raised onto surface")

	# Duplicate copies the stump with its pot; delete removes both; undo restores.
	main.set_tool(SelectTool.new())
	main.selection.set_ids([stump])
	main.tool.on_key(key(KEY_D, true))
	check(count.call() == 4, "duplicate copies stump and pot (got %d)" % count.call())
	var copy := main.selection.list()
	check(copy.size() == 1 and copy[0] != stump, "duplicate selects the copy")
	main.selection.set_ids([stump])
	main.tool.on_key(key(KEY_DELETE))
	check(count.call() == 2, "delete removed stump and pot (got %d)" % count.call())
	main.undo()
	check(count.call() == 4, "undo restored them")

	# Box select everything on screen.
	var size := main.get_viewport_rect().size
	main.tool.on_press(Vector2(PropBrowser.WIDTH + 20, 5), click)
	main.tool.on_motion(size - Vector2(5, 5))
	main.tool.on_release(size - Vector2(5, 5), click)
	check(main.selection.ids.size() == 4, "box select gets all 4 (got %d)" % main.selection.ids.size())

	# Copy/paste at another spot.
	main.tool.on_key(key(KEY_C, true))
	main.cursor_screen = center + Vector2(-200, 100)
	main.tool.on_key(key(KEY_V, true))
	check(count.call() == 8, "paste (got %d)" % count.call())

	# Terrain: a raise stroke under a placed tree lifts the tree with it; undo restores both.
	main.set_tool(SelectTool.new())
	main.choose_prop(main.library.get_prop("kenney_nature:tree_oak"))
	var spot := center + Vector2(0, 150)
	main.cursor_screen = spot
	main.tool.on_motion(spot)
	main.tool.on_press(spot, click)
	var tree := ""
	for id in doc.objects:
		if doc.get_prop(id, "prop") == "kenney_nature:tree_oak":
			tree = id
	var tree_y: float = doc.get_prop(tree, "position").y
	main.set_tool_by_name("terrain")
	check(main.tool is TerrainTool, "terrain tool")
	TerrainTool.mode = TerrainBrush.Mode.RAISE
	TerrainTool.radius = 5.0
	TerrainTool.strength = 1.0
	main.tool.on_press(spot, click)
	for i in 20:
		main.tool.process(1.0 / 60.0)
	main.tool.on_release(spot, click)
	var tree_pos: Vector3 = doc.get_prop(tree, "position")
	var ground_y := TerrainEdit.height_at_world(doc, tree_pos.x, tree_pos.z)
	check(ground_y > 1.0, "terrain raised (%.2f)" % ground_y)
	check(absf(tree_pos.y - ground_y) < 0.01, "tree rides terrain (%.2f vs %.2f)" % [tree_pos.y, ground_y])
	await process_frame  # emitted before nodes process; wait for a full frame
	await process_frame
	check(main.terrain.get_child_count() > 0, "terrain chunk mesh built")
	main.undo()
	check(is_equal_approx(float(doc.get_prop(tree, "position").y), tree_y), "undo lowers tree")
	check(doc.terrain.is_empty(), "undo removes terrain chunk")

	# Paint.
	TerrainTool.mode = TerrainBrush.Mode.PAINT
	TerrainTool.material = 2
	main.tool.on_press(spot, click)
	main.tool.on_release(spot, click)
	var g: Vector3 = main.rig.ground_point(spot)
	check(TerrainEdit.material_at(doc, floori(g.x), floori(g.z)) == 2, "painted sand")

	# Water: three corners + Enter.
	main.set_tool_by_name("water")
	for offset in [Vector2(-60, -40), Vector2(60, -40), Vector2(0, 50)]:
		main.tool.on_motion(center + offset)
		main.tool.on_press(center + offset, click)
	main.tool.on_key(key(KEY_ENTER))
	var water := main.selection.list()
	check(water.size() == 1 and doc.get_object(water[0]).type == "water", "water created and selected")
	check(main.tool is SelectTool, "back to select")
	main.tool.on_key(key(KEY_PAGEUP))
	check(is_equal_approx(float(doc.get_prop(water[0], "position").y), 0.25), "PageUp raises water")
	check(main.world.node_for(water[0]) != null, "water rendered")

	# Buildings: paint a 3-cell foundation, make a door, add level 1, change roof, erase.
	main.set_tool_by_name("building")
	var bt: BuildingTool = main.tool
	BuildingTool.mode = BuildingTool.Mode.FOUNDATION
	bt.set_level(0)
	var origin := Vector3(-60, 0, -60)
	var at := func(local: Vector3) -> Vector2: return main.screen_position(local)
	var a: Vector2 = at.call(origin + Vector3(1.5, 0, 1.5))
	main.tool.on_press(a, click)
	main.tool.on_motion(at.call(origin + Vector3(4.5, 0, 1.5)))
	main.tool.on_motion(at.call(origin + Vector3(7.5, 0, 1.5)))
	main.tool.on_release(at.call(origin + Vector3(7.5, 0, 1.5)), click)
	var building := bt.target
	check(building != "" and doc.get_object(building).type == "building", "building created")
	var layout := BuildingLayout.from_object(doc.get_object(building))
	check(layout.cells(0).size() == 3, "3 cells painted (got %d)" % layout.cells(0).size())
	check(layout.walls(0).size() == 8, "8 exterior walls (got %d)" % layout.walls(0).size())
	check(main.selection.list() == [building], "building selected")
	var bpos: Vector3 = doc.get_prop(building, "position")

	BuildingTool.mode = BuildingTool.Mode.DOOR
	main.tool.on_press(at.call(bpos + Vector3(4.5, 1.0, 3.0)), click)  # south edge of the middle cell
	layout = BuildingLayout.from_object(doc.get_object(building))
	check(layout.walls(0).values().any(func(w): return w.kind == "door"), "door placed")

	BuildingTool.mode = BuildingTool.Mode.FOUNDATION
	bt.set_level(1)
	check(main.world.cutaway_level == 1, "cutaway follows level")
	var up: Vector2 = at.call(bpos + Vector3(1.5, 3.0, 1.5))
	main.tool.on_press(up, click)
	main.tool.on_release(up, click)
	layout = BuildingLayout.from_object(doc.get_object(building))
	check(layout.cells(1).size() == 1, "level 1 cell (got %d)" % layout.cells(1).size())
	await process_frame
	await process_frame
	var bnode := main.world.node_for(building)
	var roof1 := bnode.get_node_or_null("Roof1")
	check(roof1 != null and not roof1.visible, "roof over level 1 hidden while editing level 1")
	bt.set_roof("hip")
	check(doc.get_prop(building, "roof/style") == "hip", "roof style")
	main.undo()
	check(doc.get_prop(building, "roof/style") == "gable", "undo roof style")

	BuildingTool.mode = BuildingTool.Mode.ERASE
	main.tool.on_press(up, click)
	main.tool.on_release(up, click)
	bt.set_level(0)
	main.tool.on_press(a, click)
	main.tool.on_motion(at.call(bpos + Vector3(4.5, 0, 1.5)))
	main.tool.on_motion(at.call(bpos + Vector3(7.5, 0, 1.5)))
	main.tool.on_release(a, click)
	check(not doc.has_object(building), "erasing every cell deletes the building")
	main.undo()
	check(doc.has_object(building), "undo brings it back")
	main.set_tool(SelectTool.new())
	check(main.world.cutaway_level == -1, "cutaway cleared on leaving the tool")

	print("smoke: %s" % ("OK" if failures == 0 else "%d failures" % failures))
	quit(1 if failures > 0 else 0)
