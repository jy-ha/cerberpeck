#!/bin/sh
set -eu

BASE_URL="${CERBERPECK_RELEASE_BASE_URL:-https://github.com/jy-ha/cerberpeck/releases/latest/download}"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/cerberpeck-install.XXXXXX")"
cleanup() { rm -rf "$TEMP_ROOT"; }
trap cleanup EXIT HUP INT TERM

if ! command -v node >/dev/null 2>&1; then
  echo "cerberpeck: Node.js 24 or newer is required by this portable release" >&2
  exit 3
fi
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "cerberpeck: Node.js 24 or newer is required" >&2
  exit 3
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "cerberpeck: curl is required" >&2
  exit 3
fi

case "$(uname -s)" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  *) echo "cerberpeck: unsupported operating system: $(uname -s)" >&2; exit 3 ;;
esac
case "$(uname -m)" in
  x86_64|amd64) ARCH=x64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) echo "cerberpeck: unsupported architecture: $(uname -m)" >&2; exit 3 ;;
esac
TARGET="$OS-$ARCH"

curl -fsSL "$BASE_URL/release-manifest.json" -o "$TEMP_ROOT/release-manifest.json"
ARTIFACT="$(node -e 'const m=require(process.argv[1]);const a=m.artifacts[process.argv[2]];if(!a)process.exit(2);process.stdout.write(a.file)' "$TEMP_ROOT/release-manifest.json" "$TARGET")" || {
  echo "cerberpeck: no release artifact for $TARGET" >&2
  exit 3
}
EXPECTED="$(node -e 'const m=require(process.argv[1]);process.stdout.write(m.artifacts[process.argv[2]].sha256)' "$TEMP_ROOT/release-manifest.json" "$TARGET")"
curl -fsSL "$BASE_URL/$ARTIFACT" -o "$TEMP_ROOT/$ARTIFACT"
if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$TEMP_ROOT/$ARTIFACT" | awk '{print $1}')"
else
  ACTUAL="$(shasum -a 256 "$TEMP_ROOT/$ARTIFACT" | awk '{print $1}')"
fi
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "cerberpeck: release checksum mismatch" >&2
  exit 3
fi
tar -xzf "$TEMP_ROOT/$ARTIFACT" -C "$TEMP_ROOT"

COMMAND=install
if [ "${1:-}" = "uninstall" ]; then
  COMMAND=uninstall
  shift
fi
if [ "$COMMAND" = install ]; then
  USE_TTY=false
  if [ "$#" -eq 0 ]; then
    USE_TTY=true
    set -- --interactive
  else
    for ARG in "$@"; do
      if [ "$ARG" = "--interactive" ]; then
        USE_TTY=true
        break
      fi
    done
  fi

  if [ "$USE_TTY" = true ] && [ -t 1 ] && [ -r /dev/tty ] && [ -w /dev/tty ]; then
    node "$TEMP_ROOT/cerberpeck/cerberpeck.cjs" --workspace "$PWD" install \
      --cli-source "$TEMP_ROOT/cerberpeck/cerberpeck.cjs" \
      --assets-dir "$TEMP_ROOT/cerberpeck/skills" "$@" </dev/tty
  else
    node "$TEMP_ROOT/cerberpeck/cerberpeck.cjs" --workspace "$PWD" install \
      --cli-source "$TEMP_ROOT/cerberpeck/cerberpeck.cjs" \
      --assets-dir "$TEMP_ROOT/cerberpeck/skills" "$@"
  fi
else
  node "$TEMP_ROOT/cerberpeck/cerberpeck.cjs" --workspace "$PWD" uninstall "$@"
fi
