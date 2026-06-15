import { Router, type Request, type Response } from 'express';
import { OutboundCaller } from '../voice/outbound-caller';
import { sendSMS } from '../services/sms/twilio-sms';
import {
  getListingAgentById,
  getPropertiesByIds,
  getRecentCalls,
  getRecentMessages,
} from '../services/supabase';
import { listMessages } from '../services/sms/messageLog';
import { logger } from '../lib/logger';

/**
 * Dashboard / control API (Express, port 3000).
 *
 * Routes:
 *   POST /api/call/initiate   start an outbound call (Supabase lookup → Twilio)
 *   GET  /api/calls/recent    recent call logs (with transcripts)
 *   GET  /api/messages/recent recent SMS (Supabase, falling back to the in-memory log)
 *   POST /api/sms/send        send a text message
 *   GET  /api/health          service health (Whisper/OpenAI, Forge LLM, Twilio)
 *
 * Note: this server (3000) and the voice/Twilio webhook server (5050) are
 * separate processes. /api/call/initiate places the call here; Twilio then hits
 * the 5050 server (via SERVER_URL) for /outbound-call + /call-status.
 */

const router = Router();

// Lazily construct the caller so the dashboard boots even without Twilio creds.
let caller: OutboundCaller | null = null;
function getCaller(): OutboundCaller {
  if (!caller) caller = new OutboundCaller();
  return caller;
}

// ---- POST /api/call/initiate ----
router.post('/api/call/initiate', async (req: Request, res: Response) => {
  const { agentId, propertyIds } = req.body as { agentId?: string; propertyIds?: string[] };

  if (!agentId || !Array.isArray(propertyIds) || propertyIds.length === 0) {
    res.status(400).json({ error: 'Body must include agentId (string) and propertyIds (string[])' });
    return;
  }

  const callbackUrl = process.env.SERVER_URL;
  if (!callbackUrl) {
    res.status(500).json({ error: 'SERVER_URL is not configured (public URL of the voice server for Twilio webhooks)' });
    return;
  }

  try {
    const agent = await getListingAgentById(agentId);
    if (!agent) {
      res.status(404).json({ error: `Listing agent ${agentId} not found` });
      return;
    }
    if (!agent.phone) {
      res.status(422).json({ error: `Listing agent ${agentId} has no phone number` });
      return;
    }

    const properties = await getPropertiesByIds(propertyIds);
    if (properties.length === 0) {
      res.status(404).json({ error: 'No properties found for the given propertyIds' });
      return;
    }

    const result = await getCaller().makeCall({
      phoneNumber: agent.phone,
      agentName: agent.name,
      properties: properties.map((p) => ({ address: p.address ?? '', mlsNumber: p.mls_number ?? '' })),
      callbackUrl,
      agentId,
      propertyIds,
    });

    res.json(result);
  } catch (err) {
    logger.error('call initiate failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to initiate call' });
  }
});

// ---- GET /api/calls/recent ----
router.get('/api/calls/recent', async (_req: Request, res: Response) => {
  try {
    const calls = await getRecentCalls(20);
    res.json({ calls });
  } catch (err) {
    logger.warn('recent calls unavailable', { message: err instanceof Error ? err.message : String(err) });
    res.json({ calls: [], degraded: true });
  }
});

// ---- GET /api/messages/recent ----
// Prefer Supabase; fall back to the in-memory log so the demo works without the DB.
router.get('/api/messages/recent', async (_req: Request, res: Response) => {
  try {
    const rows = await getRecentMessages(50);
    if (rows.length > 0) {
      const messages = rows.map((m) => ({
        direction: m.direction,
        from: m.from_number,
        to: m.to_number,
        body: m.body,
        status: m.status,
        createdAt: m.created_at,
      }));
      res.json({ messages, source: 'supabase' });
      return;
    }
  } catch (err) {
    logger.warn('recent messages: Supabase unavailable, using in-memory log', {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // Fallback: in-memory log (newest-first already).
  const messages = listMessages().map((m) => ({
    direction: m.direction,
    from: m.from,
    to: m.to,
    body: m.body,
    status: m.status,
    createdAt: m.createdAt,
  }));
  res.json({ messages, source: 'memory' });
});

// ---- POST /api/sms/send ----
router.post('/api/sms/send', async (req: Request, res: Response) => {
  const { to, body, listingAgentId, propertyIds } = req.body as {
    to?: string;
    body?: string;
    listingAgentId?: string;
    propertyIds?: string[];
  };
  if (!to || !body) {
    res.status(400).json({ error: 'Body must include "to" and "body"' });
    return;
  }
  try {
    const sid = await sendSMS(to, body, { listingAgentId, propertyIds });
    res.json({ ok: true, sid });
  } catch (err) {
    logger.error('sms send failed', { message: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send SMS' });
  }
});

// ---- GET /api/health ----
router.get('/api/health', async (_req: Request, res: Response) => {
  const placeholder = (v: string | undefined): boolean =>
    !v || v === 'your-openai-api-key' || v.startsWith('your-');

  const whisper = placeholder(process.env.OPENAI_API_KEY) ? 'missing' : 'configured';
  const twilioReady =
    !placeholder(process.env.TWILIO_ACCOUNT_SID) && !placeholder(process.env.TWILIO_AUTH_TOKEN)
      ? 'configured'
      : 'missing';

  // Probe the Forge LLM endpoint (short timeout). 401 still means reachable.
  let llm = 'unknown';
  const forgeUrl = process.env.FORGE_URL || 'http://66.179.10.109:8000/v1';
  try {
    const r = await fetch(`${forgeUrl.replace(/\/$/, '')}/models`, { signal: AbortSignal.timeout(3000) });
    llm = r.ok || r.status === 401 ? 'reachable' : `error (${r.status})`;
  } catch {
    llm = 'unreachable';
  }

  res.json({ status: 'ok', services: { whisper, llm, twilio: twilioReady } });
});

export default router;
