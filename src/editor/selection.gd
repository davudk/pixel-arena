class_name Selection
extends RefCounted
## The set of selected object ids. Drops ids whose objects are deleted.

signal changed

var ids: Dictionary = {}  # id -> true, in selection order
var doc: MapDocument


func bind(p_doc: MapDocument) -> void:
	if doc != null:
		doc.changed.disconnect(_on_doc_changed)
		doc.reset.disconnect(clear)
	doc = p_doc
	doc.changed.connect(_on_doc_changed)
	doc.reset.connect(clear)
	clear()


func has(id: String) -> bool:
	return ids.has(id)


func is_empty() -> bool:
	return ids.is_empty()


func list() -> Array[String]:
	var out: Array[String] = []
	out.assign(ids.keys())
	return out


func set_ids(new_ids: Array) -> void:
	ids.clear()
	for id in new_ids:
		ids[id] = true
	changed.emit()


func add(id: String) -> void:
	if not ids.has(id):
		ids[id] = true
		changed.emit()


func toggle(id: String) -> void:
	if ids.has(id):
		ids.erase(id)
	else:
		ids[id] = true
	changed.emit()


func clear() -> void:
	if ids.is_empty():
		return
	ids.clear()
	changed.emit()


## `ids` plus everything parented to them, recursively (things sitting on selected things).
static func with_descendants(doc: MapDocument, roots: Array[String]) -> Array[String]:
	var out := {}
	for id in roots:
		out[id] = true
	var grew := true
	while grew:
		grew = false
		for obj in doc.objects.values():
			if obj.deleted or out.has(obj.id):
				continue
			var parent: Variant = obj.props.get("parent")
			if parent != null and out.has(parent):
				out[obj.id] = true
				grew = true
	var result: Array[String] = []
	result.assign(out.keys())
	return result


func _on_doc_changed(op: Dictionary) -> void:
	if op.op == Ops.DELETE and ids.has(op.id):
		ids.erase(op.id)
		changed.emit()
