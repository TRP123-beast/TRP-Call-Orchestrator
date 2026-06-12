import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { executeTool } from './tools/executors';
import { logger } from './lib/logger';
import { getStatusReport } from './lib/serviceStatus';
import { getSmsService } from './services/sms';
import { listMessages, updateStatus } from './services/sms/messageLog';
import { SMS_CONSOLE_HTML } from './services/sms/console-page';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(express.json({ limit: '1mb' }));
// Twilio posts inbound-SMS webhooks as application/x-www-form-urlencoded.
app.use(express.urlencoded({ extended: false }));

// Request logging — records method, path, status, and duration for every request.
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });
  next();
});

app.get('/', (_req: Request, res: Response) => {
  res.send('Marcus - TRP Listing Agent - Call #1');
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/api/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const services = await getStatusReport();
    res.json({ status: 'ok', services });
  } catch (err) {
    next(err);
  }
});

app.post('/api/tools/run', async (req: Request, res: Response, next: NextFunction) => {
  const { name, args } = req.body as { name?: string; args?: Record<string, unknown> };
  if (!name || typeof args !== 'object' || args === null) {
    res.status(400).json({ error: 'Body must have name (string) and args (object)' });
    return;
  }
  try {
    const result = await executeTool(name, args);
    res.json({ result });
  } catch (err) {
    next(err);
  }
});

// Inbound SMS webhook (Twilio). Parses the provider payload, runs the text-branch
// reply flow, and returns empty TwiML so Twilio does not send its own auto-reply.
app.post('/api/sms/webhook', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sms = getSmsService();
    const inbound = sms.parseInbound(req.body as Record<string, unknown>);
    if (!inbound.from || !inbound.body) {
      res.status(400).json({ error: 'Missing From/Body in webhook payload' });
      return;
    }
    await sms.handleInbound(inbound);
    res
      .type('text/xml')
      .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch (err) {
    next(err);
  }
});

// Simulate an inbound SMS (for the mock/demo flow). Body: { from, to?, body }.
app.post('/api/sms/simulate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to, body } = req.body as { from?: string; to?: string; body?: string };
    if (!from || !body) {
      res.status(400).json({ error: 'Body must include "from" and "body"' });
      return;
    }
    const sms = getSmsService();
    const reply = await sms.handleInbound({ from, to: to ?? sms.fromNumber(), body });
    res.json({ ok: true, provider: sms.providerName, reply });
  } catch (err) {
    next(err);
  }
});

// Send an outbound SMS directly (used by the console). Body: { to, body }.
app.post('/api/sms/send', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { to, body } = req.body as { to?: string; body?: string };
    if (!to || !body) {
      res.status(400).json({ error: 'Body must include "to" and "body"' });
      return;
    }
    const sms = getSmsService();
    const result = await sms.send(to, body);
    res.json({ ok: true, provider: sms.providerName, result });
  } catch (err) {
    next(err);
  }
});

// All logged messages with statuses, newest first (powers the console).
app.get('/api/sms/messages', (_req: Request, res: Response) => {
  res.json({ messages: listMessages() });
});

// Twilio delivery-status callback — updates a message's status (sent/delivered/failed).
app.post('/api/sms/status', (req: Request, res: Response) => {
  const b = req.body as Record<string, string>;
  const sid = b.MessageSid ?? b.messageSid;
  const status = b.MessageStatus ?? b.status;
  if (sid && status) updateStatus(sid, status);
  res.sendStatus(200);
});

// Browser SMS test console for end-to-end demoing without a phone.
app.get('/sms-demo', (_req: Request, res: Response) => {
  res.type('html').send(SMS_CONSOLE_HTML);
});

// 404 handler — any unmatched route.
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

// Centralized error-handling middleware (must have 4 params to be recognized as one).
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  logger.error('unhandled error', {
    path: req.originalUrl,
    message,
    stack: err instanceof Error ? err.stack : undefined,
  });
  if (res.headersSent) return;
  res.status(500).json({ error: message });
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Safety nets so a stray rejection/exception is logged rather than silently killing the process.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});
process.on('uncaughtException', (err: Error) => {
  logger.error('uncaughtException', { message: err.message, stack: err.stack });
});
