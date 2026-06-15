import 'dotenv/config';
import Fastify, { type FastifyRequest } from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import WebSocket from 'ws';
import { logger } from '../lib/logger';
import { connectStreamTwiml, resolveHost } from './twiml';
import { registerOutboundRoutes } from './outbound-caller';

/**
 * Twilio Media Streams ↔ OpenAI Realtime API voice bridge.
 *
 * Pattern follows Twilio's official sample:
 *   https://github.com/twilio-samples/speech-assistant-openai-realtime-api-node
 *
 * Flow:
 *   1. Twilio places/answers a call and hits POST /incoming-call.
 *   2. We return TwiML that greets the caller and <Connect>s a bidirectional
 *      Media Stream to wss://<host>/media-stream.
 *   3. /media-stream opens a WebSocket to the OpenAI Realtime API and pipes
 *      audio both ways (g711 μ-law 8kHz in BOTH directions — see note below).
 *   4. OpenAI function calls are executed locally and the results returned so
 *      the model can continue the conversation.
 *
 * Audio formats: Twilio sends/expects G.711 μ-law 8kHz base64 frames. Rather
 * than resample to PCM16 24kHz ourselves, we tell OpenAI to use 'g711_ulaw'
 * for both input_audio_format and output_audio_format — the Realtime API then
 * consumes and emits μ-law directly, so frames pass through untouched.
 */

const PORT = Number(process.env.PORT_VOICE ?? process.env.VOICE_PORT ?? 5050);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const MODEL = process.env.VOICE_MODEL ?? 'gpt-4o-mini-realtime-preview';
const VOICE = process.env.VOICE_ID ?? 'ash';
const TEMPERATURE = Number(process.env.VOICE_TEMPERATURE ?? 0.8);

// The fixed greeting Twilio speaks (via its own TTS) before the stream connects.
const TWIML_GREETING =
  'Hello, this is the AI assistant from TRP Rentals. How can I help you today?';

// Base system prompt (derived from WORKFLOW.md). [AGENT_NAME]/[ADDRESSES] are
// substituted per-call from Twilio <Stream> custom parameters when present.
const AI_NAME = process.env.AI_AGENT_NAME ?? 'Marcus';

function buildInstructions(agentName: string, propertyAddresses: string): string {
  return `You are an AI calling assistant for TRP, a Canadian rental brokerage. You are making outbound calls to listing agents to confirm property availability for upcoming showings.

Your workflow:
1. Introduce yourself: "Hi ${agentName}, this is ${AI_NAME} calling from TRP."
2. State the purpose: "I wanted to connect about your listing(s) at ${propertyAddresses}. Is the property still available for showing?"
3. If available: Ask about any registered offers, pet policies, and any special remarks or conditions.
4. If not available: Confirm the reason (tenanted, sold, withdrawn) and thank them.
5. Ask if they prefer to continue by call or switch to text for follow-ups.
6. Be professional, concise, and friendly. You represent a legitimate Canadian realty brokerage.

Use your tools as soon as an outcome is clear:
- check_property to load current property details.
- update_showing_status to record availability outcomes (categories: "Pending Showings", "Canceled Showings", "Confirmed Showings").
- schedule_callback when the agent needs a follow-up later.
- send_sms to switch a follow-up to text.
Ask one question at a time, and never read tool names or JSON aloud.`;
}

const DEFAULT_AGENT_NAME = 'there';
const DEFAULT_ADDRESSES = 'your current listing';

// ---------------------------------------------------------------------------
// Tools (OpenAI Realtime function definitions + local handlers)
// ---------------------------------------------------------------------------

