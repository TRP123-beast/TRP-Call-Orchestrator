// Per-call conversation memory for the chained voice pipeline.
//
// Holds the running dialogue history keyed by Twilio callSid, generates the AI's
// next reply via Forge/Qwen3 (NOT api.openai.com), and persists the full
// transcript to Supabase when the call ends.
import { askForge, type ChatTurn } from '../services/llm';
import { logCall } from '../services/supabase';
import { logger } from '../lib/logger';
import type { CallType } from '../models/database';

/**
 * Voice system prompt. Note: askForge() appends "\n/no_think" to whatever system
 * prompt it's given, so the prompt that actually reaches Forge ends with
 * "\n/no_think" exactly once — we do NOT add it here to avoid duplication.
 */
export const VOICE_SYSTEM_PROMPT =
  'You are a voice AI assistant for TRP (Nestr Realty), a Canadian rental ' +
  'brokerage. You are on a live phone call. Keep responses under 3 sentences. ' +
  'Never use markdown or formatting. Be natural and conversational.';

interface CallSession {
  callSid: string;
  history: ChatTurn[]; // user/assistant turns only (system is added per request)
  startedAt: number;
  agentName?: string;
  callType: CallType;
  agentId?: string;
  propertyIds?: string[];
  saved: boolean;
}

const sessions = new Map<string, CallSession>();

export interface StartCallOptions {
  agentName?: string;
  callType?: CallType;
  agentId?: string;
  propertyIds?: string[];
}

/** Begin (or reset) the conversation for a call. */
export function startCall(callSid: string, opts: StartCallOptions = {}): CallSession {
  const session: CallSession = {
    callSid,
    history: [],
    startedAt: Date.now(),
    agentName: opts.agentName,
    callType: opts.callType ?? 'inbound',
    agentId: opts.agentId,
    propertyIds: opts.propertyIds,
    saved: false,
  };
  sessions.set(callSid, session);
  return session;
}

function getSession(callSid: string): CallSession {
  let s = sessions.get(callSid);
  if (!s) s = startCall(callSid);
  return s;
}

/** Tailor the system prompt with the agent's name when we know it. */
function systemPromptFor(session: CallSession): string {
  if (session.agentName && session.agentName !== 'there') {
    return `${VOICE_SYSTEM_PROMPT} You are speaking with ${session.agentName}.`;
  }
  return VOICE_SYSTEM_PROMPT;
}

/**
 * Generate the AI's spoken reply to the caller's latest utterance, updating the
 * conversation history. Returns the reply text (to be sent to TTS).
 */
export async function generateReply(callSid: string, userText: string): Promise<string> {
  const session = getSession(callSid);
  const priorHistory = [...session.history];

  const reply = await askForge(systemPromptFor(session), userText, {
    history: priorHistory,
    maxTokens: 150, // keep it short — it's a phone call
    temperature: 0.6,
  });

  const clean = sanitizeForSpeech(reply);
  session.history.push({ role: 'user', content: userText });
  session.history.push({ role: 'assistant', content: clean });
  return clean;
}

/**
 * Produce the opening line for outbound calls (AI speaks first). Records it as
 * the first assistant turn so the model has continuity.
 */
export async function generateGreeting(callSid: string): Promise<string> {
  const session = getSession(callSid);
  const who = session.agentName && session.agentName !== 'there' ? session.agentName : 'there';
  const prompt =
    `Begin the call: greet ${who} warmly, introduce yourself as the assistant ` +
    `from TRP (Nestr Realty), and ask how you can help. One or two sentences.`;

  let greeting: string;
  try {
    greeting = sanitizeForSpeech(
      await askForge(systemPromptFor(session), prompt, { maxTokens: 80, temperature: 0.6 }),
    );
  } catch (err) {
    logger.warn('greeting generation failed — using fallback line', {
      message: err instanceof Error ? err.message : String(err),
    });
    greeting = `Hi ${who}, this is the assistant from TRP, Nestr Realty. How can I help you today?`;
  }

  session.history.push({ role: 'assistant', content: greeting });
  return greeting;
}

/** Strip markdown/formatting artifacts that don't belong in spoken audio. */
function sanitizeForSpeech(text: string): string {
  return text
    .replace(/[*_`#>]+/g, '') // markdown emphasis / headings / code ticks
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whether we have an active session for this call. */
export function hasSession(callSid: string): boolean {
  return sessions.has(callSid);
}

/**
 * End the call: persist the full transcript to Supabase (best-effort) and drop
 * the in-memory session. Safe to call more than once.
 */
export async function endCall(callSid: string): Promise<void> {
  const session = sessions.get(callSid);
  if (!session || session.saved) {
    sessions.delete(callSid);
    return;
  }
  session.saved = true;

  const durationSeconds = Math.round((Date.now() - session.startedAt) / 1000);
  const transcript = session.history
    .map((t) => `${t.role === 'user' ? 'Caller' : 'AI'}: ${t.content}`)
    .join('\n');

  try {
    await logCall({
      listing_agent_id: session.agentId ?? null,
      property_ids: session.propertyIds ?? [],
      call_type: session.callType,
      status: 'completed',
      transcript: transcript || null,
      duration_seconds: durationSeconds,
    });
    logger.info('💾 call transcript saved', { callSid, turns: session.history.length, durationSeconds });
  } catch (err) {
    logger.warn('call transcript save skipped', {
      callSid,
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    sessions.delete(callSid);
  }
}
