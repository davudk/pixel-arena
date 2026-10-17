class_name WorldView
extends Node3D
## Scene-tree view of a MapDocument. One Node3D per occupied chunk (positioned at the chunk's
## origin), each holding one node per live, positioned object. Rebuilt on the document's
## `reset`, patched per op on `changed`. Never writes to the document.

var doc: MapDocument

var _chunks: Dictionary[Vector2i, Node3D] = {}
var _objects: Dictionary[String, Node3D] = {}


func bind(p_doc: MapDocument) -> void:
	if doc != null:
		doc.changed.disconnect(_on_changed)
		doc.reset.disconnect(rebuild)
	doc = p_doc
	doc.changed.connect(_on_changed)
	doc.reset.connect(rebuild)
	rebuild()


func rebuild() -> void:
	for node in _chunks.values():
		node.queue_free()
	_chunks.clear()
	_objects.clear()
	for id in doc.objects:
		_refresh(id)


func chunk_count() -> int:
	return _chunks.size()


func object_count() -> int:
	return _objects.size()


func _on_changed(op: Dictionary) -> void:
	if op.has("id"):
		_refresh(op.id)


func _refresh(id: String) -> void:
	var obj := doc.get_object(id)
	var pos: Variant = obj.props.get("position") if obj != null else null
	if obj == null or obj.deleted or not pos is Vector3 or not ObjectVisuals.renders(obj):
		_remove(id)
		return

	var node: Node3D = _objects.get(id)
	if node != null and node.get_meta("visual_key") != ObjectVisuals.visual_key(obj):
		_remove(id)
		node = null
	if node == null:
		node = ObjectVisuals.build(obj)
		node.name = id
		node.set_meta("visual_key", ObjectVisuals.visual_key(obj))
		_objects[id] = node

	var coord := MapDocument.chunk_of(pos)
	var chunk := _chunk_node(coord)
	if node.get_parent() != chunk:
		var old := node.get_parent()
		if old != null:
			old.remove_child(node)
			_drop_if_empty(old)
		chunk.add_child(node)
	node.position = pos - chunk.position
	node.rotation = Vector3(0.0, obj.get_prop("rotation", 0.0), 0.0)
	node.scale = Vector3.ONE * float(obj.get_prop("scale", 1.0))


func _remove(id: String) -> void:
	var node: Node3D = _objects.get(id)
	if node == null:
		return
	_objects.erase(id)
	var parent := node.get_parent()
	if parent != null:
		parent.remove_child(node)
		_drop_if_empty(parent)
	node.queue_free()


func _chunk_node(coord: Vector2i) -> Node3D:
	var chunk: Node3D = _chunks.get(coord)
	if chunk == null:
		chunk = Node3D.new()
		chunk.name = "Chunk_%d_%d" % [coord.x, coord.y]
		chunk.position = Vector3(coord.x, 0, coord.y) * MapDocument.CHUNK_SIZE
		chunk.set_meta("coord", coord)
		_chunks[coord] = chunk
		add_child(chunk)
	return chunk


func _drop_if_empty(chunk: Node) -> void:
	if chunk.get_child_count() == 0 and chunk.has_meta("coord"):
		_chunks.erase(chunk.get_meta("coord"))
		chunk.queue_free()
