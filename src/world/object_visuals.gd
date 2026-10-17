class_name ObjectVisuals
extends RefCounted
## Builds the scene node for a map object. Until the prop library lands (M3) every prop is a
## placeholder box tinted by its prop id; missing props will keep using this placeholder.

static var _box: BoxMesh
static var _materials: Dictionary[int, StandardMaterial3D] = {}


static func renders(obj: MapObject) -> bool:
	return obj.type == "prop"


## Changes to this key mean the node must be rebuilt rather than just moved.
static func visual_key(obj: MapObject) -> String:
	return "%s|%s" % [obj.get_prop("prop", ""), obj.get_prop("variant", "")]


static func build(obj: MapObject) -> Node3D:
	return placeholder(obj.get_prop("prop", ""))


static func placeholder(prop_id: String) -> Node3D:
	if _box == null:
		_box = BoxMesh.new()
		_box.size = Vector3(0.9, 0.9, 0.9)
	var hue := absi(hash(prop_id)) % 12
	if not _materials.has(hue):
		var m := StandardMaterial3D.new()
		m.albedo_color = Color.from_hsv(hue / 12.0, 0.55, 0.85)
		m.roughness = 1.0
		_materials[hue] = m
	var root := Node3D.new()
	var mesh := MeshInstance3D.new()
	mesh.mesh = _box
	mesh.material_override = _materials[hue]
	mesh.position.y = 0.45
	root.add_child(mesh)
	return root
