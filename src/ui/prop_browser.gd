class_name PropBrowser
extends PanelContainer
## Left-hand prop library panel: text search, theme chips, category tree and a thumbnail grid.
## Choosing a prop starts placing it.

signal prop_chosen(prop: PropDef)
signal credits_pressed

const WIDTH := 330.0
const ICON := 64

var library: PropLibrary
var thumbnails: ThumbnailRenderer

var _search: LineEdit
var _themes: HFlowContainer
var _tree: Tree
var _list: ItemList
var _details: Label
var random_rotation: CheckBox

var _theme := ""
var _category := ""
var _theme_group := ButtonGroup.new()
var _index_of := {}  # prop id -> item index in _list


func _init() -> void:
	name = "PropBrowser"
	anchor_bottom = 1.0
	offset_left = 12
	offset_top = 12
	offset_right = 12 + WIDTH
	offset_bottom = -64

	var box := VBoxContainer.new()
	add_child(box)

	_search = LineEdit.new()
	_search.placeholder_text = "Search props…"
	_search.clear_button_enabled = true
	_search.text_changed.connect(func(_t: String) -> void: _refresh_results())
	box.add_child(_search)

	_themes = HFlowContainer.new()
	box.add_child(_themes)

	_tree = Tree.new()
	_tree.hide_root = true
	_tree.custom_minimum_size.y = 150
	_tree.item_selected.connect(_on_category_selected)
	box.add_child(_tree)

	_list = ItemList.new()
	_list.size_flags_vertical = SIZE_EXPAND_FILL
	_list.icon_mode = ItemList.ICON_MODE_TOP
	_list.max_columns = 0
	_list.same_column_width = true
	_list.fixed_column_width = ICON + 18
	_list.fixed_icon_size = Vector2i(ICON, ICON)
	_list.max_text_lines = 2
	_list.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_list.add_theme_font_size_override("font_size", 11)
	_list.item_selected.connect(_on_item_selected)
	box.add_child(_list)

	_details = Label.new()
	_details.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_details.add_theme_font_size_override("font_size", 12)
	_details.custom_minimum_size.y = 34
	box.add_child(_details)

	var row := HBoxContainer.new()
	box.add_child(row)
	random_rotation = CheckBox.new()
	random_rotation.text = "Random rotation"
	row.add_child(random_rotation)
	var credits := Button.new()
	credits.text = "Credits"
	credits.size_flags_horizontal = SIZE_SHRINK_END | SIZE_EXPAND
	credits.pressed.connect(credits_pressed.emit)
	row.add_child(credits)


func setup(p_library: PropLibrary, p_thumbnails: ThumbnailRenderer) -> void:
	library = p_library
	thumbnails = p_thumbnails
	thumbnails.thumbnail_ready.connect(_on_thumbnail_ready)
	_build_themes()
	_build_tree()
	_refresh_results()


## Clears the list selection (e.g. when leaving the place tool).
func deselect() -> void:
	_list.deselect_all()


func _build_themes() -> void:
	var counts := library.themes()
	var names: Array = counts.keys()
	names.sort()
	_add_theme_chip("all", "")
	for t: String in names:
		_add_theme_chip(t, t)


func _add_theme_chip(text: String, theme_name: String) -> void:
	var chip := Button.new()
	chip.text = text
	chip.toggle_mode = true
	chip.button_group = _theme_group
	chip.button_pressed = theme_name == _theme
	chip.add_theme_font_size_override("font_size", 11)
	chip.toggled.connect(func(on: bool) -> void:
		if on:
			_theme = theme_name
			_refresh_results())
	_themes.add_child(chip)


func _build_tree() -> void:
	_tree.clear()
	var root := _tree.create_item()
	var all := _tree.create_item(root)
	all.set_text(0, "All props (%d)" % library.props.size())
	all.set_metadata(0, "")
	var counts := library.categories()
	var paths: Array = counts.keys()
	paths.sort()
	var items := {"": root}
	for path: String in paths:
		var parent_path := path.get_base_dir() if path.contains("/") else ""
		var item := _tree.create_item(items.get(parent_path, root))
		item.set_text(0, "%s (%d)" % [path.get_file(), counts[path]])
		item.set_metadata(0, path)
		item.collapsed = true
		items[path] = item
	all.select(0)


func _on_category_selected() -> void:
	_category = _tree.get_selected().get_metadata(0)
	_refresh_results()


func _refresh_results() -> void:
	_list.clear()
	_index_of.clear()
	var results := library.search(_search.text, _theme, _category)
	for prop in results:
		var i := _list.add_item(prop.name, thumbnails.request(prop))
		_list.set_item_metadata(i, prop.id)
		_list.set_item_tooltip(i, "%s\n%s · %s" % [prop.name, prop.category, ", ".join(prop.themes)])
		_index_of[prop.id] = i
	thumbnails.prioritize(results)
	_details.text = "%d props" % results.size()


func _on_thumbnail_ready(prop_id: String, texture: Texture2D) -> void:
	if _index_of.has(prop_id):
		_list.set_item_icon(_index_of[prop_id], texture)


func _on_item_selected(index: int) -> void:
	var prop := library.get_prop(_list.get_item_metadata(index))
	if prop == null:
		return
	var a := prop.attribution
	_details.text = "%s — %s\n%s by %s (%s)" % [prop.name, prop.category, library.packs[prop.pack_id].name, a.get("author", "?"), a.get("license", "?")]
	prop_chosen.emit(prop)
