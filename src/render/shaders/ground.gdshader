shader_type spatial;
render_mode cull_disabled;
// Implicit flat terrain (height 0, material 0) with the world grid. Chunks that hold edited
// terrain are cut out (hole_mask) so their own meshes show instead.

#include "res://src/render/shaders/terrain_common.gdshaderinc"

uniform sampler2D hole_mask : filter_nearest;
uniform ivec2 hole_origin = ivec2(0);  // chunk coordinate of hole_mask texel (0, 0)

varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	ivec2 chunk = ivec2(floor(world_pos.xz / chunk_size)) - hole_origin;
	ivec2 mask_size = textureSize(hole_mask, 0);
	if (all(greaterThanEqual(chunk, ivec2(0))) && all(lessThan(chunk, mask_size))
			&& texelFetch(hole_mask, chunk, 0).r > 0.5) {
		discard;
	}
	vec3 col = apply_checker(palette_color(0), world_pos.xz);
	ALBEDO = apply_grid(col, world_pos);
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}
