class_name Hud
extends Control
## Editor overlay: status line, key hints, and the view settings panel.
## Panel edits are player overrides; labels of overridden values are highlighted.

signal make_map_default_pressed

const OVERRIDE_COLOR := Color(1.0, 0.85, 0.4)

var settings: ViewSettings
var info: Label
var _box: Panel

var _fields := {}  # settings key -> {control, label, kind}


func _init() -> void:
	name = "Hud"
	mouse_filter = MOUSE_FILTER_IGNORE
	set_anchors_preset(PRESET_FULL_RECT)

	info = Label.new()
	info.anchor_top = 1.0
	info.anchor_bottom = 1.0
	info.offset_left = PropBrowser.WIDTH + 28
	info.offset_top = -118
	info.grow_vertical = GROW_DIRECTION_BEGIN
	info.add_theme_color_override("font_outline_color", Color.BLACK)
	info.add_theme_constant_override("outline_size", 4)
	add_child(info)

	var hints := Label.new()
	hints.text = "Camera: MMB / Space+drag pan · RMB / Alt+drag orbit · wheel / pinch zoom · WASD move · Q/E turn · 1/2/3 views · P perspective · G grid\n" \
		+ "Tools: V select · T terrain · O water · B build (PgUp/PgDn level) · pick a prop to place.  Edit: Shift+click add · drag box · drag to move (Cmd = no snap) · R rotate · PgUp/PgDn or =/- raise/lower · Del · Cmd+D · Cmd+C/V · I pick prop · F focus · Cmd+Z / Cmd+Shift+Z · Cmd+S/O/N"
	hints.anchor_top = 1.0
	hints.anchor_bottom = 1.0
	hints.anchor_right = 1.0
	hints.offset_left = 12
	hints.offset_right = -316  # leave room for the right-hand panels
	hints.offset_top = -52
	hints.grow_vertical = GROW_DIRECTION_BEGIN
	hints.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hints.add_theme_color_override("font_outline_color", Color.BLACK)
	hints.add_theme_constant_override("outline_size", 4)
	hints.add_theme_font_size_override("font_size", 13)
	add_child(hints)

	_build_panel()

	_box = Panel.new()
	_box.mouse_filter = MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color = Color(1.0, 0.8, 0.3, 0.12)
	style.border_color = Color(1.0, 0.8, 0.3, 0.9)
	style.set_border_width_all(1)
	_box.add_theme_stylebox_override("panel", style)
	_box.visible = false
	add_child(_box)


## Shows the box-select rectangle (an empty rect hides it).
func set_box(rect: Rect2) -> void:
	_box.visible = rect.has_area()
	_box.position = rect.position
	_box.size = rect.size


func setup(p_settings: ViewSettings) -> void:
	settings = p_settings
	settings.changed.connect(refresh)
	refresh()


func refresh() -> void:
	for key: String in _fields:
		var f: Dictionary = _fields[key]
		var value: Variant = settings.get_value(key)
		match f.kind:
			"range":
				f.control.set_value_no_signal(float(value) / f.scale)
			"check":
				f.control.set_pressed_no_signal(value == f.on)
		f.label.modulate = OVERRIDE_COLOR if settings.overrides.has(key) else Color.WHITE


func _build_panel() -> void:
	var panel := PanelContainer.new()
	panel.anchor_left = 1.0
	panel.anchor_right = 1.0
	panel.offset_left = -292
	panel.offset_right = -12
	panel.offset_top = 12
	panel.grow_horizontal = GROW_DIRECTION_BEGIN
	add_child(panel)

	var box := VBoxContainer.new()
	panel.add_child(box)
	var title := Label.new()
	title.text = "View"
	box.add_child(title)

	var grid := GridContainer.new()
	grid.columns = 2
	box.add_child(grid)
	_add_spin(grid, "pixel_size", "Pixel size", 1, 8, 1)
	_add_spin(grid, "color_levels", "Color levels (0 = off)", 0, 64, 1)
	_add_slider(grid, "dither", "Dither", 0.0, 1.0, 0.05)
	_add_slider(grid, "time_of_day", "Time of day", 0.0, 24.0, 0.25)
	_add_check(grid, "time_mode", "Day/night cycle", "cycle", "fixed")
	_add_spin(grid, "day_length", "Day length (min)", 0.5, 120.0, 0.5, 60.0)
	_add_check(grid, "grid", "Grid", true, false)
	_add_check(grid, "projection", "Perspective", "perspective", "orthographic")

	var make_default := Button.new()
	make_default.text = "Make these the map defaults"
	make_default.pressed.connect(make_map_default_pressed.emit)
	box.add_child(make_default)
	var reset := Button.new()
	reset.text = "Use map defaults"
	reset.pressed.connect(func() -> void: settings.clear_overrides())
	box.add_child(reset)


func _row_label(grid: GridContainer, text: String) -> Label:
	var label := Label.new()
	label.text = text
	label.size_flags_horizontal = SIZE_EXPAND_FILL
	grid.add_child(label)
	return label


## `scale` converts between stored and shown values (stored = shown * scale).
func _add_spin(grid: GridContainer, key: String, text: String, lo: float, hi: float, step: float, scale: float = 1.0) -> void:
	var label := _row_label(grid, text)
	var spin := SpinBox.new()
	spin.min_value = lo
	spin.max_value = hi
	spin.step = step
	spin.value_changed.connect(func(v: float) -> void:
		var stored: Variant = v * scale
		if ViewSettings.DEFAULTS[key] is int:
			stored = int(stored)
		settings.set_override(key, stored))
	grid.add_child(spin)
	_fields[key] = {"control": spin, "label": label, "kind": "range", "scale": scale}


func _add_slider(grid: GridContainer, key: String, text: String, lo: float, hi: float, step: float) -> void:
	var label := _row_label(grid, text)
	var slider := HSlider.new()
	slider.min_value = lo
	slider.max_value = hi
	slider.step = step
	slider.custom_minimum_size.x = 110
	slider.value_changed.connect(func(v: float) -> void: settings.set_override(key, v))
	grid.add_child(slider)
	_fields[key] = {"control": slider, "label": label, "kind": "range", "scale": 1.0}


func _add_check(grid: GridContainer, key: String, text: String, on: Variant, off: Variant) -> void:
	var label := _row_label(grid, text)
	var check := CheckBox.new()
	check.toggled.connect(func(pressed: bool) -> void: settings.set_override(key, on if pressed else off))
	grid.add_child(check)
	_fields[key] = {"control": check, "label": label, "kind": "check", "on": on}
