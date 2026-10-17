class_name EditorTool
extends RefCounted
## Base for editor tools (select, place, later terrain and building tools). EditorController
## forwards left-button and pointer events plus unhandled keys to the active tool; camera
## controls are handled before tools see anything.

var main: EditorMain


func activate() -> void:
	pass


func deactivate() -> void:
	pass


func on_press(_pos: Vector2, _event: InputEventMouseButton) -> void:
	pass


func on_release(_pos: Vector2, _event: InputEventMouseButton) -> void:
	pass


func on_motion(_pos: Vector2) -> void:
	pass


## Called every frame while the tool is active.
func process(_delta: float) -> void:
	pass


## Return true if the key was used.
func on_key(_event: InputEventKey) -> bool:
	return false
