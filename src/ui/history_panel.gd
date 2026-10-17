class_name HistoryPanel
extends PanelContainer
## Branches and history. Top: the branch tree (current branch marked) with New / Switch / Merge /
## Rename / Discard. Bottom: the current branch's transactions, newest first, with entries from
## before its fork point dimmed; "Branch from here" starts a branch at the selected entry.
## The panel only emits requests; EditorMain performs them on the session.

signal new_branch_requested(branch_id: String, seq: int)  # seq -1: at the current head
signal switch_requested(branch_id: String)
signal merge_requested(branch_id: String)
signal rename_requested(branch_id: String)
signal discard_requested(branch_id: String)
signal undo_requested
signal redo_requested

const KIND_PREFIX := {"undo": "↶ Undo: ", "redo": "↷ Redo: ", "merge": "⇄ ", "edit": ""}
const DIM := Color(1, 1, 1, 0.45)

var session: MapSession

var _content: VBoxContainer
var _toggle: Button
var _tree: Tree
var _history: ItemList
var _merge: Button
var _discard: Button
var _rename: Button
var _switch: Button
var _from_here: Button


func _init() -> void:
	name = "HistoryPanel"
	anchor_left = 1.0
	anchor_right = 1.0
	anchor_bottom = 1.0
	offset_left = -292
	offset_right = -12
	offset_top = 372
	offset_bottom = -12
	grow_horizontal = GROW_DIRECTION_BEGIN

	var box := VBoxContainer.new()
	add_child(box)
	var header := HBoxContainer.new()
	box.add_child(header)
	var title := Label.new()
	title.text = "Branches & history"
	title.size_flags_horizontal = SIZE_EXPAND_FILL
	header.add_child(title)
	_toggle = Button.new()
	_toggle.text = "▾"
	_toggle.flat = true
	_toggle.focus_mode = FOCUS_NONE
	_toggle.pressed.connect(func() -> void:
		_content.visible = not _content.visible
		_toggle.text = "▾" if _content.visible else "▸"
		size_flags_vertical = SIZE_FILL
		offset_bottom = -12 if _content.visible else offset_top + 40)
	header.add_child(_toggle)

	_content = VBoxContainer.new()
	_content.size_flags_vertical = SIZE_EXPAND_FILL
	box.size_flags_vertical = SIZE_EXPAND_FILL
	box.add_child(_content)

	_tree = Tree.new()
	_tree.hide_root = true
	_tree.custom_minimum_size.y = 70
	_tree.item_selected.connect(_update_buttons)
	_tree.item_activated.connect(func() -> void: switch_requested.emit(_selected_branch()))
	_content.add_child(_tree)

	var row1 := HBoxContainer.new()
	_content.add_child(row1)
	_button(row1, "New", "Branch from the current state", func() -> void:
		new_branch_requested.emit(session.current_branch, -1))
	_switch = _button(row1, "Switch", "Show this branch (or double-click it)", func() -> void:
		switch_requested.emit(_selected_branch()))
	_merge = _button(row1, "Merge ↑", "Fold this branch into its parent", func() -> void:
		merge_requested.emit(_selected_branch()))
	var row2 := HBoxContainer.new()
	_content.add_child(row2)
	_rename = _button(row2, "Rename", "", func() -> void: rename_requested.emit(_selected_branch()))
	_discard = _button(row2, "Discard", "Delete this branch and its sub-branches", func() -> void:
		discard_requested.emit(_selected_branch()))

	var hist_title := Label.new()
	hist_title.text = "History"
	_content.add_child(hist_title)
	_history = ItemList.new()
	_history.size_flags_vertical = SIZE_EXPAND_FILL
	_history.custom_minimum_size.y = 60
	_history.add_theme_font_size_override("font_size", 12)
	_history.item_selected.connect(func(_i: int) -> void: _from_here.disabled = false)
	_content.add_child(_history)

	var row3 := HBoxContainer.new()
	_content.add_child(row3)
	_button(row3, "Undo", "Cmd+Z", undo_requested.emit)
	_button(row3, "Redo", "Cmd+Shift+Z", redo_requested.emit)
	_from_here = _button(row3, "Branch here", "Start a branch at the selected entry", func() -> void:
		var items := _history.get_selected_items()
		if not items.is_empty():
			var meta: Dictionary = _history.get_item_metadata(items[0])
			new_branch_requested.emit(meta.branch_id, meta.seq))


func bind(p_session: MapSession) -> void:
	if session != null:
		session.history_changed.disconnect(refresh)
	session = p_session
	session.history_changed.connect(refresh)
	refresh()


func refresh() -> void:
	_tree.clear()
	var root := _tree.create_item()
	_add_branch(root, MapSession.MAIN)
	_history.clear()
	for entry in session.history(session.current_branch, 300):
		var txn: Transaction = entry.txn
		var when := Time.get_datetime_dict_from_unix_time(int(txn.time))
		var text := "%s%s   %02d:%02d" % [KIND_PREFIX.get(txn.kind, ""), txn.label, when.hour, when.minute]
		var i := _history.add_item(text)
		_history.set_item_metadata(i, {"branch_id": entry.branch_id, "seq": entry.seq})
		_history.set_item_tooltip(i, "%s · %d ops · by %s%s" % [txn.label, txn.ops.size(), txn.author,
			"\n(from parent branch)" if entry.inherited else ""])
		if entry.inherited:
			_history.set_item_custom_fg_color(i, DIM)
	_from_here.disabled = true
	_update_buttons()


func _add_branch(parent: TreeItem, id: String) -> void:
	var b: Branch = session.branches[id]
	var item := _tree.create_item(parent)
	var current := id == session.current_branch
	item.set_text(0, "%s%s  (%d)" % ["● " if current else "", b.name, b.txns.size()])
	item.set_metadata(0, id)
	if current:
		item.select(0)
	var kids := session.children_of(id)
	kids.sort_custom(func(a: String, c: String) -> bool: return session.branches[a].created_time < session.branches[c].created_time)
	for child in kids:
		_add_branch(item, child)


func _selected_branch() -> String:
	var item := _tree.get_selected()
	return item.get_metadata(0) if item != null else session.current_branch


func _update_buttons() -> void:
	var id := _selected_branch()
	var is_main := id == MapSession.MAIN
	_switch.disabled = id == session.current_branch
	_discard.disabled = is_main
	_merge.disabled = is_main or not session.children_of(id).is_empty()
	_merge.tooltip_text = "Merge or discard its sub-branches first" if not is_main and _merge.disabled else "Fold this branch into its parent"


func _button(row: HBoxContainer, text: String, tip: String, on_press: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.tooltip_text = tip
	b.focus_mode = FOCUS_NONE
	b.size_flags_horizontal = SIZE_EXPAND_FILL
	b.pressed.connect(on_press)
	row.add_child(b)
	return b
