import type { SmsProvider, SmsSendResult, InboundSms } from './types';

// Minimal ANSI styling (no chalk dependency — keeps this CommonJS/ts-node safe).
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
};

/**
 * Console mock provider — for demos without a Twilio account.
 * Outbound messages are printed with colored, boxed output instead of being sent.
 */
export class MockProvider implements SmsProvider {
  readonly name = 'mock';
  private readonly from = process.env.TWILIO_PHONE_NUMBER ?? '+15555550100';
  private counter = 0;

  fromNumber(): string {
    return this.from;
  }

  async sendSMS(to: string, body: string): Promise<SmsSendResult> {
    const sid = `MOCK${Date.now()}${this.counter++}`;
    const line = `${c.cyan}${'─'.repeat(64)}${c.reset}`;
    // eslint-disable-next-line no-console
    console.log(
      `\n${line}\n` +
        `${c.cyan}${c.bold}📤 OUTBOUND SMS${c.reset} ${c.dim}(mock — not actually sent)${c.reset}\n` +
        `${c.dim}from:${c.reset} ${this.from}   ${c.dim}to:${c.reset} ${to}   ${c.dim}sid:${c.reset} ${sid}\n` +
        `${line}\n` +
        `${body}\n` +
        `${line}\n`,
    );
    return { sid, status: 'sent', provider: this.name };
  }

  async getMessageStatus(_sid: string): Promise<string> {
    return 'delivered';
  }

  parseInbound(payload: Record<string, unknown>): InboundSms {
    return {
      from: String(payload.from ?? payload.From ?? ''),
      to: String(payload.to ?? payload.To ?? this.from),
      body: String(payload.body ?? payload.Body ?? ''),
      sid: payload.sid ? String(payload.sid) : undefined,
    };
  }

  /** Pretty-print an inbound message (used by the /api/sms/simulate flow). */
  printInbound(inbound: InboundSms): void {
    const line = `${c.green}${'─'.repeat(64)}${c.reset}`;
    // eslint-disable-next-line no-console
    console.log(
      `\n${line}\n` +
        `${c.green}${c.bold}📥 INBOUND SMS${c.reset}\n` +
        `${c.dim}from:${c.reset} ${inbound.from}   ${c.dim}to:${c.reset} ${inbound.to}\n` +
        `${line}\n` +
        `${inbound.body}\n` +
        `${line}\n`,
    );
  }
}
