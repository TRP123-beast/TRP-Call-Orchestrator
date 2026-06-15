import 'dotenv/config';
import { getDb } from '../src/services/supabase';
import type {
  BrokerageInsert,
  ListingAgentInsert,
  PropertyInsert,
  ShowingInsert,
} from '../src/models/database';
import { logger } from '../src/lib/logger';

/**
 * Seed the Canadian demo data via the Supabase REST client (idempotent upserts).
 * Mirrors src/database/seed.sql for those who use `pnpm demo:seed` instead of psql.
 *
 * Prerequisite: the schema must already exist. Apply src/database/schema.sql once
 * via the Supabase SQL editor (or `psql "$SUPABASE_DB_URL" -f src/database/schema.sql`)
 * — the REST client can insert rows but cannot CREATE TABLE.
 */

const brokerages: BrokerageInsert[] = [
  { id: 'bb000000-0000-0000-0000-000000000001', name: 'Royal LePage Signature Realty', phone: '+14165550101', email: 'info@rlpsignature.example' },
  { id: 'bb000000-0000-0000-0000-000000000002', name: 'Re/Max Hallmark Realty', phone: '+14165550102', email: 'contact@remaxhallmark.example' },
  { id: 'bb000000-0000-0000-0000-000000000003', name: 'Century 21 Leading Edge', phone: '+19055550103', email: 'hello@c21leadingedge.example' },
];

const agents: ListingAgentInsert[] = [
  { id: 'aa000000-0000-0000-0000-000000000001', name: 'Sarah Chen', phone: '+14165551001', email: 'sarah.chen@rlpsignature.example', brokerage_id: 'bb000000-0000-0000-0000-000000000001', assistant_name: 'Tom Reed', assistant_phone: '+14165551901', preferred_contact: 'call' },
  { id: 'aa000000-0000-0000-0000-000000000002', name: 'David Okafor', phone: '+14165551002', email: 'david.okafor@rlpsignature.example', brokerage_id: 'bb000000-0000-0000-0000-000000000001', preferred_contact: 'text' },
  { id: 'aa000000-0000-0000-0000-000000000003', name: 'Maria Rossi', phone: '+14165551003', email: 'maria.rossi@remaxhallmark.example', brokerage_id: 'bb000000-0000-0000-0000-000000000002', assistant_name: 'Ana Silva', assistant_phone: '+14165551903', preferred_contact: 'email' },
  { id: 'aa000000-0000-0000-0000-000000000004', name: 'James Patel', phone: '+14165551004', email: 'james.patel@remaxhallmark.example', brokerage_id: 'bb000000-0000-0000-0000-000000000002', preferred_contact: 'call' },
  { id: 'aa000000-0000-0000-0000-000000000005', name: 'Lin Zhang', phone: '+19055551005', email: 'lin.zhang@c21leadingedge.example', brokerage_id: 'bb000000-0000-0000-0000-000000000003', assistant_name: 'Priya Nair', assistant_phone: '+19055551905', preferred_contact: 'text' },
];

