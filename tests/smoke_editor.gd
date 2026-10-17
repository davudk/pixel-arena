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

	print("smoke: %s" % ("OK" if failures == 0 else "%d failures" % failures))
	quit(1 if failures > 0 else 0)
