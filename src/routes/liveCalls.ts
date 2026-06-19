import { Router, type Request, type Response } from 'express';
import twilio, { type Twilio } from 'twilio';
import { liveCalls } from '../services/liveCalls';
import { logger } from '../lib/logger';

/**
 * Live-call API for the dashboard's Active Call panel.
 *
 *   GET  /api/calls/live        snapshot of in-progress calls (+ live transcript)
 *   GET  /api/calls/stream      Server-Sent Events: pushes the snapshot on change
 *   POST /api/calls/:sid/end    hang up a live call via Twilio
 *
 * State comes from the shared in-memory liveCalls store, written by the voice
 * pipeline (same process). End is a real Twilio action; Mute/Transfer aren't
 * exposed because Twilio Media Streams don't support them server-side cleanly.
 */

const router = Router();

// ---- GET /api/calls/live : snapshot ----
router.get('/api/calls/live', (_req: Request, res: Response) => {
  res.json({ calls: liveCalls.list() });
});

// ---- GET /api/calls/stream : SSE ----
router.get('/api/calls/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const send = (): void => {
    res.write(`data: ${JSON.stringify({ calls: liveCalls.list() })}\n\n`);
  };
  send(); // initial snapshot
  liveCalls.on('update', send);

  // Heartbeat so proxies don't drop the idle connection.
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(ping);
    liveCalls.off('update', send);
  });
});

// ---- POST /api/calls/:sid/end : hang up via Twilio ----
let client: Twilio | null = null;
function twilioClient(): Twilio {
  if (!client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error('Twilio credentials are not configured');
    client = twilio(sid, token);
  }
  return client;
}

router.post('/api/calls/:sid/end', async (req: Request, res: Response) => {
  const sid = String(req.params.sid);
  try {
    await twilioClient().calls(sid).update({ status: 'completed' });
    liveCalls.end(sid);
    logger.info('live call ended via dashboard', { callSid: sid });
    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('failed to end live call', { callSid: sid, message });
    res.status(500).json({ error: message });
  }
});

export default router;
