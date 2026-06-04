import { getSupabaseClient } from '../../lib/supabase';
import { logger } from '../../lib/logger';

/**
 * Persists every inbound/outbound message to the Supabase `messages` table.
 *
 * Schema (create if missing):
 *   create table if not exists messages (
 *     id uuid primary key default gen_random_uuid(),
 *     provider text, direction text, from_number text, to_number text,
 *     body text, status text, sid text, created_at timestamptz default now()
 *   );
 *
 * Logging never throws — if Supabase is unconfigured or the table is missing,
 * it warns and continues so message delivery is unaffected.
 */
export interface MessageRecord {
  provider: string;
  direction: 'outbound' | 'inbound';
  from_number: string | null;
  to_number: string | null;
  body: string;
  status: string;
  sid: string | null;
}

export async function logMessage(rec: MessageRecord): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('messages')
      .insert({ ...rec, created_at: new Date().toISOString() });
    if (error) {
      logger.warn('sms: failed to log message to Supabase', {
        direction: rec.direction,
        message: error.message,
      });
    }
  } catch (err) {
    logger.warn('sms: Supabase unavailable for message logging', {
      direction: rec.direction,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
