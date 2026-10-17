shader_type spatial;
render_mode cull_disabled;
// Implicit flat terrain (height 0) with a world-space grid: 1 m cells and stronger chunk lines.
// Line width uses screen-space derivatives, so lines stay about one (low-res) pixel wide.

uniform vec3 ground_color : source_color = vec3(0.34, 0.52, 0.26);
uniform vec3 ground_color_alt : source_color = vec3(0.31, 0.48, 0.24);
uniform bool show_grid = true;
uniform float cell_line_opacity = 0.22;
uniform float chunk_line_opacity = 0.55;
uniform float chunk_size = 32.0;

varying vec3 world_pos;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

float grid_line(vec2 p, float spacing) {
	vec2 q = p / spacing;
	vec2 d = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-5));
	return 1.0 - clamp(min(d.x, d.y), 0.0, 1.0);
}

void fragment() {
	// Subtle checker every 4 m so large flat areas still read as ground at a glance.
	vec2 c4 = floor(world_pos.xz / 4.0);
	vec3 col = mix(ground_color, ground_color_alt, mod(c4.x + c4.y, 2.0));
	if (show_grid) {
		// Fade 1 m lines out when they'd be closer than a few pixels apart.
		float px_per_m = 1.0 / max(max(fwidth(world_pos.x), fwidth(world_pos.z)), 1e-5);
		float cell_fade = smoothstep(3.0, 6.0, px_per_m);
		col = mix(col, vec3(1.0), grid_line(world_pos.xz, 1.0) * cell_line_opacity * cell_fade);
		col = mix(col, vec3(1.0), grid_line(world_pos.xz, chunk_size) * chunk_line_opacity);
	}
	ALBEDO = col;
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}
