class_name MergeDialog
extends ConfirmationDialog
## Reviews a merge before it happens: how many changes apply cleanly, and one row per conflict
## (terrain conflicts grouped per layer) with a Keep / Take choice. Rows default to taking the
## merged branch's value.

signal merge_confirmed(branch_id: String, resolutions: Dictionary)

var _branch_id := ""
var _summary: Label
var _tree: Tree
var _rows: Array[TreeItem] = []


func _init() -> void:
	title = "Merge branch"
	min_size = Vector2i(560, 300)
	ok_button_text = "Merge"
	var box := VBoxContainer.new()
	add_child(box)
	_summary = Label.new()
	_summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_summary.custom_minimum_size.x = 540  # autowrap labels need a width or they measure very tall
	box.add_child(_summary)
	_tree = Tree.new()
	_tree.columns = 4
	_tree.column_titles_visible = true
	_tree.hide_root = true
	_tree.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_tree.custom_minimum_size = Vector2(540, 160)
	_tree.set_column_expand_ratio(0, 3)
	box.add_child(_tree)
	add_button("Keep all", false, "keep_all")
	add_button("Take all", false, "take_all")
	custom_action.connect(func(action: StringName) -> void:
		for row in _rows:
			row.set_range(3, 0 if action == &"keep_all" else 1))
	confirmed.connect(func() -> void: merge_confirmed.emit(_branch_id, resolutions()))


func open(session: MapSession, branch_id: String) -> void:
	_branch_id = branch_id
	var src: Branch = session.branches[branch_id]
	var dst: Branch = session.branches[src.parent_id]
	var plan := session.merge_plan(branch_id)
	_summary.text = "Merge “%s” into “%s”: %d change%s apply cleanly, %d conflict%s." % [
		src.name, dst.name, plan.changes.size(), "" if plan.changes.size() == 1 else "s",
		plan.conflicts.size(), "" if plan.conflicts.size() == 1 else "s"]
	if plan.conflicts.is_empty():
		_summary.text += "\nThe branch is removed after merging; undo reverts the whole merge."
	_tree.clear()
	_rows.clear()
	_tree.visible = not plan.conflicts.is_empty()
	_tree.set_column_title(0, "Conflict")
	_tree.set_column_title(1, "In “%s”" % dst.name)
	_tree.set_column_title(2, "In “%s”" % src.name)
	_tree.set_column_title(3, "Result")
	var root := _tree.create_item()
	var terrain := {}  # layer -> [keys]
	for c in plan.conflicts:
		if c.kind == "terrain":
			terrain.get_or_add(c.layer, []).append(c.key)
			continue
		_add_row(root, describe(session.doc, c), format(c.mine), format(c.theirs), [c.key])
	for layer: String in terrain:
		var keys: Array = terrain[layer]
		_add_row(root, "Terrain %s (%d cells)" % [layer, keys.size()], "edited", "edited", keys)
	popup_centered_clamped(Vector2i(760, 480), 0.85)


## Conflict key -> Merge.MINE / Merge.THEIRS for every row.
func resolutions() -> Dictionary:
	var out := {}
	for row in _rows:
		var choice := Merge.MINE if row.get_range(3) == 0 else Merge.THEIRS
		for key: String in row.get_metadata(0):
			out[key] = choice
	return out


## Sets every row's choice (used by tests and the bulk buttons).
func choose_all(choice: String) -> void:
	for row in _rows:
		row.set_range(3, 0 if choice == Merge.MINE else 1)


func _add_row(root: TreeItem, what: String, mine: String, theirs: String, keys: Array) -> void:
	var row := _tree.create_item(root)
	row.set_text(0, what)
	row.set_text(1, mine)
	row.set_text(2, theirs)
	row.set_metadata(0, keys)
	row.set_cell_mode(3, TreeItem.CELL_MODE_RANGE)
	row.set_text(3, "Keep,Take")
	row.set_range(3, 1)
	row.set_editable(3, true)
	_rows.append(row)


static func describe(doc: MapDocument, c: Dictionary) -> String:
	var obj := doc.get_object(c.id)
	var what := "Object %s" % c.id.substr(0, 8)
	if c.id == MapDocument.SETTINGS_ID:
		what = "Map settings"
	elif obj != null:
		match obj.type:
			"building":
				what = "Building"
			"water":
				what = "Water"
			_:
				var prop := ObjectVisuals.prop_of(obj)
				what = prop.name if prop != null else obj.get_prop("prop", "Prop")
	if c.kind == "object":
		return "%s (exists / deleted)" % what
	return "%s · %s" % [what, c.path]


static func format(v: Variant) -> String:
	if v == null:
		return "—"
	if v is Vector3:
		return "(%.1f, %.1f, %.1f)" % [v.x, v.y, v.z]
	if v is float:
		return "%.2f" % v
	if v is Dictionary and v.has("deleted"):
		return "deleted" if v.deleted else "exists"
	if v is PackedVector2Array:
		return "%d points" % v.size()
	return str(v)
