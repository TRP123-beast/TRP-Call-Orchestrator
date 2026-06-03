import pRetry, { AbortError } from 'p-retry';
import { getSupabaseClient } from '../lib/supabase';
import { logger } from '../lib/logger';

/**
 * Backing implementations for the LiveKit agent's function tools.
 *
 * Kept separate from src/tools/executors.ts because this module depends on
 * p-retry (ESM-only). The Express server (run under ts-node/CommonJS) imports
 * only executors.ts, so it never loads this file.
 *
 * Every exported function returns a human-readable string (never throws) so a
 * tool failure degrades gracefully mid-call instead of breaking the conversation.
 * Supabase writes are retried with p-retry; permanent errors (missing table)
 * abort retries immediately and produce a soft, informative result.
 */

const CATEGORY_TO_STATUS: Record<string, string> = {
  'Pending Showings': 'pending',
  'Canceled Showings': 'cancelled',
  'Confirmed Showings': 'confirmed',
};

function isMissingRelation(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('does not exist') ||
    m.includes('schema cache') ||
    m.includes('could not find the table') ||
    m.includes('relation') && m.includes('not')
  );
}

// Convert a Supabase error message into a retryable Error or a non-retryable AbortError.
function classify(message: string): Error {
  return isMissingRelation(message) ? new AbortError(message) : new Error(message);
}

async function withRetry<T>(label: string, op: () => Promise<T>): Promise<T> {
  return pRetry(op, {
    retries: 3,
    minTimeout: 250,
    factor: 2,
    onFailedAttempt: (ctx) => {
      logger.warn('supabase operation retrying', {
        label,
        attempt: ctx.attemptNumber,
        retriesLeft: ctx.retriesLeft,
        message: ctx.error.message,
      });
    },
  });
}

