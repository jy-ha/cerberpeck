#!/bin/sh
set -eu

BASE_URL="${CERBERPECK_RELEASE_BASE_URL:-https://github.com/jy-ha/cerberpeck/releases/latest/download}"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/cerberpeck-uninstall.XXXXXX")"
cleanup() { rm -rf "$TEMP_ROOT"; }
trap cleanup EXIT HUP INT TERM

if ! command -v curl >/dev/null 2>&1; then
  echo "cerberpeck: curl is required" >&2
  exit 3
fi
if [ "$#" -ne 0 ]; then
  echo "cerberpeck: the complete uninstaller does not accept options" >&2
  exit 2
fi

curl -fsSL "$BASE_URL/install.sh" -o "$TEMP_ROOT/install.sh"
CERBERPECK_UNINSTALL_ALL_SCOPES=1 sh "$TEMP_ROOT/install.sh" uninstall --purge --yes
