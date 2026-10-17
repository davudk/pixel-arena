class_name Branch
extends RefCounted
## A line of history. A branch's state = its parent's state after `fork_seq` transactions,
## plus its own transactions. The root branch ("main") has no parent.

var id: String
var name: String
var parent_id: String
var fork_seq: int
var created_time := 0.0
var txns: Array[Transaction] = []
## Per-author stacks of transaction ids, newest last. Copied from the parent on fork so undo
## keeps working across a fork point.
var undo: Dictionary = {}
var redo: Dictionary = {}


func _init(p_id: String = "", p_name: String = "", p_parent_id: String = "", p_fork_seq: int = 0) -> void:
	id = p_id
	name = p_name
	parent_id = p_parent_id
	fork_seq = p_fork_seq
	created_time = Time.get_unix_time_from_system()


func to_dict() -> Dictionary:
	var txn_dicts: Array = []
	for txn in txns:
		txn_dicts.append(txn.to_dict())
	return {
		"id": id, "name": name, "parent_id": parent_id, "fork_seq": fork_seq,
		"created_time": created_time, "txns": txn_dicts, "undo": undo, "redo": redo,
	}


static func from_dict(d: Dictionary) -> Branch:
	var b := Branch.new(d.id, d.name, d.parent_id, d.fork_seq)
	b.created_time = d.get("created_time", 0.0)
	for td in d.txns:
		b.txns.append(Transaction.from_dict(td))
	b.undo = d.get("undo", {})
	b.redo = d.get("redo", {})
	return b
