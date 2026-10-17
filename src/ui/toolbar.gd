class_name Toolbar
extends VBoxContainer
## Tool buttons (Select V, Terrain T, Water O, Build B) plus the options panel of the terrain
## and building tools.

signal tool_requested(tool_name: String)
signal level_requested(level: int)
signal roof_requested(style: String)
signal kit_requested(kit_id: String)

const TOOLS := [["select", "Select (V)"], ["terrain", "Terrain (T)"], ["water", "Water (O)"], ["building", "Build (B)"]]
const MODES := ["Raise", "Lower", "Smooth", "Flatten", "Paint"]
const BUILD_MODES := ["Foundation", "Erase", "Wall", "Door", "Window"]

var _buttons := {}
var _group := ButtonGroup.new()
var _options: PanelContainer
var _mode_buttons: Array[Button] = []
var _mode_group := ButtonGroup.new()
var _size: HSlider
var _strength: HSlider
var _swatches: HBoxContainer
var _swatch_group := ButtonGroup.new()
var _build: PanelContainer
var _build_mode_buttons: Array[Button] = []
var _build_group := ButtonGroup.new()
var _kits: OptionButton
var _level_label: Label
var _kit_ids: Array[String] = []


func _init() -> void:
	name = "Toolbar"
	position = Vector2(PropBrowser.WIDTH + 28, 12)
	var row := HBoxContainer.new()
	add_child(row)
	for t in TOOLS:
		var b := Button.new()
		b.text = t[1]
		b.toggle_mode = true
		b.button_group = _group
		b.focus_mode = Control.FOCUS_NONE
		b.pressed.connect(func() -> void: tool_requested.emit(t[0]))
		row.add_child(b)
		_buttons[t[0]] = b
	_build_options()
	_build_building_options()


## Fills the kit list (call once the library is loaded).
func setup(library: PropLibrary) -> void:
	_kits.clear()
	_kit_ids.clear()
	var ids: Array = library.kits.keys()
	ids.sort()
	for id: String in ids:
		_kits.add_item(library.kits[id].name)
		_kit_ids.append(id)


## Reflects the active tool ("" for none, e.g. while placing a prop).
func show_tool(tool_name: String) -> void:
	for key: String in _buttons:
		_buttons[key].set_pressed_no_signal(key == tool_name)
	_options.visible = tool_name == "terrain"
	_build.visible = tool_name == "building"
	refresh()


func refresh() -> void:
	for i in _mode_buttons.size():
		_mode_buttons[i].set_pressed_no_signal(i == TerrainTool.mode)
	_size.set_value_no_signal(TerrainTool.radius)
	_strength.set_value_no_signal(TerrainTool.strength)
	_swatches.visible = TerrainTool.mode == TerrainBrush.Mode.PAINT
	for i in _swatches.get_child_count():
		(_swatches.get_child(i) as Button).set_pressed_no_signal(i == TerrainTool.material)
	for i in _build_mode_buttons.size():
		_build_mode_buttons[i].set_pressed_no_signal(i == BuildingTool.mode)
	_level_label.text = "Level %d" % BuildingTool.level
	var k := _kit_ids.find(BuildingTool.kit_id)
	if k >= 0:
		_kits.select(k)


