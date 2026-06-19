import { Router, type Request, type Response } from 'express';
import { askForge, type ChatTurn } from '../services/llm';
import { logger } from '../lib/logger';

/**
 * User-facing chat with the self-hosted Forge model.
 *
 *   POST /api/chat  { message, history? } → { reply }
 *
 * This is the "a user inquires and gets a real model answer in the UI" path —
 * it runs Forge directly (no Twilio, no SMS provider). History is supplied by
 * the client each turn (stateless server).
 */

const router = Router();

const CHAT_SYSTEM_PROMPT =
  'You are the TRP (Nestr Realty) assistant, a Canadian rental brokerage. Help ' +
  'users with questions about listings, availability, showings, offers, and pet ' +
  'policies. Be friendly, concise, and conversational. Do not use markdown.';

const MAX_HISTORY = 12; // cap context the client may send

router.post('/api/chat', async (req: Request, res: Response) => {
  const { message, history } = req.body as { message?: string; history?: ChatTurn[] };
  if (!message || !message.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  // Keep only valid user/assistant turns from the client.
  const safeHistory: ChatTurn[] = Array.isArray(history)
    ? history
        .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
        .slice(-MAX_HISTORY)
    : [];

  try {
    const reply = await askForge(CHAT_SYSTEM_PROMPT, message, {
      history: safeHistory,
      maxTokens: 256,
      temperature: 0.5,
    });
    res.json({ reply: reply || "Sorry, I didn't catch that — could you rephrase?" });
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    logger.error('chat reply failed', { message: m });
    res.status(502).json({ error: `Assistant unavailable: ${m}` });
  }
});

export default router;
