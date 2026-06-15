import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import type {
  Database,
  ListingAgent,
  Property,
  Showing,
  ShowingCategory,
  CallLog,
  CallLogInsert,
  Message,
  MessageInsert,
  WorkflowState,
  WorkflowStateInsert,
} from '../models/database';

/**
 * Typed Supabase integration layer.
 *
 * Reuses the single client from src/lib/supabase.ts (one client, one config)
 * and casts it to SupabaseClient<Database> so .from('table') queries are typed
 * against src/models/database.ts.
 */

let db: SupabaseClient<Database> | null = null;

export function getDb(): SupabaseClient<Database> {
  if (!db) {
    db = getSupabaseClient() as unknown as SupabaseClient<Database>;
  }
  return db;
}

/** A single listing agent by id (null if not found). */
export async function getListingAgentById(agentId: string): Promise<ListingAgent | null> {
  const { data, error } = await getDb()
    .from('listing_agents')
    .select('*')
    .eq('id', agentId)
    .maybeSingle();

  if (error) throw new Error(`getListingAgentById failed: ${error.message}`);
  return data ?? null;
}

/** A single listing agent by phone number (null if not found). */
export async function getListingAgentByPhone(phone: string): Promise<ListingAgent | null> {
  const { data, error } = await getDb()
    .from('listing_agents')
    .select('*')
    .eq('phone', phone)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getListingAgentByPhone failed: ${error.message}`);
  return data ?? null;
}

/** Properties for a set of ids (preserves nothing about order). */
export async function getPropertiesByIds(propertyIds: string[]): Promise<Property[]> {
  if (propertyIds.length === 0) return [];
  const { data, error } = await getDb().from('properties').select('*').in('id', propertyIds);

  if (error) throw new Error(`getPropertiesByIds failed: ${error.message}`);
  return data ?? [];
}

/** All properties listed by a given agent. */
export async function getPropertiesByAgent(agentId: string): Promise<Property[]> {
  const { data, error } = await getDb()
    .from('properties')
    .select('*')
    .eq('listing_agent_id', agentId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`getPropertiesByAgent failed: ${error.message}`);
  return data ?? [];
}

/** Update a showing's category/status, and optionally its active tags. */
export async function updateShowingStatus(
  showingId: string,
  category: ShowingCategory,
  status: string,
  tags?: string[],
): Promise<Showing> {
  const update: Database['public']['Tables']['showings']['Update'] = { category, status };
  if (tags) update.tags = tags;

  const { data, error } = await getDb()
    .from('showings')
    .update(update)
    .eq('id', showingId)
    .select()
    .single();

  if (error) throw new Error(`updateShowingStatus failed: ${error.message}`);
  return data;
}

/** Most recent call logs (newest first) — powers the dashboard Calls panel. */
export async function getRecentCalls(limit = 20): Promise<CallLog[]> {
  const { data, error } = await getDb()
    .from('call_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getRecentCalls failed: ${error.message}`);
  return data ?? [];
}

/** Most recent messages (newest first) — powers the dashboard SMS panel. */
export async function getRecentMessages(limit = 50): Promise<Message[]> {
  const { data, error } = await getDb()
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getRecentMessages failed: ${error.message}`);
  return data ?? [];
}

/** Record a call. */
export async function logCall(callData: CallLogInsert): Promise<CallLog> {
  const { data, error } = await getDb().from('call_logs').insert(callData).select().single();
  if (error) throw new Error(`logCall failed: ${error.message}`);
  return data;
}

/** Record an inbound/outbound message. */
export async function logMessage(messageData: MessageInsert): Promise<Message> {
  const { data, error } = await getDb().from('messages').insert(messageData).select().single();
  if (error) throw new Error(`logMessage failed: ${error.message}`);
  return data;
}

/** Latest workflow state for an agent (null if none yet). */
export async function getWorkflowState(agentId: string): Promise<WorkflowState | null> {
  const { data, error } = await getDb()
    .from('workflow_state')
    .select('*')
    .eq('listing_agent_id', agentId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getWorkflowState failed: ${error.message}`);
  return data ?? null;
}

/**
 * Upsert the workflow state for an agent: updates the latest row if one exists,
 * otherwise inserts a new one.
 */
export async function updateWorkflowState(
  agentId: string,
  state: Partial<WorkflowStateInsert>,
): Promise<WorkflowState> {
  const existing = await getWorkflowState(agentId);

  if (existing) {
    const update: Database['public']['Tables']['workflow_state']['Update'] = {
      ...state,
      listing_agent_id: agentId,
    };
    const { data, error } = await getDb()
      .from('workflow_state')
      .update(update)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw new Error(`updateWorkflowState failed: ${error.message}`);
    return data;
  }

  const insert: Database['public']['Tables']['workflow_state']['Insert'] = {
    ...state,
    listing_agent_id: agentId,
  };
  const { data, error } = await getDb()
    .from('workflow_state')
    .insert(insert)
    .select()
    .single();
  if (error) throw new Error(`updateWorkflowState failed: ${error.message}`);
  return data;
}
