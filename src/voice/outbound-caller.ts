import 'dotenv/config';
import twilio, { type Twilio } from 'twilio';
import cron from 'node-cron';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { logger } from '../lib/logger';
import { getSmsService } from '../services/sms';
import { getListingAgentById, getPropertiesByIds, logCall } from '../services/supabase';
import type { CallStatus } from '../models/database';
import { startTextFlow } from '../orchestrator/text-flow';
import { connectStreamTwiml, resolveHost, sayTwiml } from './twiml';

/**
 * Outbound calling system — the core of the TRP workflow. The AI agent calls
 * LISTING AGENTS (not the other way around) to confirm property availability.
 *
 *   OutboundCaller.makeCall()  → Twilio dials the agent; on answer Twilio fetches
 *                                TwiML from POST /outbound-call.
 *   POST /outbound-call        → returns TwiML connecting the Media Stream
 *                                (personalized with agent name + addresses), or
 *                                drops a voicemail if a machine answered.
 *   POST /call-status          → status callbacks; drives the No Response Branch
 *                                (retry in 20 min via node-cron) and call logging.
 *   POST /api/call/initiate     → dashboard entry: look up agent + properties in
 *                                Supabase, then makeCall(); returns { callSid, status }.
 *
 * Audio: Twilio Media Streams are G.711 μ-law 8kHz. The /media-stream bridge
 * configures the OpenAI Realtime session with input/output_audio_format
 * 'g711_ulaw', so OpenAI consumes/produces μ-law natively — no PCM16/24kHz
 * resampling is needed on our side.
 */

const COMPANY = process.env.COMPANY_NAME ?? 'Nestr Realty';
const CALLBACK_NUMBER = process.env.TWILIO_PHONE_NUMBER ?? '';
const RETRY_DELAY_MINUTES = Number(process.env.RETRY_DELAY_MINUTES ?? 20);
const MAX_CALL_ATTEMPTS = Number(process.env.MAX_CALL_ATTEMPTS ?? 2);

export interface CallProperty {
  address: string;
  mlsNumber: string;
}

export interface MakeCallParams {
  phoneNumber: string;
  agentName: string;
  properties: CallProperty[];
  callbackUrl: string;
  /** Optional links so callbacks can persist to Supabase / retry intelligently. */
  agentId?: string;
  propertyIds?: string[];
  /** 1 = initial attempt; incremented by the No Response Branch retry. */
  attempt?: number;
}

/** Per-call context kept in memory so status callbacks can retry / leave voicemail. */
interface CallContext extends MakeCallParams {
  callSid: string;
  attempts: number;
  brokerageContacted: boolean;
}

const callRegistry = new Map<string, CallContext>();

function addressList(properties: CallProperty[]): string {
  return properties.map((p) => p.address).filter(Boolean).join(', ') || 'your current listing';
}

// ---------------------------------------------------------------------------
// OutboundCaller
// ---------------------------------------------------------------------------

