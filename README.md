# TRP Call Orchestrator

**Project Name:** TRP-call-orchestrator  
**Location:** Canada  
**Tech Stack:** Node.js, TypeScript, Supabase, Express, Axios, Node-Cron, Jest  

---

## Project Overview

TRP Call Orchestrator is an AI-powered system to automate outbound calls to listing agents and assistants. It ensures property availability, follow-ups, and workflow management efficiently.

Current focus:

- Listing Agent – Call #1 (Outbound) workflow (`WORKFLOW.md`, `docs/listing-agent-call-1.md`)

Key features:

- Automated outbound calls with AI-driven conversation logic.
- Context-aware conversation tracking for multiple properties.
- Integration with Supabase for property and agent data.
- Scheduling and follow-ups based on agent responses.
- Logging and system updates for tracking each interaction.

---

## Tech Stack & Dependencies

**Core:**
- Node.js
- TypeScript
- ts-node
- Supabase (`@supabase/supabase-js`)
- Express (`express`, `@types/express`)
- Axios
- dotenv

**Scheduling & Workflow:**
- Node-Cron
- p-retry
- Winston (logging)

**Testing:**
- Jest (`jest`, `ts-jest`, `@types/jest`)

---

## Installation & Setup

```bash
# Clone the repository
git clone https://github.com/<username>/trp-call-orchestrator.git
cd trp-call-orchestrator

# Install dependencies (pnpm by default)
pnpm install

# Setup environment variables
cp .env.example .env
# Edit .env with Supabase keys, telephony provider keys, etc.

# Start development server (once scripts are wired)
pnpm run dev
```

---

## Folder Structure

```text
trp-call-orchestrator/
│
├─ src/
│  ├─ orchestrator/       Core AI agent workflow logic
│  ├─ services/           External API integrations (Supabase, SMS, calls)
│  ├─ controllers/        Orchestrator endpoints and logic handlers
│  ├─ routes/             Express routes
│  ├─ utils/              Helper functions
│  ├─ config/             Environment and system configuration
│  └─ models/             TypeScript interfaces and types
│
├─ tests/                 Unit and integration tests
├─ scripts/               Utility scripts (DB seed, cron jobs, etc.)
├─ docs/                  Documentation (workflows, tags, system updates)
├─ .env.example           Template for environment variables
├─ tsconfig.json          TypeScript configuration
├─ package.json
└─ README.md
```
