class_name SelectTool
extends EditorTool
## Default tool. Click selects (Shift toggles), drag on empty ground box-selects, drag a
## selected object to move the selection (with snapping; a single object re-seats onto surfaces).
## Keys: R / Shift+R rotate, Delete remove, Cmd+D duplicate, Cmd+C / Cmd+V copy/paste,
## I pick the prop under the cursor, F focus selection, Esc deselect.
## Objects sitting on a selected object (children) move, rotate, copy and delete with it.

enum Mode { NONE, PENDING, MOVE, BOX }

const DRAG_THRESHOLD := 4.0

static var _clipboard: Array[Dictionary] = []

var _mode := Mode.NONE
var _press_pos := Vector2.ZERO
var _press_hit := ""
var _shift := false

# Move state
var _moving: Array[String] = []
var _starts := {}  # id -> Vector3
var _primary := ""
var _grab_offset := Vector3.ZERO
var _delta := Vector3.ZERO
var _new_parent: Variant = null  # String for single-root moves, null = keep parents
var _exclude: Array[RID] = []


func deactivate() -> void:
	_cancel_move()
	main.hud.set_box(Rect2())


func on_press(pos: Vector2, event: InputEventMouseButton) -> void:
	_press_pos = pos
	_shift = event.shift_pressed
	var hit := main.pick_object(pos)
	_press_hit = hit.get("id", "")
	if _shift and _press_hit != "":
		main.selection.toggle(_press_hit)
		_mode = Mode.NONE
		return
	if _press_hit != "" and not main.selection.has(_press_hit):
		main.selection.set_ids([_press_hit])
	_mode = Mode.PENDING


func on_motion(pos: Vector2) -> void:
	match _mode:
		Mode.PENDING:
			if pos.distance_to(_press_pos) >= DRAG_THRESHOLD:
				if _press_hit != "":
					_start_move()
				else:
					_mode = Mode.BOX
				on_motion(pos)
		Mode.MOVE:
			_update_move(pos)
		Mode.BOX:
			main.hud.set_box(Rect2(_press_pos, pos - _press_pos).abs())


func on_release(pos: Vector2, _event: InputEventMouseButton) -> void:
	match _mode:
		Mode.PENDING:
			if _press_hit == "" and not _shift:
				main.selection.clear()
		Mode.MOVE:
			_commit_move()
		Mode.BOX:
			_box_select(Rect2(_press_pos, pos - _press_pos).abs())
			main.hud.set_box(Rect2())
	_mode = Mode.NONE


func on_key(event: InputEventKey) -> bool:
	var cmd := event.is_command_or_control_pressed()
	match event.keycode:
		KEY_ESCAPE:
			if _mode == Mode.MOVE:
				_cancel_move()
				_mode = Mode.NONE
			else:
				main.selection.clear()
		KEY_DELETE, KEY_BACKSPACE:
			_delete_selection()
		KEY_R:
			_rotate_selection(-1.0 if event.shift_pressed else 1.0)
		KEY_D when cmd:
			_duplicate_selection()
		KEY_C when cmd:
			_copy_selection()
		KEY_V when cmd:
			_paste()
		KEY_I:
			var hit := main.pick_object(main.cursor_screen)
			var prop := ObjectVisuals.prop_of(main.session.doc.get_object(hit.id)) if not hit.is_empty() else null
			if prop != null:
				main.choose_prop(prop, float(main.session.doc.get_prop(hit.id, "rotation", 0.0)))
		KEY_F:
			if not main.selection.is_empty():
				main.rig.focus = _centroid(main.selection.list())
		_:
			return false
	return true


# --- Move ------------------------------------------------------------------

func _start_move() -> void:
	_mode = Mode.MOVE
	var doc := main.session.doc
	_moving = Selection.with_descendants(doc, main.selection.list())
	_starts.clear()
	for id in _moving:
		_starts[id] = doc.get_prop(id, "position", Vector3.ZERO)
	_primary = _press_hit
	var ground: Variant = main.rig.ground_point(_press_pos)
	_grab_offset = (_starts[_primary] - ground) if ground != null else Vector3.ZERO
	_grab_offset.y = 0.0
	_exclude = main.world.body_rids(_moving)
	_delta = Vector3.ZERO
	_new_parent = null


func _update_move(pos: Vector2) -> void:
	var doc := main.session.doc
	var start: Vector3 = _starts[_primary]
	var target := start
	var single_root := main.selection.list().size() == 1
	var prop := ObjectVisuals.prop_of(doc.get_object(_primary))
	var yaw := float(doc.get_prop(_primary, "rotation", 0.0))
	var free := Input.is_key_pressed(KEY_META) or Input.is_key_pressed(KEY_CTRL)
	_new_parent = null

	var surface := {}
	if single_root and prop != null and prop.align == "surface":
		surface = main.pick_object(pos, _exclude)
		if not surface.is_empty() and surface.normal.y <= 0.7:
			surface = {}
	if not surface.is_empty():
		target = surface.position
		_new_parent = surface.id
	else:
		var ground: Variant = main.rig.ground_point(pos)
		if ground == null:
			return
		target = ground + _grab_offset
		target.y = 0.0 if single_root else start.y
		if single_root:
			_new_parent = ""
	if prop != null:
		var snapped := Snapping.for_prop(prop, target, yaw, free)
		target = Vector3(snapped.x, target.y, snapped.z)
	elif not free:
		target = Vector3(snappedf(target.x, 0.5), target.y, snappedf(target.z, 0.5))

	_delta = target - start
	for id in _moving:
		main.world.preview(id, _starts[id] + _delta, float(doc.get_prop(id, "rotation", 0.0)))


