// Outbound calling — initiate Twilio calls to listing agents for the chained
// voice pipeline. Thin wrapper over OutboundCaller (the single source of truth
// for Twilio dialing + the No-Response/voicemail branch in outbound-caller.ts)
// exposing the address-oriented interface this pipeline expects.
import 'dotenv/config';
import { OutboundCaller, type CallProperty } from './outbound-caller';
import { logger } from '../lib/logger';

export interface OutboundCallParams {
  /** Listing agent's phone in E.164 (e.g. +14165551001). */
  phoneNumber: string;
  agentName: string;
  /** Property addresses to discuss on the call. */
  propertyAddresses: string[];
  /** Public base URL of THIS voice server (where Twilio fetches TwiML / posts status). */
  callbackUrl: string;
  /** Optional Supabase links so call logs + smart retries can resolve context. */
  agentId?: string;
  propertyIds?: string[];
}

let caller: OutboundCaller | null = null;
function getCaller(): OutboundCaller {
  if (!caller) caller = new OutboundCaller();
  return caller;
}

/**
 * Place an outbound call to a listing agent. Twilio dials the number and, on
 * answer, fetches TwiML from `${callbackUrl}/outbound-call` which connects the
 * Media Stream (AI greets first). machineDetection + the No-Response Branch are
 * handled by OutboundCaller / its /call-status route.
 */
export async function placeOutboundCall(
  params: OutboundCallParams,
): Promise<{ callSid: string; status: string }> {
  const properties: CallProperty[] = params.propertyAddresses.map((address) => ({
    address,
    mlsNumber: '',
  }));

  const result = await getCaller().makeCall({
    phoneNumber: params.phoneNumber,
    agentName: params.agentName,
    properties,
    callbackUrl: params.callbackUrl,
    agentId: params.agentId,
    propertyIds: params.propertyIds,
  });

  logger.info('📞 outbound call placed (pipeline)', {
    to: params.phoneNumber,
    agentName: params.agentName,
    addresses: params.propertyAddresses,
    callSid: result.callSid,
  });
  return result;
}

// CLI: `tsx src/voice/outbound.ts <phoneNumber> [agentName] [address...]`
async function main(): Promise<void> {
  const phoneNumber = process.argv[2] ?? process.env.TEST_CALL_TO;
  const agentName = process.argv[3] ?? 'there';
  const propertyAddresses = process.argv.slice(4);
  const callbackUrl = process.env.SERVER_URL;

  if (!phoneNumber) throw new Error('Usage: tsx src/voice/outbound.ts <phoneNumber> [agentName] [address...]');
  if (!callbackUrl) throw new Error('SERVER_URL is required (public URL of the voice server)');

  const result = await placeOutboundCall({
    phoneNumber,
    agentName,
    propertyAddresses: propertyAddresses.length ? propertyAddresses : ['123 King Street West, Toronto'],
    callbackUrl,
  });

  console.log('✅ Outbound call initiated.');
  console.log(`   Call SID : ${result.callSid}`);
  console.log(`   Status   : ${result.status}`);
  console.log(`   Webhook  : ${callbackUrl.replace(/\/$/, '')}/outbound-call`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error(`\n❌ Failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
}
