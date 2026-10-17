class_name EditorController
extends Node
## Turns input into camera movement and editor commands. Mouse: MMB pans, RMB orbits, wheel
## zooms at the cursor. Trackpad: two-finger scroll pans, pinch zooms, Space/Alt + drag pans/orbits.
## Everything else on the left button, plus unhandled keys, goes to the active EditorTool.

enum Drag { NONE, PAN, ORBIT }

const KEY_PAN_SPEED := 0.8  # screen heights per second
const ORBIT_SPEED := Vector2(0.008, 0.006)
const WHEEL_ZOOM := 1.12

var main: EditorMain
var rig: CameraRig

var _drag := Drag.NONE
var _last_mouse := Vector2.ZERO
var _tool_pressed := false


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		_mouse_button(event)
	elif event is InputEventMouseMotion:
		_mouse_motion(event)
	elif event is InputEventPanGesture:
		if event.is_command_or_control_pressed():
			rig.zoom_at(pow(WHEEL_ZOOM, event.delta.y), event.position)
		else:
			rig.pan_relative(event.delta * 0.015)
	elif event is InputEventMagnifyGesture:
		rig.zoom_at(1.0 / event.factor, event.position)
	elif event is InputEventKey and event.pressed and not event.echo:
		_key(event)


func _process(delta: float) -> void:
	main.tool.process(delta)
	if Input.is_key_pressed(KEY_META) or Input.is_key_pressed(KEY_CTRL):
		return
	if get_viewport().gui_get_focus_owner() is LineEdit:
		return
	var dir := Vector2(
		_axis(KEY_A, KEY_LEFT, KEY_D, KEY_RIGHT),
		_axis(KEY_W, KEY_UP, KEY_S, KEY_DOWN))
	if dir != Vector2.ZERO:
		rig.pan_relative(dir.normalized() * KEY_PAN_SPEED * delta)


func _mouse_button(event: InputEventMouseButton) -> void:
	_last_mouse = event.position
	if not event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT and _tool_pressed:
			_tool_pressed = false
			main.tool.on_release(event.position, event)
		_drag = Drag.NONE
		return
	get_viewport().gui_release_focus()
	match event.button_index:
		MOUSE_BUTTON_WHEEL_UP:
			rig.zoom_at(pow(WHEEL_ZOOM, -maxf(event.factor, 1.0)), event.position)
		MOUSE_BUTTON_WHEEL_DOWN:
			rig.zoom_at(pow(WHEEL_ZOOM, maxf(event.factor, 1.0)), event.position)
		MOUSE_BUTTON_MIDDLE:
			_drag = Drag.PAN
		MOUSE_BUTTON_RIGHT:
			_drag = Drag.ORBIT
		MOUSE_BUTTON_LEFT:
			if Input.is_key_pressed(KEY_SPACE):
				_drag = Drag.PAN
			elif event.alt_pressed:
				_drag = Drag.ORBIT
			else:
				_tool_pressed = true
				main.tool.on_press(event.position, event)


func _mouse_motion(event: InputEventMouseMotion) -> void:
	match _drag:
		Drag.PAN:
			rig.pan_screen(_last_mouse, event.position)
		Drag.ORBIT:
			rig.orbit(-event.relative.x * ORBIT_SPEED.x, -event.relative.y * ORBIT_SPEED.y)
	_last_mouse = event.position
	main.cursor_screen = event.position
	if _drag == Drag.NONE:
		main.tool.on_motion(event.position)


func _key(event: InputEventKey) -> void:
	var app_shortcut := event.keycode in [KEY_Z, KEY_Y, KEY_S, KEY_O, KEY_N]
	if not (event.is_command_or_control_pressed() and app_shortcut) and main.tool.on_key(event):
		get_viewport().set_input_as_handled()
		return
	if event.is_command_or_control_pressed():
		match event.keycode:
			KEY_Z:
				main.redo() if event.shift_pressed else main.undo()
			KEY_Y:
				main.redo()
			KEY_S:
				main.save_as() if event.shift_pressed else main.save()
			KEY_O:
				main.open()
			KEY_N:
				main.new_map()
			_:
				return
		get_viewport().set_input_as_handled()
		return
	match event.keycode:
		KEY_Q:
			rig.rotate_by(PI / 4)
		KEY_E:
			rig.rotate_by(-PI / 4)
		KEY_1:
			rig.set_preset(CameraRig.Preset.TOP_DOWN)
		KEY_2:
			rig.set_preset(CameraRig.Preset.ISOMETRIC)
		KEY_3:
			rig.set_preset(CameraRig.Preset.THREE_QUARTER)
		KEY_P:
			var persp: bool = main.settings.get_value("projection") == "perspective"
			main.settings.set_override("projection", "orthographic" if persp else "perspective")
		KEY_G:
			main.settings.set_override("grid", not main.settings.get_value("grid"))
		KEY_H:
			rig.focus = Vector3.ZERO
		KEY_V:
			main.set_tool_by_name("select")
		KEY_T:
			main.set_tool_by_name("terrain")
		KEY_O:
			main.set_tool_by_name("water")
		KEY_B:
			main.set_tool_by_name("building")
		_:
			return
	get_viewport().set_input_as_handled()


func _axis(neg: Key, neg_alt: Key, pos: Key, pos_alt: Key) -> float:
	var v := 0.0
	if Input.is_key_pressed(neg) or Input.is_key_pressed(neg_alt):
		v -= 1.0
	if Input.is_key_pressed(pos) or Input.is_key_pressed(pos_alt):
		v += 1.0
	return v
