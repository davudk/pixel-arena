class_name MapObject
extends RefCounted
## One placed thing on the map (prop, building, water body, the settings record, ...).
## Its state is a flat bag of properties addressed by path, e.g. "position" or
## "floors/0/walls/3,4,N", so concurrent edits and merges work per property.
##
## Common prop paths: prop ("pack:id"), position (Vector3), rotation (float yaw, radians),
## scale (float), parent (uuid), variant (String), anim_offset (float).

var id: String
var type: String
## Tombstone: deleted objects keep their props so the delete can be undone or merged.
var deleted := false
var props: Dictionary = {}


func _init(p_id: String = "", p_type: String = "") -> void:
	id = p_id
	type = p_type


func get_prop(path: String, default: Variant = null) -> Variant:
	return props.get(path, default)


func to_dict() -> Dictionary:
	return {"id": id, "type": type, "deleted": deleted, "props": props}


static func from_dict(d: Dictionary) -> MapObject:
	var obj := MapObject.new(d.id, d.type)
	obj.deleted = d.get("deleted", false)
	obj.props = d.get("props", {})
	return obj
