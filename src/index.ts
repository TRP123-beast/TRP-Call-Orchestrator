import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import express, { type Request, type Response, type NextFunction } from 'express';
import { executeTool } from './tools/executors';
import { logger } from './lib/logger';
import { getStatusReport } from './lib/serviceStatus';
import { listMessages, updateStatus } from './services/sms/messageLog';
import { SMS_CONSOLE_HTML } from './services/sms/console-page';
import smsRouter from './routes/sms';
import apiRouter from './routes/api';

const DASHBOARD_HTML = path.join(process.cwd(), 'frontend', 'index.html');

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

// Inbound SMS: webhook + no-phone simulator (Forge-powered text flow).
app.use(smsRouter);
// Dashboard control API: call initiate, recent calls/messages, sms send, health.
app.use(apiRouter);

// Demo dashboard (served on :3000).
app.get('/', (_req: Request, res: Response) => {
  if (fs.existsSync(DASHBOARD_HTML)) {
    res.sendFile(DASHBOARD_HTML);
    return;
  }
  res.send('TRP Call Orchestrator — dashboard not found (expected frontend/index.html)');
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

const server = app.listen(PORT, () => {
  logger.info(`🟦 TRP dashboard + API running on http://localhost:${PORT}`);
  logger.info(`   Dashboard: http://localhost:${PORT}/   ·   SMS console: /sms-demo`);
  logger.info(`   Voice pipeline runs separately on :5050 (pnpm voice:dev / pnpm voice:tunnel)`);
});

// Graceful shutdown: stop accepting connections, then exit.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => {
    logger.info('HTTP server closed — bye');
    process.exit(0);
  });
  // Force-exit if connections linger.
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Safety nets so a stray rejection/exception is logged rather than silently killing the process.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});
process.on('uncaughtException', (err: Error) => {
  logger.error('uncaughtException', { message: err.message, stack: err.stack });
});
