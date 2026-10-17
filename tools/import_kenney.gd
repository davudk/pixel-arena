extends SceneTree
## Imports a Kenney model pack into packs/<pack_id>/ and generates its manifests.
##   godot --headless --path . -s tools/import_kenney.gd -- <pack_key> <models_dir> <license_file>
## pack_key: nature | town | characters. <models_dir> holds the .glb files (and Textures/).
## Categories, themes and placement come from the name rules below; footprints and heights are
## measured from the models. Re-running overwrites the pack.

const SCALE := 3.0  # Kenney units -> meters: 3 m walls, 2 m characters, 1 m fences

const PACKS := {
	"nature": {
		"id": "kenney_nature", "name": "Nature Kit", "version": "2.1",
		"source_url": "https://kenney.nl/assets/nature-kit",
		# The glTFs omit metallicFactor, which glTF defaults to 1 (shiny, sky-tinted).
		"materials": {"metallic": 0.0},
		"rules": [
			["^tree_palm", "nature/trees", ["tropical", "beach"], "subgrid"],
			["^cactus", "nature/plants", ["desert"], "subgrid"],
			["^tree_pine", "nature/trees", ["forest", "mountain", "winter"], "subgrid"],
			["^tree_.*_fall", "nature/trees", ["forest", "autumn"], "subgrid"],
			["^tree_", "nature/trees", ["forest", "countryside", "medieval"], "subgrid"],
			["^(rock|stone)_", "nature/rocks", ["wilderness", "mountain"], "subgrid"],
			["^cliff_", "terrain/cliffs", ["mountain", "wilderness"], "grid"],
			["^ground_river", "terrain/water", ["wilderness", "countryside"], "grid"],
			["^(ground_|path_|platform_)", "terrain/paths", ["countryside", "wilderness"], "grid"],
			["^crops_", "farming/fields", ["farm", "countryside", "medieval"], "grid"],
			["^crop_", "farming/crops", ["farm", "countryside", "medieval"], "subgrid"],
			["^(flower_|grass|plant_|mushroom_|lily_|hanging_moss)", "nature/plants", ["forest", "countryside", "wilderness"], "free"],
			["^fence_", "structures/fences", ["farm", "countryside", "medieval"], "grid"],
			["^bridge_", "structures/bridges", ["countryside", "medieval"], "grid"],
			["^(log|stump_)", "nature/wood", ["forest", "camp"], "subgrid"],
			["^(campfire_|tent_|bed|canoe|sign|pot_)", "camp", ["camp", "wilderness"], "subgrid"],
			["^statue_", "decor/statues", ["ruins", "ancient"], "subgrid"],
		],
	},
	"town": {
		"id": "kenney_town", "name": "Fantasy Town Kit", "version": "2.0",
		"source_url": "https://kenney.nl/assets/fantasy-town-kit",
		"rules": [
			["^wall-wood", "buildings/walls", ["medieval", "town"], "grid", ["wood"]],
			["^wall", "buildings/walls", ["medieval", "town", "castle"], "grid", ["stone"]],
			["^(roof|chimney)", "buildings/roofs", ["medieval", "town"], "grid"],
			["^stairs", "buildings/stairs", ["medieval", "town"], "grid"],
			["^(balcony|overhang|pillar|planks|poles)", "buildings/parts", ["medieval", "town"], "grid"],
			["^(fence|hedge)", "structures/fences", ["medieval", "town", "countryside"], "grid"],
			["^fountain", "decor/fountains", ["medieval", "town"], "grid"],
			["^road", "terrain/roads", ["medieval", "town"], "grid"],
			["^(stall|cart|banner|lantern|wheel)", "town/market", ["medieval", "town", "market"], "subgrid"],
			["^(windmill|watermill|blade)", "buildings/mills", ["medieval", "countryside", "farm"], "subgrid"],
			["^tree", "nature/trees", ["medieval", "town"], "subgrid"],
			["^rock", "nature/rocks", ["medieval"], "subgrid"],
		],
	},
	"characters": {
		"id": "kenney_characters", "name": "Mini Characters", "version": "1.0",
		"source_url": "https://kenney.nl/assets/mini-characters",
		"rules": [
			["^character", "people/characters", ["modern", "everyday"], "free", ["person"]],
			["^(aid|wheelchair)", "people/accessories", ["modern", "everyday"], "free"],
		],
	},
}

const PLACEMENT := {
	"grid": {"mode": "grid", "step": SCALE, "align": "ground", "rotate_snap_deg": 90},
	"subgrid": {"mode": "subgrid", "step": 0.5, "align": "surface", "rotate_snap_deg": 15},
	"free": {"mode": "free", "step": 0.0, "align": "surface", "rotate_snap_deg": 15},
}