const REALTIME_TOOLS = [
  {
    type: 'function',
    name: 'check_property',
    description:
      'Look up the current availability, status, pet policy, and remarks for a property or showing under discussion. Call this near the start of the call.',
    parameters: {
      type: 'object',
      properties: {
        propertyId: { type: 'string', description: 'Property ID, if known' },
        showingId: { type: 'string', description: 'Showing request ID, if known' },
        address: { type: 'string', description: 'Property address, if that is all that is known' },
      },
    },
  },
  {
    type: 'function',
    name: 'update_showing_status',
    description: "Update a showing's category and status once an outcome is clear.",
    parameters: {
      type: 'object',
      properties: {
        showingIds: { type: 'string', description: 'Comma-separated showing IDs' },
        category: {
          type: 'string',
          enum: ['Pending Showings', 'Canceled Showings', 'Confirmed Showings'],
          description: 'Canonical showing category',
        },
        status: { type: 'string', description: 'Exact human-readable status string' },
      },
      required: ['category', 'status'],
    },
  },
  {
    type: 'function',
    name: 'schedule_callback',
    description: 'Record that we should follow up with the listing agent later.',
    parameters: {
      type: 'object',
      properties: {
        callbackAt: { type: 'string', description: 'When to follow up (ISO timestamp or natural language)' },
        reason: { type: 'string', description: 'Why we are calling back' },
        channel: { type: 'string', enum: ['call', 'text'], description: 'Preferred follow-up channel' },
      },
      required: ['callbackAt'],
    },
  },
  {
    type: 'function',
    name: 'send_sms',
    description: 'Send an SMS follow-up to the listing agent (e.g. a confirmation or summary).',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Destination phone number (E.164)' },
        body: { type: 'string', description: 'The message text to send' },
      },
      required: ['body'],
    },
  },
] as const;

/**
 * Execute a tool call from OpenAI. Handlers are stubbed for now — they log what
 * WOULD happen and return a structured result. (check_property → Supabase,
 * update_showing_status → Supabase tools, send_sms → Twilio SMS service.)
 */
async function executeRealtimeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'check_property':
      logger.info('[tool stub] check_property — would query Supabase', { args });
      return {
        ok: true,
        stub: true,
        property: {
          status: 'active',
          petsAllowed: 'unknown',
          remarks: '(stub) wire to Supabase getConversationContext / checkPropertyAvailability',
        },
      };
    case 'update_showing_status':
      logger.info('[tool stub] update_showing_status — would update Supabase showings', { args });
      return { ok: true, stub: true, updated: args };
    case 'schedule_callback':
      logger.info('[tool stub] schedule_callback — would persist a callback', { args });
      return { ok: true, stub: true, scheduled: args };
    case 'send_sms':
      logger.info('[tool stub] send_sms — would send via Twilio SMS service', { args });
      return { ok: true, stub: true, queued: args };
    default:
      logger.warn('unknown tool call from realtime model', { name, args });
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// Event typing (loose — Realtime/Twilio payloads are dynamic JSON)
// ---------------------------------------------------------------------------

interface TwilioMessage {
  event: string;
  media?: { timestamp: number; payload: string };
  start?: { streamSid: string; callSid?: string; customParameters?: Record<string, string> };
  mark?: { name: string };
}

interface RealtimeEvent {
  type: string;
  delta?: string;
  transcript?: string;
  item_id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  [key: string]: unknown;
}

interface TranscriptTurn {
  role: 'user' | 'assistant';
  text: string;
}

interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

