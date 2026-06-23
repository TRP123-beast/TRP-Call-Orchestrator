#!/usr/bin/env bash
# SSH tunnel to the GPU box exposing the self-hosted model stack on localhost:
#   8000 → Forge (LLM)   8880 → Kokoro (TTS)   5000 → TRP wrapper   3001 → Whisper(:3100)
#
# Runs in the FOREGROUND (no -f) on purpose, so a supervisor (systemd — see
# scripts/trp-tunnel.service) can keep it alive and restart it on drop.
# Keepalives make ssh exit promptly when the link dies so it gets restarted.
#
# Manual use: `pnpm tunnel` (Ctrl+C to stop). Persistent use: install the
# systemd unit (instructions in scripts/trp-tunnel.service).
set -euo pipefail

REMOTE="${TRP_TUNNEL_REMOTE:-root@66.179.10.109}"
KEY="${TRP_TUNNEL_KEY:-$HOME/.ssh/id_ed25519}"

exec ssh -i "$KEY" -N \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes \
  -o StrictHostKeyChecking=accept-new \
  -L 8000:localhost:8000 \
  -L 8880:localhost:8880 \
  -L 5000:localhost:5000 \
  -L 3001:localhost:3100 \
  "$REMOTE"