function parseIds(value: unknown): string[] {
  return String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Queries Supabase for the current status/details of the property/showing(s). */
export async function checkPropertyAvailability(args: Record<string, unknown>): Promise<string> {
  const showingIds = parseIds(args.showingIds);
  const propertyIds = parseIds(args.propertyIds ?? args.propertyId);
  const propsTable = process.env.SUPABASE_PROPERTIES_TABLE ?? 'properties';

  if (!showingIds.length && !propertyIds.length) {
    return 'Error: provide showingIds or propertyIds to check availability';
  }

  try {
    return await withRetry('check_property_availability', async () => {
      const supabase = getSupabaseClient();
      let showings: Record<string, unknown>[] = [];
      let resolvedPropertyIds = propertyIds;

      if (showingIds.length) {
        const { data, error } = await supabase
          .from('showing_requests')
          .select('id, property_id, status, reason, scheduled_date, scheduled_time')
          .in('id', showingIds);
        if (error) throw classify(error.message);
        showings = data ?? [];
        resolvedPropertyIds = [
          ...new Set([
            ...propertyIds,
            ...showings.map((s) => String(s.property_id)).filter(Boolean),
          ]),
        ];
      }

      let properties: Record<string, unknown>[] = [];
      if (resolvedPropertyIds.length) {
        const { data, error } = await supabase
          .from(propsTable)
          .select('id, address, pets_allowed, offer_requirements, brokerage_remarks, client_remarks')
          .in('id', resolvedPropertyIds);
        if (error) throw classify(error.message);
        properties = data ?? [];
      }

      if (!showings.length && !properties.length) {
        return JSON.stringify({ found: false, message: 'No matching showings or properties found' });
      }
      return JSON.stringify({ found: true, showings, properties });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('check_property_availability failed', { message: msg });
    return `Could not check availability: ${msg}`;
  }
}

/** Updates a showing's category/status in Supabase (Pending/Canceled/Confirmed). */
export async function updatePropertyStatus(args: Record<string, unknown>): Promise<string> {
  const showingIds = parseIds(args.showingIds);
  const category = String(args.category ?? '');
  const statusDetail = String(args.status ?? '');
  const releaseSpecialist = Boolean(args.releaseSpecialist);

  if (!showingIds.length || !category || !statusDetail) {
    return 'Error: showingIds, category, and status are required';
  }
  const dbStatus = CATEGORY_TO_STATUS[category] ?? 'pending';

  try {
    return await withRetry('update_property_status', async () => {
      const supabase = getSupabaseClient();
      const updates: Record<string, unknown> = {
        status: dbStatus,
        reason: statusDetail,
        updated_at: nowIso(),
      };
      if (dbStatus === 'cancelled') updates.cancelled_at = nowIso();
      else if (dbStatus === 'confirmed') updates.confirmed_at = nowIso();
      if (releaseSpecialist) updates.rental_specialist_id = null;

      const { error } = await supabase.from('showing_requests').update(updates).in('id', showingIds);
      if (error) throw classify(error.message);
      return `Updated ${showingIds.length} showing(s): ${category} / "${statusDetail}"${
        releaseSpecialist ? ' (specialist released)' : ''
      }`;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('update_property_status failed', { message: msg, showingIds });
    return `Failed to update showing status: ${msg}`;
  }
}

/** Records that the agent should call/text back later. */
export async function scheduleCallback(args: Record<string, unknown>): Promise<string> {
  const showingIds = parseIds(args.showingIds);
  const callbackAt = args.callbackAt ? String(args.callbackAt) : null;
  const reason = args.reason ? String(args.reason) : null;
  const channel = args.channel ? String(args.channel) : 'call';

  try {
    return await withRetry('schedule_callback', async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('scheduled_callbacks').insert({
        showing_ids: showingIds,
        callback_at: callbackAt,
        reason,
        channel,
        status: 'scheduled',
        created_at: nowIso(),
      });
      if (error) throw classify(error.message);
      return `Scheduled ${channel} callback${callbackAt ? ` at ${callbackAt}` : ''}${
        reason ? ` (${reason})` : ''
      }`;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isMissingRelation(msg)) {
      logger.warn('schedule_callback not persisted (no scheduled_callbacks table)', { message: msg });
      return `Callback noted (${channel}${callbackAt ? ` at ${callbackAt}` : ''}); not persisted — 'scheduled_callbacks' table not found.`;
    }
    logger.error('schedule_callback failed', { message: msg });
    return `Failed to schedule callback: ${msg}`;
  }
}

/**
 * Sends an SMS follow-up. No SMS provider is wired in this project, so the
 * intent is logged and recorded to Supabase as 'queued' for a provider to pick up.
 */
export async function sendTextMessage(args: Record<string, unknown>): Promise<string> {
  const to = args.to ? String(args.to) : (process.env.TRIAL_NUMBER ?? '');
  const body = String(args.body ?? '').trim();
  const showingId = args.showingId ? String(args.showingId) : null;

  if (!body) return 'Error: message body is required';

  logger.info('send_text_message (no live SMS provider — recording intent)', { to, showingId, body });

  try {
    return await withRetry('send_text_message', async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('text_messages').insert({
        to_number: to || null,
        body,
        showing_id: showingId,
        status: 'queued',
        created_at: nowIso(),
      });
      if (error) throw classify(error.message);
      return `Text message queued${to ? ` to ${to}` : ''} (no live SMS provider configured; stored as 'queued').`;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isMissingRelation(msg)) {
      return `Text message logged${to ? ` to ${to}` : ''} (no SMS provider and no 'text_messages' table; not persisted).`;
    }
    logger.error('send_text_message failed', { message: msg });
    return `Failed to record text message: ${msg}`;
  }
}

/** Saves a conversation transcript/summary to Supabase. */
export async function logConversation(args: Record<string, unknown>): Promise<string> {
  const showingIds = parseIds(args.showingIds);
  const transcript = args.transcript !== undefined ? String(args.transcript) : '';
  const summary = args.summary ? String(args.summary) : null;
  const outcome = args.outcome ? String(args.outcome) : null;

  if (!transcript && !summary) return 'Error: transcript or summary is required';

  try {
    return await withRetry('log_conversation', async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('conversation_logs').insert({
        showing_ids: showingIds,
        transcript: transcript || null,
        summary,
        outcome,
        created_at: nowIso(),
      });
      if (error) throw classify(error.message);
      return `Logged conversation${showingIds.length ? ` for ${showingIds.length} showing(s)` : ''}.`;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isMissingRelation(msg)) {
      logger.warn('log_conversation not persisted (no conversation_logs table)', { message: msg });
      return `Conversation captured but not persisted — 'conversation_logs' table not found.`;
    }
    logger.error('log_conversation failed', { message: msg });
    return `Failed to log conversation: ${msg}`;
  }
}
