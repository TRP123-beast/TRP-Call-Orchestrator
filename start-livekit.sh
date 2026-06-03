#!/usr/bin/env bash
#
# Starts a local LiveKit server for development using livekit-server-config.yaml
# (port 7880, key devkey/secret). See docs/livekit-setup.md.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="${SCRIPT_DIR}/livekit-server-config.yaml"

# Resolve the livekit-server binary: PATH first, then common local install dirs.
if command -v livekit-server >/dev/null 2>&1; then
  BIN="$(command -v livekit-server)"
elif [ -x "${HOME}/.local/bin/livekit-server" ]; then
  BIN="${HOME}/.local/bin/livekit-server"
elif [ -x "/usr/local/bin/livekit-server" ]; then
  BIN="/usr/local/bin/livekit-server"
else
  echo "Error: livekit-server binary not found." >&2
  echo "Install it with: curl -sSL https://get.livekit.io | bash" >&2
  echo "or download from https://github.com/livekit/livekit/releases" >&2
  exit 1
fi

if [ ! -f "${CONFIG}" ]; then
  echo "Error: config not found at ${CONFIG}" >&2
  exit 1
fi

echo "Starting LiveKit server (${BIN}) with config ${CONFIG}"
echo "  ws://127.0.0.1:7880  |  key: devkey / secret"
exec "${BIN}" --config "${CONFIG}"
