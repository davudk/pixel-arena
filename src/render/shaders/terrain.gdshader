shader_type spatial;
// One edited terrain chunk. Materials come from a (SIZE + 2)^2 index texture: the chunk's
// cells plus a one-cell border from its neighbours. Transitions between cells are dithered
// in 25 cm blocks (crisp, pixel-art friendly) instead of smoothly blended. Steep slopes turn
// to the cliff material.

#include "res://src/render/shaders/terrain_common.gdshaderinc"

uniform sampler2D materials : filter_nearest;
uniform vec2 chunk_origin;  // world xz of the chunk's minimum corner
uniform int cliff_material = 3;

varying vec3 world_pos;
varying vec3 world_normal;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_normal = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

int material_at(ivec2 cell) {
	// +1: texel (0, 0) is the border cell at local (-1, -1).
	return int(texelFetch(materials, cell + ivec2(1), 0).r * 255.0 + 0.5);
}

void fragment() {
	vec2 local = world_pos.xz - chunk_origin;
	vec2 u = local - 0.5;  // cell centers at integer + 0.5
	ivec2 c = ivec2(floor(u));
	vec2 f = fract(u);
	float r = hash12(floor(world_pos.xz * 4.0));
	// Pick one of the four surrounding cells with probability = its bilinear weight.
	float w00 = (1.0 - f.x) * (1.0 - f.y);
	float w10 = f.x * (1.0 - f.y);
	float w01 = (1.0 - f.x) * f.y;
	ivec2 pick = c + ivec2(1, 1);
	if (r < w00) {
		pick = c;
	} else if (r < w00 + w10) {
		pick = c + ivec2(1, 0);
	} else if (r < w00 + w10 + w01) {
		pick = c + ivec2(0, 1);
	}
	vec3 col = palette_color(material_at(pick));

	float steep = 1.0 - smoothstep(0.55, 0.7, world_normal.y);
	if (hash12(floor(world_pos.xz * 4.0) + 17.0) < steep) {
		col = palette_color(cliff_material);
	}
	col = apply_checker(col, world_pos.xz);
	ALBEDO = apply_grid(col, world_pos);
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}
