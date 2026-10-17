class_name PropDef
extends RefCounted
## One prop from a pack manifest, validated and resolved (absolute model path, scale and
## attribution inherited from the pack). See docs/PLAN.md §7 for the manifest format.

const MODES := ["grid", "subgrid", "free"]
const ALIGNS := ["ground", "surface", "wall"]
const ID_PATTERN := "^[a-z0-9_\\-]+$"

var id: String  ## "pack_id:local_id"
var local_id: String
var pack_id: String
var name: String
var category: String
var themes: PackedStringArray
var tags: PackedStringArray
var model_path: String
var scale: float
var footprint: Vector2  ## meters (x, z) at rotation 0
var height: float
var mode: String
var step: float
var align: String
var rotate_snap_deg: float
var autoplay := ""
var animations: PackedStringArray
var light: Dictionary = {}
var material_overrides: Dictionary = {}
var attribution: Dictionary
## Lowercase text matched by search.
var search_text: String


## Parses one manifest entry. Problems are appended to `errors`; returns null if unusable.
static func parse(d: Dictionary, pack: PropPack, errors: Array[String]) -> PropDef:
	var where := "%s:%s" % [pack.id, d.get("id", "?")]
	var p := PropDef.new()
	p.local_id = str(d.get("id", ""))
	if not RegEx.create_from_string(ID_PATTERN).search(p.local_id):
		errors.append("%s: invalid id" % where)
		return null
	p.pack_id = pack.id
	p.id = pack.id + ":" + p.local_id
	p.name = str(d.get("name", p.local_id.capitalize()))
	p.category = str(d.get("category", ""))
	if p.category == "":
		errors.append("%s: missing category" % where)
		return null
	p.themes = PackedStringArray(d.get("themes", []))
	p.tags = PackedStringArray(d.get("tags", []))

	var model := str(d.get("model", ""))
	p.model_path = pack.dir.path_join(model)
	if model == "" or not FileAccess.file_exists(p.model_path):
		errors.append("%s: model not found: %s" % [where, model])
		return null

	p.scale = float(d.get("scale", pack.scale))
	var fp: Array = d.get("footprint", [1.0, 1.0])
	p.footprint = Vector2(fp[0], fp[1])
	p.height = float(d.get("height", 1.0))

	var placement: Dictionary = d.get("placement", {})
	p.mode = placement.get("mode", "subgrid")
	p.step = float(placement.get("step", 0.5))
	p.align = placement.get("align", "ground")
	p.rotate_snap_deg = float(placement.get("rotate_snap_deg", 15.0))
	if not p.mode in MODES or not p.align in ALIGNS:
		errors.append("%s: bad placement %s" % [where, placement])
		return null

	var anim: Dictionary = d.get("animations", {})
	p.autoplay = anim.get("autoplay", "")
	p.animations = PackedStringArray(anim.get("available", []))
	p.light = d.get("light", {})
	p.material_overrides = pack.materials

	p.attribution = pack.attribution.duplicate()
	p.attribution.merge(d.get("attribution", {}), true)
	var license := str(p.attribution.get("license", ""))
	if not license in PropPack.ALLOWED_LICENSES:
		errors.append("%s: license '%s' not allowed" % [where, license])
		return null

	p.search_text = " ".join([p.name, p.local_id, p.category, " ".join(p.themes), " ".join(p.tags), pack.name]).to_lower()
	return p


## Footprint after rotating by `yaw` (only 90 degree turns swap axes).
func footprint_at(yaw: float) -> Vector2:
	var quarter := posmod(roundi(yaw / (PI / 2)), 2)
	return Vector2(footprint.y, footprint.x) if quarter == 1 else footprint
