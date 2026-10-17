class_name CreditsDialog
extends AcceptDialog
## Attribution for every loaded asset pack, generated from the manifests.


func _init() -> void:
	title = "Credits"
	min_size = Vector2i(560, 420)


func show_for(library: PropLibrary, doc: MapDocument) -> void:
	var used := {}
	for obj in doc.objects.values():
		var prop := library.get_prop(obj.get_prop("prop", "")) if not obj.deleted else null
		if prop != null:
			used[prop.pack_id] = used.get(prop.pack_id, 0) + 1

	var text := "[b]Pixel Arena[/b]\n\n[b]Asset packs[/b]\n"
	var ids: Array = library.packs.keys()
	ids.sort()
	for id: String in ids:
		var pack: PropPack = library.packs[id]
		var a := pack.attribution
		text += "\n[b]%s[/b] %s — %d props%s\n" % [pack.name, pack.version, pack.props.size(),
			("  (%d used in this map)" % used[id]) if used.has(id) else ""]
		text += "by %s · [url=%s]%s[/url] · [url=%s]%s[/url]\n" % [
			a.get("author", "?"), a.get("source_url", ""), a.get("source_url", ""),
			a.get("license_url", ""), a.get("license", "?")]

	var label := RichTextLabel.new()
	label.bbcode_enabled = true
	label.fit_content = false
	label.custom_minimum_size = Vector2(520, 340)
	label.text = text
	label.meta_clicked.connect(func(meta: Variant) -> void: OS.shell_open(str(meta)))
	for child in get_children():
		if child is RichTextLabel:
			child.queue_free()
	add_child(label)
	popup_centered()
