class_name TerrainEdit
extends RefCounted
## World-space terrain helpers that turn edits into terrain ops.
## Height samples sit on integer world (x, z) coordinates. A sample on a chunk border exists in
## every chunk touching it (up to 4) and all copies are written, so chunk edges stay seamless.
## Material cells are addressed by the world coordinate of their minimum corner.

const SIZE := TerrainChunk.SIZE


static func height_at(doc: MapDocument, sx: int, sz: int) -> float:
	var c := Vector2i(_div(sx), _div(sz))
	var local := Vector2i(posmod(sx, SIZE), posmod(sz, SIZE))
	return doc.read_terrain(c, TerrainChunk.HEIGHT, Rect2i(local, Vector2i.ONE))[0]


static func material_at(doc: MapDocument, cx: int, cz: int) -> int:
	var c := Vector2i(_div(cx), _div(cz))
	var local := Vector2i(posmod(cx, SIZE), posmod(cz, SIZE))
	return doc.read_terrain(c, TerrainChunk.MATERIAL, Rect2i(local, Vector2i.ONE))[0]


## Ops setting heights for world samples in `rect` (end exclusive).
## `fn(sx: int, sz: int, old: float) -> float` returns each sample's new height.
static func height_ops(doc: MapDocument, rect: Rect2i, fn: Callable) -> Array[Dictionary]:
	var values := {}
	for sz in range(rect.position.y, rect.end.y):
		for sx in range(rect.position.x, rect.end.x):
			var old := height_at(doc, sx, sz)
			var h: float = fn.call(sx, sz, old)
			if h != old:
				values[Vector2i(sx, sz)] = h
	return set_ops(doc, TerrainChunk.HEIGHT, values)


## Ops setting material indices for world cells in `rect` (end exclusive).
## `fn(cx: int, cz: int, old: int) -> int` returns each cell's new material.
static func material_ops(doc: MapDocument, rect: Rect2i, fn: Callable) -> Array[Dictionary]:
	var values := {}
	for cz in range(rect.position.y, rect.end.y):
		for cx in range(rect.position.x, rect.end.x):
			var old := material_at(doc, cx, cz)
			var m: int = fn.call(cx, cz, old)
			if m != old:
				values[Vector2i(cx, cz)] = m
	return set_ops(doc, TerrainChunk.MATERIAL, values)


## Ops writing explicit values: `values` maps world sample (height) or cell (material)
## coordinates to new values. One op per affected chunk.
static func set_ops(doc: MapDocument, layer: String, values: Dictionary) -> Array[Dictionary]:
	var per_chunk := {}  # Vector2i chunk -> {Vector2i local: value}
	for p: Vector2i in values:
		var chunks: Array[Vector2i] = [Vector2i(_div(p.x), _div(p.y))]
		if layer == TerrainChunk.HEIGHT:
			chunks = _chunks_with_sample(p.x, p.y)
		for c in chunks:
			per_chunk.get_or_add(c, {})[p - c * SIZE] = values[p]
	return _build_ops(doc, per_chunk, layer)


static func _div(v: int) -> int:
	return floori(float(v) / SIZE)


static func _chunks_with_sample(sx: int, sz: int) -> Array[Vector2i]:
	var xs := [_div(sx)]
	if posmod(sx, SIZE) == 0:
		xs.append(_div(sx) - 1)
	var zs := [_div(sz)]
	if posmod(sz, SIZE) == 0:
		zs.append(_div(sz) - 1)
	var out: Array[Vector2i] = []
	for x in xs:
		for z in zs:
			out.append(Vector2i(x, z))
	return out


## One op per chunk covering the bounding rect of its changed cells.
static func _build_ops(doc: MapDocument, per_chunk: Dictionary, layer: String) -> Array[Dictionary]:
	var ops: Array[Dictionary] = []
	for c: Vector2i in per_chunk:
		var cells: Dictionary = per_chunk[c]
		var lo := Vector2i(1 << 30, 1 << 30)
		var hi := -lo
		for p: Vector2i in cells:
			lo = lo.min(p)
			hi = hi.max(p)
		var rect := Rect2i(lo, hi - lo + Vector2i.ONE)
		var values: Variant = doc.read_terrain(c, layer, rect)
		for p: Vector2i in cells:
			values[(p.y - lo.y) * rect.size.x + (p.x - lo.x)] = cells[p]
		ops.append(Ops.terrain(c, layer, rect, values))
	return ops
