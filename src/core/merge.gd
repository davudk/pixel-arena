class_name Merge
extends RefCounted
## Three-way merge of map documents at the granularity of object existence, single properties
## and single terrain cells. Anything changed on only one side merges automatically; the same
## key changed to different values on both sides is a conflict for the user to resolve.

## Keep the target branch's value.
const MINE := "mine"
## Take the merged-in branch's value.
const THEIRS := "theirs"


class Plan:
	## Diff entries to apply: {key, kind: "object"|"prop"|"terrain", ..., value}
	var changes: Array[Dictionary] = []
	## Like changes but with `mine` and `theirs` instead of `value`.
	var conflicts: Array[Dictionary] = []


## Every key whose value differs between `base` and `head`, mapped to a diff entry carrying
## the head value. Keys: "o|id" (existence), "p|id|path", "t|layer|x,z". Terrain keys use world
## coordinates so a border height sample stored in several chunks is a single entry.
static func diff(base: MapDocument, head: MapDocument) -> Dictionary:
	var out := {}
	var ids := {}
	for id in base.objects:
		ids[id] = true
	for id in head.objects:
		ids[id] = true
	for id: String in ids:
		var a: MapObject = base.objects.get(id)
		var b: MapObject = head.objects.get(id)
		var ea: Variant = _existence(a)
		var eb: Variant = _existence(b)
		if not Codec.same(ea, eb):
			out["o|" + id] = {"key": "o|" + id, "kind": "object", "id": id, "value": eb}
		var pa: Dictionary = a.props if a != null else {}
		var pb: Dictionary = b.props if b != null else {}
		var paths := pa.duplicate()
		paths.merge(pb)
		for path: String in paths:
			var vb: Variant = pb.get(path)
			if not Codec.same(pa.get(path), vb):
				var key := "p|%s|%s" % [id, path]
				out[key] = {"key": key, "kind": "prop", "id": id, "path": path, "value": vb}

	var coords := {}
	for c in base.terrain:
		coords[c] = true
	for c in head.terrain:
		coords[c] = true
	for c: Vector2i in coords:
		for layer in [TerrainChunk.HEIGHT, TerrainChunk.MATERIAL]:
			var n := TerrainChunk.side(layer)
			var full := Rect2i(0, 0, n, n)
			var va: Variant = base.read_terrain(c, layer, full)
			var vb: Variant = head.read_terrain(c, layer, full)
			if va == vb:
				continue
			for i in va.size():
				if va[i] != vb[i]:
					var cell := c * TerrainChunk.SIZE + Vector2i(i % n, i / n)
					var key := "t|%s|%d,%d" % [layer, cell.x, cell.y]
					out[key] = {"key": key, "kind": "terrain", "layer": layer, "cell": cell, "value": vb[i]}
	return out


## What merging `source` into `target` (both descended from `base`) would do.
static func plan(base: MapDocument, target: MapDocument, source: MapDocument) -> Plan:
	var theirs := diff(base, source)
	var mine := diff(base, target)
	var p := Plan.new()
	for key: String in theirs:
		var e: Dictionary = theirs[key]
		if not mine.has(key):
			p.changes.append(e)
		elif not Codec.same(mine[key].value, e.value):
			var c := e.duplicate()
			c.erase("value")
			c.mine = mine[key].value
			c.theirs = e.value
			p.conflicts.append(c)
	return p


## Ops that apply `plan` to `doc` (the target head). `resolutions` maps conflict keys to
## MINE/THEIRS; unlisted conflicts use `default_resolution`.
static func ops_for(doc: MapDocument, p: Plan, resolutions: Dictionary = {}, default_resolution: String = THEIRS) -> Array[Dictionary]:
	var picked: Array[Dictionary] = p.changes.duplicate()
	for c in p.conflicts:
		if resolutions.get(c.key, default_resolution) == THEIRS:
			var e := c.duplicate()
			e.value = c.theirs
			picked.append(e)

	var ops: Array[Dictionary] = []
	# Existence first so property sets can target newly created objects.
	for e in picked:
		if e.kind != "object" or e.value == null:
			continue
		var obj := doc.get_object(e.id)
		if obj == null:
			ops.append(Ops.create(e.id, e.value.type))
			if e.value.deleted:
				ops.append(Ops.delete(e.id))
		elif obj.deleted and not e.value.deleted:
			ops.append(Ops.restore(e.id))
		elif not obj.deleted and e.value.deleted:
			ops.append(Ops.delete(e.id))

	for e in picked:
		if e.kind == "prop" and not Codec.same(doc.get_prop(e.id, e.path), e.value):
			ops.append(Ops.set_prop(e.id, e.path, e.value))

	var by_layer := {}  # layer -> {world cell: value}
	for e in picked:
		if e.kind == "terrain":
			by_layer.get_or_add(e.layer, {})[e.cell] = e.value
	for layer: String in by_layer:
		ops.append_array(TerrainEdit.set_ops(doc, layer, by_layer[layer]))
	return ops


static func _existence(obj: MapObject) -> Variant:
	if obj == null:
		return null
	return {"type": obj.type, "deleted": obj.deleted}
