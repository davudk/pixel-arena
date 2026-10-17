class_name Uuid
extends RefCounted
## Random (version 4) UUIDs for objects, transactions and branches.

static var _crypto := Crypto.new()


static func v4() -> String:
	var b := _crypto.generate_random_bytes(16)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	var h := b.hex_encode()
	return "%s-%s-%s-%s-%s" % [h.substr(0, 8), h.substr(8, 4), h.substr(12, 4), h.substr(16, 4), h.substr(20, 12)]