func _build_options() -> void:
	_options = PanelContainer.new()
	_options.visible = false
	add_child(_options)
	var box := VBoxContainer.new()
	_options.add_child(box)

	var modes := HBoxContainer.new()
	box.add_child(modes)
	for i in MODES.size():
		var b := Button.new()
		b.text = MODES[i]
		b.toggle_mode = true
		b.button_group = _mode_group
		b.focus_mode = Control.FOCUS_NONE
		b.pressed.connect(func() -> void:
			TerrainTool.mode = i as TerrainBrush.Mode
			refresh())
		modes.add_child(b)
		_mode_buttons.append(b)

	var grid := GridContainer.new()
	grid.columns = 2
	box.add_child(grid)
	_size = _slider(grid, "Size  [ ]", 1.0, 32.0, 0.5, func(v: float) -> void: TerrainTool.radius = v)
	_strength = _slider(grid, "Strength  ⇧[ ]", 0.05, 1.0, 0.05, func(v: float) -> void: TerrainTool.strength = v)

	_swatches = HBoxContainer.new()
	box.add_child(_swatches)
	for i in TerrainPalette.MATERIALS.size():
		var m: Dictionary = TerrainPalette.MATERIALS[i]
		var b := Button.new()
		b.toggle_mode = true
		b.button_group = _swatch_group
		b.focus_mode = Control.FOCUS_NONE
		b.tooltip_text = m.name
		b.custom_minimum_size = Vector2(26, 26)
		var style := StyleBoxFlat.new()
		style.bg_color = m.color
		style.set_border_width_all(2)
		style.border_color = Color(0, 0, 0, 0.4)
		var pressed := style.duplicate()
		pressed.border_color = Color(1.0, 0.85, 0.3)
		pressed.set_border_width_all(3)
		b.add_theme_stylebox_override("normal", style)
		b.add_theme_stylebox_override("hover", style)
		b.add_theme_stylebox_override("pressed", pressed)
		b.pressed.connect(func() -> void: TerrainTool.material = i)
		_swatches.add_child(b)


func _build_building_options() -> void:
	_build = PanelContainer.new()
	_build.visible = false
	add_child(_build)
	var box := VBoxContainer.new()
	_build.add_child(box)

	var modes := HBoxContainer.new()
	box.add_child(modes)
	for i in BUILD_MODES.size():
		var b := Button.new()
		b.text = BUILD_MODES[i]
		b.toggle_mode = true
		b.button_group = _build_group
		b.focus_mode = Control.FOCUS_NONE
		b.pressed.connect(func() -> void:
			BuildingTool.mode = i as BuildingTool.Mode
			refresh())
		modes.add_child(b)
		_build_mode_buttons.append(b)

	var row := HBoxContainer.new()
	box.add_child(row)
	_kits = OptionButton.new()
	_kits.focus_mode = Control.FOCUS_NONE
	_kits.item_selected.connect(func(i: int) -> void: kit_requested.emit(_kit_ids[i]))
	row.add_child(_kits)
	var down := Button.new()
	down.text = "▼"
	down.focus_mode = Control.FOCUS_NONE
	down.tooltip_text = "Level down (PageDown / ,)"
	down.pressed.connect(func() -> void: level_requested.emit(BuildingTool.level - 1))
	row.add_child(down)
	_level_label = Label.new()
	row.add_child(_level_label)
	var up := Button.new()
	up.text = "▲"
	up.focus_mode = Control.FOCUS_NONE
	up.tooltip_text = "Level up (PageUp / .)"
	up.pressed.connect(func() -> void: level_requested.emit(BuildingTool.level + 1))
	row.add_child(up)

	var roofs := HBoxContainer.new()
	box.add_child(roofs)
	var label := Label.new()
	label.text = "Roof"
	roofs.add_child(label)
	for style in BuildingLayout.ROOF_STYLES:
		var b := Button.new()
		b.text = style.capitalize()
		b.focus_mode = Control.FOCUS_NONE
		b.pressed.connect(func() -> void: roof_requested.emit(style))
		roofs.add_child(b)


func _slider(grid: GridContainer, text: String, lo: float, hi: float, step: float, on_change: Callable) -> HSlider:
	var label := Label.new()
	label.text = text
	grid.add_child(label)
	var s := HSlider.new()
	s.min_value = lo
	s.max_value = hi
	s.step = step
	s.custom_minimum_size.x = 160
	s.focus_mode = Control.FOCUS_NONE
	s.value_changed.connect(on_change)
	grid.add_child(s)
	return s