const LIGHTS := {
	"^campfire_": {"color": "#ffa04a", "energy": 2.0, "range": 6.0},
	"^lantern": {"color": "#ffd27a", "energy": 1.2, "range": 5.0},
}


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 3 or not PACKS.has(args[0]):
		printerr("usage: -- <%s> <models_dir> <license_file>" % "|".join(PACKS.keys()))
		quit(1)
		return
	var cfg: Dictionary = PACKS[args[0]]
	var src: String = args[1]
	var dst := ProjectSettings.globalize_path("res://packs/%s" % cfg.id)

	DirAccess.make_dir_recursive_absolute(dst.path_join("models/Textures"))
	DirAccess.make_dir_recursive_absolute(dst.path_join("props"))
	DirAccess.copy_absolute(args[2], dst.path_join("LICENSE.txt"))
	if DirAccess.dir_exists_absolute(src.path_join("Textures")):
		for f in DirAccess.get_files_at(src.path_join("Textures")):
			DirAccess.copy_absolute(src.path_join("Textures").path_join(f), dst.path_join("models/Textures").path_join(f))

	var by_file := {}  # top-level category -> [prop dicts]
	var unmatched: Array[String] = []
	var files := Array(DirAccess.get_files_at(src)).filter(func(f: String) -> bool: return f.ends_with(".glb"))
	files.sort()
	for file: String in files:
		var stem := file.get_basename()
		var rule := _match(cfg.rules, stem)
		if rule.is_empty():
			unmatched.append(stem)
			continue
		DirAccess.copy_absolute(src.path_join(file), dst.path_join("models").path_join(file))
		var info := _measure(src.path_join(file))
		var prop := {
			"id": _id(stem),
			"name": _title(stem),
			"category": rule[1],
			"themes": rule[2],
			"tags": rule[4] if rule.size() > 4 else [],
			"model": "models/" + file,
			"footprint": [snappedf(info.size.x * SCALE, 0.01), snappedf(info.size.z * SCALE, 0.01)],
			"height": snappedf(info.size.y * SCALE, 0.01),
			"placement": PLACEMENT[rule[3]],
		}
		if info.animations.has("idle"):
			prop.animations = {"autoplay": "idle", "available": info.animations}
		for pattern: String in LIGHTS:
			if RegEx.create_from_string(pattern).search(stem):
				prop.light = LIGHTS[pattern]
		by_file.get_or_add(rule[1].get_slice("/", 0), []).append(prop)

	var pack := {
		"id": cfg.id,
		"name": cfg.name,
		"version": cfg.version,
		"scale": SCALE,
		"attribution": {
			"author": "Kenney",
			"source_url": cfg.source_url,
			"license": "CC0-1.0",
			"license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
		},
	}
	if cfg.has("materials"):
		pack.materials = cfg.materials
	_write_json(dst.path_join("pack.json"), pack)
	var total := 0
	for group: String in by_file:
		_write_json(dst.path_join("props/%s.json" % group), by_file[group])
		total += by_file[group].size()
	print("%s: %d props in %d files" % [cfg.id, total, by_file.size()])
	if not unmatched.is_empty():
		print("skipped (no rule): ", ", ".join(unmatched))
	quit()


func _match(rules: Array, stem: String) -> Array:
	for rule: Array in rules:
		if RegEx.create_from_string(rule[0]).search(stem):
			return rule
	return []


## Model bounds (in model units) and animation names.
func _measure(path: String) -> Dictionary:
	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	doc.append_from_file(path, state)
	var root: Node = doc.generate_scene(state)
	var aabb := AABB()
	var first := true
	for m: MeshInstance3D in root.find_children("*", "MeshInstance3D", true, false):
		var xf := Transform3D.IDENTITY
		var n: Node = m
		while n != null and n is Node3D:
			xf = (n as Node3D).transform * xf
			n = n.get_parent()
		var box := xf * m.get_aabb()
		aabb = box if first else aabb.merge(box)
		first = false
	var animations: Array = []
	for ap: AnimationPlayer in root.find_children("*", "AnimationPlayer", true, false):
		animations.append_array(ap.get_animation_list())
	root.free()
	return {"size": aabb.size, "animations": animations}


## "tree_pineRoundA" / "wall-wood-door" -> "tree_pine_round_a" / "wall_wood_door"
func _id(stem: String) -> String:
	return stem.to_snake_case().replace("-", "_")


func _title(stem: String) -> String:
	return _id(stem).replace("_", " ").capitalize()


func _write_json(path: String, data: Variant) -> void:
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_string(JSON.stringify(data, "\t", false) + "\n")