async function buildServer() {
  const fastify = Fastify();
  await fastify.register(fastifyFormBody);
  await fastify.register(fastifyWs);

  fastify.get('/', async () => ({ status: 'ok', service: 'twilio-realtime-voice-agent' }));

  // ---- GET /health : config readiness probe ----
  fastify.get('/health', async () => ({
    status: 'ok',
    openai: OPENAI_API_KEY ? 'configured' : 'missing',
    twilio:
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN ? 'configured' : 'missing',
  }));

  // ---- POST /incoming-call : return TwiML that greets + connects the stream ----
  fastify.all('/incoming-call', async (request: FastifyRequest, reply) => {
    const query = (request.query ?? {}) as Record<string, string>;
    const body = (request.body ?? {}) as Record<string, string>;
    const agentName = query.agentName ?? body.agentName ?? DEFAULT_AGENT_NAME;
    const addresses = query.addresses ?? body.addresses ?? DEFAULT_ADDRESSES;
    const host = resolveHost(request, PORT);

    logger.info('incoming-call → returning TwiML', { host, agentName, addresses });
    return reply
      .type('text/xml')
      .send(connectStreamTwiml({ host, agentName, addresses, greeting: TWIML_GREETING }));
  });

  // ---- WS /media-stream : the Twilio ↔ OpenAI bridge ----
  fastify.get('/media-stream', { websocket: true }, (twilioWs: WebSocket) => {
    logger.info('📞 Twilio media stream connected');

    // ---- per-call state ----
    let streamSid: string | null = null;
    let callSid: string | null = null;
    let latestMediaTimestamp = 0;
    let lastAssistantItem: string | null = null;
    let markQueue: string[] = [];
    let responseStartTimestampTwilio: number | null = null;
    let agentName = DEFAULT_AGENT_NAME;
    let addresses = DEFAULT_ADDRESSES;

    // ---- transcript / summary tracking ----
    const callStartedAt = Date.now();
    const transcript: TranscriptTurn[] = [];
    const toolCalls: ToolCallRecord[] = [];
    let userTurns = 0;
    let aiTurns = 0;
    let twilioMediaCount = 0;
    let openAiAudioDeltaCount = 0;
    const seenOpenAiTypes = new Set<string>();
    const seenTwilioTypes = new Set<string>();
    let summaryPrinted = false;

    if (!OPENAI_API_KEY) {
      logger.error('OPENAI_API_KEY is not set — closing media stream');
      twilioWs.close();
      return;
    }

    const openAiWs = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODEL)}`,
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'OpenAI-Beta': 'realtime=v1' } },
    );

    const sendSessionUpdate = (): void => {
      const sessionUpdate = {
        type: 'session.update',
        session: {
          turn_detection: { type: 'server_vad' },
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          voice: VOICE,
          instructions: buildInstructions(agentName, addresses),
          modalities: ['text', 'audio'],
          temperature: TEMPERATURE,
          input_audio_transcription: { model: 'whisper-1' },
          tools: REALTIME_TOOLS,
          tool_choice: 'auto',
        },
      };
      openAiWs.send(JSON.stringify(sessionUpdate));
      logger.info('openai session.update sent', { model: MODEL, voice: VOICE });
    };

    // Make the assistant speak first (outbound calls: AI drives the workflow).
    const sendInitialGreeting = (): void => {
      openAiWs.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: 'Begin the call now: greet the listing agent and start the availability workflow.',
              },
            ],
          },
        }),
      );
      openAiWs.send(JSON.stringify({ type: 'response.create' }));
    };

    const sendMark = (): void => {
      if (!streamSid) return;
      twilioWs.send(JSON.stringify({ event: 'mark', streamSid, mark: { name: 'responsePart' } }));
      markQueue.push('responsePart');
    };

    // Caller spoke over the assistant — truncate the in-flight response & clear Twilio's buffer.
    const handleSpeechStarted = (): void => {
      if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
        const elapsed = latestMediaTimestamp - responseStartTimestampTwilio;
        if (lastAssistantItem) {
          openAiWs.send(
            JSON.stringify({
              type: 'conversation.item.truncate',
              item_id: lastAssistantItem,
              content_index: 0,
              audio_end_ms: Math.max(elapsed, 0),
            }),
          );
        }
        twilioWs.send(JSON.stringify({ event: 'clear', streamSid }));
        markQueue = [];
        lastAssistantItem = null;
        responseStartTimestampTwilio = null;
      }
    };

    const handleFunctionCall = async (evt: RealtimeEvent): Promise<void> => {
      if (!evt.name || !evt.call_id) return;
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(evt.arguments || '{}') as Record<string, unknown>;
      } catch (err) {
        logger.warn('failed to parse tool arguments', {
          name: evt.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      toolCalls.push({ name: evt.name, args: parsed });
      logger.info(`🔧 tool call → ${evt.name}`, { args: parsed });
      const result = await executeRealtimeTool(evt.name, parsed);
      openAiWs.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'function_call_output', call_id: evt.call_id, output: JSON.stringify(result) },
        }),
      );
      // Let the model continue speaking now that it has the tool result.
      openAiWs.send(JSON.stringify({ type: 'response.create' }));
    };

    const printCallSummary = (): void => {
      if (summaryPrinted) return;
      summaryPrinted = true;
      const durationSec = ((Date.now() - callStartedAt) / 1000).toFixed(1);
      const bar = '═'.repeat(64);
      const lines: string[] = [
        '',
        bar,
        '📋 CALL SUMMARY',
        bar,
        `Call SID     : ${callSid ?? '(unknown)'}`,
        `Stream SID   : ${streamSid ?? '(unknown)'}`,
        `Duration     : ${durationSec}s`,
        `Turns        : agent spoke ${userTurns}×, AI spoke ${aiTurns}×`,
        `Tool calls   : ${toolCalls.length ? toolCalls.map((t) => t.name).join(', ') : 'none'}`,
        `Audio frames : ${twilioMediaCount} inbound (Twilio), ${openAiAudioDeltaCount} outbound (OpenAI)`,
        '',
        '── Transcript ──',
      ];
      if (transcript.length === 0) {
        lines.push('  (no transcribed turns captured)');
      } else {
        for (const t of transcript) {
          lines.push(`  ${t.role === 'user' ? '👤 Agent' : '🤖 AI'}: ${t.text}`);
        }
      }
      if (toolCalls.length) {
        lines.push('', '── Tool calls ──');
        for (const tc of toolCalls) {
          lines.push(`  🔧 ${tc.name}(${JSON.stringify(tc.args)})`);
        }
      }
      lines.push(bar, '');
      // Print as a single block so it stays together in the console.
      // eslint-disable-next-line no-console
      console.log(lines.join('\n'));
    };

    // ---- OpenAI Realtime socket ----
    openAiWs.on('open', () => {
      logger.info('🔌 connected to OpenAI Realtime API');
      // Small delay lets the session settle before we configure it.
      setTimeout(() => {
        sendSessionUpdate();
        sendInitialGreeting();
      }, 250);
    });

    openAiWs.on('message', (raw: WebSocket.RawData) => {
      let evt: RealtimeEvent;
      try {
        evt = JSON.parse(raw.toString()) as RealtimeEvent;
      } catch (err) {
        logger.warn('non-JSON message from OpenAI', {
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      // Log every event type. High-frequency .delta streams are logged once then
      // counted, so the log shows every type without flooding.
      if (evt.type.endsWith('.delta')) {
        if (evt.type === 'response.audio.delta') openAiAudioDeltaCount += 1;
        if (!seenOpenAiTypes.has(evt.type)) logger.info(`openai ▸ ${evt.type} (streaming; counted)`);
      } else {
        logger.info(`openai ▸ ${evt.type}`);
      }
      seenOpenAiTypes.add(evt.type);

      if (evt.type === 'error') {
        logger.error('openai realtime error', { event: evt });
      }

      // Stream assistant audio back to Twilio.
      if (evt.type === 'response.audio.delta' && typeof evt.delta === 'string') {
        twilioWs.send(JSON.stringify({ event: 'media', streamSid, media: { payload: evt.delta } }));
        if (responseStartTimestampTwilio == null) {
          responseStartTimestampTwilio = latestMediaTimestamp;
        }
        if (evt.item_id) lastAssistantItem = evt.item_id;
        sendMark();
      }

      // Real-time transcript: assistant (full utterance).
      if (evt.type === 'response.audio_transcript.done' && typeof evt.transcript === 'string') {
        const text = evt.transcript.trim();
        if (text) {
          aiTurns += 1;
          transcript.push({ role: 'assistant', text });
          logger.info(`🤖 AI: ${text}`);
        }
      }

      // Real-time transcript: caller (Whisper transcription of inbound audio).
      if (
        evt.type === 'conversation.item.input_audio_transcription.completed' &&
        typeof evt.transcript === 'string'
      ) {
        const text = evt.transcript.trim();
        if (text) {
          userTurns += 1;
          transcript.push({ role: 'user', text });
          logger.info(`👤 Agent: ${text}`);
        }
      }

      if (evt.type === 'input_audio_buffer.speech_started') {
        handleSpeechStarted();
      }

      // Function calling: this event carries name + call_id + arguments.
      if (evt.type === 'response.function_call_arguments.done') {
        void handleFunctionCall(evt);
      }
    });

    openAiWs.on('close', () => logger.info('🔌 OpenAI Realtime socket closed'));
    openAiWs.on('error', (err: Error) =>
      logger.error('OpenAI Realtime socket error', { message: err.message }),
    );

    // ---- Twilio media socket ----
    twilioWs.on('message', (raw: WebSocket.RawData) => {
      let data: TwilioMessage;
      try {
        data = JSON.parse(raw.toString()) as TwilioMessage;
      } catch (err) {
        logger.warn('non-JSON message from Twilio', {
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      // Log every Twilio event type (media frames logged once then counted).
      if (data.event === 'media') {
        twilioMediaCount += 1;
        if (!seenTwilioTypes.has('media')) logger.info('twilio ▸ media (frames follow; counted)');
      } else {
        logger.info(`twilio ▸ ${data.event}`);
      }
      seenTwilioTypes.add(data.event);

      switch (data.event) {
        case 'media':
          latestMediaTimestamp = data.media?.timestamp ?? latestMediaTimestamp;
          if (openAiWs.readyState === WebSocket.OPEN && data.media?.payload) {
            openAiWs.send(
              JSON.stringify({ type: 'input_audio_buffer.append', audio: data.media.payload }),
            );
          }
          break;
        case 'start':
          streamSid = data.start?.streamSid ?? null;
          callSid = data.start?.callSid ?? null;
          responseStartTimestampTwilio = null;
          latestMediaTimestamp = 0;
          if (data.start?.customParameters) {
            agentName = data.start.customParameters.agentName ?? agentName;
            addresses = data.start.customParameters.addresses ?? addresses;
            // Re-send instructions personalized for this call if the socket is ready.
            if (openAiWs.readyState === WebSocket.OPEN) sendSessionUpdate();
          }
          logger.info('▶️  Twilio stream started', { streamSid, callSid, agentName, addresses });
          break;
        case 'mark':
          if (markQueue.length) markQueue.shift();
          break;
        case 'stop':
          logger.info('⏹️  Twilio stream stopped', { streamSid });
          break;
        default:
          break;
      }
    });

    twilioWs.on('close', () => {
      logger.info('📴 Twilio media stream disconnected');
      printCallSummary();
      if (openAiWs.readyState === WebSocket.OPEN || openAiWs.readyState === WebSocket.CONNECTING) {
        openAiWs.close();
      }
    });

    twilioWs.on('error', (err: Error) =>
      logger.error('Twilio media socket error', { message: err.message }),
    );
  });

  // Outbound calling system: /outbound-call, /call-status, /api/call/initiate.
  registerOutboundRoutes(fastify, { port: PORT });

  return fastify;
}

function printStartupBanner(address: string): void {
  const serverUrl = process.env.SERVER_URL?.replace(/\/$/, '');
  const twilioNumber = process.env.TWILIO_PHONE_NUMBER;
  const bar = '═'.repeat(64);
  const lines = [
    '',
    bar,
    `🎙️  TRP voice agent — server running on port ${PORT}  (${address})`,
    `🌐 Expected public URL : ${serverUrl ?? '(not set — run `pnpm dev` to start ngrok, or set SERVER_URL)'}`,
    `🔗 Twilio voice webhook: ${(serverUrl ?? '<SERVER_URL>')}/incoming-call`,
    `📞 Call your Twilio number to test: ${twilioNumber ?? '(set TWILIO_PHONE_NUMBER in .env)'}`,
    '',
    `   1) pnpm dev                         → start ngrok + this agent`,
    `   2) pnpm twilio:configure <ngrokUrl> → point your number's webhook here`,
    `   3) Call ${twilioNumber ?? 'your Twilio number'} from any phone`,
    bar,
    '',
  ];
  lines.forEach((l) => logger.info(l));
}

buildServer()
  .then((fastify) =>
    fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
      if (err) {
        logger.error('voice agent failed to start', { message: err.message });
        process.exit(1);
      }
      printStartupBanner(address);
    }),
  )
  .catch((err: unknown) => {
    logger.error('voice agent boot error', {
      message: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
