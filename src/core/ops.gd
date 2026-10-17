class_name Ops
extends RefCounted
## Primitive operations: the only way a MapDocument changes. Ops are plain Dictionaries so they
## serialize (and later travel over the network) as-is.
##   {op: "create",  id, type}
##   {op: "delete",  id}                         tombstone; the object keeps its props
##   {op: "restore", id}                         clears the tombstone
##   {op: "set",     id, path, value}            a null value removes the property
##   {op: "terrain", chunk, layer, rect, values} rect is chunk-local; values row-major
## When applied, "set" and "terrain" ops also record `prev`, the value(s) they overwrote.

const CREATE := "create"
const DELETE := "delete"
const RESTORE := "restore"
const SET := "set"
const TERRAIN := "terrain"


static func create(id: String, type: String) -> Dictionary:
	return {"op": CREATE, "id": id, "type": type}


static func delete(id: String) -> Dictionary:
	return {"op": DELETE, "id": id}


static func restore(id: String) -> Dictionary:
	return {"op": RESTORE, "id": id}


static func set_prop(id: String, path: String, value: Variant) -> Dictionary:
	return {"op": SET, "id": id, "path": path, "value": value}


static func terrain(chunk: Vector2i, layer: String, rect: Rect2i, values: Variant) -> Dictionary:
	return {"op": TERRAIN, "chunk": chunk, "layer": layer, "rect": rect, "values": values}


## The op that reverts `applied` (an op returned by MapDocument.apply_op) against the document's
## current state, or {} if nothing can be reverted because the data has been changed since.
## This is what makes undo per-author and selective: someone else's later edit to the same
## property wins, and terrain reverts only the cells that still hold the written values.
static func inverse(doc: MapDocument, applied: Dictionary) -> Dictionary:
	match applied.op:
		CREATE, RESTORE:
			return delete(applied.id) if doc.has_object(applied.id) else {}
		DELETE:
			var obj := doc.get_object(applied.id)
			return restore(applied.id) if obj != null and obj.deleted else {}
		SET:
			# Deleted objects are left alone, so a later restore brings back the full object.
			if not doc.has_object(applied.id):
				return {}
			if not Codec.same(doc.get_prop(applied.id, applied.path), applied.value):
				return {}
			return set_prop(applied.id, applied.path, applied.get("prev"))
		TERRAIN:
			var current: Variant = doc.read_terrain(applied.chunk, applied.layer, applied.rect)
			var out: Variant = current.duplicate()
			var changed := false
			for i in out.size():
				if current[i] == applied.values[i] and current[i] != applied.prev[i]:
					out[i] = applied.prev[i]
					changed = true
			return terrain(applied.chunk, applied.layer, applied.rect, out) if changed else {}
	return {}
