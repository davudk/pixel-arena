class_name EditorMain
extends Control
## Editor root: wires the session, prop library, 3D view, camera, lighting, view settings,
## HUD, tools and input.
##
## Command-line (after `--`):
##   --demo               scatter some props over a few chunks
##   --screenshot=<path>  save a PNG of the window after a few frames, then quit
##   --view=<key>=<value> override a view setting for this run only (not saved)
##   --camera=<x>,<z>,<zoom> start the camera looking at (x, z) with that zoom

var session: MapSession
var library: PropLibrary
var selection := Selection.new()
var tool: EditorTool
var settings := ViewSettings.new()
var file_path := ""
var dirty := false
var cursor_screen := Vector2.ZERO

var pixel_view: PixelView
var rig: CameraRig
var day: DayCycle
var ground: Ground
var terrain: TerrainView
var world: WorldView
var toolbar: Toolbar
var hud: Hud
var browser: PropBrowser
var thumbnails: ThumbnailRenderer
var credits: CreditsDialog
var controller: EditorController

var _applied_time_of_day: Variant = null
var _persist_settings := true
var _dialog: FileDialog


func _ready() -> void:
	mouse_filter = MOUSE_FILTER_IGNORE
	_fit_window_to_screen_scale()

	pixel_view = PixelView.new()
	add_child(pixel_view)
	var root3d := Node3D.new()
	root3d.name = "World"
	pixel_view.viewport.add_child(root3d)
	day = DayCycle.new()
	root3d.add_child(day)
	ground = Ground.new()
	root3d.add_child(ground)
	terrain = TerrainView.new()
	terrain.name = "Terrain"
	terrain.chunks_changed.connect(ground.set_holes)
	root3d.add_child(terrain)
	world = WorldView.new()
	world.name = "Objects"
	root3d.add_child(world)
	rig = CameraRig.new()
	rig.name = "CameraRig"
	rig.pixel_view = pixel_view
	rig.moved.connect(_on_camera_moved)
	rig.ground_hit = func(origin: Vector3, dir: Vector3) -> Variant:
		return TerrainEdit.raycast(session.doc, origin, dir)
	root3d.add_child(rig)
	pixel_view.resized.connect(rig.apply)

	library = PropLibrary.load_default()
	for e in library.errors:
		push_warning("Prop library: " + e)
	ObjectVisuals.library = library
	thumbnails = ThumbnailRenderer.new()
	thumbnails.models = ObjectVisuals.models
	add_child(thumbnails)

	hud = Hud.new()
	add_child(hud)
	hud.make_map_default_pressed.connect(_make_view_map_default)
	browser = PropBrowser.new()
	hud.add_child(browser)
	toolbar = Toolbar.new()
	hud.add_child(toolbar)
	toolbar.tool_requested.connect(set_tool_by_name)
	browser.setup(library, thumbnails)
	browser.prop_chosen.connect(func(prop: PropDef) -> void: choose_prop(prop))
	browser.credits_pressed.connect(func() -> void: credits.show_for(library, session.doc))
	credits = CreditsDialog.new()
	add_child(credits)
	selection.changed.connect(func() -> void: world.set_highlights(selection.list()))

	controller = EditorController.new()
	controller.name = "EditorController"
	controller.main = self
	controller.rig = rig
	add_child(controller)

	settings.changed.connect(_apply_settings)
	settings.load_overrides()
	hud.setup(settings)
	set_session(MapSession.new())
	set_tool(SelectTool.new())
	_handle_command_line()


