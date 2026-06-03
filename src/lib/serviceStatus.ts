import { getSupabaseClient } from './supabase';

export type ConnectionState = {
  status: 'connected' | 'disconnected';
  detail?: string;
};

export type StatusReport = {
  supabase: ConnectionState;
  livekit: ConnectionState;
  openai: { apiKeyPresent: boolean; detail?: string };
};

// Values shipped in .env.example — treat them as "not configured".
const PLACEHOLDERS = new Set([
  'your-openai-api-key',
  'your-service-role-key',
  'your-service-role-key-here',
  'https://your-project.supabase.co',
]);

function isReal(value: string | undefined): value is string {
  const v = value?.trim();
  return Boolean(v) && !PLACEHOLDERS.has(v as string);
}

function looksLikeNetworkError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('fetch failed') ||
    m.includes('econnrefused') ||
    m.includes('enotfound') ||
    m.includes('network') ||
    m.includes('timeout') ||
    m.includes('aborted')
  );
}

async function checkSupabase(): Promise<ConnectionState> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!isReal(url) || !isReal(key)) {
    return { status: 'disconnected', detail: 'not configured' };
  }

  try {
    const supabase = getSupabaseClient();
    // HEAD query: reachability matters more than whether the table exists.
    const { error } = await supabase
      .from('showing_requests')
      .select('id', { head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(2500));

    if (error) {
      if (looksLikeNetworkError(error.message)) {
        return { status: 'disconnected', detail: error.message };
      }
      // Reachable, but a query-level issue (e.g. table missing) — still "connected".
      return { status: 'connected', detail: `reachable (note: ${error.message})` };
    }
    return { status: 'connected' };
  } catch (err) {
    return {
      status: 'disconnected',
      detail: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

async function checkLiveKit(): Promise<ConnectionState> {
  const wsUrl = process.env.LIVEKIT_URL ?? process.env.NEXT_PUBLIC_LIVEKIT_URL;
  if (!isReal(wsUrl)) {
    return { status: 'disconnected', detail: 'not configured' };
  }

  let httpUrl: string;
  try {
    const u = new URL(wsUrl);
    u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
    httpUrl = u.toString();
  } catch {
    return { status: 'disconnected', detail: `invalid LIVEKIT_URL: ${wsUrl}` };
  }

  try {
    // A LiveKit server answers HTTP on its ws port; any response means reachable.
    await fetch(httpUrl, { signal: AbortSignal.timeout(2000) });
    return { status: 'connected' };
  } catch (err) {
    return {
      status: 'disconnected',
      detail: err instanceof Error ? err.message : 'unreachable',
    };
  }
}

function checkOpenAI(): { apiKeyPresent: boolean; detail?: string } {
  const present = isReal(process.env.OPENAI_API_KEY);
  return present ? { apiKeyPresent: true } : { apiKeyPresent: false, detail: 'OPENAI_API_KEY not set' };
}

export async function getStatusReport(): Promise<StatusReport> {
  const [supabase, livekit] = await Promise.all([checkSupabase(), checkLiveKit()]);
  return { supabase, livekit, openai: checkOpenAI() };
}
