shader_type spatial;
render_mode cull_disabled, depth_draw_never;
// Stylized water: shallow-to-deep color by depth under the surface, a foam band where it
// meets the ground, and slow drifting highlight bands. Lit (so it darkens at night) but with
// flat color; transparency comes from depth so shores read clearly.

uniform vec3 shallow : source_color = vec3(0.45, 0.78, 0.86);
uniform vec3 deep : source_color = vec3(0.13, 0.33, 0.55);
uniform vec3 foam : source_color = vec3(0.92, 0.97, 1.0);
uniform float depth_scale = 2.5;
uniform float foam_width = 0.35;
uniform sampler2D depth_texture : hint_depth_texture, filter_nearest;

varying vec3 world_pos;

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	float raw = texture(depth_texture, SCREEN_UV).r;
	vec4 ndc = vec4(SCREEN_UV * 2.0 - 1.0, raw, 1.0);
	vec4 view = INV_PROJECTION_MATRIX * ndc;
	view.xyz /= view.w;
	float ground_dist = -view.z;
	float surface_dist = -VERTEX.z;
	// Distance through water along the view ray, scaled to roughly vertical depth.
	// Distance through water along the view ray, roughly scaled toward vertical depth.
	float depth = max(ground_dist - surface_dist, 0.0) * 0.6;

	float d = clamp(depth / depth_scale, 0.0, 1.0);
	vec3 col = mix(shallow, deep, d);
	float band = sin(world_pos.x * 0.7 + world_pos.z * 0.4 + TIME * 0.8) * sin(world_pos.z * 0.9 - TIME * 0.5);
	float sparkle = step(0.93, band) * step(0.5, hash12(floor(world_pos.xz * 3.0)));
	col = mix(col, foam, sparkle * 0.5);
	float edge = 1.0 - smoothstep(0.0, foam_width, depth);
	col = mix(col, foam, step(0.55, edge + hash12(floor(world_pos.xz * 4.0)) * 0.3) * 0.85);
	ALBEDO = col;
	ALPHA = mix(0.55, 0.92, d);
	ROUGHNESS = 0.35;
	SPECULAR = 0.3;
}
