import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { executeTool } from './tools/executors';
import { logger } from './lib/logger';
import { getStatusReport } from './lib/serviceStatus';

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(express.json({ limit: '1mb' }));

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
