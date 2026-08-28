#!/bin/sh
#
# Launch the extension-debugging browser on macOS: Microsoft Edge Dev on a
# dedicated profile, with the CDP port open and this repo's build loaded.
# scripts/ext-shot.js talks to that port.
#
# The dedicated --user-data-dir is required, not a convenience: Chromium 136+
# ignores --remote-debugging-port on a channel's default profile, so the port
# never opens without it.
#
# Overridable: EDGE_APP, EDGE_DEBUG_PROFILE, EDGE_DEBUG_PORT.

set -e

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
EDGE_APP=${EDGE_APP:-/Applications/Microsoft Edge Dev.app}
EDGE_BIN="$EDGE_APP/Contents/MacOS/$(basename "$EDGE_APP" .app)"
PROFILE=${EDGE_DEBUG_PROFILE:-$HOME/Library/Application Support/Microsoft Edge Dev Debug}
PORT=${EDGE_DEBUG_PORT:-9222}

if [ ! -x "$EDGE_BIN" ]; then
  echo "No browser binary at: $EDGE_BIN" >&2
  echo "Set EDGE_APP to the .app bundle you want (e.g. /Applications/Microsoft Edge.app)." >&2
  exit 1
fi

if [ ! -f "$REPO_ROOT/dist/manifest.json" ]; then
  echo "Warning: no build at $REPO_ROOT/dist. Run 'yarn dev' first, then relaunch." >&2
fi

# LaunchServices reads no architecture from a script-based .app, so it can start
# this under Rosetta; translation is inherited, and the exec below would then pick
# the x86_64 slice of a universal browser. hw.optional.arm64 is true even translated.
ARCH_PREFIX=""
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then
  ARCH_PREFIX="arch -arm64"
fi

exec $ARCH_PREFIX "$EDGE_BIN" \
  --user-data-dir="$PROFILE" \
  --remote-debugging-port="$PORT" \
  --load-extension="$REPO_ROOT/dist" \
  --no-first-run \
  --no-default-browser-check \
  --restore-last-session \
  --disable-sync \
  "$@"
