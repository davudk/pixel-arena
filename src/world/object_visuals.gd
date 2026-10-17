class_name ObjectVisuals
extends RefCounted
## Builds the scene node for a map object: the prop's model from the library, a pick body that
## shares the model's collision shape, and its light. Props from missing packs render as a
## placeholder box, so maps that use them still open and keep their data.

## Physics layer of map object pick bodies.
const PICK_LAYER := 1 << 1
const HIGHLIGHT_SHADER := preload("res://src/world/shaders/highlight.gdshader")
const WATER_SHADER := preload("res://src/world/shaders/water.gdshader")

static var library: PropLibrary
static var models := ModelCache.new()
static var _box: BoxMesh
static var _box_shape: BoxShape3D
static var _materials: Dictionary[int, StandardMaterial3D] = {}
static var _highlight: ShaderMaterial
static var _water: ShaderMaterial


static func renders(obj: MapObject) -> bool:
	return obj.type == "prop" or obj.type == "water"


## Changes to this key mean the node must be rebuilt rather than just moved.
static func visual_key(obj: MapObject) -> String:
	if obj.type == "water":
		return "water|%d" % hash(obj.get_prop("polygon", PackedVector2Array()))
	return "%s|%s" % [obj.get_prop("prop", ""), obj.get_prop("variant", "")]


static func prop_of(obj: MapObject) -> PropDef:
	return library.get_prop(obj.get_prop("prop", "")) if library != null else null


static func build(obj: MapObject) -> Node3D:
	var root := Node3D.new()
	root.set_meta("object_id", obj.id)
	if obj.type == "water":
		_build_water(root, obj)
		return root
	var prop := prop_of(obj)
	var entry := models.get_prop_entry(prop) if prop != null else null
	if entry == null:
		_add_placeholder(root, obj.get_prop("prop", ""))
		_add_body(root, obj.id, _placeholder_shape(), Vector3(0, 0.45, 0), 1.0)
		return root
	var model := entry.scene.instantiate() as Node3D
	model.scale = Vector3.ONE * prop.scale
	root.add_child(model)
	_add_body(root, obj.id, entry.shape, Vector3.ZERO, prop.scale)
	_add_light(root, prop)
	_autoplay(model, prop, float(obj.get_prop("anim_offset", 0.0)))
	return root


## A see-through copy of a prop's model for placement previews (no pick body).
static func build_ghost(prop: PropDef) -> Node3D:
	var root := Node3D.new()
	var entry := models.get_prop_entry(prop)
	if entry == null:
		_add_placeholder(root, prop.id)
	else:
		var model := entry.scene.instantiate() as Node3D
		model.scale = Vector3.ONE * prop.scale
		root.add_child(model)
		_autoplay(model, prop, 0.0)
	for g: GeometryInstance3D in root.find_children("*", "GeometryInstance3D", true, false):
		g.transparency = 0.35
		g.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return root


static func set_highlighted(node: Node3D, on: bool) -> void:
	if _highlight == null:
		_highlight = ShaderMaterial.new()
		_highlight.shader = HIGHLIGHT_SHADER
	for g: GeometryInstance3D in node.find_children("*", "GeometryInstance3D", true, false):
		g.material_overlay = _highlight if on else null


## Water body: a flat polygon (relative to the object's position, so the surface sits at
## position.y) with a matching pick body.
static func _build_water(root: Node3D, obj: MapObject) -> void:
	var polygon: PackedVector2Array = obj.get_prop("polygon", PackedVector2Array())
	var mesh := water_mesh(polygon)
	if mesh == null:
		return
	if _water == null:
		_water = ShaderMaterial.new()
		_water.shader = WATER_SHADER
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = _water
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(mi)
	var shape := ConcavePolygonShape3D.new()
	shape.set_faces(mesh.get_faces())
	_add_body(root, obj.id, shape, Vector3.ZERO, 1.0)


## Triangulated flat mesh for a polygon in the XZ plane, or null if it's degenerate.
static func water_mesh(polygon: PackedVector2Array) -> ArrayMesh:
	if polygon.size() < 3:
		return null
	var tris := Geometry2D.triangulate_polygon(polygon)
	if tris.is_empty():
		return null
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	for p in polygon:
		verts.append(Vector3(p.x, 0.0, p.y))
		normals.append(Vector3.UP)
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_INDEX] = tris
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh


static func _add_body(root: Node3D, id: String, shape: Shape3D, offset: Vector3, scale: float) -> void:
	var body := StaticBody3D.new()
	body.name = "PickBody"
	body.collision_layer = PICK_LAYER
	body.collision_mask = 0
	body.set_meta("object_id", id)
	var cs := CollisionShape3D.new()
	cs.shape = shape
	cs.position = offset
	cs.scale = Vector3.ONE * scale
	body.add_child(cs)
	root.add_child(body)


static func _add_light(root: Node3D, prop: PropDef) -> void:
	if prop.light.is_empty():
		return
	var light := OmniLight3D.new()
	light.light_color = Color(prop.light.get("color", "#ffffff"))
	light.light_energy = float(prop.light.get("energy", 1.0))
	light.omni_range = float(prop.light.get("range", 5.0))
	light.position.y = minf(prop.height * 0.5, 1.0)
	root.add_child(light)


static func _autoplay(model: Node, prop: PropDef, offset: float) -> void:
	if prop.autoplay == "":
		return
	var players := model.find_children("*", "AnimationPlayer", true, false)
	if players.is_empty():
		return
	var ap: AnimationPlayer = players[0]
	if not ap.has_animation(prop.autoplay):
		return
	ap.get_animation(prop.autoplay).loop_mode = Animation.LOOP_LINEAR
	ap.play(prop.autoplay)
	ap.seek(fposmod(offset, 1.0) * ap.current_animation_length, true)


static func _add_placeholder(root: Node3D, prop_id: String) -> void:
	if _box == null:
		_box = BoxMesh.new()
		_box.size = Vector3(0.9, 0.9, 0.9)
	var hue := absi(hash(prop_id)) % 12
	if not _materials.has(hue):
		var m := StandardMaterial3D.new()
		m.albedo_color = Color.from_hsv(hue / 12.0, 0.55, 0.85)
		m.roughness = 1.0
		_materials[hue] = m
	var mesh := MeshInstance3D.new()
	mesh.mesh = _box
	mesh.material_override = _materials[hue]
	mesh.position.y = 0.45
	root.add_child(mesh)


static func _placeholder_shape() -> BoxShape3D:
	if _box_shape == null:
		_box_shape = BoxShape3D.new()
		_box_shape.size = Vector3(0.9, 0.9, 0.9)
	return _box_shape
