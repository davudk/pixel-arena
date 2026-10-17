class_name PropPack
extends RefCounted
## A folder of props: pack.json plus props/*.json (each an entry or an array of entries).
## Packs are data and assets only; they never contain scripts.

const ALLOWED_LICENSES := ["CC0-1.0", "CC-BY-3.0", "CC-BY-4.0"]

var id: String
var name: String
var version: String
var dir: String
var scale := 1.0
var attribution: Dictionary = {}
## Overrides applied to every material of the pack's models, e.g. {"metallic": 0.0}.
var materials: Dictionary = {}
var props: Array[PropDef] = []
var kits: Array[KitDef] = []


## Loads the pack in `dir`. Problems are appended to `errors`; returns null if unusable.
static func load_dir(p_dir: String, errors: Array[String]) -> PropPack:
	var meta: Variant = _read_json(p_dir.path_join("pack.json"), errors)
	if not meta is Dictionary:
		return null
	var pack := PropPack.new()
	pack.dir = p_dir
	pack.id = str(meta.get("id", ""))
	if not RegEx.create_from_string(PropDef.ID_PATTERN).search(pack.id):
		errors.append("%s: invalid pack id '%s'" % [p_dir, pack.id])
		return null
	pack.name = str(meta.get("name", pack.id))
	pack.version = str(meta.get("version", ""))
	pack.scale = float(meta.get("scale", 1.0))
	pack.attribution = meta.get("attribution", {})
	pack.materials = meta.get("materials", {})

	var props_dir := p_dir.path_join("props")
	var files := Array(DirAccess.get_files_at(props_dir))
	files.sort()
	var seen := {}
	for file: String in files:
		if not file.ends_with(".json"):
			continue
		var data: Variant = _read_json(props_dir.path_join(file), errors)
		var entries: Array = data if data is Array else [data] if data is Dictionary else []
		for entry in entries:
			if not entry is Dictionary:
				errors.append("%s/%s: entry is not an object" % [pack.id, file])
				continue
			var prop := PropDef.parse(entry, pack, errors)
			if prop == null:
				continue
			if seen.has(prop.local_id):
				errors.append("%s: duplicate id" % prop.id)
				continue
			seen[prop.local_id] = true
			pack.props.append(prop)

	var kits_dir := p_dir.path_join("kits")
	if DirAccess.dir_exists_absolute(kits_dir):
		for file in DirAccess.get_files_at(kits_dir):
			if file.ends_with(".json"):
				var data: Variant = _read_json(kits_dir.path_join(file), errors)
				if data is Dictionary:
					var kit := KitDef.parse(data, pack, errors)
					if kit != null:
						pack.kits.append(kit)
	return pack


static func _read_json(path: String, errors: Array[String]) -> Variant:
	if not FileAccess.file_exists(path):
		errors.append("%s: missing" % path)
		return null
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(path)) != OK:
		errors.append("%s:%d: %s" % [path, json.get_error_line(), json.get_error_message()])
		return null
	return json.data
