/** Normalized result of sending an outbound SMS. */
export interface SmsSendResult {
  sid: string;
  status: string;
  provider: string;
}

/** Normalized inbound SMS, parsed from a provider-specific webhook payload. */
export interface InboundSms {
  from: string;
  to: string;
  body: string;
  sid?: string;
}

/** Common interface implemented by every SMS provider (Twilio, mock, ...). */
export interface SmsProvider {
  readonly name: string;
  /** The sender phone number this provider sends from. */
  fromNumber(): string;
  /** Send an outbound SMS. */
  sendSMS(to: string, body: string): Promise<SmsSendResult>;
  /** Look up the delivery status of a previously sent message. */
  getMessageStatus(sid: string): Promise<string>;
  /** Parse a provider-specific inbound webhook payload into a normalized InboundSms. */
  parseInbound(payload: Record<string, unknown>): InboundSms;
}
