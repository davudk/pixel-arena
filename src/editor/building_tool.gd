class_name BuildingTool
extends EditorTool
## Builds modular buildings on the kit's grid. Modes:
##   Foundation  drag to add cells on the current level. On level 0, painting away from the
##               target building (not touching its footprint) starts a new building.
##   Erase       drag to remove cells (a building with no cells left is deleted).
##   Wall        click an edge: toggles wall / open (exterior edges get walls automatically).
##   Door/Window click an edge to make it a door / window; click again for a plain wall.
## PageUp / PageDown (or . / ,) change the level; everything above it is cut away.
## Roof style and kit (from the options panel) apply to the target building. Esc: select tool.

signal options_changed

enum Mode { FOUNDATION, ERASE, WALL, DOOR, WINDOW }

const MAX_LEVEL := 9

# Settings persist across activations.
static var mode := Mode.FOUNDATION
static var kit_id := "kenney_town:timber"
static var level := 0

## The building being edited ("" until one is picked or started).
var target := ""

var _painting := false
var _hover: MeshInstance3D
var _hover_box := BoxMesh.new()


func activate() -> void:
	for id in main.selection.list():
		if main.session.doc.get_object(id).type == "building":
			target = id
			break
	_hover = MeshInstance3D.new()
	_hover.mesh = _hover_box
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(1.0, 0.85, 0.3, 0.45)
	mat.no_depth_test = true
	_hover.material_override = mat
	_hover.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	main.world.add_child(_hover)
	main.world.cutaway_level = level
	on_motion(main.cursor_screen)


func deactivate() -> void:
	if _painting:
		_end_stroke()
	if _hover != null:
		_hover.queue_free()
		_hover = null
	main.world.cutaway_level = -1


func kit() -> KitDef:
	var id: String = main.session.doc.get_prop(target, "kit", kit_id) if _has_target() else kit_id
	var k: KitDef = main.library.kits.get(id)
	if k == null and not main.library.kits.is_empty():
		k = main.library.kits.values()[0]
	return k


func set_level(value: int) -> void:
	level = clampi(value, 0, MAX_LEVEL)
	main.world.cutaway_level = level
	options_changed.emit()
	on_motion(main.cursor_screen)


func set_roof(style: String) -> void:
	if _has_target():
		main.session.edit("Roof: " + style, func() -> void: main.session.set_prop(target, "roof/style", style))


func set_kit(id: String) -> void:
	kit_id = id
	if _has_target():
		main.session.edit("Change kit", func() -> void: main.session.set_prop(target, "kit", id))


# --- Input -----------------------------------------------------------------

func on_press(pos: Vector2, _event: InputEventMouseButton) -> void:
	var hit := main.pick_object(pos)
	if not hit.is_empty() and main.session.doc.get_object(hit.id).type == "building":
		target = hit.id
	match mode:
		Mode.FOUNDATION, Mode.ERASE:
			_painting = true
			main.session.begin("Build foundation" if mode == Mode.FOUNDATION else "Remove floor")
			_paint(pos, true)
		_:
			_click_edge(pos)


func on_motion(pos: Vector2) -> void:
	if _painting:
		_paint(pos, false)
	_update_hover(pos)


func on_release(_pos: Vector2, _event: InputEventMouseButton) -> void:
	if _painting:
		_end_stroke()


func on_key(event: InputEventKey) -> bool:
	match event.keycode:
		KEY_PAGEUP, KEY_PERIOD:
			set_level(level + 1)
		KEY_PAGEDOWN, KEY_COMMA:
			set_level(level - 1)
		KEY_ESCAPE:
			main.set_tool(SelectTool.new())
		_:
			return false
	return true


# --- Editing ---------------------------------------------------------------

func _paint(pos: Vector2, stroke_start: bool) -> void:
	var k := kit()
	if k == null:
		return
	if mode == Mode.FOUNDATION and level == 0 and stroke_start:
		var ground: Variant = main.rig.ground_point(pos)
		if ground != null and (not _has_target() or not _touches_footprint(ground)):
			_start_building(ground, k)
	if not _has_target():
		return
	var local: Variant = _local_hit(pos)
	if local == null:
		return
	var cell := Vector2i(floori(local.x / k.cell_size), floori(local.z / k.cell_size))
	var path := BuildingLayout.cell_path(level, cell)
	var present := main.session.doc.get_prop(target, path) != null
	if mode == Mode.FOUNDATION and not present:
		main.session.set_prop(target, path, true)
	elif mode == Mode.ERASE and present:
		main.session.set_prop(target, path, null)


func _end_stroke() -> void:
	_painting = false
	if _has_target() and BuildingLayout.from_object(main.session.doc.get_object(target)).is_empty():
		main.session.delete_object(target)
		target = ""
	main.session.commit()
	if _has_target():
		main.selection.set_ids([target])


