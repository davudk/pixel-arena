extends TestCase

const PATH := "user://test_project.pxmap"

var s: MapSession


func before_each() -> void:
	s = MapSession.new()
	DirAccess.remove_absolute(ProjectSettings.globalize_path(PATH))


func _place(pos: Vector3) -> String:
	s.begin("Place")
	var id := s.create_object("prop", {"prop": "core:tree", "position": pos, "rotation": 0.5})
	s.commit()
	return id


func test_round_trip_preserves_state_and_history() -> void:
	var a := _place(Vector3(1.5, 0, -2))
	s.begin("Raise")
	for op in TerrainEdit.height_ops(s.doc, Rect2i(30, 30, 4, 4), func(_x, _z, _o): return 2.5):
		s.apply(op)
	s.commit()
	var b := s.fork("Branch")
	s.edit("Paint", func() -> void: s.set_prop(a, "variant", "red"))
	check_eq(ProjectFile.save(s, PATH), OK)

	var loaded := ProjectFile.open(PATH)
	check(loaded != null)
	check_eq(loaded.doc.map_id, s.doc.map_id)
	check_eq(loaded.current_branch, b)
	check(Merge.diff(s.doc, loaded.doc).is_empty(), "document differs after load")
	check_eq(loaded.branches.size(), 2)
	check_eq(loaded.lamport, s.lamport)

	loaded.undo()
	check_eq(loaded.doc.get_prop(a, "variant"), null, "undo works after load")
	loaded.switch_branch(MapSession.MAIN)
	check_eq(TerrainEdit.height_at(loaded.doc, 32, 32), 2.5)


func test_load_without_matching_snapshot_replays_history() -> void:
	var a := _place(Vector3(3, 0, 3))
	check_eq(ProjectFile.save(s, PATH), OK)
	# Simulate a stale snapshot by loading history into a fresh session and rebuilding.
	var fresh := MapSession.new(s.doc.map_id)
	fresh.load_history(Codec.decode(Codec.encode(s.history_to_dict())))
	fresh.rebuild_document()
	check(Merge.diff(s.doc, fresh.doc).is_empty())
	check(fresh.doc.has_object(a))


func test_save_overwrites_existing_file() -> void:
	_place(Vector3.ZERO)
	check_eq(ProjectFile.save(s, PATH), OK)
	_place(Vector3(40, 0, 0))
	check_eq(ProjectFile.save(s, PATH), OK)
	check_eq(ProjectFile.open(PATH).doc.occupied_chunks().size(), 2)


func test_open_missing_file_returns_null() -> void:
	check(ProjectFile.open("user://does_not_exist.pxmap") == null)
