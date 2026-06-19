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
import dashboardRouter from './routes/dashboard';
import liveCallsRouter from './routes/liveCalls';
import chatRouter from './routes/chat';
import webcallRouter from './routes/webcall';
import { startVoiceServer } from './voice/pipeline';

// React dashboard (Vite build, in web/). Build it with `pnpm web:build`.
const WEB_DIST = path.join(process.cwd(), 'web', 'dist');
const WEB_INDEX = path.join(WEB_DIST, 'index.html');
const hasReactApp = (): boolean => fs.existsSync(WEB_INDEX);

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

// 8mb so the in-browser web call can POST short base64 audio utterances.
app.use(express.json({ limit: '8mb' }));
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
// Dashboard read API: agents, properties, stats, workflows, activity, conversations.
app.use(dashboardRouter);
// Live-call API: in-progress snapshot, SSE stream, end-call.
app.use(liveCallsRouter);
// User-facing: live chat with Forge + in-browser web call (Whisper→Forge→Kokoro).
app.use(chatRouter);
app.use(webcallRouter);

// Serve the built React app's static assets (JS/CSS/etc) when present.
if (fs.existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
}

// Root: the React app when built; otherwise a hint to build it.
app.get('/', (_req: Request, res: Response) => {
  if (hasReactApp()) {
    res.sendFile(WEB_INDEX);
    return;
  }
  res.send('TRP Call Orchestrator — dashboard not built yet (run `pnpm web:build`)');
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

// SPA fallback (Express 5 safe — no '*' route, which throws under path-to-regexp v8).
// Any GET that isn't an API/known route gets the React index.html so client-side
// routing (/calls, /messages) works on refresh / deep-link.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'GET' || !hasReactApp()) return next();
  if (
    req.path.startsWith('/api') ||
    req.path === '/health' ||
    req.path === '/sms-demo'
  ) {
    return next();
  }
  res.sendFile(WEB_INDEX);
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
});

// Start the Fastify voice pipeline on :5050 in the same process (Twilio webhooks
// + Media Stream WebSocket). Failure here never takes down the dashboard.
// Set VOICE_ENABLED=false to run the dashboard alone (e.g. `pnpm dev:voice` separately).
if (process.env.VOICE_ENABLED !== 'false') {
  void startVoiceServer();
}

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
