/**
 * In-memory log of every inbound/outbound message and its status history.
 *
 * This is what the SMS console page reads, so messages and statuses are visible
 * for end-to-end testing even when Supabase is unreachable. It's process-local
 * (cleared on restart) and capped — it complements, not replaces, Supabase logging.
 */
export type LoggedMessage = {
  id: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  body: string;
  status: string;
  provider: string;
  createdAt: string;
  statusHistory: { status: string; at: string }[];
};

const MAX_MESSAGES = 500;
const messages: LoggedMessage[] = [];
let inboundCounter = 0;

export function nextInboundId(): string {
  inboundCounter += 1;
  return `IN${Date.now()}${inboundCounter}`;
}

export function recordMessage(input: {
  id: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  body: string;
  status: string;
  provider: string;
}): LoggedMessage {
  const createdAt = new Date().toISOString();
  const entry: LoggedMessage = {
    ...input,
    createdAt,
    statusHistory: [{ status: input.status, at: createdAt }],
  };
  messages.push(entry);
  if (messages.length > MAX_MESSAGES) messages.shift();
  return entry;
}

export function updateStatus(id: string, status: string): boolean {
  const m = messages.find((x) => x.id === id);
  if (!m || m.status === status) return false;
  m.status = status;
  m.statusHistory.push({ status, at: new Date().toISOString() });
  return true;
}

/** Newest-first list for the console / API. */
export function listMessages(): LoggedMessage[] {
  return [...messages].reverse();
}

/**
 * Simulated delivery lifecycle for mock outbound messages so testers can see
 * status transitions (queued → sent → delivered). Real Twilio statuses arrive
 * via the /api/sms/status callback instead.
 */
export function simulateOutboundLifecycle(id: string): void {
  setTimeout(() => updateStatus(id, 'sent'), 600);
  setTimeout(() => updateStatus(id, 'delivered'), 1800);
}
