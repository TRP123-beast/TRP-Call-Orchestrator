#!/usr/bin/env bash
#
# Dev launcher for the Twilio ↔ OpenAI voice agent.
#   1. Starts an ngrok tunnel to port 5050 in the background.
#   2. Waits for ngrok, then reads the public URL from its local API.
#   3. Exports it as SERVER_URL and starts the voice agent.
#
# After it prints the URL, in another terminal run:
#   pnpm twilio:configure <printed-url>
# then call your Twilio number.
#
set -uo pipefail

PORT=5050
NGROK_API="http://localhost:4040/api/tunnels"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "❌ ngrok is not installed. Get it at https://ngrok.com/download" >&2
  echo "   (macOS: brew install ngrok/ngrok/ngrok)" >&2
  exit 1
fi

echo "🚀 Starting ngrok tunnel on port ${PORT}..."
ngrok http "${PORT}" --log=stdout >/tmp/ngrok-trp.log 2>&1 &
NGROK_PID=$!

cleanup() {
  echo ""
  echo "🛑 Stopping ngrok (pid ${NGROK_PID})..."
  kill "${NGROK_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "⏳ Waiting 2s for ngrok to initialize..."
sleep 2

# Read the public https URL from ngrok's local API (retry until it appears).
SERVER_URL=""
for _ in $(seq 1 15); do
  SERVER_URL=$(curl -s "${NGROK_API}" \
    | grep -o '"public_url":"https:[^"]*"' \
    | head -n1 \
    | sed 's/"public_url":"//; s/"$//') || true
  if [ -n "${SERVER_URL}" ]; then
    break
  fi
  sleep 1
done

if [ -z "${SERVER_URL}" ]; then
  echo "❌ Could not read ngrok URL from ${NGROK_API}." >&2
  echo "   Is ngrok authenticated? See /tmp/ngrok-trp.log" >&2
  exit 1
fi

export SERVER_URL

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "🌐 ngrok public URL : ${SERVER_URL}"
echo "🔗 Voice webhook    : ${SERVER_URL}/incoming-call"
echo "👉 Next: pnpm twilio:configure ${SERVER_URL}"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Hand off to the voice agent (SERVER_URL is now in its environment).
npx tsx src/voice/twilio-realtime-agent.ts
