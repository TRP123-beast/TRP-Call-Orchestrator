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
  apiKey: process.env.FORGE_API_KEY || 'dummy', // vLLM ignores it, SDK requires non-empty
  timeout: 120_000, // 32B model inference can be slow
});

export const FORGE_MODEL = process.env.FORGE_MODEL || 'trp-agent';
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

  const response = await forge.chat.completions.create({
    model: FORGE_MODEL,
    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    max_tokens: options?.maxTokens ?? 512,
    temperature: options?.temperature ?? 0.3,
  });

  return response.choices[0]?.message?.content ?? '';
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
    signal: AbortSignal.timeout(120_000),
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
