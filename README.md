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
  `-plugin-silero`, plus `@livekit/noise-cancellation-node`; `livekit-server-sdk` for
  room/token/dispatch in local testing
- OpenAI (`openai`) — the voice agent uses Whisper STT, GPT-4o LLM, and `gpt-4o-mini-tts`
  (voice `ash`); the text REPL and SMS replies use `gpt-4o-mini`
- SMS — `twilio` (production) or a built-in console mock, toggled by `SMS_PROVIDER`
- Supabase (`@supabase/supabase-js`) — property / showing / message data
- Express 5 (`express`) — tool-dispatch + SMS HTTP API
- Logging & resilience — `winston` (console + file), `p-retry`
- `axios`, `dotenv`, `zod`

**Frontend**
- Next.js 16 / React 19 / Tailwind v4
- `livekit-client`, `livekit-server-sdk`

> **Note:** there is **no unit-test framework** (no Jest), but there are smoke-test
> scripts (`test:sms`, `test:livekit`) and a LiveKit playground test harness (see below).
> `TRIAL_NUMBER` is used as the default recipient for SMS tests.

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
| **SMS** | `SMS_PROVIDER` (`mock` or `twilio`), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` |
| **Testing** | `TRIAL_NUMBER` / `TEST_SMS_TO` (default SMS test recipient) |

---

## Scripts

| Command | What it does |
|---|---|
| `pnpm run dev` | Express API on `:3000` via nodemon + ts-node (auto-reload) |
| `pnpm start` | Express API once (`ts-node src/index.ts`) |
| `pnpm run build` | Compile backend with `tsc` (uses `tsconfig.json`) |
| `pnpm run text:dev` | Terminal chat REPL against Marcus's prompt (`src/text-demo.ts`) — needs `OPENAI_API_KEY` |
| `pnpm run test:sms` | Send a test SMS via the configured provider (`src/test-sms.ts`) |
| `pnpm run livekit:server` | Start a local LiveKit server (`./start-livekit.sh`, uses `livekit-server-config.yaml`) |
| `pnpm run livekit:download-files` | Download LiveKit/turn-detector/silero model files (run once) |
| `pnpm run livekit:dev` | Run the Marcus voice agent worker in dev mode — needs a LiveKit server on `LIVEKIT_URL` |
| `pnpm run livekit:start` | Run the voice agent worker in production mode |
| `pnpm run test:livekit` | Smoke-test the LiveKit connection (create → list → delete a room) |
| `pnpm run livekit:test-playground` | Create a room, dispatch the agent, print a playground join URL + token |
| `pnpm run livekit:test-outbound` | Simulate the outbound-call flow (dispatch + simulated callee + room monitor) |

### HTTP API (Express)

| Method & path | Purpose |
|---|---|
| `GET /` | Liveness string |
| `GET /health` | `{ status, timestamp }` |
| `GET /api/status` | Connection status for Supabase / LiveKit / OpenAI |
| `POST /api/tools/run` | Dispatch a tool from `src/tools/executors.ts` (`{ name, args }`) |
| `POST /api/sms/webhook` | Inbound SMS webhook (Twilio, form-encoded) |
| `POST /api/sms/simulate` | Simulate an inbound SMS for the demo (`{ from, body }`) |
| `POST /api/sms/send` | Send an outbound SMS (`{ to, body }`) |
| `GET /api/sms/messages` | All logged messages + statuses, newest first |
| `POST /api/sms/status` | Twilio delivery-status callback (updates message status) |
| `GET /sms-demo` | Browser SMS test console (thread + statuses, send/simulate) |

### Running the voice agent locally

`livekit:dev` starts a worker that **registers with a LiveKit server**. You must have one
running at `LIVEKIT_URL` (default `ws://127.0.0.1:7880`) — otherwise the worker boots,
loads its models, and then loops on `ECONNREFUSED`. See `docs/livekit-setup.md`.

Quick local loop (three terminals):

```bash
pnpm run livekit:server           # 1. local LiveKit server on ws://127.0.0.1:7880
pnpm run livekit:dev              # 2. the Marcus agent worker
pnpm run livekit:test-playground  # 3. create room + dispatch agent + print join token
```

Then open <https://agents-playground.livekit.io/>, choose **Manual** connection, paste the
printed **Server URL** and **Token**, and talk to the agent in your browser. (Actual audio
needs a funded `OPENAI_API_KEY`.)

---

## SMS / text messaging

The agent supports the WORKFLOW.md **text-preference branch**: it sends outbound texts to
listing agents, receives inbound replies, continues the availability/offers/pets flow over
SMS (via the LLM), and logs every message to Supabase. Two providers are selectable with
`SMS_PROVIDER`:

- **`mock`** (default) — no Twilio account needed. Outbound messages are printed to the
  console with colored output; simulate inbound replies via `POST /api/sms/simulate`.
- **`twilio`** — production. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
  `TWILIO_PHONE_NUMBER`. Point your Twilio number's inbound webhook at
  `POST /api/sms/webhook`.

Outbound messages are formatted professionally and signed as **Nestr Realty**, and all
messages are logged to the Supabase `messages` table (logging degrades gracefully if the
table is absent).

