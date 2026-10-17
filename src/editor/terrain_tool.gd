class_name TerrainTool
extends EditorTool
## Sculpts (raise, lower, smooth, flatten) and paints terrain with a round brush. Hold the left
## button to apply continuously; one stroke is one undo step. Props standing on the ground
## (no parent) ride the surface up and down, together with anything sitting on them.
## [ / ] brush size, Shift+[ / ] strength, Esc returns to selection.

signal options_changed

const RAISE_SPEED := 6.0  # meters per second at full strength, brush center
const BLEND_SPEED := 8.0  # smooth / flatten blend per second at full strength
const GROUNDED_EPSILON := 0.05

# Brush settings persist across activations.
static var mode := TerrainBrush.Mode.RAISE
static var radius := 4.0
static var strength := 0.5
static var material := 1

var _stroking := false
var _flatten_target := 0.0
var _cursor: MeshInstance3D
var _cursor_mesh := ImmediateMesh.new()


func activate() -> void:
	_cursor = MeshInstance3D.new()
	_cursor.mesh = _cursor_mesh
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.no_depth_test = true
	mat.albedo_color = Color(1.0, 0.85, 0.3)
	_cursor.material_override = mat
	_cursor.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	main.world.add_child(_cursor)
	on_motion(main.cursor_screen)


func deactivate() -> void:
	if _stroking:
		_end_stroke()
	if _cursor != null:
		_cursor.queue_free()
		_cursor = null


func on_press(pos: Vector2, _event: InputEventMouseButton) -> void:
	var hit: Variant = main.rig.ground_point(pos)
	if hit == null:
		return
	_stroking = true
	_flatten_target = hit.y
	main.session.begin(TerrainBrush.Mode.keys()[mode].capitalize() + " terrain")
	_apply(hit, 1.0 / 60.0)


func on_release(_pos: Vector2, _event: InputEventMouseButton) -> void:
	if _stroking:
		_end_stroke()


func on_motion(pos: Vector2) -> void:
	var hit: Variant = main.rig.ground_point(pos)
	_cursor.visible = hit != null
	if hit != null:
		_draw_cursor(hit)


func process(delta: float) -> void:
	if not _stroking:
		return
	var hit: Variant = main.rig.ground_point(main.cursor_screen)
	if hit != null:
		_apply(hit, delta)
		_draw_cursor(hit)


func on_key(event: InputEventKey) -> bool:
	match event.keycode:
		KEY_BRACKETLEFT, KEY_BRACKETRIGHT:
			var up := event.keycode == KEY_BRACKETRIGHT
			if event.shift_pressed:
				strength = clampf(strength + (0.1 if up else -0.1), 0.05, 1.0)
			else:
				radius = clampf(radius * (1.25 if up else 0.8), 1.0, 32.0)
			options_changed.emit()
			on_motion(main.cursor_screen)
			return true
		KEY_ESCAPE:
			main.set_tool(SelectTool.new())
			return true
	return false


func _end_stroke() -> void:
	_stroking = false
	main.session.commit()


func _apply(center: Vector3, delta: float) -> void:
	var doc := main.session.doc
	if mode == TerrainBrush.Mode.PAINT:
		for op in TerrainBrush.paint_ops(doc, center, radius, material):
			main.session.apply(op)
		return
	var amount := strength * (RAISE_SPEED if mode in [TerrainBrush.Mode.RAISE, TerrainBrush.Mode.LOWER] else BLEND_SPEED) * delta
	var grounded := _grounded_objects(center)
	for op in TerrainBrush.sculpt_ops(doc, mode, center, radius, amount, _flatten_target):
		main.session.apply(op)
	for id: String in grounded:
		var p: Vector3 = doc.get_prop(id, "position")
		var dy := TerrainEdit.height_at_world(doc, p.x, p.z) - p.y
		if absf(dy) < 0.0001:
			continue
		for moved in Selection.with_descendants(doc, [id] as Array[String]):
			main.session.set_prop(moved, "position", doc.get_prop(moved, "position") + Vector3(0, dy, 0))


## Unparented props within the brush that currently stand on the terrain surface.
func _grounded_objects(center: Vector3) -> Array[String]:
	var doc := main.session.doc
	var out: Array[String] = []
	var reach := radius + 1.0
	var lo := MapDocument.chunk_of(center - Vector3(reach, 0, reach))
	var hi := MapDocument.chunk_of(center + Vector3(reach, 0, reach))
	for cz in range(lo.y, hi.y + 1):
		for cx in range(lo.x, hi.x + 1):
			for id in doc.objects_in_chunk(Vector2i(cx, cz)):
				var obj := doc.get_object(id)
				if obj.type != "prop" or obj.props.get("parent") != null:
					continue
				var p: Vector3 = obj.props.position
				if Vector2(p.x - center.x, p.z - center.z).length() > reach:
					continue
				if absf(p.y - TerrainEdit.height_at_world(doc, p.x, p.z)) < GROUNDED_EPSILON:
					out.append(id)
	return out


func _draw_cursor(center: Vector3) -> void:
	var doc := main.session.doc
	_cursor_mesh.clear_surfaces()
	_cursor_mesh.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
	for i in 49:
		var a := TAU * i / 48.0
		var x := center.x + cos(a) * radius
		var z := center.z + sin(a) * radius
		_cursor_mesh.surface_add_vertex(Vector3(x, TerrainEdit.height_at_world(doc, x, z) + 0.05, z))
	_cursor_mesh.surface_end()
