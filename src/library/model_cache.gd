class_name ModelCache
extends RefCounted
## Loads prop models at runtime with GLTFDocument (same path for built-in and user packs) and
## caches the resulting scene plus a shared collision shape for picking.

class Entry:
	var scene: PackedScene
	## Trimesh of all meshes in model space, shared by every instance (for ray picking).
	var shape: ConcavePolygonShape3D
	var aabb: AABB

var _entries: Dictionary[String, Entry] = {}


## The model for a prop (with its pack's material overrides), or null if it can't be loaded.
func get_prop_entry(prop: PropDef) -> Entry:
	return get_entry(prop.model_path, prop.material_overrides)


## The loaded model at `path`, or null if it can't be loaded. `material_overrides` maps
## BaseMaterial3D property names to values (e.g. {"metallic": 0.0}).
func get_entry(path: String, material_overrides: Dictionary = {}) -> Entry:
	var key := path if material_overrides.is_empty() else "%s|%s" % [path, material_overrides]
	if _entries.has(key):
		return _entries[key]
	var entry := _load(path, material_overrides)
	_entries[key] = entry
	return entry


func _load(path: String, material_overrides: Dictionary) -> Entry:
	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	if doc.append_from_file(path, state) != OK:
		push_error("ModelCache: can't load %s" % path)
		return null
	var root: Node = doc.generate_scene(state)
	if root == null:
		return null
	var entry := Entry.new()
	var faces := PackedVector3Array()
	var first := true
	for m: MeshInstance3D in root.find_children("*", "MeshInstance3D", true, false):
		if m.mesh == null:
			continue
		var xf := _relative_transform(m, root)
		var box := xf * m.get_aabb()
		entry.aabb = box if first else entry.aabb.merge(box)
		first = false
		for v in m.mesh.get_faces():
			faces.append(xf * v)
		if not material_overrides.is_empty():
			for i in m.mesh.get_surface_count():
				var mat := m.mesh.surface_get_material(i) as BaseMaterial3D
				for prop_name: String in material_overrides:
					if mat != null:
						mat.set(prop_name, material_overrides[prop_name])
	entry.shape = ConcavePolygonShape3D.new()
	entry.shape.set_faces(faces)
	_set_owner_recursive(root, root)
	entry.scene = PackedScene.new()
	entry.scene.pack(root)
	root.free()
	return entry


static func _relative_transform(node: Node3D, root: Node) -> Transform3D:
	var xf := Transform3D.IDENTITY
	var n: Node = node
	while n != null and n != root:
		if n is Node3D:
			xf = (n as Node3D).transform * xf
		n = n.get_parent()
	return xf


static func _set_owner_recursive(node: Node, owner: Node) -> void:
	for child in node.get_children():
		child.owner = owner
		_set_owner_recursive(child, owner)
