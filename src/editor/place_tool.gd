class_name PlaceTool
extends EditorTool
## Places the chosen prop: a see-through ghost follows the cursor with the prop's snapping;
## click to place (repeatedly). Props that allow surface placement sit on whatever is under the
## cursor and become its children. R / Shift+R rotate, Cmd/Ctrl held disables snapping,
## Esc returns to selection.

var prop: PropDef
var yaw := 0.0
var random_rotation := false

var _ghost: Node3D
var _target := {}  # {position, parent} for the current cursor position


func _init(p_prop: PropDef) -> void:
	prop = p_prop


func activate() -> void:
	_ghost = ObjectVisuals.build_ghost(prop)
	_ghost.visible = false
	main.world.add_child(_ghost)
	on_motion(main.cursor_screen)


func deactivate() -> void:
	if _ghost != null:
		_ghost.queue_free()
		_ghost = null


func on_motion(pos: Vector2) -> void:
	_target = _compute_target(pos)
	_ghost.visible = not _target.is_empty()
	if _ghost.visible:
		_ghost.global_position = _target.position
		_ghost.rotation.y = yaw


func on_press(pos: Vector2, _event: InputEventMouseButton) -> void:
	on_motion(pos)
	if _target.is_empty():
		return
	var props := {
		"prop": prop.id,
		"position": _target.position,
		"rotation": yaw,
		"anim_offset": randf(),
	}
	if _target.parent != "":
		props.parent = _target.parent
	main.session.edit("Place " + prop.name, func() -> void:
		main.session.create_object("prop", props))
	if random_rotation:
		yaw = Snapping.snap_yaw(randf() * TAU, prop.rotate_snap_deg)
		on_motion(pos)


func on_key(event: InputEventKey) -> bool:
	match event.keycode:
		KEY_R:
			var step := deg_to_rad(maxf(prop.rotate_snap_deg, 1.0))
			yaw = wrapf(yaw + (-step if event.shift_pressed else step), -PI, PI)
			on_motion(main.cursor_screen)
			return true
		KEY_ESCAPE:
			main.set_tool(SelectTool.new())
			return true
	return false


func _compute_target(pos: Vector2) -> Dictionary:
	var free := Input.is_key_pressed(KEY_META) or Input.is_key_pressed(KEY_CTRL)
	if prop.align == "surface":
		var hit := main.pick_object(pos)
		if not hit.is_empty() and hit.normal.y > 0.7:
			var p := Snapping.for_prop(prop, hit.position, yaw, true if prop.mode == "grid" else free)
			p.y = hit.position.y
			return {"position": p, "parent": hit.id}
	var ground: Variant = main.rig.ground_point(pos)
	if ground == null:
		return {}
	var p := Snapping.for_prop(prop, ground, yaw, free)
	p.y = TerrainEdit.height_at_world(main.session.doc, p.x, p.z)
	return {"position": p, "parent": ""}
