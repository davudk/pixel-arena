class_name Transaction
extends RefCounted
## A group of applied ops produced by one user action. The unit of undo, history and sync.

const KIND_EDIT := "edit"
const KIND_UNDO := "undo"
const KIND_REDO := "redo"
const KIND_MERGE := "merge"

var id: String
var author: String
var label: String
var kind: String
## For undo/redo: the id of the transaction this one inverts.
var target := ""
var branch := ""
var lamport := 0
var time := 0.0
## Applied ops (with `prev` filled in), in application order.
var ops: Array[Dictionary] = []
## For undo/redo: ops that couldn't be reverted because the data changed since.
var skipped := 0


func _init(p_id: String = "", p_author: String = "", p_label: String = "", p_kind: String = KIND_EDIT) -> void:
	id = p_id
	author = p_author
	label = p_label
	kind = p_kind


func to_dict() -> Dictionary:
	return {
		"id": id, "author": author, "label": label, "kind": kind, "target": target,
		"branch": branch, "lamport": lamport, "time": time, "ops": ops, "skipped": skipped,
	}


static func from_dict(d: Dictionary) -> Transaction:
	var txn := Transaction.new(d.id, d.author, d.label, d.kind)
	txn.target = d.get("target", "")
	txn.branch = d.get("branch", "")
	txn.lamport = d.get("lamport", 0)
	txn.time = d.get("time", 0.0)
	txn.ops.assign(d.ops)
	txn.skipped = d.get("skipped", 0)
	return txn
