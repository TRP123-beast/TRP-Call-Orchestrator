// Text-to-Speech client — Kokoro, served with an OpenAI-compatible API on our
// GPU server. We point the OpenAI SDK at it; no requests go to api.openai.com.
//
// Returns raw PCM (16-bit, 24 kHz, mono) so the voice pipeline can resample to
// 8 kHz and μ-law-encode it for Twilio (see src/voice/audio-utils.ts).
import OpenAI from 'openai';
import { logger } from '../lib/logger';

// .env uses TTS_SERVER_URL (no /v1). Support both TTS_URL and TTS_SERVER_URL.
const TTS_BASE_URL =
  process.env.TTS_URL ||
  (process.env.TTS_SERVER_URL
    ? `${process.env.TTS_SERVER_URL.replace(/\/$/, '')}/v1`
    : 'http://66.179.10.109:8880/v1');

const tts = new OpenAI({
  baseURL: TTS_BASE_URL,
  apiKey: 'not-needed', // Kokoro ignores it; the SDK requires a non-empty value
  timeout: 60_000,
});

export const TTS_MODEL = process.env.TTS_MODEL || 'kokoro';
export const TTS_VOICE = process.env.TTS_VOICE || 'af_heart';

/** Native sample rate of Kokoro's PCM output (24 kHz, 16-bit mono). */
export const TTS_SAMPLE_RATE = 24000;

/**
 * Synthesize speech for `text`. Returns raw PCM (16-bit LE, 24 kHz, mono) as a
 * Buffer, ready for resampling + μ-law encoding before Twilio playback.
 */
export async function textToSpeech(
  text: string,
  voice: string = TTS_VOICE,
): Promise<Buffer> {
  const response = await tts.audio.speech.create({
    model: TTS_MODEL,
    voice,
    input: text,
    response_format: 'pcm', // raw PCM 24 kHz 16-bit for Twilio conversion
  });
  const buf = Buffer.from(await response.arrayBuffer());
  logger.info('🗣️  TTS synthesized', { chars: text.length, bytes: buf.length, voice });
  return buf;
}
