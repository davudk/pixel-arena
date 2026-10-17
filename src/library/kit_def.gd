class_name KitDef
extends RefCounted
## A modular building kit from packs/<pack>/kits/*.json: grid size, story height, the prop used
## for each piece role (wall, window, door, floor) and colors for generated parts (roof, gable
## ends, foundation). Piece prop ids are resolved against the library when a building is built.

const ROLES := ["wall", "window", "door", "floor"]

var id: String  ## "pack_id:local_id"
var name: String
var themes: PackedStringArray
var cell_size: float
var wall_height: float
var pieces: Dictionary = {}  # role -> prop id
var colors: Dictionary = {}  # "roof" | "gable" | "foundation" -> Color


static func parse(d: Dictionary, pack: PropPack, errors: Array[String]) -> KitDef:
	var k := KitDef.new()
	var local := str(d.get("id", ""))
	if not RegEx.create_from_string(PropDef.ID_PATTERN).search(local):
		errors.append("%s: invalid kit id '%s'" % [pack.id, local])
		return null
	k.id = pack.id + ":" + local
	k.name = str(d.get("name", local.capitalize()))
	k.themes = PackedStringArray(d.get("themes", []))
	k.cell_size = float(d.get("cell_size", 3.0))
	k.wall_height = float(d.get("wall_height", 3.0))
	if k.cell_size <= 0.0 or k.wall_height <= 0.0:
		errors.append("%s: bad kit dimensions" % k.id)
		return null
	var pieces: Dictionary = d.get("pieces", {})
	for role in ROLES:
		if pieces.has(role):
			k.pieces[role] = str(pieces[role])
	if not k.pieces.has("wall"):
		errors.append("%s: kit needs a wall piece" % k.id)
		return null
	var colors: Dictionary = d.get("colors", {})
	k.colors = {
		"roof": Color(colors.get("roof", "#3f9e8f")),
		"gable": Color(colors.get("gable", "#9a5b3e")),
		"foundation": Color(colors.get("foundation", "#8f8a84")),
	}
	return k
