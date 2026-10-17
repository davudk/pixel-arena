class_name Snapping
extends RefCounted
## Placement snapping. Snapping is editor behaviour only: positions are always stored as floats.
##   grid    - align the footprint to cells of `step` meters. A footprint spanning an odd number
##             of cells sits in a cell's center; an even number sits on a grid line.
##   subgrid - round to multiples of `step`.
##   free    - no snapping.


static func snap_position(p: Vector3, mode: String, step: float, footprint: Vector2) -> Vector3:
	match mode:
		"grid":
			return Vector3(grid_axis(p.x, step, footprint.x), p.y, grid_axis(p.z, step, footprint.y))
		"subgrid":
			if step <= 0.0:
				return p
			return Vector3(snappedf(p.x, step), p.y, snappedf(p.z, step))
	return p


static func grid_axis(v: float, step: float, size: float) -> float:
	if step <= 0.0:
		return v
	var cells := maxi(1, roundi(size / step))
	if cells % 2 == 1:
		return floorf(v / step) * step + step * 0.5
	return roundf(v / step) * step


static func snap_yaw(yaw: float, degrees: float) -> float:
	if degrees <= 0.0:
		return yaw
	return snappedf(yaw, deg_to_rad(degrees))


## Snapped position for a prop, honoring a "free" override (modifier key).
static func for_prop(prop: PropDef, p: Vector3, yaw: float, free: bool) -> Vector3:
	if free:
		return p
	return snap_position(p, prop.mode, prop.step, prop.footprint_at(yaw))
