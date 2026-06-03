# TRP Call Orchestrator

**Project Name:** TRP-Call-Orchestrator
**Tech Stack:** Node.js · TypeScript · LiveKit Agents · OpenAI · Supabase · Express · Next.js

---

## Project Overview

TRP Call Orchestrator is an AI voice-agent system that automates outbound calls to
listing agents and assistants — confirming property availability, handling follow-ups,
and updating records. The agent persona is **"Marcus," the TRP listing agent.**

It has two halves:

- **Backend (repo root, `src/`)** — a LiveKit voice agent, an Express tool-dispatch API,
  and a terminal chat REPL for testing the agent's prompt without voice.
- **Frontend (`frontend/`)** — a Next.js app that mints LiveKit access tokens and runs an
  in-browser call client against the agent.

Current focus: **Listing Agent – Call #1 (Outbound)** — see `docs/listing-agent-call-1.md`.

---

## Tech Stack & Dependencies

**Backend core**
- Node.js + TypeScript (`ts-node`, `tsx`, `nodemon`)
- LiveKit Agents — `@livekit/agents` and plugins: `-plugin-livekit`, `-plugin-openai`,
  `-plugin-silero`, plus `@livekit/noise-cancellation-node`
- OpenAI (`openai`) — STT (`gpt-4o-transcribe`), LLM (`gpt-4o-mini`), TTS (`gpt-4o-mini-tts`)
- Supabase (`@supabase/supabase-js`) — property / showing data
- Express 5 (`express`) — tool-dispatch HTTP API
- `axios`, `dotenv`, `zod`

**Frontend**
- Next.js 16 / React 19 / Tailwind v4
- `livekit-client`, `livekit-server-sdk`

> **Note:** `node-cron`, `p-retry`, and `winston` are listed in `package.json` but are not
> yet imported anywhere in `src/`. There is currently **no test suite** (no Jest) and **no
> SMS/telephony integration** (the `TRIAL_NUMBER` env var is reserved but unused).

---

## Requirements & Environment Constraints

- **Node.js:** developed and validated on **v20.x**.
- **pnpm:** use **pnpm 9.x**. `pnpm@latest` (11.x) requires Node ≥ 22.13 and fails on
  Node 20 with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. Provision the right version with:
  ```bash
  corepack prepare pnpm@9.15.9 --activate
  ```
- This is a **pnpm workspace** — `pnpm-workspace.yaml` includes `frontend`, so a root
  `pnpm install` installs both the backend and the frontend.

---

## Installation & Setup

```bash
# 1. Ensure the right pnpm (Node 20 → pnpm 9.x)
corepack prepare pnpm@9.15.9 --activate

# 2. Install all workspace dependencies (root + frontend)
#    On a slow network, raise the timeout / lower concurrency:
pnpm install --network-concurrency=2 --fetch-timeout=300000

# 3. Configure environment
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, LIVEKIT_* etc.

# 4. (LiveKit only) download the agent's model files once before first run
pnpm run livekit:download-files
```

### Environment variables (`.env.example`)

| Service | Variables |
|---|---|
| **Supabase** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROPERTIES_TABLE` |
| **LiveKit** (self-hosted) | `LIVEKIT_SELF_HOSTED`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_TTS_VOICE_ID` |
| **OpenAI** | `OPENAI_API_KEY` |
| _reserved / unused_ | `TRIAL_NUMBER` |

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm run dev` | Express tool API on `:3000` via nodemon + ts-node (auto-reload) |
| `pnpm start` | Express tool API once (`ts-node src/index.ts`) |
| `pnpm run build` | Compile backend with `tsc` (uses `tsconfig.json`) |
| `pnpm run text:dev` | Terminal chat REPL against Marcus's prompt (`src/text-demo.ts`) — needs `OPENAI_API_KEY` |
| `pnpm run livekit:download-files` | Download LiveKit/turn-detector/silero model files (run once) |
| `pnpm run livekit:dev` | Run the Marcus voice agent worker in dev mode — needs a LiveKit server on `LIVEKIT_URL` |
| `pnpm run livekit:start` | Run the voice agent worker in production mode |

The Express API exposes: `GET /`, `GET /health`, and `POST /api/tools/run` (dispatches the
tool functions in `src/tools/executors.ts`).

### Running the voice agent locally

`livekit:dev` starts a worker that **registers with a LiveKit server**. You must have one
running at `LIVEKIT_URL` (default `ws://127.0.0.1:7880`) — otherwise the worker boots,
loads its models, and then loops on `ECONNREFUSED`. See `docs/livekit-setup.md` for
standing up a local self-hosted server.

---

## TypeScript configuration

The backend uses **two** configs because the LiveKit code is ESM/NodeNext while the rest is CommonJS:

- **`tsconfig.json`** — CommonJS, `outDir ./dist`. Covers `src/index.ts`, `src/tools`,
  `src/lib`, `src/text-demo.ts`. **Excludes** `src/livekit`. This is what `pnpm run build` uses.
- **`tsconfig.livekit.json`** — NodeNext, `noEmit`. Covers `src/livekit/**` and `src/tools/**`
  (LiveKit imports use `.js` suffixes). Type-check only.

Both type-check cleanly under `strict`:
```bash
npx tsc --noEmit -p tsconfig.json
npx tsc --noEmit -p tsconfig.livekit.json
```

---

## Folder Structure

```text
TRP-Call-Orchestrator/
│
├─ src/
│  ├─ index.ts              Express tool-dispatch API (GET /, /health, POST /api/tools/run)
│  ├─ text-demo.ts          Terminal chat REPL against Marcus's prompt (no voice)
│  ├─ lib/
│  │  └─ supabase.ts        Lazy Supabase client singleton
│  ├─ tools/
│  │  └─ executors.ts       Tool functions (property lookup, showings, tags, workflows)
│  └─ livekit/
│     ├─ main.ts            LiveKit agent worker entrypoint (defineAgent + CLI)
│     ├─ agent.ts           MarcusAgent (voice.Agent) wiring tools + LLM/STT/TTS
│     └─ instructions.ts    MARCUS_SYSTEM_PROMPT + MARCUS_FIRST_MESSAGE
│
├─ frontend/                Next.js app (LiveKit token API + in-browser call client)
│  ├─ app/                  Pages, layout, and api/livekit-token route
│  ├─ components/           MarcusCallClient + useMarcusCall hook
│  └─ lib/livekitServer.ts  createMarcusToken (server-sdk access tokens)
│
├─ docs/                    listing-agent-call-1, livekit-setup, SUPABASE_SCHEMA,
│                           TAGS, SYSTEM_UPDATES, agent-data-flow.drawio
├─ .env.example             Environment variable template
├─ tsconfig.json            Backend TS config (CommonJS, excludes src/livekit)
├─ tsconfig.livekit.json    LiveKit TS config (NodeNext, noEmit)
├─ pnpm-workspace.yaml      Workspace root (includes frontend)
├─ package.json
└─ README.md
```
