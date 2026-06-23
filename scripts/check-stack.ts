import 'dotenv/config';

/**
 * Demo-readiness check: pings the self-hosted model stack so you know the tunnel
 * is up before a chat / web-call demo. Run with `pnpm stack:check`.
 *
 * Also reused by scripts/preflight.ts (runs before `pnpm dev`).
 *
 * If anything is unreachable, (re)start the tunnel:
 *   systemctl --user start trp-tunnel.service     # persistent service, or:
 *   pnpm tunnel                                    # foreground
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

export interface StackResult {
  name: string;
  url: string;
  ok: boolean;
  status: number | null;
}

const checks: Check[] = [
  { name: 'Forge (LLM)', url: `${FORGE_URL}/models`, headers: { Authorization: `Bearer ${FORGE_KEY}` } },
  { name: 'Whisper (STT)', url: `${STT_URL}${STT_HEALTH}` },
  { name: 'Kokoro (TTS)', url: `${TTS_URL}/v1/models` },
];

/** Ping every service. With quiet=false, prints a table + summary. */
export async function checkStack(
  opts: { timeoutMs?: number; quiet?: boolean } = {},
): Promise<StackResult[]> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const results = await Promise.all(
    checks.map(async (c): Promise<StackResult> => {
      const ok = c.okStatuses ?? [200, 401];
      try {
        const res = await fetch(c.url, { headers: c.headers, signal: AbortSignal.timeout(timeoutMs) });
        return { name: c.name, url: c.url, ok: ok.includes(res.status), status: res.status };
      } catch {
        return { name: c.name, url: c.url, ok: false, status: null };
      }
    }),
  );

  if (!opts.quiet) {
    console.log('🔎 Checking the self-hosted model stack…\n');
    for (const r of results) {
      console.log(`${r.ok ? '✅' : '❌'} ${r.name.padEnd(16)} ${r.status ?? 'DOWN'}  ${r.url}`);
    }
    const allUp = results.every((r) => r.ok);
    console.log(
      `\n${allUp ? '🎉 All services reachable — demo ready.' : '🚧 Some services down — start the tunnel (systemctl --user start trp-tunnel.service, or pnpm tunnel).'}`,
    );
  }

  return results;
}

if (require.main === module) {
  void checkStack().then((r) => process.exit(r.every((x) => x.ok) ? 0 : 1));
}
