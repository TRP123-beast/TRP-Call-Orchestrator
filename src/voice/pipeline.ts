import 'dotenv/config';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import fastifyFormBody from '@fastify/formbody';
import fastifyWs from '@fastify/websocket';
import type WebSocket from 'ws';
import { logger } from '../lib/logger';
import { connectStreamTwiml, resolveHost } from './twiml';
import { registerOutboundRoutes } from './outbound-caller';
import { transcribe, checkSttHealth } from '../services/stt';
import { textToSpeech, TTS_SAMPLE_RATE } from '../services/tts';
import {
  startCall,
  generateReply,
  generateGreeting,
  endCall,
} from './conversation';
import { liveCalls } from '../services/liveCalls';
import {
  mulawToPcm,
  pcmToMulaw,
  bufferToWav,
  mulawFrameEnergy,
} from './audio-utils';

/**
 * Chained voice pipeline (NO OpenAI Realtime API):
 *
 *   Caller speaks → Twilio Media Streams (μ-law 8kHz over WebSocket)
 *     → buffer audio → energy-based VAD detects end-of-utterance (1.5s silence)
 *     → μ-law→PCM→WAV → Whisper (STT)            [self-hosted, port 3000]
 *     → transcript → Forge/Qwen3 (LLM)           [self-hosted, /no_think]
 *     → reply text → Kokoro (TTS) → PCM 24kHz     [self-hosted, port 8880]
 *     → PCM 24kHz→μ-law 8kHz → Twilio media frames → caller hears the AI
 *
 * Routes:
 *   POST /incoming-call  TwiML <Connect><Stream> with NO <Say> (caller speaks first)
 *   POST /outbound-call  provided by registerOutboundRoutes (AI greets first via greetFirst)
 *   WS   /media-stream   the audio bridge implementing the chain above
 *   GET  /health         readiness probe (STT / LLM / TTS / Twilio)
 */

const PORT = Number(process.env.VOICE_PORT ?? process.env.PORT_VOICE ?? 5050);

// VAD / utterance tuning (all overridable via env).
const SILENCE_MS = Number(process.env.VAD_SILENCE_MS ?? 1500); // end-of-utterance gap
const ENERGY_THRESHOLD = Number(process.env.VAD_ENERGY_THRESHOLD ?? 700); // mean |amplitude|
const MIN_UTTERANCE_MS = Number(process.env.VAD_MIN_UTTERANCE_MS ?? 400); // ignore blips
const VAD_TICK_MS = 200;

// Twilio media framing: μ-law 8kHz → 8 bytes/ms; a 20ms frame is 160 bytes.
const BYTES_PER_MS = 8;
const TWILIO_FRAME_BYTES = 160;

const DEFAULT_AGENT_NAME = 'there';