const properties: PropertyInsert[] = [
  { id: 'dd000000-0000-0000-0000-000000000001', address: '120 Adelaide St W, Unit 1805, Toronto', mls_number: 'C7012001', listing_agent_id: 'aa000000-0000-0000-0000-000000000001', status: 'active', pet_policy: 'unknown', has_offers: false },
  { id: 'dd000000-0000-0000-0000-000000000002', address: '88 Harbour St, Unit 4506, Toronto', mls_number: 'C7012002', listing_agent_id: 'aa000000-0000-0000-0000-000000000002', status: 'active', pet_policy: 'allowed', has_offers: true, brokerage_remarks: 'Offers reviewed Tuesdays.' },
  { id: 'dd000000-0000-0000-0000-000000000003', address: '15 Mercer St, Unit 909, Toronto', mls_number: 'C7012003', listing_agent_id: 'aa000000-0000-0000-0000-000000000003', status: 'pending', pet_policy: 'unknown', has_offers: true, brokerage_remarks: 'Multiple offers registered.', client_remarks: 'Client prefers move-in by Aug 1.' },
  { id: 'dd000000-0000-0000-0000-000000000004', address: '38 Joe Shuster Way, Unit 312, Toronto', mls_number: 'C7012004', listing_agent_id: 'aa000000-0000-0000-0000-000000000004', status: 'tenanted', pet_policy: 'not_allowed', has_offers: false, brokerage_remarks: '24h notice required for any access.' },
  { id: 'dd000000-0000-0000-0000-000000000005', address: '210 Simcoe St, Unit 1102, Toronto', mls_number: 'C7012005', listing_agent_id: 'aa000000-0000-0000-0000-000000000005', status: 'unavailable', pet_policy: 'unknown', has_offers: false },
  { id: 'dd000000-0000-0000-0000-000000000006', address: '55 Mercer St, Unit 2210, Toronto', mls_number: 'C7012006', listing_agent_id: 'aa000000-0000-0000-0000-000000000001', status: 'active', pet_policy: 'allowed', has_offers: false },
  { id: 'dd000000-0000-0000-0000-000000000007', address: '290 Adelaide St W, Unit 3304, Toronto', mls_number: 'C7012007', listing_agent_id: 'aa000000-0000-0000-0000-000000000002', status: 'active', pet_policy: 'not_allowed', has_offers: false, client_remarks: 'No pets per landlord.' },
  { id: 'dd000000-0000-0000-0000-000000000008', address: '101 Erskine Ave, Unit 1507, Toronto', mls_number: 'C7012008', listing_agent_id: 'aa000000-0000-0000-0000-000000000003', status: 'pending', pet_policy: 'allowed', has_offers: true, brokerage_remarks: 'Landlord reviewing an offer.' },
  { id: 'dd000000-0000-0000-0000-000000000009', address: '12 York St, Unit 5801, Toronto', mls_number: 'C7012009', listing_agent_id: 'aa000000-0000-0000-0000-000000000004', status: 'tenanted', pet_policy: 'unknown', has_offers: false },
  { id: 'dd000000-0000-0000-0000-000000000010', address: '161 Roehampton Ave, Unit 2204, Toronto', mls_number: 'C7012010', listing_agent_id: 'aa000000-0000-0000-0000-000000000005', status: 'active', pet_policy: 'allowed', has_offers: false },
];

const inDays = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString();

const showings: ShowingInsert[] = [
  { id: 'cc000000-0000-0000-0000-000000000001', property_id: 'dd000000-0000-0000-0000-000000000003', category: 'pending_showings', status: 'Temporarily Unavailable - Landlord Reviewing Offer', tags: ['C'], scheduled_at: inDays(2) },
  { id: 'cc000000-0000-0000-0000-000000000002', property_id: 'dd000000-0000-0000-0000-000000000006', category: 'confirmed_showings', status: 'Confirmed - Ready to Show', tags: ['A'], rental_specialist_id: 'ee000000-0000-0000-0000-000000000001', scheduled_at: inDays(1) },
  { id: 'cc000000-0000-0000-0000-000000000003', property_id: 'dd000000-0000-0000-0000-000000000004', category: 'canceled_showings', status: 'Unavailable - Tenanted', tags: [] },
];

async function upsert(table: 'brokerages' | 'listing_agents' | 'properties' | 'showings', rows: unknown[]): Promise<void> {
  const { error } = await getDb()
    .from(table)
    .upsert(rows as never, { onConflict: 'id' });
  if (error) throw new Error(`${table}: ${error.message}`);
  logger.info(`seeded ${rows.length} row(s) into ${table}`);
}

async function main(): Promise<void> {
  console.log('🌱 Seeding TRP demo data into Supabase...');
  // Parent → child order to satisfy foreign keys.
  await upsert('brokerages', brokerages);
  await upsert('listing_agents', agents);
  await upsert('properties', properties);
  await upsert('showings', showings);
  console.log('✅ Seed complete: 3 brokerages, 5 agents, 10 properties, 3 showings.');
  console.log('   Demo agent: Sarah Chen  aa000000-0000-0000-0000-000000000001');
  console.log('   Demo property: 55 Mercer St  dd000000-0000-0000-0000-000000000006');
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Seed failed: ${msg}`);
    if (/does not exist|schema cache|find the table/i.test(msg)) {
      console.error('   Tables are missing — apply the schema first:');
      console.error('     Supabase SQL editor → paste src/database/schema.sql, or');
      console.error('     psql "$SUPABASE_DB_URL" -f src/database/schema.sql');
    }
    process.exit(1);
  });
