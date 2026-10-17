class_name ThumbnailRenderer
extends Node
## Renders prop thumbnails in an offscreen viewport, one per frame, and caches them as PNGs in
## user://cache/thumbs (keyed by the model file's modification time, so edits re-render).

signal thumbnail_ready(prop_id: String, texture: Texture2D)

const SIZE := 96
const CACHE_DIR := "user://cache/thumbs"

var models: ModelCache

var _viewport: SubViewport
var _camera: Camera3D
var _stage: Node3D
var _queue: Array[PropDef] = []
var _queued := {}
var _textures: Dictionary[String, Texture2D] = {}
var _busy := false


func _ready() -> void:
	_viewport = SubViewport.new()
	_viewport.size = Vector2i(SIZE, SIZE)
	_viewport.own_world_3d = true
	_viewport.transparent_bg = true
	_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	add_child(_viewport)
	_stage = Node3D.new()
	_viewport.add_child(_stage)

	_camera = Camera3D.new()
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_viewport.add_child(_camera)
	var sun := DirectionalLight3D.new()
	sun.rotation = Vector3(deg_to_rad(-50), deg_to_rad(-30), 0)
	_viewport.add_child(sun)
	var env := Environment.new()
	env.background_mode = Environment.BG_CLEAR_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.75, 0.78, 0.85)
	env.ambient_light_energy = 0.9
	var world_env := WorldEnvironment.new()
	world_env.environment = env
	_viewport.add_child(world_env)


## The thumbnail if available now; otherwise null and `thumbnail_ready` fires later.
func request(prop: PropDef) -> Texture2D:
	if _textures.has(prop.id):
		return _textures[prop.id]
	var path := _cache_path(prop)
	if FileAccess.file_exists(path):
		var img := Image.load_from_file(ProjectSettings.globalize_path(path))
		if img != null:
			_textures[prop.id] = ImageTexture.create_from_image(img)
			return _textures[prop.id]
	if not _queued.has(prop.id):
		_queued[prop.id] = true
		_queue.append(prop)
	return null


## Moves these props to the front of the queue (e.g. the ones currently listed).
func prioritize(props: Array[PropDef]) -> void:
	var front: Array[PropDef] = []
	for p in props:
		if _queued.has(p.id):
			front.append(p)
	var rest := _queue.filter(func(p: PropDef) -> bool: return not p in front)
	_queue = front
	_queue.append_array(rest)


func _process(_delta: float) -> void:
	if not _busy and not _queue.is_empty():
		_render(_queue.pop_front())


func _render(prop: PropDef) -> void:
	_busy = true
	var entry := models.get_prop_entry(prop)
	if entry == null:
		_queued.erase(prop.id)
		_busy = false
		return
	var model := entry.scene.instantiate() as Node3D
	model.scale = Vector3.ONE * prop.scale
	_stage.add_child(model)

	var box := AABB(entry.aabb.position * prop.scale, entry.aabb.size * prop.scale)
	var center := box.get_center()
	var radius := maxf(box.size.length() * 0.5, 0.01)
	var basis := Basis.from_euler(Vector3(deg_to_rad(-30), deg_to_rad(35), 0))
	_camera.transform = Transform3D(basis, center + basis.z * radius * 4.0)
	_camera.size = radius * 2.05
	_camera.near = 0.01
	_camera.far = radius * 8.0

	_viewport.render_target_update_mode = SubViewport.UPDATE_ONCE
	await RenderingServer.frame_post_draw
	var img := _viewport.get_texture().get_image()
	model.queue_free()
	if img == null:  # headless / dummy renderer
		_queued.erase(prop.id)
		_busy = false
		return

	DirAccess.make_dir_recursive_absolute(_cache_path(prop).get_base_dir())
	img.save_png(_cache_path(prop))
	var tex := ImageTexture.create_from_image(img)
	_textures[prop.id] = tex
	_queued.erase(prop.id)
	_busy = false
	thumbnail_ready.emit(prop.id, tex)


func _cache_path(prop: PropDef) -> String:
	var stamp := FileAccess.get_modified_time(prop.model_path)
	return CACHE_DIR.path_join(prop.pack_id).path_join("%s_%d.png" % [prop.local_id, stamp])
