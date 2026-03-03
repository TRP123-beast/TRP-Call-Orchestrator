import axios, { AxiosResponse } from 'axios';
import { getSupabaseClient } from '../lib/supabase';

const CATEGORY_TO_STATUS: Record<string, string> = {
  'Pending Showings': 'pending',
  'Canceled Showings': 'cancelled',
  'Confirmed Showings': 'confirmed',
};

const VALID_TAGS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J'];

type PropertyDetails = Record<string, unknown>;

export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case 'fetch_showing_requests':
      return fetchShowingRequests(args);
    case 'get_conversation_context':
      return getConversationContext(args);
    case 'update_showings':
      return updateShowings(args);
    case 'update_property_records':
      return updatePropertyRecords(args);
    case 'manage_rental_specialist':
      return manageRentalSpecialist(args);
    case 'trigger_workflow':
      return triggerWorkflow(args);
    case 'set_tag':
      return setTag(args);
    case 'fetch_property_details':
      return fetchPropertyDetails(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function fetchPropertyDetails(
  args: Record<string, unknown>
): Promise<string> {
  const rawId = args.propertyId ?? args.id;
  const id = typeof rawId === 'string' ? rawId.trim() : '';
  if (!id) {
    throw new Error('propertyId or id is required');
  }

  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) {
    throw new Error('API_BASE_URL is not configured');
  }

  const url = `${baseUrl.replace(/\/$/, '')}/api/properties/${encodeURIComponent(id)}`;

  const timeoutMs =
    typeof args.timeoutMs === 'number' && Number.isFinite(args.timeoutMs)
      ? Math.min(Math.max(args.timeoutMs, 1000), 60000)
      : 30000;

  let response: AxiosResponse<PropertyDetails>;
  try {
    response = await axios.get<PropertyDetails>(url, { timeout: timeoutMs });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch property details';
    throw new Error(message);
  }

  return JSON.stringify(response.data ?? {});
}

export async function getConversationContext(
  args: Record<string, unknown>
): Promise<string> {
  const showingIds = String(args.showingIds ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!showingIds.length) {
    throw new Error('showingIds is required');
  }

  const supabase = getSupabaseClient();
  const { data: showings, error: showingsError } = await supabase
    .from('showing_requests')
    .select(
      'id, property_id, status, reason, notes, rental_specialist_id, scheduled_date, scheduled_time'
    )
    .in('id', showingIds);

  if (showingsError) {
    throw new Error(`Failed to fetch showings: ${showingsError.message}`);
  }

  if (!showings?.length) {
    return JSON.stringify({ showings: [], properties: [], message: 'No showings found' });
  }

  const propertyIds = [...new Set(showings.map((s) => s.property_id).filter(Boolean))];
  let properties: Record<string, unknown>[] = [];

  const propsTable = process.env.SUPABASE_PROPERTIES_TABLE ?? 'properties';
  if (propertyIds.length > 0) {
    const { data: props } = await supabase
      .from(propsTable)
      .select('id, address, pets_allowed, offer_requirements, brokerage_remarks, client_remarks')
      .in('id', propertyIds);

    if (props) properties = props as Record<string, unknown>[];
  }

  const context = {
    showings,
    properties,
    propertyAddresses: properties
      .map((p) => (p as { address?: string }).address)
      .filter(Boolean)
      .join(', '),
  };

  return JSON.stringify(context);
}

