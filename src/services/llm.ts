// Centralized Forge/LLM client — ALL LLM calls go through here.
//
// Forge is our self-hosted Qwen3-32B model served by vLLM with an
// OpenAI-compatible API on our GPU server. We point the OpenAI SDK at it; no
// requests ever go to api.openai.com from this module. (OpenAI is only used
// elsewhere for voice TTS — never for text understanding.)
//
// Note: every system prompt gets "\n/no_think" appended to disable Qwen3's
// internal thinking mode (saves hidden tokens + latency).
import OpenAI from 'openai';
import { logger } from '../lib/logger';

export const forge = new OpenAI({
  baseURL: process.env.FORGE_URL || 'http://66.179.10.109:8000/v1',
  // The Forge server enforces auth — FORGE_API_KEY must be the real key from .env.
  // ('dummy' is only a last-resort fallback so the SDK can construct.)
  apiKey: process.env.FORGE_API_KEY || 'dummy',
  timeout: 180_000, // 32B model inference is slow — allow 180s per pipeline spec
});

// Model name as served by vLLM (matches FORGE_MODEL in .env).
export const FORGE_MODEL = process.env.FORGE_MODEL || 'forge';
export const TRP_WRAPPER_URL = process.env.TRP_WRAPPER_URL || 'http://66.179.10.109:5000';

export type ChatTurn = { role: 'system' | 'user' | 'assistant'; content: string };

export interface AskForgeOptions {
  maxTokens?: number;
  temperature?: number;
  history?: ChatTurn[];
}

/** Get a chat completion from Forge. Appends /no_think to the system prompt. */
export async function askForge(
  systemPrompt: string,
  userMessage: string,
  options?: AskForgeOptions,
): Promise<string> {
  const messages: ChatTurn[] = [
    { role: 'system', content: `${systemPrompt}\n/no_think` },
    ...(options?.history ?? []),
    { role: 'user', content: userMessage },
  ];

  // Disable Qwen3 "thinking" on the vLLM side. Without this, the server emits a
  // separate `reasoning` field and leaves `content` null — and at low max_tokens
  // the reasoning consumes the whole budget, yielding an empty reply. The
  // "/no_think" prompt hint alone is NOT honored by this server; the
  // chat_template_kwargs flag is. We keep both (spec requires /no_think).
  const params = {
    model: FORGE_MODEL,
    messages,
    max_tokens: options?.maxTokens ?? 512,
    temperature: options?.temperature ?? 0.3,
    chat_template_kwargs: { enable_thinking: false },
  };

  const response = await forge.chat.completions.create(
    params as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  );

  return stripThink(response.choices[0]?.message?.content ?? '').trim();
}

/** Defensively remove any inline <think>…</think> blocks from model output. */
function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/** Quick chat via the TRP Wrapper API (Canadian-tenancy system prompt baked in). */
export async function askTRPWrapper(
  message: string,
  endpoint: '/chat' | '/legal' | '/booking' = '/chat',
): Promise<string> {
  const res = await fetch(`${TRP_WRAPPER_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, max_tokens: 512, temperature: 0.3 }),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) throw new Error(`TRP Wrapper error: ${res.status}`);
  const data = (await res.json()) as { response?: string };
  return data.response ?? '';
}

/** Parse unstructured text into structured JSON using Forge. Returns `fallback` on any error. */
export async function parseWithForge<T>(
  text: string,
  parseInstructions: string,
  fallback: T,
): Promise<T> {
  try {
    const result = await askForge(
      `You are a text parser. Extract structured data from the user's message.
${parseInstructions}
Respond with ONLY valid JSON, no markdown, no explanation, no backticks.`,
      text,
      { maxTokens: 256, temperature: 0.1 },
    );

    // Strip any accidental markdown code fences before parsing.
    const cleaned = result.replace(/```json\n?|```\n?/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch (error) {
    logger.warn('parseWithForge failed — using fallback', {
      message: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}
