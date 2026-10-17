shader_type canvas_item;
// Post pass on the upscaled low-res image: optional per-channel color quantization with
// 4x4 ordered (Bayer) dithering, computed per low-res texel so the pattern stays pixel-aligned.

uniform int color_levels = 0; // levels per channel; 0 or 1 = off
uniform float dither : hint_range(0.0, 1.0) = 0.0;
uniform vec2 source_size = vec2(1.0);

const float BAYER[16] = float[](
	0.0, 8.0, 2.0, 10.0,
	12.0, 4.0, 14.0, 6.0,
	3.0, 11.0, 1.0, 9.0,
	15.0, 7.0, 13.0, 5.0);

void fragment() {
	vec4 c = texture(TEXTURE, UV);
	if (color_levels > 1) {
		ivec2 px = ivec2(floor(UV * source_size)) % 4;
		float threshold = (BAYER[px.y * 4 + px.x] + 0.5) / 16.0 - 0.5;
		float steps = float(color_levels - 1);
		vec3 v = c.rgb + threshold * dither / steps;
		c.rgb = clamp(floor(v * steps + 0.5) / steps, 0.0, 1.0);
	}
	COLOR = c;
}
