class_name MapSession
extends RefCounted
## Owns the live MapDocument and its full history: branches of transactions, per-author
## undo/redo, and fork / switch / merge / discard. All edits go through begin() ... commit().
##
## Undo is per author and selective: it appends a new transaction that inverts the author's
## own last transaction, skipping anything someone else has changed since (see Ops.inverse).
## In single player this behaves like ordinary undo.

signal history_changed
signal branch_switched(branch_id: String)

const MAIN := "main"

## The live document. Stays the same instance for the session's lifetime; switching branches
## replaces its contents and emits its `reset` signal.
var doc: MapDocument
var author_id: String
var branches: Dictionary[String, Branch] = {}
var current_branch := MAIN
var lamport := 0

var _txns: Dictionary[String, Transaction] = {}
var _open: Transaction = null


func _init(p_map_id: String = "", p_author_id: String = "local") -> void:
	doc = MapDocument.new(p_map_id)
	author_id = p_author_id
	branches[MAIN] = Branch.new(MAIN, "Main")


func branch() -> Branch:
	return branches[current_branch]


func get_transaction(id: String) -> Transaction:
	return _txns.get(id)


# --- Editing ---------------------------------------------------------------

func begin(label: String) -> void:
	assert(_open == null, "MapSession.begin: a transaction is already open")
	_open = Transaction.new(Uuid.v4(), author_id, label)


func is_editing() -> bool:
	return _open != null


## Applies a primitive op inside the open transaction. Returns the applied op or {}.
func apply(op: Dictionary) -> Dictionary:
	if _open == null:
		push_error("MapSession.apply: no open transaction")
		return {}
	var applied := doc.apply_op(op)
	if not applied.is_empty():
		_open.ops.append(applied)
	return applied


func create_object(type: String, props: Dictionary = {}) -> String:
	var id := Uuid.v4()
	if apply(Ops.create(id, type)).is_empty():
		return ""
	for path: String in props:
		apply(Ops.set_prop(id, path, props[path]))
	return id


func set_prop(id: String, path: String, value: Variant) -> void:
	apply(Ops.set_prop(id, path, value))


func delete_object(id: String) -> void:
	apply(Ops.delete(id))


## Records the open transaction. Returns it, or null if it made no changes.
func commit() -> Transaction:
	var txn := _open
	_open = null
	if txn == null or txn.ops.is_empty():
		return null
	_record(txn)
	_stack(branch().undo).push_back(txn.id)
	_stack(branch().redo).clear()
	history_changed.emit()
	return txn


## Reverts and drops the open transaction.
func cancel() -> void:
	if _open == null:
		return
	for i in range(_open.ops.size() - 1, -1, -1):
		var inv := Ops.inverse(doc, _open.ops[i])
		if not inv.is_empty():
			doc.apply_op(inv)
	_open = null


## begin(label), fn.call(), commit().
func edit(label: String, fn: Callable) -> Transaction:
	begin(label)
	fn.call()
	return commit()


# --- Undo / redo -----------------------------------------------------------

func can_undo() -> bool:
	return not branch().undo.get(author_id, []).is_empty()


func can_redo() -> bool:
	return not branch().redo.get(author_id, []).is_empty()


## Reverts this author's last transaction. Returns the inverse transaction, or null if there
## was nothing to undo or everything had since been changed by someone else.
func undo() -> Transaction:
	assert(_open == null, "MapSession.undo: transaction open")
	var stack := _stack(branch().undo)
	if stack.is_empty():
		return null
	var inv := _invert(_txns[stack.pop_back()], Transaction.KIND_UNDO)
	if inv != null:
		_stack(branch().redo).push_back(inv.id)
	history_changed.emit()
	return inv


func redo() -> Transaction:
	assert(_open == null, "MapSession.redo: transaction open")
	var stack := _stack(branch().redo)
	if stack.is_empty():
		return null
	var inv := _invert(_txns[stack.pop_back()], Transaction.KIND_REDO)
	if inv != null:
		_stack(branch().undo).push_back(inv.id)
	history_changed.emit()
	return inv


func _invert(target: Transaction, kind: String) -> Transaction:
	var txn := Transaction.new(Uuid.v4(), author_id, target.label, kind)
	txn.target = target.id
	# Reverse order, applying as we go: each check must see the earlier reverts.
	for i in range(target.ops.size() - 1, -1, -1):
		var inv := Ops.inverse(doc, target.ops[i])
		if inv.is_empty():
			txn.skipped += 1
		else:
			txn.ops.append(doc.apply_op(inv))
	if txn.ops.is_empty():
		return null
	_record(txn)
	return txn


# --- Branches --------------------------------------------------------------

