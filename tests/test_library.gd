extends TestCase

const TMP := "user://test_packs"
const MODEL := "res://packs/kenney_nature/models/tree_oak.glb"


func before_each() -> void:
	_rm(ProjectSettings.globalize_path(TMP))


func _rm(dir: String) -> void:
	if not DirAccess.dir_exists_absolute(dir):
		return
	for f in DirAccess.get_files_at(dir):
		DirAccess.remove_absolute(dir.path_join(f))
	for d in DirAccess.get_directories_at(dir):
		_rm(dir.path_join(d))
	DirAccess.remove_absolute(dir)


## Writes a pack with the given prop entries; every entry may use "models/m.glb".
func _make_pack(dir_name: String, pack: Dictionary, props: Array) -> String:
	var dir := TMP.path_join(dir_name)
	DirAccess.make_dir_recursive_absolute(dir.path_join("props"))
	DirAccess.make_dir_recursive_absolute(dir.path_join("models"))
	DirAccess.copy_absolute(MODEL, dir.path_join("models/m.glb"))
	FileAccess.open(dir.path_join("pack.json"), FileAccess.WRITE).store_string(JSON.stringify(pack))
	FileAccess.open(dir.path_join("props/all.json"), FileAccess.WRITE).store_string(JSON.stringify(props))
	return dir


func _pack(id: String) -> Dictionary:
	return {"id": id, "name": id.capitalize(), "scale": 2.0, "attribution": {"author": "Someone", "license": "CC0-1.0"}}


func _prop(id: String, extra: Dictionary = {}) -> Dictionary:
	var d := {"id": id, "category": "nature/trees", "themes": ["forest"], "model": "models/m.glb"}
	d.merge(extra, true)
	return d


func test_builtin_packs_load_cleanly() -> void:
	var lib := PropLibrary.new()
	lib.load_from(PropLibrary.BUILTIN_DIR)
	check_eq(lib.errors, [] as Array[String])
	check_eq(lib.packs.size(), 3)
	check(lib.props.size() > 500)
	var fire := lib.get_prop("kenney_nature:campfire_logs")
	check(fire != null)
	check(not fire.light.is_empty())
	check_eq(fire.attribution.license, "CC0-1.0")
	var person := lib.get_prop("kenney_characters:character_female_a")
	check_eq(person.autoplay, "idle")


func test_prop_inherits_pack_scale_and_attribution() -> void:
	var errors: Array[String] = []
	var pack := PropPack.load_dir(_make_pack("a", _pack("alpha"), [_prop("oak", {"attribution": {"author": "Other"}})]), errors)
	check_eq(errors, [] as Array[String])
	var p := pack.props[0]
	check_eq(p.id, "alpha:oak")
	check_eq(p.scale, 2.0)
	check_eq(p.attribution.author, "Other")
	check_eq(p.attribution.license, "CC0-1.0")


func test_invalid_entries_are_rejected_with_errors() -> void:
	var errors: Array[String] = []
	var pack := PropPack.load_dir(_make_pack("b", _pack("beta"), [
		_prop("ok"),
		_prop("Bad Id"),
		_prop("nc", {"attribution": {"license": "CC-BY-NC-4.0"}}),
		_prop("missing", {"model": "models/nope.glb"}),
		_prop("nocat", {"category": ""}),
		_prop("ok"),
		_prop("badmode", {"placement": {"mode": "magnetic"}}),
	]), errors)
	check_eq(pack.props.size(), 1)
	check_eq(errors.size(), 6)


func test_duplicate_pack_id_skipped() -> void:
	_make_pack("one", _pack("same"), [_prop("a")])
	_make_pack("two", _pack("same"), [_prop("b")])
	var lib := PropLibrary.new()
	lib.load_from(TMP)
	check_eq(lib.packs.size(), 1)
	check_eq(lib.errors.size(), 1)


func test_search_and_listings() -> void:
	_make_pack("c", _pack("gamma"), [
		_prop("oak", {"name": "Oak Tree", "themes": ["forest", "medieval"]}),
		_prop("palm", {"name": "Palm Tree", "themes": ["beach"]}),
		_prop("boulder", {"name": "Boulder", "category": "nature/rocks", "tags": ["stone"]}),
		_prop("hut", {"name": "Hut", "category": "buildings", "themes": ["medieval"]}),
	])
	var lib := PropLibrary.new()
	lib.load_from(TMP)
	var ids := func(list: Array[PropDef]) -> Array:
		return list.map(func(p: PropDef) -> String: return p.local_id)
	check_eq(ids.call(lib.search("tree")), ["oak", "palm"])
	check_eq(ids.call(lib.search("", "medieval")), ["hut", "oak"])
	check_eq(ids.call(lib.search("", "", "nature")), ["boulder", "oak", "palm"])
	check_eq(ids.call(lib.search("stone")), ["boulder"])
	check_eq(ids.call(lib.search("tree OAK")), ["oak"])
	check_eq(ids.call(lib.search("tree", "beach", "nature/trees")), ["palm"])
	check_eq(lib.categories(), {"nature": 3, "nature/trees": 2, "nature/rocks": 1, "buildings": 1})
	check_eq(lib.themes().medieval, 2)


func test_model_cache_builds_scene_and_shape() -> void:
	var cache := ModelCache.new()
	var entry := cache.get_entry(ProjectSettings.globalize_path(MODEL))
	check(entry != null)
	check(entry.shape.get_faces().size() > 0)
	check(entry.aabb.size.y > 0.5)
	check(cache.get_entry(ProjectSettings.globalize_path(MODEL)) == entry, "cached")
	var node := entry.scene.instantiate()
	check(node.find_children("*", "MeshInstance3D", true, false).size() > 0)
	node.free()