func _start_building(ground: Vector3, k: KitDef) -> void:
	var origin := Vector3(floorf(ground.x / k.cell_size) * k.cell_size, ground.y, floorf(ground.z / k.cell_size) * k.cell_size)
	target = main.session.create_object("building", {
		"kit": k.id, "position": origin, "rotation": 0.0, "roof/style": "gable"})


func _click_edge(pos: Vector2) -> void:
	if not _has_target():
		return
	var edge := _edge_at(pos)
	if edge == "":
		return
	var layout := BuildingLayout.from_object(main.session.doc.get_object(target))
	var pair := BuildingLayout.edge_cells(edge)
	var a := layout.cells(level).has(pair[0])
	var b := layout.cells(level).has(pair[1])
	if not a and not b:
		return
	var auto := "wall" if a != b else ""
	var current := layout.effective_kind(level, edge)
	var value: Variant
	match mode:
		Mode.WALL:
			if current != "":
				value = "open" if auto == "wall" else null
			else:
				value = null if auto == "wall" else "wall"
		Mode.DOOR, Mode.WINDOW:
			var kind := "door" if mode == Mode.DOOR else "window"
			if current == kind:
				value = null if auto == "wall" else "wall"
			else:
				value = kind
	main.session.edit("Edit wall", func() -> void:
		main.session.set_prop(target, BuildingLayout.wall_path(level, edge), value))


# --- Geometry --------------------------------------------------------------

func _has_target() -> bool:
	return target != "" and main.session.doc.has_object(target)


func _building_xform() -> Transform3D:
	var doc := main.session.doc
	return Transform3D(Basis(Vector3.UP, float(doc.get_prop(target, "rotation", 0.0))), doc.get_prop(target, "position", Vector3.ZERO))


## Building-local point where the cursor ray meets the current level's floor plane.
func _local_hit(pos: Vector2) -> Variant:
	var k := kit()
	var xf := _building_xform()
	var ray := main.rig.screen_ray(pos)
	var plane := Plane(Vector3.UP, xf.origin.y + level * k.wall_height)
	var p: Variant = plane.intersects_ray(ray[0], ray[1])
	return xf.affine_inverse() * p if p != null else null


## Nearest cell edge to the cursor on the current level ("" if none).
func _edge_at(pos: Vector2) -> String:
	var local: Variant = _local_hit(pos)
	if local == null:
		return ""
	var cs := kit().cell_size
	var fx: float = local.x / cs
	var fz: float = local.z / cs
	if absf(fx - roundf(fx)) < absf(fz - roundf(fz)):
		return "%d,%d,W" % [roundi(fx), floori(fz)]
	return "%d,%d,N" % [floori(fx), roundi(fz)]


## True if the world point is on or next to the target building's level-0 footprint.
func _touches_footprint(world: Vector3) -> bool:
	var k := kit()
	var local := _building_xform().affine_inverse() * world
	var cell := Vector2i(floori(local.x / k.cell_size), floori(local.z / k.cell_size))
	var cells := BuildingLayout.from_object(main.session.doc.get_object(target)).cells(0)
	for d in [Vector2i.ZERO, Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
		if cells.has(cell + d):
			return true
	return false


func _update_hover(pos: Vector2) -> void:
	var k := kit()
	_hover.visible = false
	if k == null:
		return
	var cs := k.cell_size
	var h := k.wall_height
	var xf: Transform3D
	var local: Variant
	if _has_target():
		xf = _building_xform()
		local = _local_hit(pos)
	else:
		var ground: Variant = main.rig.ground_point(pos)
		if ground == null:
			return
		xf = Transform3D(Basis(), Vector3(0, ground.y, 0))
		local = Vector3(ground.x, 0, ground.z)
	if local == null:
		return
	var y := level * h
	if mode in [Mode.FOUNDATION, Mode.ERASE]:
		var cell := Vector2i(floori(local.x / cs), floori(local.z / cs))
		_hover_box.size = Vector3(cs, 0.25, cs)
		_hover.global_transform = xf * Transform3D(Basis(), Vector3((cell.x + 0.5) * cs, y + 0.12, (cell.y + 0.5) * cs))
		_hover.visible = true
	elif _has_target():
		var edge := _edge_at(pos)
		var p := edge.split(",")
		var i := p[0].to_int()
		var j := p[1].to_int()
		if p[2] == "W":
			_hover_box.size = Vector3(0.3, h, cs)
			_hover.global_transform = xf * Transform3D(Basis(), Vector3(i * cs, y + h * 0.5, (j + 0.5) * cs))
		else:
			_hover_box.size = Vector3(cs, h, 0.3)
			_hover.global_transform = xf * Transform3D(Basis(), Vector3((i + 0.5) * cs, y + h * 0.5, j * cs))
		_hover.visible = true
