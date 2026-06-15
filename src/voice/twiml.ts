import type { FastifyRequest } from 'fastify';

/**
 * Shared TwiML builders for the voice routes (/incoming-call, /outbound-call).
 * Kept dependency-free so both the agent server and the outbound caller can use
 * them without an import cycle.
 */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * The host Twilio should open the Media Stream against. Prefers SERVER_URL
 * (the ngrok / deployed origin); falls back to the request's Host header.
 */
export function resolveHost(request: FastifyRequest, port: number): string {
  const fromEnv = process.env.SERVER_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return fromEnv ?? request.headers.host ?? `localhost:${port}`;
}

/**
 * TwiML that connects the call to the bidirectional Media Stream, passing the
 * listing agent's name + property addresses as <Stream> custom parameters. The
 * /media-stream handler reads these to personalize the AI's system prompt.
 */
export function connectStreamTwiml(opts: {
  host: string;
  agentName: string;
  addresses: string;
  greeting?: string;
}): string {
  const greeting = opts.greeting ? `\n  <Say>${escapeXml(opts.greeting)}</Say>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>${greeting}
  <Connect>
    <Stream url="wss://${opts.host}/media-stream">
      <Parameter name="agentName" value="${escapeXml(opts.agentName)}" />
      <Parameter name="addresses" value="${escapeXml(opts.addresses)}" />
    </Stream>
  </Connect>
</Response>`;
}

/** TwiML that speaks a single message and optionally hangs up (voicemail drop). */
export function sayTwiml(message: string, opts?: { hangup?: boolean }): string {
  const hangup = opts?.hangup ? '\n  <Hangup/>' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${escapeXml(message)}</Say>${hangup}
</Response>`;
}
