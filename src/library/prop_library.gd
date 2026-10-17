class_name PropLibrary
extends RefCounted
## Every loaded prop pack, with lookup, category/theme listings and search.
## Built-in packs live in res://packs; user packs (later: Workshop) in user://packs.

const BUILTIN_DIR := "res://packs"
const USER_DIR := "user://packs"

var packs: Dictionary[String, PropPack] = {}
var props: Dictionary[String, PropDef] = {}
## Problems found while loading, for display / logs.
var errors: Array[String] = []


static func load_default() -> PropLibrary:
	var lib := PropLibrary.new()
	lib.load_from(BUILTIN_DIR)
	lib.load_from(USER_DIR)
	return lib


## Loads every pack folder under `root`. A pack id that's already loaded is skipped.
func load_from(root: String) -> void:
	if not DirAccess.dir_exists_absolute(root):
		return
	var dirs := Array(DirAccess.get_directories_at(root))
	dirs.sort()
	for d: String in dirs:
		var pack := PropPack.load_dir(root.path_join(d), errors)
		if pack == null:
			continue
		if packs.has(pack.id):
			errors.append("%s: pack id '%s' already loaded" % [root.path_join(d), pack.id])
			continue
		packs[pack.id] = pack
		for prop in pack.props:
			props[prop.id] = prop


func get_prop(id: String) -> PropDef:
	return props.get(id)


## Category paths with prop counts, including parent paths ("nature" and "nature/trees").
func categories() -> Dictionary:
	var out := {}
	for prop: PropDef in props.values():
		var parts := prop.category.split("/")
		for i in parts.size():
			var path := "/".join(parts.slice(0, i + 1))
			out[path] = out.get(path, 0) + 1
	return out


## Theme names with prop counts.
func themes() -> Dictionary:
	var out := {}
	for prop: PropDef in props.values():
		for t in prop.themes:
			out[t] = out.get(t, 0) + 1
	return out


## Props matching all filters, sorted by category then name. `query` words must all appear
## (in name, id, category, themes, tags or pack name). `category` matches itself and below.
func search(query: String = "", theme: String = "", category: String = "") -> Array[PropDef]:
	var words := query.to_lower().split(" ", false)
	var out: Array[PropDef] = []
	for prop: PropDef in props.values():
		if theme != "" and not theme in prop.themes:
			continue
		if category != "" and prop.category != category and not prop.category.begins_with(category + "/"):
			continue
		var ok := true
		for w in words:
			if not prop.search_text.contains(w):
				ok = false
				break
		if ok:
			out.append(prop)
	out.sort_custom(func(a: PropDef, b: PropDef) -> bool:
		return a.category < b.category if a.category != b.category else a.name < b.name)
	return out
