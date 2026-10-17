class_name TestCase
extends RefCounted
## Base class for unit tests. Methods named `test_*` are run by tests/run_tests.gd.
## A fresh instance is created for each test method.

var failures: Array[String] = []


func before_each() -> void:
	pass


func check(condition: bool, message: String = "condition was false") -> void:
	if not condition:
		_fail(message)


func check_eq(actual: Variant, expected: Variant, message: String = "") -> void:
	if typeof(actual) != typeof(expected) or actual != expected:
		_fail("expected %s, got %s %s" % [var_to_str(expected), var_to_str(actual), message])


func check_ne(actual: Variant, unexpected: Variant, message: String = "") -> void:
	if typeof(actual) == typeof(unexpected) and actual == unexpected:
		_fail("did not expect %s %s" % [var_to_str(actual), message])


func _fail(message: String) -> void:
	var stack := get_stack()
	var where := ""
	# Frame 0 is _fail, 1 is the check_* helper, 2 is the test.
	if stack.size() > 2:
		where = "%s:%d " % [stack[2].source.get_file(), stack[2].line]
	failures.append(where + message)
