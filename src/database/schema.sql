-- TRP Call Orchestrator — Supabase schema
--
-- Apply with the Supabase SQL editor, or:
--   psql "$SUPABASE_DB_URL" -f src/database/schema.sql
-- Idempotent: enums are guarded, tables use IF NOT EXISTS, triggers are re-created.
--
-- NOTE: this schema is the target data model for the workflow. It differs from
-- some table/column names the current app code still uses (e.g. showing_requests,
-- properties.pets_allowed). Reconcile the app layer separately before relying on it.

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ─────────────────────────────── Enums ───────────────────────────────
do $$ begin create type property_status   as enum ('active','pending','unavailable','tenanted'); exception when duplicate_object then null; end $$;
do $$ begin create type pet_policy         as enum ('allowed','not_allowed','unknown');          exception when duplicate_object then null; end $$;
do $$ begin create type contact_method     as enum ('call','text','email');                      exception when duplicate_object then null; end $$;
do $$ begin create type showing_category   as enum ('pending_showings','canceled_showings','confirmed_showings'); exception when duplicate_object then null; end $$;
do $$ begin create type call_type          as enum ('outbound_agent','outbound_brokerage','inbound'); exception when duplicate_object then null; end $$;
do $$ begin create type call_status        as enum ('initiated','answered','no_answer','voicemail','completed','failed'); exception when duplicate_object then null; end $$;
do $$ begin create type message_direction  as enum ('inbound','outbound');                       exception when duplicate_object then null; end $$;
do $$ begin create type message_status     as enum ('sent','delivered','failed','received');     exception when duplicate_object then null; end $$;

-- shared updated_at trigger function
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ─────────────────────────────── Tables ──────────────────────────────

-- 3. brokerages (no FKs — created first)
create table if not exists brokerages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  email      text,
  created_at timestamptz not null default now()
);

-- 2. listing_agents
create table if not exists listing_agents (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  phone             text,
  email             text,
  brokerage_id      uuid references brokerages(id) on delete set null,
  assistant_name    text,
  assistant_phone   text,
  preferred_contact contact_method not null default 'call',
  created_at        timestamptz not null default now()
);

-- 1. properties
create table if not exists properties (
  id                uuid primary key default gen_random_uuid(),
  address           text,
  mls_number        text,
  listing_agent_id  uuid references listing_agents(id) on delete set null,
  status            property_status not null default 'active',
  pet_policy        pet_policy not null default 'unknown',
  has_offers        boolean not null default false,
  brokerage_remarks text,
  client_remarks    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 4. showings
create table if not exists showings (
  id                   uuid primary key default gen_random_uuid(),
  property_id          uuid references properties(id) on delete cascade,
  category             showing_category not null default 'pending_showings',
  status               text,                      -- detailed status message (WORKFLOW.md)
  tags                 text[] not null default '{}',  -- active tags A..J
  rental_specialist_id uuid,
  scheduled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 5. call_logs
create table if not exists call_logs (
  id               uuid primary key default gen_random_uuid(),
  listing_agent_id uuid references listing_agents(id) on delete set null,
  property_ids     uuid[] not null default '{}',  -- batched properties
  call_type        call_type not null,
  status           call_status not null default 'initiated',
  transcript       text,
  duration_seconds integer,
  livekit_room_id  text,
  created_at       timestamptz not null default now()
);

-- 6. messages
create table if not exists messages (
  id                  uuid primary key default gen_random_uuid(),
  direction           message_direction not null,
  from_number         text,
  to_number           text,
  body                text,
  listing_agent_id    uuid references listing_agents(id) on delete set null,
  property_ids        uuid[] not null default '{}',
  provider_message_id text,
  status              message_status not null default 'sent',
  created_at          timestamptz not null default now()
);

-- 7. workflow_state
create table if not exists workflow_state (
  id               uuid primary key default gen_random_uuid(),
  listing_agent_id uuid references listing_agents(id) on delete cascade,
  property_ids     uuid[] not null default '{}',
  current_stage    text,            -- maps to WORKFLOW.md stages
  attempts         integer not null default 0,
  last_attempt_at  timestamptz,
  next_action      text,
  next_action_at   timestamptz,
  metadata         jsonb not null default '{}'::jsonb,  -- tags, remarks, etc.
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ─────────────────────────── updated_at triggers ─────────────────────
drop trigger if exists trg_properties_updated_at on properties;
create trigger trg_properties_updated_at     before update on properties     for each row execute function set_updated_at();
drop trigger if exists trg_showings_updated_at on showings;
create trigger trg_showings_updated_at       before update on showings       for each row execute function set_updated_at();
drop trigger if exists trg_workflow_state_updated_at on workflow_state;
create trigger trg_workflow_state_updated_at before update on workflow_state for each row execute function set_updated_at();

-- ───────────────────────────────── Indexes ───────────────────────────
create index if not exists idx_listing_agents_brokerage on listing_agents(brokerage_id);
create index if not exists idx_properties_agent          on properties(listing_agent_id);
create index if not exists idx_properties_status         on properties(status);
create index if not exists idx_showings_property         on showings(property_id);
create index if not exists idx_showings_category         on showings(category);
create index if not exists idx_call_logs_agent           on call_logs(listing_agent_id);
create index if not exists idx_messages_agent            on messages(listing_agent_id);
create index if not exists idx_workflow_state_agent      on workflow_state(listing_agent_id);