func _process(_delta: float) -> void:
	var hit: Variant = rig.ground_point(cursor_screen)
	var cursor := "-"
	if hit != null:
		var cell := Vector2i(floori(hit.x), floori(hit.z))
		var chunk := MapDocument.chunk_of(hit)
		cursor = "(%.1f, %.1f)  cell %d,%d  chunk %d,%d" % [hit.x, hit.z, cell.x, cell.y, chunk.x, chunk.y]
	var hours := int(day.time_of_day)
	var mode := "%d selected" % selection.ids.size()
	if tool is PlaceTool:
		mode = "Placing %s" % (tool as PlaceTool).prop.name
	elif tool is TerrainTool:
		mode = "Terrain: %s, size %.1f m, strength %.2f" % [Toolbar.MODES[TerrainTool.mode], TerrainTool.radius, TerrainTool.strength]
	elif tool is WaterTool:
		mode = "Water: click corners, Enter to finish"
	info_text("FPS %d   cursor %s\n%s   chunks %d   objects %d   branch %s   %02d:%02d   zoom %.0f m" % [
		Engine.get_frames_per_second(), cursor, mode, world.chunk_count(), world.object_count(),
		session.branch().name, hours, int((day.time_of_day - hours) * 60.0), rig.zoom])


func info_text(text: String) -> void:
	hud.info.text = text


func set_session(s: MapSession) -> void:
	if session != null:
		session.history_changed.disconnect(_on_history_changed)
	session = s
	session.history_changed.connect(_on_history_changed)
	world.bind(session.doc)
	terrain.bind(session.doc)
	settings.bind(session.doc)
	selection.bind(session.doc)
	dirty = false
	_update_title()


# --- Commands --------------------------------------------------------------

func undo() -> void:
	session.undo()


func redo() -> void:
	session.redo()


func new_map() -> void:
	file_path = ""
	set_session(MapSession.new())


func save() -> void:
	if file_path == "":
		save_as()
		return
	var err := ProjectFile.save(session, file_path)
	if err != OK:
		push_error("Save failed (%s): %s" % [error_string(err), file_path])
		return
	dirty = false
	_update_title()


func save_as() -> void:
	_show_dialog(FileDialog.FILE_MODE_SAVE_FILE, func(path: String) -> void:
		if path.get_extension() != ProjectFile.EXTENSION:
			path += "." + ProjectFile.EXTENSION
		file_path = path
		save())


func open() -> void:
	_show_dialog(FileDialog.FILE_MODE_OPEN_FILE, func(path: String) -> void:
		var loaded := ProjectFile.open(path)
		if loaded == null:
			return
		file_path = path
		set_session(loaded))


func set_tool(new_tool: EditorTool) -> void:
	if tool != null:
		tool.deactivate()
	tool = new_tool
	tool.main = self
	tool.activate()
	if not tool is PlaceTool:
		browser.deselect()
	if tool is TerrainTool:
		(tool as TerrainTool).options_changed.connect(toolbar.refresh)
	toolbar.show_tool("select" if tool is SelectTool else "terrain" if tool is TerrainTool else "water" if tool is WaterTool else "")


func set_tool_by_name(tool_name: String) -> void:
	match tool_name:
		"select":
			set_tool(SelectTool.new())
		"terrain":
			selection.clear()
			set_tool(TerrainTool.new())
		"water":
			selection.clear()
			set_tool(WaterTool.new())


## Starts placing `prop` (from the browser or the eyedropper).
func choose_prop(prop: PropDef, yaw: float = 0.0) -> void:
	var place := PlaceTool.new(prop)
	place.yaw = yaw
	place.random_rotation = browser.random_rotation.button_pressed
	selection.clear()
	set_tool(place)


## The map object under a screen position: {id, position, normal}, or {} if none.
func pick_object(screen_pos: Vector2, exclude: Array[RID] = []) -> Dictionary:
	var ray := rig.screen_ray(screen_pos)
	var query := PhysicsRayQueryParameters3D.create(ray[0], ray[0] + ray[1] * 10000.0, ObjectVisuals.PICK_LAYER, exclude)
	var hit := rig.camera.get_world_3d().direct_space_state.intersect_ray(query)
	if hit.is_empty() or not hit.collider.has_meta("object_id"):
		return {}
	return {"id": hit.collider.get_meta("object_id"), "position": hit.position, "normal": hit.normal}


