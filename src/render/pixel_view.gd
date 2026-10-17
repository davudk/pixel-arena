class_name PixelView
extends Control
## Renders the 3D world into a low-resolution SubViewport and shows it upscaled with nearest
## filtering: the pixel filter. With pixel_size 1 it's a plain full-resolution view.
##
## Smooth camera motion without pixel crawl: CameraRig snaps the camera to the texel grid and
## reports the leftover sub-texel offset here, which shifts the upscaled image instead. MARGIN
## extra texels around the edge keep that shift from ever exposing a border.

const MARGIN := 2
const POST_SHADER := preload("res://src/render/shaders/pixel_post.gdshader")

var viewport: SubViewport
var display: TextureRect
var pixel_size := 3:
	set(v):
		pixel_size = maxi(1, v)
		if is_node_ready():
			_layout()
## Leftover camera offset in low-res texels, set by CameraRig each frame.
var subpixel_offset := Vector2.ZERO:
	set(v):
		subpixel_offset = v
		if is_node_ready():
			_place_display()

var _post := ShaderMaterial.new()


func _init() -> void:
	mouse_filter = MOUSE_FILTER_IGNORE
	set_anchors_preset(PRESET_FULL_RECT)
	clip_contents = true

	viewport = SubViewport.new()
	viewport.name = "Viewport"
	viewport.handle_input_locally = false
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.positional_shadow_atlas_size = 2048
	add_child(viewport)

	_post.shader = POST_SHADER
	display = TextureRect.new()
	display.name = "Display"
	display.mouse_filter = MOUSE_FILTER_IGNORE
	display.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	display.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	display.stretch_mode = TextureRect.STRETCH_SCALE
	display.material = _post
	add_child(display)


func _ready() -> void:
	display.texture = viewport.get_texture()
	resized.connect(_layout)
	_layout()


## Color quantization: levels per channel (0 or 1 = off) and ordered-dither strength (0-1).
func set_post(color_levels: int, dither: float) -> void:
	_post.set_shader_parameter("color_levels", color_levels)
	_post.set_shader_parameter("dither", dither)


## World units per texel for an orthographic camera of the given size (keep-height).
func texel_world_size(camera_size: float) -> float:
	return camera_size / viewport.size.y


## Camera size that shows `world_height` meters across this control's visible height.
func camera_size_for(world_height: float) -> float:
	return world_height * viewport.size.y * pixel_size / maxf(size.y, 1.0)


## A position in this control's coordinates → SubViewport pixel coordinates (for camera rays).
func to_viewport(p: Vector2) -> Vector2:
	return (p - display.position) / pixel_size


func _layout() -> void:
	var low := Vector2i((size / pixel_size).ceil()) + Vector2i.ONE * MARGIN * 2
	viewport.size = low.max(Vector2i.ONE)
	display.size = Vector2(viewport.size * pixel_size)
	_post.set_shader_parameter("source_size", Vector2(viewport.size))
	_place_display()


func _place_display() -> void:
	display.position = (subpixel_offset - Vector2.ONE * MARGIN) * pixel_size
