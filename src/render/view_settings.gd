class_name ViewSettings
extends RefCounted
## How the map looks to this viewer: filter, time of day, grid, projection. Not map content.
## Each value resolves through layers, most specific first:
##   player override → map default (MapDocument @settings "view/<key>") → built-in default.
## A server-default layer slots in between player and map when co-op lands.

signal changed

const PREFIX := "view/"
const DEFAULTS := {
	"pixel_size": 3,
	"color_levels": 0,
	"dither": 0.0,
	"time_mode": "fixed",  # "fixed" | "cycle"
	"time_of_day": 10.0,
	"day_length": 600.0,  # seconds per full day in cycle mode
	"grid": true,
	"projection": "orthographic",  # "orthographic" | "perspective"
}
const OVERRIDES_PATH := "user://view_settings.cfg"

var doc: MapDocument
var overrides := {}


func bind(p_doc: MapDocument) -> void:
	if doc != null:
		doc.changed.disconnect(_on_doc_changed)
		doc.reset.disconnect(_on_doc_reset)
	doc = p_doc
	doc.changed.connect(_on_doc_changed)
	doc.reset.connect(_on_doc_reset)
	changed.emit()


func get_value(key: String) -> Variant:
	if overrides.has(key):
		return overrides[key]
	var map_value: Variant = map_default(key)
	return map_value if map_value != null else DEFAULTS[key]


func map_default(key: String) -> Variant:
	return doc.get_setting(PREFIX + key) if doc != null else null


func set_override(key: String, value: Variant) -> void:
	overrides[key] = value
	changed.emit()


func clear_overrides() -> void:
	overrides.clear()
	changed.emit()


## Ops that make the currently resolved values the map's defaults (apply inside a transaction).
func map_default_ops() -> Array[Dictionary]:
	var ops: Array[Dictionary] = []
	for key: String in DEFAULTS:
		var value: Variant = get_value(key)
		if not Codec.same(map_default(key), value):
			ops.append(Ops.set_prop(MapDocument.SETTINGS_ID, PREFIX + key, value))
	return ops


func save_overrides() -> void:
	var cfg := ConfigFile.new()
	for key: String in overrides:
		cfg.set_value("view", key, overrides[key])
	cfg.save(OVERRIDES_PATH)


func load_overrides() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(OVERRIDES_PATH) != OK or not cfg.has_section("view"):
		return
	overrides.clear()
	for key in cfg.get_section_keys("view"):
		if DEFAULTS.has(key):
			overrides[key] = cfg.get_value("view", key)
	changed.emit()


func _on_doc_changed(op: Dictionary) -> void:
	if op.get("id") == MapDocument.SETTINGS_ID:
		changed.emit()


func _on_doc_reset() -> void:
	changed.emit()
