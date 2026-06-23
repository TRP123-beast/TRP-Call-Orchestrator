import 'dotenv/config';
import { checkStack } from './check-stack';

/**
 * Runs before `pnpm dev`. Warns (does NOT block) if the self-hosted model stack
 * is unreachable, so you know Chat / Web Call won't work until the tunnel is up.
 * The dashboard, SMS, and call history work fine without it — so this never
 * fails startup.
 */
void (async () => {
  try {
    const results = await checkStack({ timeoutMs: 2500, quiet: true });
    const down = results.filter((r) => !r.ok);
    if (down.length === 0) {
      console.log('✅ preflight: model stack reachable (Forge · Whisper · Kokoro).');
    } else {
      console.warn(`\n⚠️  preflight: ${down.length} model service(s) unreachable — ${down.map((d) => d.name).join(', ')}.`);
      console.warn('   Chat & Web Call need the GPU tunnel. Start it with:');
      console.warn('     systemctl --user start trp-tunnel.service     # or:  pnpm tunnel');
      console.warn('   (Dashboard, SMS, and call history still work without it.)\n');
    }
  } catch {
    /* never block dev on the preflight itself */
  }
  process.exit(0);
})();
