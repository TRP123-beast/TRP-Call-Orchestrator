import 'dotenv/config';
import express from 'express';
import { executeTool } from './tools/executors';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.send('Marcus - TRP Listing Agent - Call #1');
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/tools/run', async (req, res) => {
  const { name, args } = req.body as { name?: string; args?: Record<string, unknown> };
  if (!name || typeof args !== 'object') {
    res.status(400).json({ error: 'Body must have name (string) and args (object)' });
    return;
  }
  try {
    const result = await executeTool(name, args);
    res.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Tool execution failed';
    res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
