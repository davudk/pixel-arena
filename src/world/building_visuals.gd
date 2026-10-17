class_name BuildingVisuals
extends RefCounted
## Builds a building's scene from its BuildingLayout and kit: wall / window / door pieces on
## edges, floor tiles, a foundation under level 0 and generated roofs. Each level is its own
## child ("level" meta) with its own pick body, and roofs are grouped per level ("roof_level"
## meta), so set_cutaway() can hide everything above the level being edited.
##
## Building-local space: cell (i, j) of level L spans [i, i+1] x [j, j+1] * cell_size, floor at
## y = L * wall_height. Kit wall pieces sit on a cell's +X edge; they're rotated per side.

const FOUNDATION_DEPTH := 2.0
const SIDE_YAW := {"E": 0.0, "N": PI / 2, "W": PI, "S": -PI / 2}

static var _vertex_material: StandardMaterial3D


static func build(root: Node3D, obj: MapObject, kit: KitDef) -> void:
	var layout := BuildingLayout.from_object(obj)
	var cs := kit.cell_size if kit != null else 3.0
	var h := kit.wall_height if kit != null else 3.0
	var colors: Dictionary = kit.colors if kit != null else {"roof": Color("3f9e8f"), "gable": Color("9a5b3e"), "foundation": Color("8f8a84")}

	for level in layout.level_indices():
		var node := Node3D.new()
		node.name = "Level%d" % level
		node.set_meta("level", level)
		root.add_child(node)
		var body := _body(node, obj.id)
		var y := level * h
		var floor_prop := _piece(kit, "floor")
		for c: Vector2i in layout.cells(level):
			var center := Vector3((c.x + 0.5) * cs, y, (c.y + 0.5) * cs)
			if floor_prop != null:
				_instance(node, floor_prop, center, 0.0)
			_shape(body, BoxShape3D.new(), Vector3(cs, 0.2, cs), center + Vector3(0, -0.04, 0))
		var walls := layout.walls(level)
		for e: String in walls:
			var w: Dictionary = walls[e]
			var center := Vector3((w.host.x + 0.5) * cs, y, (w.host.y + 0.5) * cs)
			var yaw: float = SIDE_YAW[w.side]
			var prop := _piece(kit, w.kind)
			if prop != null:
				_instance(node, prop, center, yaw)
			else:
				_plain_wall(node, center, yaw, cs, h, colors.gable)
			var offset := Vector3(cs * 0.45, h * 0.5, 0).rotated(Vector3.UP, yaw)
			var size := Vector3(0.15, h, cs) if w.side in ["E", "W"] else Vector3(cs, h, 0.15)
			_shape(body, BoxShape3D.new(), size, center + offset)
		if level == layout.level_indices()[0]:
			_foundation(node, layout.cells(level), cs, y, colors.foundation)

	if layout.roof_style == "none":
		return
	var groups := layout.roof_groups()
	for level: int in groups:
		var st := SurfaceTool.new()
		st.begin(Mesh.PRIMITIVE_TRIANGLES)
		for r: Rect2i in groups[level]:
			RoofMesh.build(st, Rect2(Vector2(r.position) * cs, Vector2(r.size) * cs), (level + 1) * h, layout.roof_style, colors.roof, colors.gable)
		var mesh := st.commit()
		var roof := Node3D.new()
		roof.name = "Roof%d" % level
		roof.set_meta("roof_level", level)
		root.add_child(roof)
		var mi := MeshInstance3D.new()
		mi.mesh = mesh
		mi.material_override = _material()
		roof.add_child(mi)
		var shape := ConcavePolygonShape3D.new()
		shape.set_faces(mesh.get_faces())
		_shape(_body(roof, obj.id), shape, Vector3.ONE, Vector3.ZERO)


## Shows levels up to `level` and roofs below it; -1 shows everything. Hidden parts stop
## taking picks so you can click through to the level being edited.
static func set_cutaway(root: Node3D, level: int) -> void:
	for child in root.get_children():
		var show := true
		if child.has_meta("level"):
			show = level < 0 or int(child.get_meta("level")) <= level
		elif child.has_meta("roof_level"):
			show = level < 0 or int(child.get_meta("roof_level")) < level
		else:
			continue
		child.visible = show
		var body := child.get_node_or_null("PickBody") as StaticBody3D
		if body != null:
			body.collision_layer = ObjectVisuals.PICK_LAYER if show else 0


static func _piece(kit: KitDef, role: String) -> PropDef:
	if kit == null or not kit.pieces.has(role) or ObjectVisuals.library == null:
		return null
	return ObjectVisuals.library.get_prop(kit.pieces[role])


static func _instance(parent: Node3D, prop: PropDef, position: Vector3, yaw: float) -> void:
	var entry := ObjectVisuals.models.get_prop_entry(prop)
	if entry == null:
		return
	var model := entry.scene.instantiate() as Node3D
	model.scale = Vector3.ONE * prop.scale
	model.position = position
	model.rotation.y = yaw
	parent.add_child(model)


static func _plain_wall(parent: Node3D, center: Vector3, yaw: float, cs: float, h: float, color: Color) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	RoofMesh.box(st, Vector3(cs * 0.4, 0, -cs * 0.5), Vector3(cs * 0.5, h, cs * 0.5), color)
	var mi := MeshInstance3D.new()
	mi.mesh = st.commit()
	mi.material_override = _material()
	mi.position = center
	mi.rotation.y = yaw
	parent.add_child(mi)


static func _foundation(parent: Node3D, cells: Dictionary, cs: float, y: float, color: Color) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for c: Vector2i in cells:
		RoofMesh.box(st, Vector3(c.x * cs, y - FOUNDATION_DEPTH, c.y * cs), Vector3((c.x + 1) * cs, y, (c.y + 1) * cs), color)
	var mi := MeshInstance3D.new()
	mi.name = "Foundation"
	mi.mesh = st.commit()
	mi.material_override = _material()
	parent.add_child(mi)


static func _body(parent: Node3D, id: String) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = "PickBody"
	body.collision_layer = ObjectVisuals.PICK_LAYER
	body.collision_mask = 0
	body.set_meta("object_id", id)
	parent.add_child(body)
	return body


static func _shape(body: StaticBody3D, shape: Shape3D, size: Vector3, position: Vector3) -> void:
	if shape is BoxShape3D:
		(shape as BoxShape3D).size = size
	var cs := CollisionShape3D.new()
	cs.shape = shape
	cs.position = position
	body.add_child(cs)


static func _material() -> StandardMaterial3D:
	if _vertex_material == null:
		_vertex_material = StandardMaterial3D.new()
		_vertex_material.vertex_color_use_as_albedo = true
		_vertex_material.vertex_color_is_srgb = true
		_vertex_material.roughness = 1.0
		_vertex_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return _vertex_material
