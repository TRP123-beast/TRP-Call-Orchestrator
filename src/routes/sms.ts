import { Router, type Request, type Response } from 'express';
import { twiml } from 'twilio';
import { askForge } from '../services/llm';
import { handleTextFlowResponse, isActiveTextWorkflow } from '../orchestrator/text-flow';
import { getListingAgentByPhone, getWorkflowState, getDb } from '../services/supabase';
import { recordMessage } from '../services/sms/messageLog';
import { logger } from '../lib/logger';

/**
 * Inbound SMS handling (Express, port 3000). Both the Twilio webhook and the
 * no-phone simulator share processIncomingSMS():
 *   - log inbound (console + Supabase)
 *   - identify the sender; if a text workflow is active, drive the stage machine,
 *     otherwise reply generally via Forge; unknown senders get a default reply
 *   - log the outbound reply (console + Supabase) and return its text
 *
 * Adaptation note: replies are returned (the webhook sends them via TwiML
 * <Message>; the simulator returns JSON) so we never double-send.
 */

const router = Router();
const FROM = process.env.TWILIO_PHONE_NUMBER ?? '';

const DEFAULT_REPLY = 'Thank you for your message. A TRP team member will follow up shortly.';
const ERROR_REPLY = "Thanks for your message — we're having a brief issue and a TRP team member will follow up shortly.";

let outboundCounter = 0;

async function insertMessage(rec: {
  direction: 'inbound' | 'outbound';
  from_number: string;
  to_number: string;
  body: string;
  provider_message_id?: string;
}): Promise<void> {
  try {
    await getDb()
      .from('messages')
      .insert({ ...rec, property_ids: [], status: rec.direction === 'inbound' ? 'received' : 'sent' });
  } catch (err) {
    logger.warn('messages insert skipped', { message: err instanceof Error ? err.message : String(err) });
  }
}

/** Run an LLM-backed reply, degrading to a safe message if Forge is unreachable. */
async function safeReply(fn: () => Promise<string>): Promise<string> {
  try {
    const text = (await fn()).trim();
    return text || DEFAULT_REPLY;
  } catch (err) {
    logger.warn('reply generation failed — using fallback', {
      message: err instanceof Error ? err.message : String(err),
    });
    return ERROR_REPLY;
  }
}

export async function processIncomingSMS(
  from: string,
  body: string,
  sid: string,
  opts?: { provider?: string },
): Promise<string> {
  const provider = opts?.provider ?? 'twilio';
  logger.info(`Incoming SMS from ${from}: ${body}`);

  // Log inbound (console + Supabase).
  recordMessage({ id: sid, direction: 'inbound', from, to: FROM, body, status: 'received', provider });
  await insertMessage({ direction: 'inbound', from_number: from, to_number: FROM, body, provider_message_id: sid });

  let replyText: string;
  let agent = null;
  try {
    agent = await getListingAgentByPhone(from);
  } catch (err) {
    logger.warn('listing agent lookup failed — treating as unknown sender', {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  if (agent) {
    let workflow = null;
    try {
      workflow = await getWorkflowState(agent.id);
    } catch (err) {
      logger.warn('workflow lookup failed', { message: err instanceof Error ? err.message : String(err) });
    }

    if (isActiveTextWorkflow(workflow)) {
      replyText = await safeReply(() => handleTextFlowResponse(workflow, agent!, body));
    } else {
      replyText = await safeReply(() =>
        askForge(
          `You are a helpful assistant for TRP, a Canadian rental brokerage.
You are responding via text message to a listing agent named ${agent!.name}.
Keep responses concise (under 160 characters if possible) and professional.
If they are asking about a property or showing, offer to help.`,
          body,
          { maxTokens: 128 },
        ),
      );
    }
  } else {
    replyText = DEFAULT_REPLY;
  }

  // Log the outbound reply (console + Supabase). The actual send happens via
  // TwiML (webhook) — here we only record it.
  outboundCounter += 1;
  recordMessage({
    id: `OUT${Date.now()}${outboundCounter}`,
    direction: 'outbound',
    from: FROM,
    to: from,
    body: replyText,
    status: 'sent',
    provider,
  });
  await insertMessage({ direction: 'outbound', from_number: FROM, to_number: from, body: replyText });

  return replyText;
}

// Twilio inbound-SMS webhook.
router.post('/api/sms/webhook', async (req: Request, res: Response) => {
  const { From, Body, MessageSid } = req.body as { From?: string; Body?: string; MessageSid?: string };
  if (!From || !Body) {
    res.status(400).json({ error: 'Missing From/Body in webhook payload' });
    return;
  }

  const reply = await processIncomingSMS(From, Body, MessageSid ?? `WH${Date.now()}`, { provider: 'twilio' });

  const response = new twiml.MessagingResponse();
  response.message(reply);
  res.type('text/xml').send(response.toString());
});

// No-phone simulator — fakes the Twilio payload and reuses the webhook logic.
router.post('/api/sms/simulate', async (req: Request, res: Response) => {
  const { from, body } = req.body as { from?: string; body?: string };
  const reply = await processIncomingSMS(
    from || '+15551234567',
    body || 'yes available',
    `SIM_${Date.now()}`,
    { provider: process.env.SMS_PROVIDER ?? 'mock' },
  );
  res.json({ reply, simulated: true });
});

export default router;
