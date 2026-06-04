-- TRP Call Orchestrator — sample data
--   psql "$SUPABASE_DB_URL" -f src/database/seed.sql   (run after schema.sql)
-- Re-runnable: every insert uses ON CONFLICT (id) DO NOTHING with fixed UUIDs.

-- ── 3 brokerages ──────────────────────────────────────────────────────
insert into brokerages (id, name, phone, email) values
  ('bb000000-0000-0000-0000-000000000001', 'Royal LePage Signature Realty', '+14165550101', 'info@rlpsignature.example'),
  ('bb000000-0000-0000-0000-000000000002', 'Re/Max Hallmark Realty',         '+14165550102', 'contact@remaxhallmark.example'),
  ('bb000000-0000-0000-0000-000000000003', 'Century 21 Leading Edge',        '+19055550103', 'hello@c21leadingedge.example')
on conflict (id) do nothing;

-- ── 5 listing agents (across the 3 brokerages) ───────────────────────
insert into listing_agents (id, name, phone, email, brokerage_id, assistant_name, assistant_phone, preferred_contact) values
  ('aa000000-0000-0000-0000-000000000001', 'Sarah Chen',   '+14165551001', 'sarah.chen@rlpsignature.example',    'bb000000-0000-0000-0000-000000000001', 'Tom Reed',    '+14165551901', 'call'),
  ('aa000000-0000-0000-0000-000000000002', 'David Okafor', '+14165551002', 'david.okafor@rlpsignature.example',  'bb000000-0000-0000-0000-000000000001', null,          null,          'text'),
  ('aa000000-0000-0000-0000-000000000003', 'Maria Rossi',  '+14165551003', 'maria.rossi@remaxhallmark.example',  'bb000000-0000-0000-0000-000000000002', 'Ana Silva',   '+14165551903', 'email'),
  ('aa000000-0000-0000-0000-000000000004', 'James Patel',  '+14165551004', 'james.patel@remaxhallmark.example',  'bb000000-0000-0000-0000-000000000002', null,          null,          'call'),
  ('aa000000-0000-0000-0000-000000000005', 'Lin Zhang',    '+19055551005', 'lin.zhang@c21leadingedge.example',   'bb000000-0000-0000-0000-000000000003', 'Priya Nair',  '+19055551905', 'text')
on conflict (id) do nothing;

-- ── 10 properties (mix of statuses / pet policies / offers) ──────────
insert into properties (id, address, mls_number, listing_agent_id, status, pet_policy, has_offers, brokerage_remarks, client_remarks) values
  ('dd000000-0000-0000-0000-000000000001', '120 Adelaide St W, Unit 1805, Toronto',  'C7012001', 'aa000000-0000-0000-0000-000000000001', 'active',      'unknown',     false, null,                                  null),
  ('dd000000-0000-0000-0000-000000000002', '88 Harbour St, Unit 4506, Toronto',      'C7012002', 'aa000000-0000-0000-0000-000000000002', 'active',      'allowed',     true,  'Offers reviewed Tuesdays.',           null),
  ('dd000000-0000-0000-0000-000000000003', '15 Mercer St, Unit 909, Toronto',        'C7012003', 'aa000000-0000-0000-0000-000000000003', 'pending',     'unknown',     true,  'Multiple offers registered.',         'Client prefers move-in by Aug 1.'),
  ('dd000000-0000-0000-0000-000000000004', '38 Joe Shuster Way, Unit 312, Toronto',  'C7012004', 'aa000000-0000-0000-0000-000000000004', 'tenanted',    'not_allowed', false, '24h notice required for any access.', null),
  ('dd000000-0000-0000-0000-000000000005', '210 Simcoe St, Unit 1102, Toronto',      'C7012005', 'aa000000-0000-0000-0000-000000000005', 'unavailable', 'unknown',     false, null,                                  null),
  ('dd000000-0000-0000-0000-000000000006', '55 Mercer St, Unit 2210, Toronto',       'C7012006', 'aa000000-0000-0000-0000-000000000001', 'active',      'allowed',     false, null,                                  null),
  ('dd000000-0000-0000-0000-000000000007', '290 Adelaide St W, Unit 3304, Toronto',  'C7012007', 'aa000000-0000-0000-0000-000000000002', 'active',      'not_allowed', false, null,                                  'No pets per landlord.'),
  ('dd000000-0000-0000-0000-000000000008', '101 Erskine Ave, Unit 1507, Toronto',    'C7012008', 'aa000000-0000-0000-0000-000000000003', 'pending',     'allowed',     true,  'Landlord reviewing an offer.',        null),
  ('dd000000-0000-0000-0000-000000000009', '12 York St, Unit 5801, Toronto',         'C7012009', 'aa000000-0000-0000-0000-000000000004', 'tenanted',    'unknown',     false, null,                                  null),
  ('dd000000-0000-0000-0000-000000000010', '161 Roehampton Ave, Unit 2204, Toronto', 'C7012010', 'aa000000-0000-0000-0000-000000000005', 'active',      'allowed',     false, null,                                  null)
on conflict (id) do nothing;

-- ── 3 showings (pending / confirmed / canceled) ──────────────────────
insert into showings (id, property_id, category, status, tags, rental_specialist_id, scheduled_at) values
  ('cc000000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000003', 'pending_showings',   'Temporarily Unavailable - Landlord Reviewing Offer', '{C}', null,                                   now() + interval '2 days'),
  ('cc000000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000006', 'confirmed_showings', 'Confirmed - Ready to Show',                          '{A}', 'ee000000-0000-0000-0000-000000000001', now() + interval '1 day'),
  ('cc000000-0000-0000-0000-000000000003', 'dd000000-0000-0000-0000-000000000004', 'canceled_showings',  'Unavailable - Tenanted',                             '{}',  null,                                   null)
on conflict (id) do nothing;
