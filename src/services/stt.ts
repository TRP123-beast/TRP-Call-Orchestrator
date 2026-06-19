// Speech-to-Text client — Whisper on the GPU server (STT_SERVER_URL, port 3000).
//
// The pipeline hands us a WAV buffer (16-bit PCM, 8 kHz). We upload it as
// multipart/form-data, which is what OpenAI-compatible Whisper servers
// (/v1/audio/transcriptions) and most self-hosted variants (whisper-asr,
// faster-whisper-server, whisper.cpp /inference) accept.
//
// Because the exact server contract wasn't reachable when this was written,
// everything is env-overridable so it adapts without code changes:
//   STT_SERVER_URL        base URL              (default http://66.179.10.109:3000)
//   STT_TRANSCRIBE_PATH   transcription path    (default /v1/audio/transcriptions)
//   STT_FIELD_NAME        file form-field name  (default "file")
//   STT_MODEL             model name to request (default "whisper-1")
//   STT_RAW              "true" → POST the raw buffer instead of multipart
import { logger } from '../lib/logger';

const STT_SERVER_URL = (process.env.STT_SERVER_URL || 'http://66.179.10.109:3000').replace(/\/$/, '');
const STT_TRANSCRIBE_PATH = process.env.STT_TRANSCRIBE_PATH || '/v1/audio/transcriptions';
const STT_FIELD_NAME = process.env.STT_FIELD_NAME || 'file';
const STT_MODEL = process.env.STT_MODEL || 'whisper-1';
const STT_RAW = process.env.STT_RAW === 'true';
const STT_TIMEOUT_MS = Number(process.env.STT_TIMEOUT_MS ?? 60_000);
// The whisper_api server exposes /status (not /api/health). Configurable.
const STT_HEALTH_PATH = process.env.STT_HEALTH_PATH || '/status';

const transcribeUrl = `${STT_SERVER_URL}${STT_TRANSCRIBE_PATH.startsWith('/') ? '' : '/'}${STT_TRANSCRIBE_PATH}`;

export interface TranscribeOptions {
  /** Filename hint sent with multipart uploads. */
  filename?: string;
  /** MIME type of the audio buffer. */
  contentType?: string;
}

/**
 * Transcribe an audio buffer (a WAV file by default) to text. Returns '' if the
 * server produced nothing usable; throws only on network/HTTP errors.
 */
export async function transcribe(audio: Buffer, opts: TranscribeOptions = {}): Promise<string> {
  const contentType = opts.contentType ?? 'audio/wav';
  const filename = opts.filename ?? 'audio.wav';

  const res = STT_RAW
    ? await postRaw(audio, contentType)
    : await postMultipart(audio, filename, contentType);

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`STT HTTP ${res.status} ${res.statusText} ${detail.slice(0, 200)}`);
  }

  const text = await extractText(res);
  logger.info('📝 STT transcription', { chars: text.length, preview: text.slice(0, 80) });
  return text;
}

// Multipart upload (OpenAI-compatible + most self-hosted Whisper servers).
async function postMultipart(audio: Buffer, filename: string, contentType: string): Promise<Response> {
  const form = new FormData();
  // Node 20 has global Blob/FormData/fetch (undici). Wrap in Uint8Array so the
  // Web Blob type accepts it (a Node Buffer isn't a BlobPart under DOM libs).
  form.append(STT_FIELD_NAME, new Blob([new Uint8Array(audio)], { type: contentType }), filename);
  form.append('model', STT_MODEL);
  form.append('response_format', 'json');
  return fetch(transcribeUrl, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(STT_TIMEOUT_MS),
  });
}

// Raw-body upload (for servers that accept the audio bytes directly).
async function postRaw(audio: Buffer, contentType: string): Promise<Response> {
  return fetch(transcribeUrl, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: new Uint8Array(audio),
    signal: AbortSignal.timeout(STT_TIMEOUT_MS),
  });
}

// Accept the common response shapes: {text}, {transcription}, {result}, or plain text.
async function extractText(res: Response): Promise<string> {
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const data = (await res.json()) as Record<string, unknown>;
    const candidate =
      (data.text as string) ??
      (data.transcription as string) ??
      (data.result as string) ??
      (typeof data.data === 'object' && data.data !== null
        ? ((data.data as Record<string, unknown>).text as string)
        : undefined);
    return (candidate ?? '').toString().trim();
  }
  return (await res.text()).trim();
}

/** Lightweight reachability check used by the dashboard health probe. */
export async function checkSttHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${STT_SERVER_URL}${STT_HEALTH_PATH}`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
