import { createProvider } from './index';
import { recordMessage, simulateOutboundLifecycle } from './messageLog';
import type { SmsProvider } from './types';
import { getDb } from '../supabase';
import { logger } from '../../lib/logger';

/**
 * Outbound SMS sender for the text-flow orchestrator.
 *
 * Adaptation note: rather than hardcode a Twilio client (which would fail in
 * demos without a purchased number), this routes through the repo's existing
 * provider abstraction (SMS_PROVIDER=mock|twilio). It also records every send to
 * the in-memory log (so the /sms-demo console shows it) and best-effort to the
 * Supabase `messages` table with listing-agent/property context.
 */

let provider: SmsProvider | null = null;
function getProvider(): SmsProvider {
  if (!provider) provider = createProvider();
  return provider;
}

export interface SmsContext {
  listingAgentId?: string;
  propertyIds?: string[];
}

export async function sendSMS(to: string, body: string, context?: SmsContext): Promise<string> {
  const p = getProvider();
  const result = await p.sendSMS(to, body);

  // In-memory log for the demo console.
  recordMessage({
    id: result.sid,
    direction: 'outbound',
    from: p.fromNumber(),
    to,
    body,
    status: p.name === 'mock' ? 'queued' : result.status,
    provider: p.name,
  });
  if (p.name === 'mock') simulateOutboundLifecycle(result.sid);

  logger.info(`SMS sent to ${to}: ${body.substring(0, 50)}...`, {
    sid: result.sid,
    to,
    direction: 'outbound',
  });

  // Best-effort Supabase log (never throws — Supabase may be unconfigured/unreachable).
  try {
    await getDb()
      .from('messages')
      .insert({
        direction: 'outbound',
        from_number: p.fromNumber(),
        to_number: to,
        body,
        listing_agent_id: context?.listingAgentId ?? null,
        property_ids: context?.propertyIds ?? [],
        provider_message_id: result.sid,
        status: 'sent',
      });
  } catch (err) {
    logger.warn('Failed to log outbound SMS to Supabase', {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return result.sid;
}