export class OutboundCaller {
  private readonly client: Twilio;
  private readonly from: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.from = process.env.TWILIO_PHONE_NUMBER ?? '';
    if (!accountSid || !authToken || !this.from) {
      throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER are required');
    }
    this.client = twilio(accountSid, authToken);
  }

  /** Place an outbound call to a listing agent. */
  async makeCall(params: MakeCallParams): Promise<{ callSid: string; status: string }> {
    const base = params.callbackUrl.replace(/\/$/, '');
    const addresses = addressList(params.properties);
    const attempt = params.attempt ?? 1;

    // Personalization travels to /outbound-call as query params (stateless), so
    // it works even if the server was restarted between dialing and answering.
    const query = new URLSearchParams({ agentName: params.agentName, addresses }).toString();

    const call = await this.client.calls.create({
      to: params.phoneNumber,
      from: this.from,
      url: `${base}/outbound-call?${query}`,
      statusCallback: `${base}/call-status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      machineDetection: 'DetectMessageEnd', // voicemail detection → AnsweredBy
    });

    const ctx: CallContext = {
      ...params,
      attempt,
      callSid: call.sid,
      attempts: attempt,
      brokerageContacted: false,
    };
    callRegistry.set(call.sid, ctx);

    logger.info('📞 outbound call placed', {
      callSid: call.sid,
      to: params.phoneNumber,
      agentName: params.agentName,
      addresses,
      attempt,
      status: call.status,
    });

    return { callSid: call.sid, status: call.status };
  }
}

// Lazily build the caller so the server boots even when Twilio isn't configured.
let caller: OutboundCaller | null = null;
function getOutboundCaller(): OutboundCaller {
  if (!caller) caller = new OutboundCaller();
  return caller;
}

// ---------------------------------------------------------------------------
// Voicemail + No Response Branch
// ---------------------------------------------------------------------------

function voicemailMessage(agentName: string, address: string): string {
  return `Hi ${agentName}, this is ${COMPANY} calling about your listing at ${address}. Please call us back at ${CALLBACK_NUMBER} or reply to this text.`;
}

function isMachine(answeredBy: string | undefined): boolean {
  return typeof answeredBy === 'string' && answeredBy.startsWith('machine');
}

/** Send the voicemail message as an SMS too (best-effort; never throws). */
async function sendVoicemailSms(to: string | undefined, agentName: string, address: string): Promise<void> {
  if (!to) return;
  try {
    const sms = getSmsService();
    await sms.send(to, voicemailMessage(agentName, address));
    logger.info('voicemail follow-up SMS sent', { to });
  } catch (err) {
    logger.warn('voicemail SMS failed', { to, message: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * No Response Branch (WORKFLOW.md §3): on no-answer/busy, wait 20 minutes and
 * retry. After the max direct attempts, escalate to the brokerage.
 */
function handleNoResponse(ctx: CallContext | undefined, twilioStatus: string, to: string | undefined): void {
  logger.warn('No Response Branch triggered', { status: twilioStatus, to, callSid: ctx?.callSid });

  if (!ctx) {
    logger.warn('No call context in memory — cannot auto-retry (server may have restarted)', { to });
    return;
  }

  if (ctx.attempts < MAX_CALL_ATTEMPTS) {
    scheduleRetry(ctx);
    return;
  }

  // Max direct call attempts reached → WORKFLOW.md "text preference" fallback:
  // switch the conversation to SMS when we have the agent + property context.
  if (ctx.agentId && ctx.propertyIds && ctx.propertyIds.length > 0) {
    logger.info('No Response Branch: max call attempts reached — switching to text flow (SMS)', {
      agentId: ctx.agentId,
      attempts: ctx.attempts,
    });
    void startTextFlow(ctx.agentId, ctx.propertyIds).catch((err: unknown) =>
      logger.error('startTextFlow failed', { message: err instanceof Error ? err.message : String(err) }),
    );
    return;
  }

  // No agent/property context (e.g. an ad-hoc test call) → brokerage escalation.
  if (!ctx.brokerageContacted) {
    ctx.brokerageContacted = true;
    logger.warn(
      `No Response Branch: ${ctx.attempts} direct attempts exhausted — next step per WORKFLOW.md §3 is to call the brokerage`,
      { agentId: ctx.agentId, to: ctx.phoneNumber },
    );
    return;
  }

  logger.warn('No Response Branch: brokerage already contacted — holding per workflow', {
    callSid: ctx.callSid,
  });
}

/** Schedule the next attempt RETRY_DELAY_MINUTES from now using node-cron (one-shot). */
function scheduleRetry(ctx: CallContext): void {
  const fireAt = new Date(Date.now() + RETRY_DELAY_MINUTES * 60_000);
  // node-cron 5-field expression for the exact target minute; stopped after it fires once.
  const expr = `${fireAt.getMinutes()} ${fireAt.getHours()} ${fireAt.getDate()} ${fireAt.getMonth() + 1} *`;

  logger.info('No Response Branch: scheduling retry in 20 minutes', {
    callSid: ctx.callSid,
    to: ctx.phoneNumber,
    nextAttempt: ctx.attempts + 1,
    fireAt: fireAt.toISOString(),
  });

  const task = cron.schedule(expr, () => {
    task.stop();
    logger.info('No Response Branch: retrying outbound call now', {
      to: ctx.phoneNumber,
      attempt: ctx.attempts + 1,
    });
    void getOutboundCaller()
      .makeCall({
        phoneNumber: ctx.phoneNumber,
        agentName: ctx.agentName,
        properties: ctx.properties,
        callbackUrl: ctx.callbackUrl,
        agentId: ctx.agentId,
        propertyIds: ctx.propertyIds,
        attempt: ctx.attempts + 1,
      })
      .catch((err: unknown) =>
        logger.error('retry call failed', { message: err instanceof Error ? err.message : String(err) }),
      );
  });
}

// Map Twilio call statuses onto our call_status enum for persistence.
function toCallStatus(twilioStatus: string, answeredBy: string | undefined): CallStatus {
  if (isMachine(answeredBy)) return 'voicemail';
  switch (twilioStatus) {
    case 'completed':
      return 'completed';
    case 'in-progress':
    case 'answered':
      return 'answered';
    case 'no-answer':
      return 'no_answer';
    case 'busy':
    case 'failed':
    case 'canceled':
      return 'failed';
    default:
      return 'initiated';
  }
}

/** Best-effort call_logs write (never throws — mirrors the SMS store pattern). */
async function persistCallLog(ctx: CallContext | undefined, status: CallStatus, durationSeconds?: number): Promise<void> {
  try {
    await logCall({
      listing_agent_id: ctx?.agentId ?? null,
      property_ids: ctx?.propertyIds ?? [],
      call_type: 'outbound_agent',
      status,
      duration_seconds: durationSeconds ?? null,
    });
  } catch (err) {
    logger.warn('call_logs write skipped', { message: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------------------
// Routes (registered onto the voice agent's Fastify server)
// ---------------------------------------------------------------------------

export function registerOutboundRoutes(fastify: FastifyInstance, opts: { port: number }): void {
  // ---- POST /outbound-call : Twilio fetches this when the agent answers ----
  fastify.all('/outbound-call', async (request: FastifyRequest, reply) => {
    const query = (request.query ?? {}) as Record<string, string>;
    const body = (request.body ?? {}) as Record<string, string>;
    const agentName = query.agentName ?? body.agentName ?? 'there';
    const addresses = query.addresses ?? body.addresses ?? 'your current listing';
    const answeredBy = body.AnsweredBy ?? query.AnsweredBy;
    const callSid = body.CallSid ?? query.CallSid;
    const ctx = callSid ? callRegistry.get(callSid) : undefined;

    // Voicemail: with DetectMessageEnd, AnsweredBy arrives on this webhook.
    if (isMachine(answeredBy)) {
      const firstAddress = addresses.split(',')[0]?.trim() || 'your listing';
      logger.info('🤖 machine/voicemail detected — leaving message + SMS', { callSid, answeredBy });
      void sendVoicemailSms(ctx?.phoneNumber ?? body.To, agentName, firstAddress);
      return reply.type('text/xml').send(sayTwiml(voicemailMessage(agentName, firstAddress), { hangup: true }));
    }

    // Human answered → connect the Media Stream (AI greets first).
    const host = resolveHost(request, opts.port);
    logger.info('☎️  agent answered — connecting media stream', { callSid, host, agentName, addresses });
    return reply.type('text/xml').send(connectStreamTwiml({ host, agentName, addresses }));
  });

  // ---- POST /call-status : Twilio call lifecycle callbacks ----
  fastify.all('/call-status', async (request: FastifyRequest, reply) => {
    const b = (request.body ?? {}) as Record<string, string>;
    const callSid = b.CallSid;
    const status = b.CallStatus ?? 'unknown';
    const answeredBy = b.AnsweredBy;
    const durationSeconds = b.CallDuration ? Number(b.CallDuration) : undefined;
    const ctx = callSid ? callRegistry.get(callSid) : undefined;

    logger.info(`call-status ▸ ${status}`, { callSid, answeredBy, durationSeconds, to: b.To });

    // Async-AMD fallback: if a machine was reported here, at least send the SMS.
    if (isMachine(answeredBy)) {
      const addresses = ctx ? addressList(ctx.properties) : '';
      const firstAddress = addresses.split(',')[0]?.trim() || 'your listing';
      void sendVoicemailSms(ctx?.phoneNumber ?? b.To, ctx?.agentName ?? 'there', firstAddress);
    }

    if (status === 'no-answer' || status === 'busy' || status === 'failed') {
      handleNoResponse(ctx, status, b.To);
    }

    if (status === 'completed') {
      void persistCallLog(ctx, toCallStatus(status, answeredBy), durationSeconds);
      if (callSid) callRegistry.delete(callSid);
    }

    // Twilio ignores the body of status callbacks; just acknowledge.
    return reply.code(204).send();
  });

  // ---- POST /api/call/initiate : dashboard kicks off a call ----
  fastify.post('/api/call/initiate', async (request: FastifyRequest, reply) => {
    const body = (request.body ?? {}) as { agentId?: string; propertyIds?: string[] };
    const { agentId, propertyIds } = body;

    if (!agentId || !Array.isArray(propertyIds) || propertyIds.length === 0) {
      return reply.code(400).send({ error: 'Body must include agentId (string) and propertyIds (string[])' });
    }

    const callbackUrl = process.env.SERVER_URL;
    if (!callbackUrl) {
      return reply.code(500).send({ error: 'SERVER_URL is not configured (public URL for Twilio webhooks)' });
    }

    try {
      const agent = await getListingAgentById(agentId);
      if (!agent) return reply.code(404).send({ error: `Listing agent ${agentId} not found` });
      if (!agent.phone) return reply.code(422).send({ error: `Listing agent ${agentId} has no phone number` });

      const properties = await getPropertiesByIds(propertyIds);
      if (properties.length === 0) {
        return reply.code(404).send({ error: 'No properties found for the given propertyIds' });
      }

      const result = await getOutboundCaller().makeCall({
        phoneNumber: agent.phone,
        agentName: agent.name,
        properties: properties.map((p) => ({ address: p.address ?? '', mlsNumber: p.mls_number ?? '' })),
        callbackUrl,
        agentId,
        propertyIds,
      });

      return reply.send(result);
    } catch (err) {
      logger.error('call initiate failed', { message: err instanceof Error ? err.message : String(err) });
      return reply.code(500).send({ error: err instanceof Error ? err.message : 'Failed to initiate call' });
    }
  });
}

// ---------------------------------------------------------------------------
// Test runner: `pnpm run call:outbound <yourNumber> [agentName] [address...]`
// Requires the voice agent running (pnpm dev) and SERVER_URL reachable.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const phoneNumber = process.argv[2] ?? process.env.TEST_CALL_TO;
  const agentName = process.argv[3] ?? 'there';
  const addressArgs = process.argv.slice(4);
  const callbackUrl = process.env.SERVER_URL;

  if (!phoneNumber) {
    throw new Error('Usage: pnpm run call:outbound <phoneNumber> [agentName] [address...]');
  }
  if (!callbackUrl) {
    throw new Error('SERVER_URL is required (public URL of the voice agent — run `pnpm dev` to get an ngrok URL)');
  }

  const properties: CallProperty[] =
    addressArgs.length > 0
      ? addressArgs.map((address) => ({ address, mlsNumber: '' }))
      : [{ address: '123 King Street West', mlsNumber: 'W0000000' }];

  const result = await getOutboundCaller().makeCall({ phoneNumber, agentName, properties, callbackUrl });

  console.log('✅ Outbound call initiated.');
  console.log(`   Call SID : ${result.callSid}`);
  console.log(`   To       : ${phoneNumber}`);
  console.log(`   Status   : ${result.status}`);
  console.log(`   Webhook  : ${callbackUrl.replace(/\/$/, '')}/outbound-call`);
  console.log('\n📞 Answer your phone — the AI agent should greet you and begin the TRP workflow.');
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error(`\n❌ Failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
}
