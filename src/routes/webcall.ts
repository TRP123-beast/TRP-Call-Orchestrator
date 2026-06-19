import { Router, type Request, type Response } from 'express';
import { transcribe } from '../services/stt';
import { textToSpeech, TTS_VOICE } from '../services/tts';
import { startCall, generateReply, generateGreeting, endCall } from '../voice/conversation';
import { logger } from '../lib/logger';

/**
 * In-browser demo call — the SAME Whisper → Forge → Kokoro chain as the phone
 * pipeline, but driven from a web page (mic permission only, no Twilio).
 *
 *   POST /api/webcall/start  { sessionId }                  → { reply, audio }   (AI greets)
 *   POST /api/webcall/turn   { sessionId, audioBase64, mime } → { transcript, reply, audio }
 *   POST /api/webcall/end    { sessionId }                  → { ok }
 *
 * `audio` is base64 MP3 the browser plays directly. Conversation history is
 * tracked server-side per sessionId (reusing the voice conversation store).
 */

const router = Router();
const VOICE = process.env.TTS_VOICE || TTS_VOICE;

const mp3 = (buf: Buffer): string => `data:audio/mpeg;base64,${buf.toString('base64')}`;

router.post('/api/webcall/start', async (req: Request, res: Response) => {
  const sessionId = String((req.body as { sessionId?: string }).sessionId ?? '');
  if (!sessionId) {
    res.status(400).json({ error: 'sessionId is required' });
    return;
  }
  try {
    startCall(sessionId, { agentName: 'there', callType: 'inbound' });
    const reply = await generateGreeting(sessionId);
    const audio = await textToSpeech(reply, VOICE, 'mp3');
    res.json({ reply, audio: mp3(audio) });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    logger.error('webcall start failed', { message: m });
    res.status(502).json({ error: m });
  }
});

router.post('/api/webcall/turn', async (req: Request, res: Response) => {
  const { sessionId, audioBase64, mime } = req.body as {
    sessionId?: string;
    audioBase64?: string;
    mime?: string;
  };
  if (!sessionId || !audioBase64) {
    res.status(400).json({ error: 'sessionId and audioBase64 are required' });
    return;
  }

  try {
    const audioBuf = Buffer.from(audioBase64, 'base64');
    const contentType = mime || 'audio/webm';
    const ext = contentType.includes('wav') ? 'wav' : contentType.includes('mp4') ? 'mp4' : 'webm';

    // 1) Whisper
    const transcript = (await transcribe(audioBuf, { contentType, filename: `utterance.${ext}` })).trim();
    if (!transcript) {
      res.json({ transcript: '', reply: '', audio: null, empty: true });
      return;
    }

    // 2) Forge (history-aware) → 3) Kokoro
    const reply = await generateReply(sessionId, transcript);
    const audio = await textToSpeech(reply, VOICE, 'mp3');
    res.json({ transcript, reply, audio: mp3(audio) });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    logger.error('webcall turn failed', { message: m });
    res.status(502).json({ error: m });
  }
});

router.post('/api/webcall/end', async (req: Request, res: Response) => {
  const sessionId = String((req.body as { sessionId?: string }).sessionId ?? '');
  if (sessionId) await endCall(sessionId);
  res.json({ ok: true });
});

export default router;