export async function fetchShowingRequests(
  args: Record<string, unknown>
): Promise<string> {
  const status = args.status as string | undefined;
  const userId = args.userId as string | undefined;
  const scheduledDate = args.scheduledDate as string | undefined;
  const groupName = args.groupName as string | undefined;
  const id = args.id as string | undefined;
  const propertyId = args.propertyId as string | undefined;
  const limit = Math.min(Number(args.limit) || 50, 100);

  const supabase = getSupabaseClient();
  let query = supabase
    .from('showing_requests')
    .select(
      'id, user_id, property_id, status, reason, notes, rental_specialist_id, scheduled_date, scheduled_time, group_name, created_at'
    )
    .order('scheduled_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (userId) query = query.eq('user_id', userId);
  if (scheduledDate) query = query.eq('scheduled_date', scheduledDate);
  if (groupName) query = query.eq('group_name', groupName);
  if (id) {
    const ids = id.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length) query = query.in('id', ids);
  }
  if (propertyId) {
    const ids = propertyId.split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length) query = query.in('property_id', ids);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch showing requests: ${error.message}`);
  }

  return JSON.stringify({ showingRequests: data ?? [] });
}

export async function updateShowings(args: Record<string, unknown>): Promise<string> {
  const showingIds = String(args.showingIds ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const category = args.category as string;
  const statusDetail = args.status as string;
  const releaseSpecialist = Boolean(args.releaseSpecialist);

  if (!showingIds.length || !category || !statusDetail) {
    throw new Error('showingIds, category, and status are required');
  }

  const dbStatus = CATEGORY_TO_STATUS[category] ?? 'pending';
  const supabase = getSupabaseClient();

  const updates: Record<string, unknown> = {
    status: dbStatus,
    reason: statusDetail,
    updated_at: new Date().toISOString(),
  };

  if (dbStatus === 'cancelled') {
    updates.cancelled_at = new Date().toISOString();
  } else if (dbStatus === 'confirmed') {
    updates.confirmed_at = new Date().toISOString();
  }

  if (releaseSpecialist) {
    updates.rental_specialist_id = null;
  }

  const { error } = await supabase
    .from('showing_requests')
    .update(updates)
    .in('id', showingIds);

  if (error) {
    throw new Error(`Failed to update showings: ${error.message}`);
  }

  return `Updated ${showingIds.length} showing(s): status=${dbStatus}, reason=${statusDetail}${releaseSpecialist ? ', specialist released' : ''}`;
}

export async function updatePropertyRecords(args: Record<string, unknown>): Promise<string> {
  const propertyIds = String(args.propertyIds ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const petsAllowed = args.petsAllowed as boolean | undefined;
  const offerRequirements = args.offerRequirements as string | undefined;

  if (!propertyIds.length) {
    throw new Error('propertyIds is required');
  }

  const supabase = getSupabaseClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof petsAllowed === 'boolean') {
    updates.pets_allowed = petsAllowed;
  }
  if (offerRequirements !== undefined && offerRequirements !== null) {
    updates.offer_requirements = offerRequirements;
  }

  const propsTable = process.env.SUPABASE_PROPERTIES_TABLE ?? 'properties';
  const { error } = await supabase
    .from(propsTable)
    .update(updates)
    .in('id', propertyIds);

  if (error) {
    throw new Error(`Failed to update properties: ${error.message}`);
  }

  const parts = [`Updated ${propertyIds.length} property(ies)`];
  if (typeof petsAllowed === 'boolean') parts.push(`petsAllowed=${petsAllowed}`);
  if (offerRequirements) parts.push(`offerRequirements added`);
  return parts.join(', ');
}

export async function manageRentalSpecialist(args: Record<string, unknown>): Promise<string> {
  const action = args.action as string;
  const showingIds = String(args.showingIds ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!['release', 'confirm'].includes(action) || !showingIds.length) {
    throw new Error('action (release|confirm) and showingIds are required');
  }

  const supabase = getSupabaseClient();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (action === 'release') {
    updates.rental_specialist_id = null;
  }

  const { error } = await supabase
    .from('showing_requests')
    .update(updates)
    .in('id', showingIds);

  if (error) {
    throw new Error(`Failed to ${action} specialist: ${error.message}`);
  }

  return `${action === 'release' ? 'Released' : 'Confirmed'} rental specialist for ${showingIds.length} showing(s)`;
}

export async function triggerWorkflow(args: Record<string, unknown>): Promise<string> {
  const workflowName = args.workflowName as string;
  const context = args.context as string | undefined;

  if (!workflowName) {
    throw new Error('workflowName is required');
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.from('workflow_jobs').insert({
    workflow_name: workflowName,
    context: context ?? null,
    status: 'queued',
    created_at: new Date().toISOString(),
  });

  if (error) {
    return `Queued workflow "${workflowName}" (workflow_jobs table missing or error: ${error.message})`;
  }

  return `Triggered workflow "${workflowName}"${context ? ` with context: ${context}` : ''}`;
}

export async function setTag(args: Record<string, unknown>): Promise<string> {
  const tag = (args.tag as string)?.toUpperCase();
  const showingIds = String(args.showingIds ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!VALID_TAGS.includes(tag) || !showingIds.length) {
    throw new Error(`tag (${VALID_TAGS.join('|')}) and showingIds are required`);
  }

  const supabase = getSupabaseClient();
  const { data: existing, error: fetchError } = await supabase
    .from('showing_requests')
    .select('id, tags')
    .in('id', showingIds);

  if (fetchError) {
    throw new Error(
      fetchError.message.includes('tags')
        ? `set_tag requires a tags column. Run: ALTER TABLE showing_requests ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'`
        : `Failed to set tag ${tag}: ${fetchError.message}`
    );
  }

  const updates = (existing ?? []).map((row) => {
    const tags = (row.tags as string[]) ?? [];
    const next = tags.includes(tag) ? tags : [...tags, tag];
    return { id: row.id, tags: next };
  });

  for (const u of updates) {
    const { error } = await supabase
      .from('showing_requests')
      .update({ tags: u.tags, updated_at: new Date().toISOString() })
      .eq('id', u.id);

    if (error) {
      throw new Error(`Failed to set tag ${tag}: ${error.message}`);
    }
  }

  return `Set Tag ${tag} on ${showingIds.length} showing(s)`;
}
