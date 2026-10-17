class_name RoofMesh
extends RefCounted
## Procedural roofs over a rectangle (building-local meters): gable or hip with the ridge along
## the longer side, or a flat slab. Vertex-colored (roof surfaces + gable end walls), flat-shaded
## with normals facing away from the rectangle's center.

const OVERHANG := 0.35
const PITCH := 0.75  # rise per unit of horizontal run


## `rect`: x/y of the Rect2 are building-local x/z. `base_y`: top of the walls.
static func build(st: SurfaceTool, rect: Rect2, base_y: float, style: String, roof_color: Color, gable_color: Color) -> void:
	var swap := rect.size.y > rect.size.x  # build with the ridge along x, then swap axes
	var x0 := rect.position.y if swap else rect.position.x
	var z0 := rect.position.x if swap else rect.position.y
	var w := rect.size.y if swap else rect.size.x
	var d := rect.size.x if swap else rect.size.y
	var x1 := x0 + w
	var z1 := z0 + d
	var zc := (z0 + z1) * 0.5
	var center := Vector3((x0 + x1) * 0.5, base_y, zc)
	var o := OVERHANG
	var rise := d * 0.5 * PITCH
	var ye := base_y - o * PITCH
	var yr := base_y + rise
	var tris: Array = []  # [a, b, c, color]

	match style:
		"flat":
			_box(tris, Vector3(x0 - o * 0.5, base_y, z0 - o * 0.5), Vector3(x1 + o * 0.5, base_y + 0.3, z1 + o * 0.5), roof_color)
		"hip":
			var ra := Vector3(x0 + d * 0.5, yr, zc)
			var rb := Vector3(x1 - d * 0.5, yr, zc)
			var e00 := Vector3(x0 - o, ye, z0 - o)
			var e10 := Vector3(x1 + o, ye, z0 - o)
			var e11 := Vector3(x1 + o, ye, z1 + o)
			var e01 := Vector3(x0 - o, ye, z1 + o)
			_quad(tris, e00, e10, rb, ra, roof_color)
			_quad(tris, e11, e01, ra, rb, roof_color)
			tris.append([e01, e00, ra, roof_color])
			tris.append([e10, e11, rb, roof_color])
		_:  # gable
			var e00 := Vector3(x0 - o, ye, z0 - o)
			var e10 := Vector3(x1 + o, ye, z0 - o)
			var e11 := Vector3(x1 + o, ye, z1 + o)
			var e01 := Vector3(x0 - o, ye, z1 + o)
			var r0 := Vector3(x0 - o, yr, zc)
			var r1 := Vector3(x1 + o, yr, zc)
			_quad(tris, e00, e10, r1, r0, roof_color)
			_quad(tris, e11, e01, r0, r1, roof_color)
			for x in [x0, x1]:
				tris.append([Vector3(x, base_y, z0), Vector3(x, base_y, z1), Vector3(x, yr, zc), gable_color])

	for t: Array in tris:
		var a: Vector3 = t[0]
		var b: Vector3 = t[1]
		var c: Vector3 = t[2]
		if swap:
			a = Vector3(a.z, a.y, a.x)
			b = Vector3(b.z, b.y, b.x)
			c = Vector3(c.z, c.y, c.x)
		var cen := Vector3(center.z, center.y, center.x) if swap else center
		_add(st, a, b, c, t[3], cen)


## Axis-aligned box as triangles, normals facing outward.
static func box(st: SurfaceTool, lo: Vector3, hi: Vector3, color: Color) -> void:
	var tris: Array = []
	_box(tris, lo, hi, color)
	for t: Array in tris:
		_add(st, t[0], t[1], t[2], t[3], (lo + hi) * 0.5)


static func _box(tris: Array, lo: Vector3, hi: Vector3, color: Color) -> void:
	var p := func(x: int, y: int, z: int) -> Vector3:
		return Vector3(hi.x if x else lo.x, hi.y if y else lo.y, hi.z if z else lo.z)
	for face in [
		[[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
		[[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]],
		[[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
	]:
		var v: Array = face.map(func(c: Array) -> Vector3: return p.call(c[0], c[1], c[2]))
		_quad(tris, v[0], v[1], v[2], v[3], color)


static func _quad(tris: Array, a: Vector3, b: Vector3, c: Vector3, d: Vector3, color: Color) -> void:
	tris.append([a, b, c, color])
	tris.append([a, c, d, color])


static func _add(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, color: Color, center: Vector3) -> void:
	var cross := (b - a).cross(c - a)
	var n := cross.normalized()
	if n.dot((a + b + c) / 3.0 - center) < 0.0:
		n = -n
	# Godot's front faces are clockwise; two-sided materials flip normals on back faces, so the
	# winding must agree with the outward normal or the face shades as if lit from inside.
	if cross.dot(n) > 0.0:
		var tmp := b
		b = c
		c = tmp
	for v in [a, b, c]:
		st.set_color(color)
		st.set_normal(n)
		st.add_vertex(v)