## Screen position of a world point, or null if it's behind the camera.
func screen_position(world_pos: Vector3) -> Variant:
	if rig.camera.is_position_behind(world_pos):
		return null
	return rig.camera.unproject_position(world_pos) * pixel_view.pixel_size + pixel_view.display.position


## Live objects whose position falls inside a screen rectangle.
func objects_in_screen_rect(rect: Rect2) -> Array[String]:
	var out: Array[String] = []
	for obj in session.doc.objects.values():
		if obj.deleted or not obj.props.get("position") is Vector3:
			continue
		var p: Variant = screen_position(obj.props.position)
		if p != null and rect.has_point(p):
			out.append(obj.id)
	return out


# --- Internals -------------------------------------------------------------

func _apply_settings() -> void:
	pixel_view.pixel_size = settings.get_value("pixel_size")
	pixel_view.set_post(settings.get_value("color_levels"), settings.get_value("dither"))
	ground.set_grid_visible(settings.get_value("grid"))
	terrain.show_grid = settings.get_value("grid")
	rig.set_orthographic(settings.get_value("projection") == "orthographic")
	day.mode = DayCycle.Mode.CYCLE if settings.get_value("time_mode") == "cycle" else DayCycle.Mode.FIXED
	day.day_length = settings.get_value("day_length")
	# Only jump the clock when the time setting itself changed, so a running cycle isn't reset
	# by unrelated settings changes.
	var t: Variant = settings.get_value("time_of_day")
	if not Codec.same(t, _applied_time_of_day):
		_applied_time_of_day = t
		day.time_of_day = t
	day.apply()
	if _persist_settings:
		settings.save_overrides()


func _make_view_map_default() -> void:
	var ops := settings.map_default_ops()
	session.edit("Set map view defaults", func() -> void:
		for op in ops:
			session.apply(op))
	settings.clear_overrides()


func _on_camera_moved() -> void:
	ground.follow(rig.focus)
	if tool != null:
		tool.on_motion(cursor_screen)
	var dist := rig.camera.position.distance_to(rig.focus)
	day.set_shadow_distance(dist + rig.zoom * 2.0)


func _on_history_changed() -> void:
	dirty = true
	_update_title()


func _update_title() -> void:
	var name := file_path.get_file() if file_path != "" else "Untitled"
	get_window().title = "Pixel Arena — %s%s" % [name, " *" if dirty else ""]


func _show_dialog(mode: FileDialog.FileMode, on_selected: Callable) -> void:
	if _dialog != null:
		_dialog.queue_free()
	_dialog = FileDialog.new()
	_dialog.file_mode = mode
	_dialog.access = FileDialog.ACCESS_FILESYSTEM
	_dialog.use_native_dialog = true
	_dialog.filters = PackedStringArray(["*.%s ; Pixel Arena map" % ProjectFile.EXTENSION])
	_dialog.file_selected.connect(on_selected)
	add_child(_dialog)
	_dialog.popup_centered_ratio(0.6)


func _handle_command_line() -> void:
	var screenshot := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--view="):
			_persist_settings = false
			var kv := arg.trim_prefix("--view=").split("=", true, 1)
			if kv.size() == 2 and ViewSettings.DEFAULTS.has(kv[0]):
				settings.set_override(kv[0], type_convert(str_to_var(kv[1]) if kv[1].is_valid_float() or kv[1] in ["true", "false"] else kv[1], typeof(ViewSettings.DEFAULTS[kv[0]])))
		elif arg.begins_with("--camera="):
			var v := arg.trim_prefix("--camera=").split_floats(",")
			if v.size() == 3:
				rig.focus = Vector3(v[0], 0, v[1])
				rig.zoom_at(v[2] / rig.zoom, Vector2.ZERO)
				rig.focus = Vector3(v[0], 0, v[1])
				rig.apply()
		elif arg == "--demo":
			_scatter_demo()
		elif arg.begins_with("--screenshot="):
			screenshot = arg.trim_prefix("--screenshot=")
	if screenshot != "":
		for i in 120:
			await get_tree().process_frame
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(screenshot)
		get_tree().quit()