```bash
# Send a test message via the configured provider
pnpm run test:sms                       # to TRIAL_NUMBER / TEST_SMS_TO
pnpm run test:sms +15551234567 "Hi there"

# Simulate an inbound reply against a running server (mock demo)
curl -X POST http://localhost:3000/api/sms/simulate \
  -H 'Content-Type: application/json' \
  -d '{"from":"+15551234567","body":"Yes, it'\''s still available"}'
```

### Browser test console (`/sms-demo`)

For end-to-end testing without a phone, run the server (`pnpm run dev`) and open
**<http://localhost:3000/sms-demo>**. It shows a live message thread (inbound + outbound)
with each message's status, plus inputs to receive a simulated inbound text (as the listing
agent) and send an outbound one. Messages are kept in an in-memory log (visible via
`GET /api/sms/messages`) so statuses — `queued → sent → delivered` for outbound, `received`
for inbound — are visible even when Supabase is unreachable.

### Testing Twilio without a purchased number

Set `TWILIO_TEST_MODE=true` with your Twilio **Test Credentials**
(`TEST_TWILIO_ACCOUNT_SID` / `TEST_TWILIO_AUTH_TOKEN`); the provider uses the magic sender
`+15005550006` and the Twilio API returns a simulated response (real SID, nothing delivered
or billed). Use a magic/verified recipient like `+15005550006`:

```bash
SMS_PROVIDER=twilio TWILIO_TEST_MODE=true pnpm run test:sms +15005550006 "Hi from Nestr Realty"
```

Code lives in `src/services/sms/` (`index.ts` factory + `SmsService`, `mock-provider.ts`,
`twilio-provider.ts`, `store.ts`, `format.ts`, `messageLog.ts`, `console-page.ts`).

---

## Database

`src/database/schema.sql` + `src/database/seed.sql` define the **target** Supabase schema
(brokerages, listing_agents, properties, showings, call_logs, messages, workflow_state)
with matching TypeScript types in `src/models/database.ts` and a typed helper layer in
`src/services/supabase.ts`. Apply it with the Supabase SQL editor or
`psql "$SUPABASE_DB_URL" -f src/database/schema.sql` (then `seed.sql`).

> **Not yet wired in.** The running code still uses the current tables
> (`showing_requests`, `properties.pets_allowed`, …). This schema is the planned model to
> migrate to later.

---

## TypeScript configuration

The backend uses **two** configs because the LiveKit code is ESM/NodeNext while the rest is CommonJS:

- **`tsconfig.json`** — CommonJS, `outDir ./dist`. Covers everything under `src/` except
  `src/livekit` (i.e. `index.ts`, `tools/`, `lib/`, `services/`, `models/`, and the test
  scripts). This is what `pnpm run build` uses.
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
│  ├─ index.ts              Express API (tools, status, SMS webhook/simulate)
│  ├─ text-demo.ts          Terminal chat REPL against Marcus's prompt (no voice)
│  ├─ test-sms.ts           Send a test SMS (pnpm run test:sms)
│  ├─ test-livekit-connection.ts  LiveKit connection smoke test
│  ├─ lib/
│  │  ├─ supabase.ts        Lazy Supabase client singleton
│  │  ├─ logger.ts          Winston logger (console + logs/ file transports)
│  │  └─ serviceStatus.ts   Supabase/LiveKit/OpenAI connection checks (/api/status)
│  ├─ tools/
│  │  ├─ executors.ts       Express tool functions (showings, tags, workflows)
│  │  └─ livekitTools.ts    Agent tools (availability, status, callback, SMS, log)
│  ├─ services/
│  │  ├─ supabase.ts        Typed Supabase layer (target schema; not yet wired in)
│  │  └─ sms/               SMS service: factory + mock/twilio providers, store, format
│  ├─ models/
│  │  └─ database.ts        TypeScript types for the target schema
│  ├─ database/
│  │  ├─ schema.sql         Target Supabase schema (7 tables, enums, triggers)
│  │  └─ seed.sql           Sample data (brokerages, agents, properties, showings)
│  └─ livekit/
│     ├─ main.ts            Agent worker runner (cli.runApp)
│     ├─ agent.ts           MarcusAgent + 5 workflow tools + entry point
│     ├─ instructions.ts    System prompt + first message (Nestr Realty)
│     ├─ create-test-room.ts  Playground room + agent dispatch + token
│     └─ test-outbound.ts   Simulated outbound-call flow + room monitor
│
├─ frontend/                Next.js app (LiveKit token API + in-browser call client)
│  ├─ app/                  Pages, layout, and api/livekit-token route
│  ├─ components/           MarcusCallClient + useMarcusCall hook
│  └─ lib/livekitServer.ts  createMarcusToken (server-sdk access tokens)
│
├─ docs/                    listing-agent-call-1, livekit-setup, SUPABASE_SCHEMA,
│                           TAGS, SYSTEM_UPDATES, agent-data-flow.drawio
├─ livekit-server-config.yaml  Local LiveKit server config (port 7880, devkey/secret)
├─ start-livekit.sh         Launches a local LiveKit server
├─ .env.example             Environment variable template
├─ tsconfig.json            Backend TS config (CommonJS, excludes src/livekit)
├─ tsconfig.livekit.json    LiveKit TS config (NodeNext, noEmit)
├─ pnpm-workspace.yaml      Workspace root (includes frontend)
├─ package.json
└─ README.md
```
