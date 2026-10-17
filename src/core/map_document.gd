class_name MapDocument
extends RefCounted
## Source-of-truth map state: objects keyed by UUID plus sparse terrain chunks.
## Pure data, no Nodes or rendering. Changes only through apply_op(); views listen to
## `changed` (one primitive op was applied) and `reset` (the whole state was replaced).

signal changed(op: Dictionary)
signal reset

const FORMAT_VERSION := 1
## Reserved object holding map-level defaults (filter preset, time of day, ...). Editing it goes
## through ops like any other object, so settings changes are undoable and mergeable.
const SETTINGS_ID := "@settings"
const CHUNK_SIZE := TerrainChunk.SIZE

var map_id: String
var objects: Dictionary[String, MapObject] = {}
var terrain: Dictionary[Vector2i, TerrainChunk] = {}

# Derived spatial index, never persisted: chunk -> {object id: true} for live positioned objects.
var _chunk_objects: Dictionary[Vector2i, Dictionary] = {}
var _object_chunk: Dictionary[String, Vector2i] = {}


func _init(p_map_id: String = "") -> void:
	map_id = p_map_id if p_map_id != "" else Uuid.v4()
	objects[SETTINGS_ID] = MapObject.new(SETTINGS_ID, "settings")


static func chunk_of(position: Vector3) -> Vector2i:
	return Vector2i(floori(position.x / CHUNK_SIZE), floori(position.z / CHUNK_SIZE))


# --- Queries ---------------------------------------------------------------

## True if the object exists and is not deleted.
func has_object(id: String) -> bool:
	return objects.has(id) and not objects[id].deleted


## The object even if deleted (check `deleted`), or null.
func get_object(id: String) -> MapObject:
	return objects.get(id)


func get_prop(id: String, path: String, default: Variant = null) -> Variant:
	var obj: MapObject = objects.get(id)
	return obj.props.get(path, default) if obj != null else default


func get_setting(path: String, default: Variant = null) -> Variant:
	return get_prop(SETTINGS_ID, path, default)


## Terrain values in a chunk-local rect; default values if the chunk isn't stored.
func read_terrain(coord: Vector2i, layer: String, rect: Rect2i) -> Variant:
	var chunk: TerrainChunk = terrain.get(coord)
	if chunk != null:
		return chunk.read(layer, rect)
	return TerrainChunk.default_values(layer, rect.get_area())


func objects_in_chunk(coord: Vector2i) -> Array[String]:
	var out: Array[String] = []
	out.assign(_chunk_objects.get(coord, {}).keys())
	return out


## Every chunk with content (objects or edited terrain). Empty space between them costs nothing.
func occupied_chunks() -> Array[Vector2i]:
	var seen := {}
	for c in _chunk_objects:
		seen[c] = true
	for c in terrain:
		seen[c] = true
	var out: Array[Vector2i] = []
	out.assign(seen.keys())
	return out


# --- Mutation --------------------------------------------------------------

## Applies one primitive op (see Ops). Returns a copy of the op with `prev` filled in for
## "set"/"terrain", or {} if the op was invalid.
func apply_op(op: Dictionary) -> Dictionary:
	var applied := op.duplicate()
	match op.get("op"):
		Ops.CREATE:
			if objects.has(op.id):
				return _invalid(op, "object already exists")
			objects[op.id] = MapObject.new(op.id, op.type)
		Ops.DELETE:
			var obj: MapObject = objects.get(op.id)
			if obj == null or obj.deleted or op.id == SETTINGS_ID:
				return _invalid(op, "no live object to delete")
			obj.deleted = true
			_reindex(obj)
		Ops.RESTORE:
			var obj: MapObject = objects.get(op.id)
			if obj == null or not obj.deleted:
				return _invalid(op, "no deleted object to restore")
			obj.deleted = false
			_reindex(obj)
		Ops.SET:
			var obj: MapObject = objects.get(op.id)
			if obj == null:
				return _invalid(op, "no such object")
			applied.prev = obj.props.get(op.path)
			if op.value == null:
				obj.props.erase(op.path)
			else:
				obj.props[op.path] = Codec.copy(op.value)
			if op.path == "position":
				_reindex(obj)
		Ops.TERRAIN:
			if not TerrainChunk.is_valid_rect(op.layer, op.rect) or op.values.size() != op.rect.get_area():
				return _invalid(op, "bad terrain rect")
			var chunk: TerrainChunk = terrain.get(op.chunk)
			if chunk == null:
				chunk = TerrainChunk.new(op.chunk)
			applied.prev = chunk.write(op.layer, op.rect, op.values)
			if chunk.is_default():
				terrain.erase(op.chunk)
			else:
				terrain[op.chunk] = chunk
		_:
			return _invalid(op, "unknown op")
	changed.emit(applied)
	return applied


## Takes over another document's state (it must not be used afterwards). Emits `reset`.
func load_state(other: MapDocument) -> void:
	map_id = other.map_id
	objects = other.objects
	terrain = other.terrain
	_rebuild_index()
	reset.emit()


func to_dict() -> Dictionary:
	var objs: Array = []
	for obj in objects.values():
		objs.append(obj.to_dict())
	var chunks: Array = []
	for chunk in terrain.values():
		chunks.append(chunk.to_dict())
	return {"map_id": map_id, "objects": objs, "terrain": chunks}


static func from_dict(d: Dictionary) -> MapDocument:
	var doc := MapDocument.new(d.map_id)
	for od in d.objects:
		var obj := MapObject.from_dict(od)
		doc.objects[obj.id] = obj
	for cd in d.terrain:
		var chunk := TerrainChunk.from_dict(cd)
		doc.terrain[chunk.coord] = chunk
	doc._rebuild_index()
	return doc


func _invalid(op: Dictionary, reason: String) -> Dictionary:
	push_error("MapDocument.apply_op: %s: %s" % [reason, op])
	return {}


func _rebuild_index() -> void:
	_chunk_objects.clear()
	_object_chunk.clear()
	for obj in objects.values():
		_reindex(obj)


func _reindex(obj: MapObject) -> void:
	var pos: Variant = obj.props.get("position")
	var indexed := not obj.deleted and pos is Vector3
	var new_chunk := chunk_of(pos) if indexed else Vector2i.ZERO
	if _object_chunk.has(obj.id):
		var old: Vector2i = _object_chunk[obj.id]
		if indexed and old == new_chunk:
			return
		var members: Dictionary = _chunk_objects[old]
		members.erase(obj.id)
		if members.is_empty():
			_chunk_objects.erase(old)
		_object_chunk.erase(obj.id)
	if indexed:
		if not _chunk_objects.has(new_chunk):
			_chunk_objects[new_chunk] = {}
		_chunk_objects[new_chunk][obj.id] = true
		_object_chunk[obj.id] = new_chunk
