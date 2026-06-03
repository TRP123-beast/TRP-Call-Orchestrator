import {
  type JobContext,
  type JobProcess,
  defineAgent,
  llm,
  voice,
} from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import type { TTSVoices } from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { MARCUS_SYSTEM_PROMPT, MARCUS_FIRST_MESSAGE } from './instructions.js';
import {
  checkPropertyAvailability,
  updatePropertyStatus,
  scheduleCallback,
  sendTextMessage,
  logConversation,
} from '../tools/livekitTools.js';

// ---------------------------------------------------------------------------
// Tools (function calling)
// ---------------------------------------------------------------------------

const checkPropertyAvailabilityTool = llm.tool({
  description:
    'Look up the current availability, status, address, pet policy, and remarks for the property/properties or showing(s) under discussion. Call this at the start of the call.',
  parameters: z.object({
    showingIds: z.string().optional().describe('Comma-separated showing request IDs'),
    propertyIds: z.string().optional().describe('Comma-separated property IDs'),
  }),
  execute: async (params) => checkPropertyAvailability(params as Record<string, unknown>),
});

const updatePropertyStatusTool = llm.tool({
  description:
    'Update the showing status in Supabase once an outcome is clear. Category is the canonical bucket; status is the exact human-readable string.',
  parameters: z.object({
    showingIds: z.string().describe('Comma-separated showing IDs to update'),
    category: z
      .enum(['Pending Showings', 'Canceled Showings', 'Confirmed Showings'])
      .describe('Canonical showing category'),
    status: z
      .string()
      .describe('Exact status string, e.g. "Unavailable - Tenanted" or "Temporarily Unavailable - Landlord Reviewing Offer"'),
    releaseSpecialist: z
      .boolean()
      .optional()
      .describe('Release the assigned rental specialist for these showings'),
  }),
  execute: async (params) => updatePropertyStatus(params as Record<string, unknown>),
});

const scheduleCallbackTool = llm.tool({
  description:
    'Record that we should follow up with the listing agent later (e.g. they need time to confirm pets, or asked to be called back).',
  parameters: z.object({
    showingIds: z.string().optional().describe('Comma-separated showing IDs this callback relates to'),
    callbackAt: z.string().describe('When to follow up — ISO timestamp or natural description (e.g. "tomorrow 2pm")'),
    reason: z.string().optional().describe('Why we are calling back'),
    channel: z.enum(['call', 'text']).optional().describe('Preferred follow-up channel (default call)'),
  }),
  execute: async (params) => scheduleCallback(params as Record<string, unknown>),
});

const sendTextMessageTool = llm.tool({
  description:
    'Send an SMS follow-up to the listing agent (e.g. a confirmation or summary). Use when the agent prefers text.',
  parameters: z.object({
    to: z.string().optional().describe('Destination phone number (E.164). Defaults to the configured trial number.'),
    body: z.string().describe('The message text to send'),
    showingId: z.string().optional().describe('Related showing ID, if any'),
  }),
  execute: async (params) => sendTextMessage(params as Record<string, unknown>),
});

const logConversationTool = llm.tool({
  description:
    'Save a transcript or summary of the conversation to Supabase. Use to record the outcome and key points.',
  parameters: z.object({
    showingIds: z.string().optional().describe('Comma-separated showing IDs this conversation relates to'),
    transcript: z.string().optional().describe('Full or partial transcript text'),
    summary: z.string().optional().describe('Short summary of the call'),
    outcome: z.string().optional().describe('Resulting outcome (e.g. "confirmed", "cancelled - tenanted")'),
  }),
  execute: async (params) => logConversation(params as Record<string, unknown>),
});

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export class MarcusAgent extends voice.Agent {
  constructor() {
    super({
      instructions: MARCUS_SYSTEM_PROMPT,
      tools: {
        check_property_availability: checkPropertyAvailabilityTool,
        update_property_status: updatePropertyStatusTool,
        schedule_callback: scheduleCallbackTool,
        send_text_message: sendTextMessageTool,
        log_conversation: logConversationTool,
      },
    });
  }
}

// STT: OpenAI Whisper · LLM: OpenAI GPT-4o · TTS: OpenAI ("ash") · VAD: Silero
function createSession(ctx: JobContext): voice.AgentSession {
  return new voice.AgentSession({
    vad: ctx.proc.userData.vad as silero.VAD,
    stt: new openai.STT({ model: 'whisper-1', language: 'en' }),
    llm: new openai.LLM({ model: 'gpt-4o' }),
    tts: new openai.TTS({
      model: 'gpt-4o-mini-tts',
      voice: (process.env.LIVEKIT_TTS_VOICE_ID ?? 'ash') as TTSVoices,
    }),
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    const transcript: string[] = [];
    let persisted = false;

    // Persist the captured transcript exactly once (on close or shutdown).
    const persistTranscript = async (outcome: string): Promise<void> => {
      if (persisted) return;
      persisted = true;
      if (!transcript.length) return;
      await logConversation({ transcript: transcript.join('\n'), outcome });
    };

    try {
      await ctx.connect();
      logger.info('agent connected to room', { room: ctx.room.name });

      // Wait for the person being called to join before starting the conversation.
      const participant = await ctx.waitForParticipant();
      logger.info('participant joined; starting conversation', {
        room: ctx.room.name,
        participant: participant.identity,
      });

      const session = createSession(ctx);

      // Build the transcript as items are added.
      session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
        const text = ev.item.textContent;
        if (text) transcript.push(`${ev.item.role}: ${text}`);
      });

      // Log pipeline errors (STT/LLM/TTS) without tearing down the call.
      session.on(voice.AgentSessionEventTypes.Error, (ev) => {
        logger.error('agent session error', {
          room: ctx.room.name,
          error: ev.error instanceof Error ? ev.error.message : String(ev.error),
        });
      });

      // Call drop / normal end: save the transcript best-effort.
      session.on(voice.AgentSessionEventTypes.Close, (ev) => {
        logger.info('session closed', { room: ctx.room.name, reason: String(ev.reason) });
        void persistTranscript(String(ev.reason));
      });

      // Final safety net on worker shutdown / abrupt disconnect.
      ctx.addShutdownCallback(async () => {
        await persistTranscript('shutdown');
      });

      await session.start({
        agent: new MarcusAgent(),
        room: ctx.room,
      });

      // Open the conversation following the WORKFLOW.md greeting.
      await session.generateReply({
        instructions: `Greet the listing agent naturally, in your own words, opening with: "${MARCUS_FIRST_MESSAGE}"`,
      });
    } catch (err) {
      logger.error('agent entry failed', {
        room: ctx.room?.name,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      await persistTranscript('error');
      throw err;
    }
  },
});
