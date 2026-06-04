import type { SmsProvider, SmsSendResult, InboundSms } from './types';

// `import =`/`require` keeps this working under CommonJS/ts-node without esModuleInterop.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import twilio = require('twilio');

type TwilioClient = ReturnType<typeof twilio>;

/**
 * Production SMS provider backed by Twilio.
 * Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.
 */
export class TwilioProvider implements SmsProvider {
  readonly name = 'twilio';
  private readonly client: TwilioClient;
  private readonly from: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.from = process.env.TWILIO_PHONE_NUMBER ?? '';

    if (!accountSid || !authToken || !this.from) {
      throw new Error(
        'Twilio provider requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER',
      );
    }
    this.client = twilio(accountSid, authToken);
  }

  fromNumber(): string {
    return this.from;
  }

  async sendSMS(to: string, body: string): Promise<SmsSendResult> {
    const message = await this.client.messages.create({ to, from: this.from, body });
    return { sid: message.sid, status: message.status, provider: this.name };
  }

  async getMessageStatus(sid: string): Promise<string> {
    const message = await this.client.messages(sid).fetch();
    return message.status;
  }

  /** Parse Twilio's form-encoded inbound webhook (POST /api/sms/webhook). */
  parseInbound(payload: Record<string, unknown>): InboundSms {
    return {
      from: String(payload.From ?? ''),
      to: String(payload.To ?? this.from),
      body: String(payload.Body ?? ''),
      sid: payload.MessageSid ? String(payload.MessageSid) : undefined,
    };
  }
}
