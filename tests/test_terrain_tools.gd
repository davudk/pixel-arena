extends TestCase

var doc: MapDocument


func before_each() -> void:
	doc = MapDocument.new()


func _apply(ops: Array[Dictionary]) -> void:
	for op in ops:
		doc.apply_op(op)


func test_height_at_world_interpolates() -> void:
	_apply(TerrainEdit.height_ops(doc, Rect2i(1, 0, 1, 1), func(_x, _z, _o): return 2.0))
	check_eq(TerrainEdit.height_at_world(doc, 1.0, 0.0), 2.0)
	check(is_equal_approx(TerrainEdit.height_at_world(doc, 0.5, 0.0), 1.0))
	check(is_equal_approx(TerrainEdit.height_at_world(doc, 1.5, 0.5), 0.5))


func test_height_range_tracks_edits() -> void:
	_apply(TerrainEdit.height_ops(doc, Rect2i(3, 3, 1, 1), func(_x, _z, _o): return 5.0))
	_apply(TerrainEdit.height_ops(doc, Rect2i(40, 3, 1, 1), func(_x, _z, _o): return -2.0))
	check_eq(doc.height_range(), Vector2(-2, 5))


func test_raycast_flat_ground() -> void:
	var hit: Variant = TerrainEdit.raycast(doc, Vector3(3, 50, 3), Vector3(0, -1, 0))
	check(hit is Vector3 and hit.distance_to(Vector3(3, 0, 3)) < 0.01, str(hit))


func test_raycast_hits_hill_side_first() -> void:
	_apply(TerrainBrush.sculpt_ops(doc, TerrainBrush.Mode.RAISE, Vector3(10, 0, 0), 4.0, 6.0))
	# Shallow ray from the -x side aimed at the hill's base: must stop on the slope, not at x=10.
	var origin := Vector3(-20, 3, 0)
	var hit: Variant = TerrainEdit.raycast(doc, origin, Vector3(1, -0.1, 0))
	check(hit is Vector3, "hit")
	check(hit.x < 10.0 and hit.x > 5.0, "hit on near slope: %s" % hit)
	check(absf(hit.y - TerrainEdit.height_at_world(doc, hit.x, hit.z)) < 0.01, "on surface")


func test_raycast_pointing_up_misses() -> void:
	check(TerrainEdit.raycast(doc, Vector3(0, 5, 0), Vector3(0, 1, 0)) == null)


func test_raise_and_lower_falloff() -> void:
	_apply(TerrainBrush.sculpt_ops(doc, TerrainBrush.Mode.RAISE, Vector3(0, 0, 0), 3.0, 1.0))
	check(is_equal_approx(TerrainEdit.height_at(doc, 0, 0), 1.0), "full at center")
	var mid := TerrainEdit.height_at(doc, 2, 0)
	check(mid > 0.0 and mid < 1.0, "partial near edge: %f" % mid)
	check_eq(TerrainEdit.height_at(doc, 3, 0), 0.0)
	_apply(TerrainBrush.sculpt_ops(doc, TerrainBrush.Mode.LOWER, Vector3(0, 0, 0), 3.0, 1.0))
	check(is_equal_approx(TerrainEdit.height_at(doc, 0, 0), 0.0))


func test_flatten_moves_toward_target() -> void:
	_apply(TerrainBrush.sculpt_ops(doc, TerrainBrush.Mode.RAISE, Vector3.ZERO, 4.0, 4.0))
	_apply(TerrainBrush.sculpt_ops(doc, TerrainBrush.Mode.FLATTEN, Vector3.ZERO, 6.0, 1.0, 1.0))
	check(is_equal_approx(TerrainEdit.height_at(doc, 0, 0), 1.0))


func test_smooth_reduces_spike() -> void:
	_apply(TerrainEdit.height_ops(doc, Rect2i(5, 5, 1, 1), func(_x, _z, _o): return 9.0))
	_apply(TerrainBrush.sculpt_ops(doc, TerrainBrush.Mode.SMOOTH, Vector3(5, 0, 5), 2.0, 1.0))
	var h := TerrainEdit.height_at(doc, 5, 5)
	check(h < 9.0 and h > 0.0, "spike smoothed: %f" % h)


func test_paint_circle() -> void:
	_apply(TerrainBrush.paint_ops(doc, Vector3(0, 0, 0), 2.0, 3))
	check_eq(TerrainEdit.material_at(doc, 0, 0), 3)
	check_eq(TerrainEdit.material_at(doc, -2, -1), 3)
	check_eq(TerrainEdit.material_at(doc, 2, 2), 0)
