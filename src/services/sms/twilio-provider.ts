import type { SmsProvider, SmsSendResult, InboundSms } from './types';

// `import =`/`require` keeps this working under CommonJS/ts-node without esModuleInterop.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import twilio = require('twilio');

type TwilioClient = ReturnType<typeof twilio>;

// Twilio's magic test-sender number that returns a successful (simulated) send.
const TWILIO_TEST_FROM = '+15005550006';

/**
 * SMS provider backed by Twilio.
 *
 * Live mode (default): uses TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER.
 *
 * Test mode (TWILIO_TEST_MODE=true): uses TEST_TWILIO_ACCOUNT_SID / TEST_TWILIO_AUTH_TOKEN
 * (Twilio "Test Credentials") and the magic sender +15005550006. The Twilio API validates
 * the request and returns a simulated response — nothing is delivered and nothing is billed,
 * so no purchased phone number is required. Override the sender with TWILIO_TEST_FROM.
 */
export class TwilioProvider implements SmsProvider {
  readonly name = 'twilio';
  private readonly client: TwilioClient;
  private readonly from: string;
  private readonly testMode: boolean;

  constructor() {
    this.testMode =
      process.env.TWILIO_TEST_MODE === 'true' || process.env.TWILIO_TEST_MODE === '1';

    const accountSid = this.testMode
      ? process.env.TEST_TWILIO_ACCOUNT_SID
      : process.env.TWILIO_ACCOUNT_SID;
    const authToken = this.testMode
      ? process.env.TEST_TWILIO_AUTH_TOKEN
      : process.env.TWILIO_AUTH_TOKEN;
    this.from = this.testMode
      ? (process.env.TWILIO_TEST_FROM ?? TWILIO_TEST_FROM)
      : (process.env.TWILIO_PHONE_NUMBER ?? '');

    if (!accountSid || !authToken || !this.from) {
      throw new Error(
        this.testMode
          ? 'Twilio test mode requires TEST_TWILIO_ACCOUNT_SID and TEST_TWILIO_AUTH_TOKEN'
          : 'Twilio provider requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER',
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
    // Test credentials don't persist messages, so a fetch would 404 — skip it.
    if (this.testMode) {
      return 'test-mode (status not tracked)';
    }
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
