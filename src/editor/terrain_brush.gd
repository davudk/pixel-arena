class_name TerrainBrush
extends RefCounted
## Brush math for terrain tools: turns one brush application at a world position into terrain
## ops. Heights are sample-based (1 m grid); weights fall off smoothly to the brush edge.

enum Mode { RAISE, LOWER, SMOOTH, FLATTEN, PAINT }


## Smoothstep falloff: 1 at the center, 0 at `radius`.
static func weight(distance: float, radius: float) -> float:
	var t := clampf(1.0 - distance / maxf(radius, 0.001), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)


## Height ops for one application. `amount`: meters at the center for RAISE/LOWER, blend
## factor (0-1) for SMOOTH/FLATTEN. `target` is the FLATTEN height.
static func sculpt_ops(doc: MapDocument, mode: Mode, center: Vector3, radius: float, amount: float, target: float = 0.0) -> Array[Dictionary]:
	var rect := Rect2i(floori(center.x - radius), floori(center.z - radius), ceili(radius * 2.0) + 2, ceili(radius * 2.0) + 2)
	var fn := func(sx: int, sz: int, old: float) -> float:
		var w := weight(Vector2(sx - center.x, sz - center.z).length(), radius)
		if w <= 0.0:
			return old
		match mode:
			Mode.RAISE:
				return old + amount * w
			Mode.LOWER:
				return old - amount * w
			Mode.FLATTEN:
				return lerpf(old, target, clampf(amount * w, 0.0, 1.0))
			Mode.SMOOTH:
				var sum := 0.0
				for dz in range(-1, 2):
					for dx in range(-1, 2):
						sum += TerrainEdit.height_at(doc, sx + dx, sz + dz)
				return lerpf(old, sum / 9.0, clampf(amount * w, 0.0, 1.0))
		return old
	return TerrainEdit.height_ops(doc, rect, fn)


## Material ops painting every cell whose center lies within `radius`.
static func paint_ops(doc: MapDocument, center: Vector3, radius: float, material: int) -> Array[Dictionary]:
	var rect := Rect2i(floori(center.x - radius) - 1, floori(center.z - radius) - 1, ceili(radius * 2.0) + 3, ceili(radius * 2.0) + 3)
	return TerrainEdit.material_ops(doc, rect, func(cx: int, cz: int, old: int) -> int:
		return material if Vector2(cx + 0.5 - center.x, cz + 0.5 - center.z).length() <= radius else old)
