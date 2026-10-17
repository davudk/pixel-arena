class_name EditorMain
extends Control
## Editor root: wires the session, 3D view, camera, lighting, view settings, HUD and input.
##
## Command-line (after `--`):
##   --demo               scatter test boxes over a few chunks
##   --screenshot=<path>  save a PNG of the window after a few frames, then quit
##   --view=<key>=<value> override a view setting for this run only (not saved)

const TEST_BOX_KINDS := 6

var session: MapSession
var settings := ViewSettings.new()
var file_path := ""
var dirty := false
var cursor_screen := Vector2.ZERO

var pixel_view: PixelView
var rig: CameraRig
var day: DayCycle
var ground: Ground
var world: WorldView
var hud: Hud
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
	world = WorldView.new()
	world.name = "Objects"
	root3d.add_child(world)
	rig = CameraRig.new()
	rig.name = "CameraRig"
	rig.pixel_view = pixel_view
	rig.moved.connect(_on_camera_moved)
	root3d.add_child(rig)
	pixel_view.resized.connect(rig.apply)

	hud = Hud.new()
	add_child(hud)
	hud.make_map_default_pressed.connect(_make_view_map_default)

	controller = EditorController.new()
	controller.name = "EditorController"
	controller.main = self
	controller.rig = rig
	add_child(controller)

	settings.changed.connect(_apply_settings)
	settings.load_overrides()
	hud.setup(settings)
	set_session(MapSession.new())
	_handle_command_line()


func _process(_delta: float) -> void:
	var hit: Variant = rig.ground_point(cursor_screen)
	var cursor := "-"
	if hit != null:
		var cell := Vector2i(floori(hit.x), floori(hit.z))
		var chunk := MapDocument.chunk_of(hit)
		cursor = "(%.1f, %.1f)  cell %d,%d  chunk %d,%d" % [hit.x, hit.z, cell.x, cell.y, chunk.x, chunk.y]
	var hours := int(day.time_of_day)
	info_text("FPS %d   cursor %s\nchunks %d   objects %d   branch %s   %02d:%02d   zoom %.0f m" % [
		Engine.get_frames_per_second(), cursor, world.chunk_count(), world.object_count(),
		session.branch().name, hours, int((day.time_of_day - hours) * 60.0), rig.zoom])


func info_text(text: String) -> void:
	hud.info.text = text


func set_session(s: MapSession) -> void:
	if session != null:
		session.history_changed.disconnect(_on_history_changed)
	session = s
	session.history_changed.connect(_on_history_changed)
	world.bind(session.doc)
	settings.bind(session.doc)
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


## Temporary until the prop library (M3): drop a placeholder box on the cell under the cursor.
func place_test_box(screen_pos: Vector2) -> void:
	var hit: Variant = rig.ground_point(screen_pos)
	if hit == null:
		return
	var pos := Vector3(floorf(hit.x) + 0.5, 0.0, floorf(hit.z) + 0.5)
	var kind := randi() % TEST_BOX_KINDS
	session.edit("Place box", func() -> void:
		session.create_object("prop", {"prop": "debug:box_%d" % kind, "position": pos, "rotation": 0.0}))


func remove_test_box(screen_pos: Vector2) -> void:
	var hit: Variant = rig.ground_point(screen_pos)
	if hit == null:
		return
	var nearest := ""
	var best := 0.75
	var center := MapDocument.chunk_of(hit)
	for dz in range(-1, 2):
		for dx in range(-1, 2):
			for id in session.doc.objects_in_chunk(center + Vector2i(dx, dz)):
				var p: Vector3 = session.doc.get_prop(id, "position")
				var d := Vector2(p.x - hit.x, p.z - hit.z).length()
				if d < best:
					best = d
					nearest = id
	if nearest != "":
		session.edit("Remove box", func() -> void: session.delete_object(nearest))


# --- Internals -------------------------------------------------------------

func _apply_settings() -> void:
	pixel_view.pixel_size = settings.get_value("pixel_size")
	pixel_view.set_post(settings.get_value("color_levels"), settings.get_value("dither"))
	ground.set_grid_visible(settings.get_value("grid"))
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
		elif arg == "--demo":
			_scatter_demo()
		elif arg.begins_with("--screenshot="):
			screenshot = arg.trim_prefix("--screenshot=")
	if screenshot != "":
		for i in 20:
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
	session.edit("Demo", func() -> void:
		for i in 60:
			var pos := Vector3(rng.randi_range(-20, 40) + 0.5, 0.0, rng.randi_range(-20, 40) + 0.5)
			session.create_object("prop", {"prop": "debug:box_%d" % (i % TEST_BOX_KINDS), "position": pos})
		session.create_object("prop", {"prop": "debug:far", "position": Vector3(3200.5, 0, 3200.5)}))
