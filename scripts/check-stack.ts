import 'dotenv/config';

/**
 * Demo-readiness check: pings the self-hosted model stack so you know the tunnel
 * is up before a chat / web-call demo. Run with `pnpm stack:check`.
 *
 * If anything is unreachable, (re)start the SSH tunnel:
 *   ssh -i ~/.ssh/id_ed25519 -N -f \
 *     -L 8000:localhost:8000 -L 8880:localhost:8880 \
 *     -L 5000:localhost:5000 -L 3001:localhost:3100 root@66.179.10.109
 */

const FORGE_URL = (process.env.FORGE_URL || 'http://localhost:8000/v1').replace(/\/$/, '');
const FORGE_KEY = process.env.FORGE_API_KEY || 'dummy';
const STT_URL = (process.env.STT_SERVER_URL || 'http://localhost:3001').replace(/\/$/, '');
const STT_HEALTH = process.env.STT_HEALTH_PATH || '/status';
const TTS_URL = (process.env.TTS_URL || process.env.TTS_SERVER_URL || 'http://localhost:8880').replace(
  /\/(v1)?\/?$/,
  '',
);

interface Check {
  name: string;
  url: string;
  headers?: Record<string, string>;
  okStatuses?: number[];
}

const checks: Check[] = [
  { name: 'Forge (LLM)', url: `${FORGE_URL}/models`, headers: { Authorization: `Bearer ${FORGE_KEY}` } },
  { name: 'Whisper (STT)', url: `${STT_URL}${STT_HEALTH}` },
  { name: 'Kokoro (TTS)', url: `${TTS_URL}/v1/models` },
];

async function ping(c: Check): Promise<boolean> {
  const ok = c.okStatuses ?? [200, 401];
  try {
    const res = await fetch(c.url, { headers: c.headers, signal: AbortSignal.timeout(5000) });
    const good = ok.includes(res.status);
    console.log(`${good ? '✅' : '⚠️ '} ${c.name.padEnd(16)} ${res.status}  ${c.url}`);
    return good;
  } catch (err) {
    console.log(`❌ ${c.name.padEnd(16)} DOWN  ${c.url}  (${err instanceof Error ? err.message : err})`);
    return false;
  }
}

async function main(): Promise<void> {
  console.log('🔎 Checking the self-hosted model stack…\n');
  const results = await Promise.all(checks.map(ping));
  const allUp = results.every(Boolean);
  console.log(`\n${allUp ? '🎉 All services reachable — demo ready.' : '🚧 Some services are down — start the SSH tunnel (see this file’s header).'}`);
  process.exit(allUp ? 0 : 1);
}

void main();