## Starts a new branch at the current state and switches to it. Returns its id.
func fork(name: String) -> String:
	assert(_open == null, "MapSession.fork: transaction open")
	var parent := branch()
	var b := Branch.new(Uuid.v4(), name, parent.id, parent.txns.size())
	b.undo = parent.undo.duplicate(true)
	b.redo = parent.redo.duplicate(true)
	branches[b.id] = b
	current_branch = b.id
	history_changed.emit()
	branch_switched.emit(b.id)
	return b.id


func switch_branch(id: String) -> void:
	assert(_open == null, "MapSession.switch_branch: transaction open")
	if id == current_branch or not branches.has(id):
		return
	doc.load_state(_materialize(id))
	current_branch = id
	history_changed.emit()
	branch_switched.emit(id)


func children_of(id: String) -> Array[String]:
	var out: Array[String] = []
	for b in branches.values():
		if b.parent_id == id:
			out.append(b.id)
	return out


## Deletes a branch and all branches forked from it. If the current branch is among them,
## switches to the discarded branch's parent first. Main can't be discarded.
func discard_branch(id: String) -> bool:
	if id == MAIN or not branches.has(id):
		return false
	if _descends_from(current_branch, id):
		switch_branch(branches[id].parent_id)
	for child in children_of(id):
		discard_branch(child)
	for txn in branches[id].txns:
		_txns.erase(txn.id)
	branches.erase(id)
	history_changed.emit()
	return true


## What merging `source_id` into its parent would change, including conflicts.
func merge_plan(source_id: String) -> Merge.Plan:
	var src := branches[source_id]
	var base := _materialize(src.parent_id, src.fork_seq)
	return Merge.plan(base, _head(src.parent_id), _head(source_id))


## Merges a branch into its parent as one undoable transaction, then discards the branch.
## Leaves the parent as the current branch. Branches with sub-branches can't be merged.
func merge_branch(source_id: String, resolutions: Dictionary = {}, default_resolution: String = Merge.THEIRS) -> Transaction:
	assert(_open == null, "MapSession.merge_branch: transaction open")
	if source_id == MAIN or not branches.has(source_id) or not children_of(source_id).is_empty():
		push_error("MapSession.merge_branch: can't merge %s" % source_id)
		return null
	var src := branches[source_id]
	var p := merge_plan(source_id)
	switch_branch(src.parent_id)
	var txn := Transaction.new(Uuid.v4(), author_id, "Merge " + src.name, Transaction.KIND_MERGE)
	for op in Merge.ops_for(doc, p, resolutions, default_resolution):
		var applied := doc.apply_op(op)
		if not applied.is_empty():
			txn.ops.append(applied)
	discard_branch(source_id)
	if txn.ops.is_empty():
		return null
	_record(txn)
	_stack(branch().undo).push_back(txn.id)
	_stack(branch().redo).clear()
	history_changed.emit()
	return txn


## Rebuilds the live document from history (e.g. after loading without a usable snapshot).
func rebuild_document() -> void:
	doc.load_state(_materialize(current_branch))


## State of `id` after its first `upto` transactions (all if -1), replayed from the root.
func _materialize(id: String, upto: int = -1) -> MapDocument:
	var b := branches[id]
	var out: MapDocument
	if b.parent_id == "":
		out = MapDocument.new(doc.map_id)
	else:
		out = _materialize(b.parent_id, b.fork_seq)
	var n := b.txns.size() if upto < 0 else upto
	for i in n:
		for op in b.txns[i].ops:
			out.apply_op(op)
	return out


func _head(id: String) -> MapDocument:
	return doc if id == current_branch else _materialize(id)


func _descends_from(id: String, ancestor: String) -> bool:
	while id != "":
		if id == ancestor:
			return true
		id = branches[id].parent_id
	return false


func _record(txn: Transaction) -> void:
	lamport += 1
	txn.lamport = lamport
	txn.branch = current_branch
	txn.time = Time.get_unix_time_from_system()
	branch().txns.append(txn)
	_txns[txn.id] = txn


func _stack(stacks: Dictionary) -> Array:
	if not stacks.has(author_id):
		stacks[author_id] = []
	return stacks[author_id]


# --- Serialization ---------------------------------------------------------

func history_to_dict() -> Dictionary:
	var bs: Array = []
	for b in branches.values():
		bs.append(b.to_dict())
	return {"current_branch": current_branch, "lamport": lamport, "branches": bs}


func load_history(d: Dictionary) -> void:
	branches.clear()
	_txns.clear()
	for bd in d.branches:
		var b := Branch.from_dict(bd)
		branches[b.id] = b
		for txn in b.txns:
			_txns[txn.id] = txn
	current_branch = d.current_branch
	lamport = d.lamport
