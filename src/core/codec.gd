class_name Codec
extends RefCounted
## Value helpers shared by the data layer: strict equality, defensive copies, and JSON encoding
## that preserves Godot types (Vector3, Rect2i, packed arrays, non-string dictionary keys).


## Equality that never errors on mismatched types (GDScript's `==` does for e.g. int vs String).
static func same(a: Variant, b: Variant) -> bool:
	return typeof(a) == typeof(b) and a == b


## Copy containers so stored values can't be mutated through a caller's reference.
static func copy(value: Variant) -> Variant:
	if value is Array or value is Dictionary:
		return value.duplicate(true)
	if typeof(value) >= TYPE_PACKED_BYTE_ARRAY and typeof(value) < TYPE_MAX:
		return value.duplicate()
	return value


static func encode(value: Variant) -> String:
	return JSON.stringify(JSON.from_native(value), "", false, true)


static func decode(text: String) -> Variant:
	var json := JSON.new()
	if json.parse(text) != OK:
		push_error("Codec.decode: %s at line %d" % [json.get_error_message(), json.get_error_line()])
		return null
	return JSON.to_native(json.data)
