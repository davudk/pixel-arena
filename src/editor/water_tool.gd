class_name WaterTool
extends EditorTool
## Draws a water body: click to add corners (snapped to 0.5 m; hold Cmd/Ctrl for free), click
## the first corner or press Enter to finish, Backspace removes the last corner, Esc cancels.
## The surface sits at the terrain height of the first corner; raise or lower it afterwards with
## PageUp / PageDown (or = / -) in the select tool.

const CLOSE_DISTANCE := 12.0  # pixels

var _points: Array[Vector3] = []
var _hover := Vector3.ZERO
var _has_hover := false
var _preview: MeshInstance3D
var _preview_mesh := ImmediateMesh.new()


func activate() -> void:
	_preview = MeshInstance3D.new()
	_preview.mesh = _preview_mesh
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.no_depth_test = true
	mat.albedo_color = Color(0.4, 0.8, 1.0)
	_preview.material_override = mat
	main.world.add_child(_preview)
	on_motion(main.cursor_screen)


func deactivate() -> void:
	if _preview != null:
		_preview.queue_free()
		_preview = null


func on_motion(pos: Vector2) -> void:
	var p: Variant = _snapped_ground(pos)
	_has_hover = p != null
	if _has_hover:
		_hover = p
	_redraw()


func on_press(pos: Vector2, _event: InputEventMouseButton) -> void:
	if _points.size() >= 3:
		var first: Variant = main.screen_position(_points[0])
		if first != null and pos.distance_to(first) < CLOSE_DISTANCE:
			_finish()
			return
	var p: Variant = _snapped_ground(pos)
	if p != null:
		_points.append(p)
		_redraw()


func on_key(event: InputEventKey) -> bool:
	match event.keycode:
		KEY_ENTER, KEY_KP_ENTER:
			_finish()
		KEY_BACKSPACE, KEY_DELETE:
			_points.pop_back()
			_redraw()
		KEY_ESCAPE:
			if _points.is_empty():
				main.set_tool(SelectTool.new())
			else:
				_points.clear()
				_redraw()
		_:
			return false
	return true


func _finish() -> void:
	if _points.size() < 3:
		return
	var center := Vector3.ZERO
	for p in _points:
		center += p
	center /= _points.size()
	var level := _points[0].y
	var polygon := PackedVector2Array()
	for p in _points:
		polygon.append(Vector2(p.x - center.x, p.z - center.z))
	if Geometry2D.triangulate_polygon(polygon).is_empty():
		return  # self-intersecting; keep editing
	_points.clear()
	var created: Array[String] = []  # lambdas capture locals by value; collect via the array
	main.session.edit("Add water", func() -> void:
		created.append(main.session.create_object("water", {
			"position": Vector3(center.x, level, center.z), "rotation": 0.0, "polygon": polygon})))
	main.set_tool(SelectTool.new())
	main.selection.set_ids(created)


func _snapped_ground(pos: Vector2) -> Variant:
	var hit: Variant = main.rig.ground_point(pos)
	if hit == null:
		return null
	if not (Input.is_key_pressed(KEY_META) or Input.is_key_pressed(KEY_CTRL)):
		hit = Vector3(snappedf(hit.x, 0.5), 0.0, snappedf(hit.z, 0.5))
	hit.y = TerrainEdit.height_at_world(main.session.doc, hit.x, hit.z)
	return hit


func _redraw() -> void:
	_preview_mesh.clear_surfaces()
	var pts := _points.duplicate()
	if _has_hover:
		pts.append(_hover)
	if pts.size() < 2:
		return
	_preview_mesh.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
	var level: float = pts[0].y + 0.05
	for p: Vector3 in pts:
		_preview_mesh.surface_add_vertex(Vector3(p.x, level, p.z))
	_preview_mesh.surface_add_vertex(Vector3(pts[0].x, level, pts[0].z))
	_preview_mesh.surface_end()
