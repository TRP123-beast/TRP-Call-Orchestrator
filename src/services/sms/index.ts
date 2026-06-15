import { logger } from '../../lib/logger';
import { askForge } from '../llm';
import { MARCUS_SYSTEM_PROMPT } from '../../agent/instructions';
import { formatProfessional } from './format';
import { logMessage } from './store';
import { recordMessage, simulateOutboundLifecycle, nextInboundId } from './messageLog';
import { MockProvider } from './mock-provider';
import { TwilioProvider } from './twilio-provider';
import type { SmsProvider, SmsSendResult, InboundSms } from './types';

export type { SmsProvider, SmsSendResult, InboundSms } from './types';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const SMS_SYSTEM_SUFFIX =
  '\n\nYou are now communicating with the listing agent by SMS, not voice. Keep replies short (1-3 sentences), warm, and professional. Continue the same workflow (confirm availability, then offers, pets, and remarks) over text.';

const FALLBACK_REPLY =
  'Thanks for getting back to us. A Nestr Realty specialist will follow up shortly.';

/** Builds the configured provider based on the SMS_PROVIDER env var. */
export function createProvider(): SmsProvider {
  const name = (process.env.SMS_PROVIDER ?? 'mock').toLowerCase();
  switch (name) {
    case 'twilio':
      return new TwilioProvider();
    case 'mock':
      return new MockProvider();
    default:
      throw new Error(`Unknown SMS_PROVIDER "${name}" — use 'mock' or 'twilio'`);
  }
}

/**
 * High-level SMS service: sends professionally-formatted outbound messages,
 * handles inbound replies (continuing the WORKFLOW.md text branch via the LLM),
 * and logs everything to Supabase.
 */
export class SmsService {
  private readonly histories = new Map<string, ChatMessage[]>();

  constructor(private readonly provider: SmsProvider) {}

  get providerName(): string {
    return this.provider.name;
  }

  fromNumber(): string {
    return this.provider.fromNumber();
  }

  parseInbound(payload: Record<string, unknown>): InboundSms {
    return this.provider.parseInbound(payload);
  }

  /** Send an outbound SMS to a listing agent (formatted + logged). */
  async send(to: string, rawBody: string): Promise<SmsSendResult> {
    const body = formatProfessional(rawBody);
    const result = await this.provider.sendSMS(to, body);

    // In-memory log for the console. Mock starts at "queued" and is advanced to
    // sent → delivered so testers see the full lifecycle.
    const isMock = this.provider.name === 'mock';
    recordMessage({
      id: result.sid,
      direction: 'outbound',
      from: this.provider.fromNumber(),
      to,
      body,
      status: isMock ? 'queued' : result.status,
      provider: this.provider.name,
    });
    if (isMock) simulateOutboundLifecycle(result.sid);

    await logMessage({
      provider: this.provider.name,
      direction: 'outbound',
      from_number: this.provider.fromNumber(),
      to_number: to,
      body,
      status: result.status,
      sid: result.sid,
    });
    return result;
  }

  async getMessageStatus(sid: string): Promise<string> {
    return this.provider.getMessageStatus(sid);
  }

  /**
   * Handle an inbound reply: log it, generate an agent reply continuing the
   * workflow over text, send the reply, and return the reply text.
   */
  async handleInbound(inbound: InboundSms): Promise<string> {
    recordMessage({
      id: inbound.sid ?? nextInboundId(),
      direction: 'inbound',
      from: inbound.from,
      to: inbound.to,
      body: inbound.body,
      status: 'received',
      provider: this.provider.name,
    });
    await logMessage({
      provider: this.provider.name,
      direction: 'inbound',
      from_number: inbound.from,
      to_number: inbound.to,
      body: inbound.body,
      status: 'received',
      sid: inbound.sid ?? null,
    });
    logger.info('sms inbound', { from: inbound.from, body: inbound.body });

    // Mirror inbound to the mock console for a clear demo trace.
    if (this.provider instanceof MockProvider) {
      this.provider.printInbound(inbound);
    }

    const reply = await this.generateReply(inbound.from, inbound.body);
    await this.send(inbound.from, reply);
    return reply;
  }

  /** Generate the agent's text reply via the Forge model (not OpenAI). */
  private async generateReply(from: string, inboundBody: string): Promise<string> {
    try {
      // History holds only user/assistant turns; askForge prepends the system prompt.
      const history = this.histories.get(from) ?? [];
      const reply = await askForge(MARCUS_SYSTEM_PROMPT + SMS_SYSTEM_SUFFIX, inboundBody, {
        history,
        maxTokens: 200,
      });
      const text = reply.trim() || FALLBACK_REPLY;
      history.push({ role: 'user', content: inboundBody });
      history.push({ role: 'assistant', content: text });
      this.histories.set(from, history);
      return text;
    } catch (err) {
      logger.warn('sms: Forge reply generation failed, using fallback', {
        message: err instanceof Error ? err.message : String(err),
      });
      return FALLBACK_REPLY;
    }
  }
}

let singleton: SmsService | null = null;

/** Returns the process-wide SMS service (provider chosen by SMS_PROVIDER). */
export function getSmsService(): SmsService {
  if (!singleton) {
    singleton = new SmsService(createProvider());
    logger.info('sms service initialized', { provider: singleton.providerName });
  }
  return singleton;
}
