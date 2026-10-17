class_name BuildingLayout
extends RefCounted
## Structured view of a building object's flat property paths, plus the rules for which walls
## appear. Pure data, shared with a future server / web viewer.
##   floors/<L>/cells/<i>,<j> = true        cell (i, j) exists on level L
##   floors/<L>/walls/<edge>  = kind        per-edge override: wall | window | door | open
##   roof/style               = gable | hip | flat | none
## Edge "i,j,W" is the boundary at x = i between cells (i-1, j) and (i, j); "i,j,N" is the
## boundary at z = j between (i, j-1) and (i, j). An edge without an override gets a wall when
## exactly one side is a cell (exterior) and nothing when both or neither are.

const KINDS := ["wall", "window", "door", "open"]
const ROOF_STYLES := ["gable", "hip", "flat", "none"]

## level -> {"cells": {Vector2i: true}, "overrides": {edge key: kind}}
var levels: Dictionary = {}
var roof_style := "gable"


static func from_object(obj: MapObject) -> BuildingLayout:
	var layout := BuildingLayout.new()
	layout.roof_style = obj.get_prop("roof/style", "gable")
	for path: String in obj.props:
		if not path.begins_with("floors/"):
			continue
		var parts := path.split("/")
		if parts.size() != 4:
			continue
		var level := parts[1].to_int()
		var entry: Dictionary = layout.levels.get_or_add(level, {"cells": {}, "overrides": {}})
		match parts[2]:
			"cells":
				var ij := parts[3].split(",")
				if ij.size() == 2:
					entry.cells[Vector2i(ij[0].to_int(), ij[1].to_int())] = true
			"walls":
				entry.overrides[parts[3]] = obj.props[path]
	return layout


static func cell_path(level: int, cell: Vector2i) -> String:
	return "floors/%d/cells/%d,%d" % [level, cell.x, cell.y]


static func wall_path(level: int, edge: String) -> String:
	return "floors/%d/walls/%s" % [level, edge]


## side: "W" (the cell's west boundary) or "N" (its north boundary).
static func edge_key(cell: Vector2i, side: String) -> String:
	return "%d,%d,%s" % [cell.x, cell.y, side]


## The two cells an edge separates: [negative side, positive side].
static func edge_cells(edge: String) -> Array[Vector2i]:
	var p := edge.split(",")
	var c := Vector2i(p[0].to_int(), p[1].to_int())
	var other := c - (Vector2i(1, 0) if p[2] == "W" else Vector2i(0, 1))
	return [other, c]


func cells(level: int) -> Dictionary:
	return levels.get(level, {}).get("cells", {})


func overrides(level: int) -> Dictionary:
	return levels.get(level, {}).get("overrides", {})


## Levels that have at least one cell, ascending.
func level_indices() -> Array[int]:
	var out: Array[int] = []
	for l: int in levels:
		if not cells(l).is_empty():
			out.append(l)
	out.sort()
	return out


func is_empty() -> bool:
	return level_indices().is_empty()


## The wall kind an edge shows on a level ("" for none).
func effective_kind(level: int, edge: String) -> String:
	var lc := cells(level)
	var pair := edge_cells(edge)
	var a := lc.has(pair[0])
	var b := lc.has(pair[1])
	if not a and not b:
		return ""
	var kind: String = overrides(level).get(edge, "wall" if a != b else "")
	return "" if kind == "open" else kind


## Visible walls on a level: edge -> {kind, host: Vector2i, side: "W"|"E"|"N"|"S"}. The host is
## the cell whose model shows the wall: the inside cell for exterior walls, otherwise the cell on
## the positive side.
func walls(level: int) -> Dictionary:
	var lc := cells(level)
	var candidates := {}
	for c: Vector2i in lc:
		candidates[edge_key(c, "W")] = true
		candidates[edge_key(c + Vector2i(1, 0), "W")] = true
		candidates[edge_key(c, "N")] = true
		candidates[edge_key(c + Vector2i(0, 1), "N")] = true
	for e: String in overrides(level):
		candidates[e] = true
	var out := {}
	for e: String in candidates:
		var kind := effective_kind(level, e)
		if kind == "":
			continue
		var pair := edge_cells(e)
		var west := e.ends_with("W")
		if lc.has(pair[0]) and not lc.has(pair[1]):
			out[e] = {"kind": kind, "host": pair[0], "side": "E" if west else "S"}
		else:
			out[e] = {"kind": kind, "host": pair[1], "side": "W" if west else "N"}
	return out


## Roof footprints: level -> rectangles of the cells whose highest level is that level.
func roof_groups() -> Dictionary:
	var top := {}
	for l in level_indices():
		for c: Vector2i in cells(l):
			top[c] = maxi(top.get(c, l), l)
	var by_level := {}
	for c: Vector2i in top:
		by_level.get_or_add(top[c], {})[c] = true
	var out := {}
	for l: int in by_level:
		out[l] = decompose(by_level[l])
	return out


## Greedy split of a cell set into rectangles: row-major scan, widen along x, then extend down
## while whole rows fit.
static func decompose(cell_set: Dictionary) -> Array[Rect2i]:
	var todo := cell_set.duplicate()
	var order: Array = todo.keys()
	order.sort_custom(func(a: Vector2i, b: Vector2i) -> bool: return a.y < b.y or (a.y == b.y and a.x < b.x))
	var out: Array[Rect2i] = []
	for start: Vector2i in order:
		if not todo.has(start):
			continue
		var w := 1
		while todo.has(start + Vector2i(w, 0)):
			w += 1
		var h := 1
		while true:
			var row_ok := true
			for x in w:
				if not todo.has(start + Vector2i(x, h)):
					row_ok = false
					break
			if not row_ok:
				break
			h += 1
		for z in h:
			for x in w:
				todo.erase(start + Vector2i(x, z))
		out.append(Rect2i(start, Vector2i(w, h)))
	return out
