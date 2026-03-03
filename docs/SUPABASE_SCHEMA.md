# Supabase Schema for TRP Call Orchestrator

Required tables and columns for the Listing Agent tools.

## Existing: showing_requests

You have this. Add one column for tags:

```sql
ALTER TABLE showing_requests ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]';
```

## Required: properties (or listings)

Used by `update_property_records` and `get_conversation_context`. Set `SUPABASE_PROPERTIES_TABLE=listings` in `.env` if your table is named differently. The table must have `id` (text) matching `showing_requests.property_id`.

```sql
-- Minimal schema; adjust to match your TRP app
CREATE TABLE IF NOT EXISTS properties (
  id text PRIMARY KEY,
  address text,
  pets_allowed boolean,
  offer_requirements text,
  brokerage_remarks text,
  client_remarks text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

## Optional: workflow_jobs

Used by `trigger_workflow`. If you use an external workflow engine, you can skip this and the tool will still return success (insert may fail).

```sql
CREATE TABLE IF NOT EXISTS workflow_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name text NOT NULL,
  context text,
  status text DEFAULT 'queued',
  created_at timestamptz DEFAULT now()
);
```

## Alternative: showing_tags (instead of tags column)

If you prefer a separate table instead of a `tags` jsonb column on showing_requests:

```sql
CREATE TABLE IF NOT EXISTS showing_tags (
  showing_id uuid REFERENCES showing_requests(id) ON DELETE CASCADE,
  tag text NOT NULL,
  PRIMARY KEY (showing_id, tag)
);
```

Then update `src/tools/executors.ts` to use `showing_tags` for set_tag and get_conversation_context.
