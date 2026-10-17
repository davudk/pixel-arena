class_name TerrainPalette
extends RefCounted
## Terrain materials by index (the value stored per cell in TerrainChunk.materials).
## Flat colors for now; textured materials can replace them later without changing map data.
## Index 0 is the default for untouched land and must match the ground plane.

const MATERIALS := [
	{"name": "Grass", "color": Color("5a8c45")},
	{"name": "Dirt", "color": Color("8a6844")},
	{"name": "Sand", "color": Color("d9c48c")},
	{"name": "Rock", "color": Color("8a8580")},
	{"name": "Snow", "color": Color("eef2f5")},
	{"name": "Dark grass", "color": Color("3f6e36")},
	{"name": "Mud", "color": Color("5e4a36")},
	{"name": "Gravel", "color": Color("a39d92")},
]
## Steep slopes blend toward this material automatically.
const CLIFF := 3

static var _texture: ImageTexture


## The palette as an N x 1 texture (sRGB), shared by the ground and terrain shaders.
static func texture() -> ImageTexture:
	if _texture == null:
		var img := Image.create(MATERIALS.size(), 1, false, Image.FORMAT_RGBA8)
		for i in MATERIALS.size():
			img.set_pixel(i, 0, MATERIALS[i].color)
		_texture = ImageTexture.create_from_image(img)
	return _texture
