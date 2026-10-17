#!/bin/bash
# Double-click in Finder to launch Pixel Arena with Godot.
# Pass --editor to open the Godot editor instead of running the game.
cd "$(dirname "$0")"
GODOT="/Applications/Godot.app/Contents/MacOS/Godot"
if [ "$1" == "--editor" ]; then
  exec "$GODOT" --path . --editor
fi
# Make sure scripts/classes are imported (fast when nothing changed).
"$GODOT" --headless --path . --import >/dev/null 2>&1
exec "$GODOT" --path . "$@"
