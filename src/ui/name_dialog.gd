class_name NameDialog
extends ConfirmationDialog
## Asks for a short name (new branch, rename). Calls the callback with the trimmed text.

var _edit: LineEdit
var _on_done: Callable


func _init() -> void:
	min_size = Vector2i(360, 100)
	_edit = LineEdit.new()
	_edit.custom_minimum_size.x = 320
	add_child(_edit)
	register_text_enter(_edit)  # Enter confirms
	confirmed.connect(_finish)


func ask(dialog_title: String, initial: String, on_done: Callable) -> void:
	title = dialog_title
	_edit.text = initial
	_on_done = on_done
	popup_centered()
	_edit.grab_focus()
	_edit.select_all()


func _finish() -> void:
	var text := _edit.text.strip_edges()
	if text != "" and _on_done.is_valid():
		_on_done.call(text)
		_on_done = Callable()
