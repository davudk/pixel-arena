extends TestCase
## Loads every script under src/ so parse errors fail the suite (scripts load lazily otherwise).


func test_all_scripts_compile() -> void:
	for path in _scripts("res://src"):
		var script: Script = load(path)
		check(script != null and script.can_instantiate(), "failed to compile: " + path)


func _scripts(dir: String) -> Array[String]:
	var out: Array[String] = []
	for f in DirAccess.get_files_at(dir):
		if f.ends_with(".gd"):
			out.append(dir.path_join(f))
	for d in DirAccess.get_directories_at(dir):
		out.append_array(_scripts(dir.path_join(d)))
	return out