## Window sizes are physical pixels; on HiDPI screens scale both the window and the UI.
func _fit_window_to_screen_scale() -> void:
	var win := get_window()
	var scale := DisplayServer.screen_get_scale()
	if scale <= 1.0:
		return
	win.content_scale_factor = scale
	var usable := DisplayServer.screen_get_usable_rect(win.current_screen).size
	win.size = Vector2i((Vector2(win.size) * scale).min(Vector2(usable) * 0.9))
	win.move_to_center()


func _scatter_demo() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	# Terrain: a hill, a pond with sand banks, a dirt path.
	session.begin("Demo terrain")
	for op in TerrainBrush.sculpt_ops(session.doc, TerrainBrush.Mode.RAISE, Vector3(28, 0, -6), 10.0, 7.0):
		session.apply(op)
	for op in TerrainBrush.sculpt_ops(session.doc, TerrainBrush.Mode.LOWER, Vector3(-8, 0, 20), 7.0, 2.0):
		session.apply(op)
	for op in TerrainBrush.paint_ops(session.doc, Vector3(-8, 0, 20), 8.5, 2):
		session.apply(op)
	for i in 30:
		for op in TerrainBrush.paint_ops(session.doc, Vector3(-4 + i * 1.2, 0, 6 + sin(i * 0.3) * 3.0), 1.2, 1):
			session.apply(op)
	session.commit()
	var pond := PackedVector2Array()
	for i in 12:
		var a := TAU * i / 12.0
		pond.append(Vector2(cos(a), sin(a)) * 6.0)
	session.edit("Demo water", func() -> void:
		session.create_object("water", {"position": Vector3(-8, -0.6, 20), "rotation": 0.0, "polygon": pond}))
	var pick := func(query: String) -> Array[PropDef]: return library.search(query)
	var trees: Array[PropDef] = pick.call("tree_oak") + pick.call("tree_default") + pick.call("tree_pine_round")
	var rocks: Array[PropDef] = pick.call("rock_large")
	var people: Array[PropDef] = pick.call("character")
	var plants: Array[PropDef] = pick.call("flower") + pick.call("plant_bush")
	session.edit("Demo", func() -> void:
		for group: Array in [[trees, 40], [rocks, 12], [plants, 40], [people, 8]]:
			var defs: Array[PropDef] = group[0]
			if defs.is_empty():
				continue
			for i in group[1]:
				var prop: PropDef = defs[rng.randi() % defs.size()]
				var pos := Snapping.for_prop(prop, Vector3(rng.randf_range(-24, 40), 0, rng.randf_range(-24, 40)), 0.0, false)
				if Vector2(pos.x + 8, pos.z - 20).length() < 8.0:
					continue  # keep the pond clear
				pos.y = TerrainEdit.height_at_world(session.doc, pos.x, pos.z)
				session.create_object("prop", {"prop": prop.id, "position": pos,
					"rotation": rng.randf() * TAU, "anim_offset": rng.randf()})
		var tent := library.get_prop("kenney_nature:tent_detailed_open")
		var fire := library.get_prop("kenney_nature:campfire_logs")
		if tent != null and fire != null:
			session.create_object("prop", {"prop": tent.id, "position": Vector3(6, 0, 4), "rotation": 0.6})
			session.create_object("prop", {"prop": fire.id, "position": Vector3(4, 0, 7), "rotation": 0.0})
		for i in 4:
			var wall := library.get_prop("kenney_town:wall_wood_window_shutters" if i % 2 == 0 else "kenney_town:wall_wood")
			if wall != null:
				session.create_object("prop", {"prop": wall.id, "position": Vector3(-10.5 + i * 3, 0, -4.5), "rotation": PI / 2}))
