shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_back;
// Selection highlight drawn over an object's own material: a bright rim plus a faint fill.

uniform vec3 color : source_color = vec3(1.0, 0.75, 0.2);

void fragment() {
	float rim = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.0);
	ALBEDO = color * (0.18 + rim * 0.9);
}
