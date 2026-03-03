# LiveKit voice agent setup (Marcus – TRP Listing Agent)

LiveKit is free and open source. **Recommended: run a local LiveKit server** so you pay nothing to LiveKit; you only pay for the AI APIs (e.g. OpenAI) you use.

## Docs

- **Self-hosting (server)**: https://docs.livekit.io/transport/self-hosting/local/
- **Voice AI quickstart**: https://docs.livekit.io/agents/quickstarts/voice-agent/
- **Agents (Node.js) reference**: https://docs.livekit.io/reference/agents-js/
- **Models (STT, LLM, TTS)**: https://docs.livekit.io/agents/models/
- **Telephony (calls)**: https://docs.livekit.io/agents/start/telephony/

---

## Option A: Local LiveKit server (no LiveKit Cloud, $0 to LiveKit)

### 1. Run LiveKit server locally

**Install**

- **macOS**: `brew update && brew install livekit`
- **Linux**: `curl -sSL https://get.livekit.io | bash`
- **Windows**: [Download](https://github.com/livekit/livekit/releases/latest) the binary

**Start (dev mode)**

```bash
livekit-server --dev
```

Uses API key `devkey` / secret `secret`, listens on `ws://127.0.0.1:7880`. To allow other devices on your network: `livekit-server --dev --bind 0.0.0.0`.

### 2. Environment for self-hosted

In `.env`:

```env
LIVEKIT_SELF_HOSTED=true
LIVEKIT_URL=ws://127.0.0.1:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
OPENAI_API_KEY=your-openai-api-key
LIVEKIT_TTS_VOICE_ID=ash
```

With `LIVEKIT_SELF_HOSTED=true`, the agent uses the **OpenAI plugin** for STT (gpt-4o-transcribe), LLM (gpt-4.1-mini), and TTS (gpt-4o-mini-tts). No LiveKit Cloud or LiveKit Inference; only your OpenAI API key is used. Noise cancellation is disabled (it’s a Cloud-only feature).

### 3. Install deps and download model files

```bash
pnpm install
pnpm run livekit:download-files
```

### 4. Run the agent

In a second terminal (with the LiveKit server still running):

```bash
pnpm run livekit:dev
```

### 5. Test the agent

Use a client that connects to your local LiveKit server and joins a room so the agent can be dispatched:

- **LiveKit CLI**: Install the [LiveKit CLI](https://docs.livekit.io/home/cli/cli-setup/), then e.g. `lk room list` and token generation for your `devkey`/`secret` and `LIVEKIT_URL=ws://127.0.0.1:7880`.
- **Playground**: Run [agents-playground](https://github.com/livekit/agents-playground) locally and set the server URL to `ws://127.0.0.1:7880`; use a token created with `devkey`/`secret` (e.g. via a small script using `livekit-server-sdk` and your key/secret).
- **Custom frontend**: Use [LiveKit client SDKs](https://docs.livekit.io/home/get-started/authentication/) with a backend that issues tokens for your local URL and credentials.

---

## Option B: LiveKit Cloud (paid)

If you use LiveKit Cloud instead of a local server:

1. Create a project at https://cloud.livekit.io/ and get `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
2. **Do not** set `LIVEKIT_SELF_HOSTED` (or set it to `false`). The agent will use LiveKit Inference (STT/LLM/TTS) and cloud noise cancellation.
3. Run `pnpm run livekit:download-files` and `pnpm run livekit:dev`. Test via Cloud Sandbox or the hosted playground with a room token from your project.

---

## Summary

| Mode | LIVEKIT_SELF_HOSTED | Server | STT/LLM/TTS | Noise cancellation |
|------|---------------------|--------|-------------|---------------------|
| Local (recommended) | `true` | Your machine (`livekit-server --dev`) | OpenAI plugin (your `OPENAI_API_KEY`) | Off |
| LiveKit Cloud | unset / `false` | LiveKit Cloud | LiveKit Inference (or your keys) | On (Cloud) |

The Express app and `/api/vapi/tools/webhook` stay as-is for Vapi; the LiveKit agent uses the same tool logic in `src/tools/executors.ts` in-process.