func _commit_move() -> void:
	var doc := main.session.doc
	var moving := _moving.duplicate()
	var delta := _delta
	var primary := _primary
	var new_parent: Variant = _new_parent
	var starts := _starts.duplicate()
	_moving.clear()
	main.session.edit("Move", func() -> void:
		for id in moving:
			if delta != Vector3.ZERO:
				main.session.set_prop(id, "position", starts[id] + delta)
		if new_parent != null:
			var value: Variant = new_parent if new_parent != "" else null
			if not Codec.same(doc.get_prop(primary, "parent"), value):
				main.session.set_prop(primary, "parent", value))
	for id in moving:
		main.world.refresh(id)


func _cancel_move() -> void:
	for id in _moving:
		main.world.refresh(id)
	_moving.clear()


# --- Commands --------------------------------------------------------------

func _box_select(rect: Rect2) -> void:
	var picked: Array[String] = []
	if _shift:
		picked = main.selection.list()
	for id in main.objects_in_screen_rect(rect):
		if not id in picked:
			picked.append(id)
	main.selection.set_ids(picked)


func _delete_selection() -> void:
	if main.selection.is_empty():
		return
	var ids := Selection.with_descendants(main.session.doc, main.selection.list())
	main.session.edit("Delete", func() -> void:
		for id in ids:
			main.session.delete_object(id))


## Rotates the selection about its centroid by one snap step of the first selected prop.
func _rotate_selection(direction: float) -> void:
	var roots := main.selection.list()
	if roots.is_empty():
		return
	var doc := main.session.doc
	var prop := ObjectVisuals.prop_of(doc.get_object(roots[0]))
	var angle := deg_to_rad(prop.rotate_snap_deg if prop != null else 90.0) * direction
	var pivot := _centroid(roots)
	var ids := Selection.with_descendants(doc, roots)
	main.session.edit("Rotate", func() -> void:
		for id in ids:
			var p: Vector3 = doc.get_prop(id, "position", Vector3.ZERO)
			var offset := (p - pivot).rotated(Vector3.UP, angle)
			main.session.set_prop(id, "position", Vector3(pivot.x + offset.x, p.y, pivot.z + offset.z))
			main.session.set_prop(id, "rotation", wrapf(float(doc.get_prop(id, "rotation", 0.0)) + angle, -PI, PI)))


func _duplicate_selection() -> void:
	if main.selection.is_empty():
		return
	var doc := main.session.doc
	var prop := ObjectVisuals.prop_of(doc.get_object(main.selection.list()[0]))
	var step := prop.step if prop != null and prop.mode == "grid" else 1.0
	var items := _snapshot(main.selection.list())
	var new_roots := _instantiate(items, Vector3(step, 0, step), "Duplicate")
	main.selection.set_ids(new_roots)


func _copy_selection() -> void:
	if main.selection.is_empty():
		return
	_clipboard = _snapshot(main.selection.list())


func _paste() -> void:
	if _clipboard.is_empty():
		return
	var ground: Variant = main.rig.ground_point(main.cursor_screen)
	if ground == null:
		return
	var center := Vector3.ZERO
	var roots := 0
	for item in _clipboard:
		if item.root:
			center += item.props.position
			roots += 1
	center /= maxi(roots, 1)
	var offset: Vector3 = Vector3(snappedf(ground.x, 0.5), 0, snappedf(ground.z, 0.5)) - Vector3(center.x, 0, center.z)
	main.selection.set_ids(_instantiate(_clipboard, offset, "Paste"))


## Copies of the given objects and their descendants: [{id, type, props, root}].
func _snapshot(roots: Array[String]) -> Array[Dictionary]:
	var doc := main.session.doc
	var out: Array[Dictionary] = []
	for id in Selection.with_descendants(doc, roots):
		var obj := doc.get_object(id)
		out.append({"id": id, "type": obj.type, "props": obj.props.duplicate(true), "root": id in roots})
	return out


## Creates copies offset by `offset`, remapping parents inside the copied set. Returns new root ids.
func _instantiate(items: Array[Dictionary], offset: Vector3, label: String) -> Array[String]:
	var new_roots: Array[String] = []
	main.session.edit(label, func() -> void:
		var remap := {}
		for item in items:
			var props: Dictionary = item.props.duplicate(true)
			props.erase("parent")
			props.position = props.get("position", Vector3.ZERO) + offset
			var new_id := main.session.create_object(item.type, props)
			remap[item.id] = new_id
			if item.root:
				new_roots.append(new_id)
		for item in items:
			var parent: Variant = item.props.get("parent")
			if parent != null and remap.has(parent):
				main.session.set_prop(remap[item.id], "parent", remap[parent]))
	return new_roots


func _centroid(ids: Array[String]) -> Vector3:
	var sum := Vector3.ZERO
	for id in ids:
		sum += main.session.doc.get_prop(id, "position", Vector3.ZERO)
	return sum / maxi(ids.size(), 1)