interface TwilioMessage {
  event: string;
  media?: { timestamp: number; payload: string };
  start?: { streamSid: string; callSid?: string; customParameters?: Record<string, string> };
  mark?: { name: string };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export async function buildVoiceServer(): Promise<FastifyInstance> {
  const fastify = Fastify();
  await fastify.register(fastifyFormBody);
  await fastify.register(fastifyWs);

  fastify.get('/', async () => ({ status: 'ok', service: 'trp-voice-pipeline' }));

  // ---- GET /health : readiness of the self-hosted stack ----
  fastify.get('/health', async () => {
    const stt = (await checkSttHealth()) ? 'reachable' : 'unreachable';
    return {
      status: 'ok',
      stt,
      llm: process.env.FORGE_URL ? 'configured' : 'default',
      tts: process.env.TTS_SERVER_URL || process.env.TTS_URL ? 'configured' : 'default',
      twilio:
        process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN ? 'configured' : 'missing',
    };
  });

  // ---- POST /incoming-call : NO <Say> — kills Twilio's generic greeting ----
  fastify.all('/incoming-call', async (request: FastifyRequest, reply) => {
    const query = (request.query ?? {}) as Record<string, string>;
    const body = (request.body ?? {}) as Record<string, string>;
    const agentName = query.agentName ?? body.agentName ?? DEFAULT_AGENT_NAME;
    const addresses = query.addresses ?? body.addresses ?? 'your current listing';
    const host = resolveHost(request, PORT);

    logger.info('📲 incoming-call → connecting media stream (no Say)', { host, agentName });
    // Caller speaks first → no greetFirst.
    return reply.type('text/xml').send(connectStreamTwiml({ host, agentName, addresses }));
  });

  // ---- WS /media-stream : Twilio ⇆ chained AI bridge ----
  fastify.get('/media-stream', { websocket: true }, (twilioWs: WebSocket) => {
    handleMediaStream(twilioWs);
  });

  // Outbound calling system: /outbound-call (greetFirst), /call-status, /api/call/initiate.
  registerOutboundRoutes(fastify, { port: PORT });

  return fastify;
}

// ---------------------------------------------------------------------------
// Media-stream handler (one per call)
// ---------------------------------------------------------------------------

function handleMediaStream(twilioWs: WebSocket): void {
  logger.info('📞 Twilio media stream connected');

  // ---- per-call state ----
  let streamSid: string | null = null;
  let callSid = `stream-${Date.now()}`; // replaced by Twilio's callSid on 'start'
  let agentName = DEFAULT_AGENT_NAME;
  let greetFirst = false;

  // utterance buffering + VAD
  let utterance: Buffer[] = [];
  let speaking = false;
  let lastVoiceTs = 0;
  let processing = false; // STT→LLM→TTS chain running
  let aiSpeaking = false; // streaming TTS back; ignore inbound (half-duplex)
  let closed = false;

  const send = (obj: unknown): void => {
    if (twilioWs.readyState === twilioWs.OPEN) twilioWs.send(JSON.stringify(obj));
  };

  const resetUtterance = (): void => {
    utterance = [];
    speaking = false;
  };

  // Stream a TTS PCM buffer back to Twilio as μ-law media frames, then a mark.
  const speak = (pcm24k: Buffer): void => {
    if (closed) return;
    const mulaw = pcmToMulaw(pcm24k, TTS_SAMPLE_RATE, 8000);
    aiSpeaking = true;
    for (let off = 0; off < mulaw.length; off += TWILIO_FRAME_BYTES) {
      const frame = mulaw.subarray(off, off + TWILIO_FRAME_BYTES);
      send({ event: 'media', streamSid, media: { payload: frame.toString('base64') } });
    }
    // Mark lets us know when Twilio finished playing — then we resume listening.
    send({ event: 'mark', streamSid, mark: { name: 'ai-done' } });

    // Fallback: if the mark echo is missed, clear aiSpeaking after the audio
    // would have finished playing (frames are 20ms each) plus a small buffer.
    const estimatedMs = (mulaw.length / BYTES_PER_MS) + 800;
    setTimeout(() => {
      if (!closed && aiSpeaking) {
        aiSpeaking = false;
        resetUtterance();
      }
    }, estimatedMs).unref();
  };

  // Run the full STT→LLM→TTS chain on the buffered utterance.
  const processUtterance = async (): Promise<void> => {
    const mulaw = Buffer.concat(utterance);
    resetUtterance();
    const durationMs = mulaw.length / BYTES_PER_MS;
    if (durationMs < MIN_UTTERANCE_MS) {
      processing = false;
      return; // too short — likely a cough/click
    }

    try {
      // μ-law 8kHz → PCM16 8kHz → WAV → Whisper
      const pcm = mulawToPcm(mulaw);
      const wav = bufferToWav(pcm, 8000, 1);
      const transcript = (await transcribe(wav)).trim();
      if (!transcript) {
        logger.info('🔇 empty transcription — waiting for more speech', { callSid });
        processing = false;
        return;
      }
      logger.info(`👤 Caller: ${transcript}`, { callSid });
      liveCalls.addLine(callSid, 'caller', transcript);

      // transcript → Forge (with history) → reply text
      const reply = await generateReply(callSid, transcript);
      logger.info(`🤖 AI: ${reply}`, { callSid });
      liveCalls.addLine(callSid, 'ai', reply);

      // reply → Kokoro TTS → PCM → speak back
      const pcmOut = await textToSpeech(reply);
      speak(pcmOut);
    } catch (err) {
      logger.error('pipeline turn failed', {
        callSid,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      processing = false;
    }
  };

  // Periodic VAD: end-of-utterance when we've heard speech then SILENCE_MS of quiet.
  const vad = setInterval(() => {
    if (closed || processing || aiSpeaking || !speaking) return;
    if (Date.now() - lastVoiceTs >= SILENCE_MS && utterance.length > 0) {
      processing = true;
      void processUtterance();
    }
  }, VAD_TICK_MS);

  twilioWs.on('message', (raw: WebSocket.RawData) => {
    let msg: TwilioMessage;
    try {
      msg = JSON.parse(raw.toString()) as TwilioMessage;
    } catch {
      return;
    }

    switch (msg.event) {
      case 'start': {
        streamSid = msg.start?.streamSid ?? null;
        callSid = msg.start?.callSid ?? callSid;
        const params = msg.start?.customParameters ?? {};
        agentName = params.agentName ?? agentName;
        greetFirst = params.greetFirst === 'true';
        startCall(callSid, {
          agentName,
          callType: greetFirst ? 'outbound_agent' : 'inbound',
        });
        liveCalls.start(callSid, { agentName });
        logger.info('▶️  stream started', { streamSid, callSid, agentName, greetFirst });

        // Outbound: AI speaks first.
        if (greetFirst) {
          processing = true;
          void generateGreeting(callSid)
            .then((greeting) => {
              liveCalls.addLine(callSid, 'ai', greeting);
              return textToSpeech(greeting);
            })
            .then((pcm) => speak(pcm))
            .catch((err: unknown) =>
              logger.error('greeting failed', {
                message: err instanceof Error ? err.message : String(err),
              }),
            )
            .finally(() => {
              processing = false;
            });
        }
        break;
      }

      case 'media': {
        // Half-duplex: ignore inbound audio while thinking or speaking.
        if (processing || aiSpeaking || !msg.media?.payload) break;
        const frame = Buffer.from(msg.media.payload, 'base64');
        const energy = mulawFrameEnergy(frame);
        if (energy >= ENERGY_THRESHOLD) {
          speaking = true;
          lastVoiceTs = Date.now();
          utterance.push(frame);
        } else if (speaking) {
          // Trailing/inter-word silence — keep it; VAD trims via the timer.
          utterance.push(frame);
        }
        break;
      }

      case 'mark':
        // Twilio finished playing our TTS → resume listening.
        if (msg.mark?.name === 'ai-done') {
          aiSpeaking = false;
          resetUtterance();
          lastVoiceTs = Date.now();
        }
        break;

      case 'stop':
        logger.info('⏹️  stream stopped', { streamSid, callSid });
        break;

      default:
        break;
    }
  });

  twilioWs.on('close', () => {
    closed = true;
    clearInterval(vad);
    logger.info('📴 media stream disconnected', { callSid });
    liveCalls.end(callSid);
    void endCall(callSid);
  });

  twilioWs.on('error', (err: Error) => {
    logger.error('Twilio media socket error', { callSid, message: err.message });
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function printBanner(address: string): void {
  const serverUrl = process.env.SERVER_URL?.replace(/\/$/, '');
  const bar = '═'.repeat(64);
  [
    '',
    bar,
    `🎙️  TRP chained voice pipeline — listening on ${address}`,
    `   STT : ${process.env.STT_SERVER_URL ?? 'http://66.179.10.109:3000'} (Whisper)`,
    `   LLM : ${process.env.FORGE_URL ?? 'http://66.179.10.109:8000/v1'} (Forge/Qwen3)`,
    `   TTS : ${process.env.TTS_SERVER_URL ?? process.env.TTS_URL ?? 'http://66.179.10.109:8880'} (Kokoro)`,
    `🔗 Twilio voice webhook: ${(serverUrl ?? '<SERVER_URL>')}/incoming-call`,
    bar,
    '',
  ].forEach((l) => logger.info(l));
}

/**
 * Build + start the voice server. Used by src/index.ts to run it alongside
 * Express. Never throws — logs and resolves false on failure so the dashboard
 * keeps running even if the voice port is unavailable.
 */
export async function startVoiceServer(): Promise<boolean> {
  try {
    const fastify = await buildVoiceServer();
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    printBanner(`port ${PORT}`);
    return true;
  } catch (err) {
    logger.error('voice pipeline failed to start', {
      message: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// Standalone: `pnpm dev:voice` (tsx src/voice/pipeline.ts).
if (require.main === module) {
  void startVoiceServer().then((ok) => {
    if (!ok) process.exit(1);
  });
}
