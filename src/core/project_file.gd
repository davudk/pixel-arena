class_name ProjectFile
extends RefCounted
## Reads and writes `.pxmap` project files: a zip containing
##   meta.json      format version, map id
##   history.json   every branch with its transactions and undo/redo stacks
##   snapshot.json  document state at the head of the current branch, so opening is fast
## Saving writes a temp file and renames it over the target so a crash can't corrupt a save.

const EXTENSION := "pxmap"


static func save(session: MapSession, path: String) -> Error:
	var tmp := path + ".tmp"
	var zip := ZIPPacker.new()
	var err := zip.open(tmp)
	if err != OK:
		return err
	var meta := {
		"app": "pixel-arena",
		"format_version": MapDocument.FORMAT_VERSION,
		"map_id": session.doc.map_id,
		"saved_time": Time.get_unix_time_from_system(),
	}
	var snapshot := {
		"branch": session.current_branch,
		"seq": session.branch().txns.size(),
		"doc": session.doc.to_dict(),
	}
	for entry in [["meta.json", meta], ["history.json", session.history_to_dict()], ["snapshot.json", snapshot]]:
		err = _write(zip, entry[0], entry[1])
		if err != OK:
			zip.close()
			DirAccess.remove_absolute(tmp)
			return err
	err = zip.close()
	if err != OK:
		return err
	return DirAccess.rename_absolute(tmp, path)


## Opens a project as `author_id`. Returns null on failure.
static func open(path: String, author_id: String = "local") -> MapSession:
	var zip := ZIPReader.new()
	if zip.open(path) != OK:
		push_error("ProjectFile.open: can't open %s" % path)
		return null
	var meta: Variant = _read(zip, "meta.json")
	var history: Variant = _read(zip, "history.json")
	var snapshot: Variant = _read(zip, "snapshot.json")
	zip.close()
	if not (meta is Dictionary and history is Dictionary):
		push_error("ProjectFile.open: %s is not a valid project" % path)
		return null
	if meta.format_version > MapDocument.FORMAT_VERSION:
		push_error("ProjectFile.open: %s was saved by a newer version" % path)
		return null

	var session := MapSession.new(meta.map_id, author_id)
	session.load_history(history)
	if snapshot is Dictionary and snapshot.branch == session.current_branch \
			and snapshot.seq == session.branch().txns.size():
		session.doc.load_state(MapDocument.from_dict(snapshot.doc))
	else:
		session.rebuild_document()
	return session


static func _write(zip: ZIPPacker, name: String, data: Variant) -> Error:
	var err := zip.start_file(name)
	if err != OK:
		return err
	err = zip.write_file(Codec.encode(data).to_utf8_buffer())
	if err != OK:
		return err
	return zip.close_file()


static func _read(zip: ZIPReader, name: String) -> Variant:
	if not zip.file_exists(name):
		return null
	return Codec.decode(zip.read_file(name).get_string_from_utf8())
