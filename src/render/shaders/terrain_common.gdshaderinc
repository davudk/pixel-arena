// Shared by ground.gdshader and terrain.gdshader so implicit and edited terrain match exactly.

uniform sampler2D palette : source_color, filter_nearest;
uniform bool show_grid = true;
uniform float cell_line_opacity = 0.12;
uniform float chunk_line_opacity = 0.55;
uniform float chunk_size = 32.0;

vec3 palette_color(int index) {
	return texelFetch(palette, ivec2(index, 0), 0).rgb;
}

// Subtle 4 m checker so large flat areas still read as ground.
vec3 apply_checker(vec3 col, vec2 xz) {
	vec2 c4 = floor(xz / 4.0);
	return col * mix(1.0, 0.92, mod(c4.x + c4.y, 2.0));
}

float grid_line(vec2 p, float spacing) {
	vec2 q = p / spacing;
	vec2 d = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-5));
	return 1.0 - clamp(min(d.x, d.y), 0.0, 1.0);
}

// 1 m cell lines (faded out when denser than a few pixels) and stronger chunk lines.
vec3 apply_grid(vec3 col, vec3 world) {
	if (!show_grid) {
		return col;
	}
	float px_per_m = 1.0 / max(max(fwidth(world.x), fwidth(world.z)), 1e-5);
	float cell_fade = smoothstep(3.0, 6.0, px_per_m);
	col = mix(col, vec3(1.0), grid_line(world.xz, 1.0) * cell_line_opacity * cell_fade);
	return mix(col, vec3(1.0), grid_line(world.xz, chunk_size) * chunk_line_opacity);
}

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}
