import 'dotenv/config';
import twilio from 'twilio';
import { logger } from '../lib/logger';

/**
 * Initiates an outbound Twilio call that connects the listing agent to the
 * realtime voice bridge (src/voice/twilio-realtime-agent.ts).
 *
 * Twilio dials `phoneNumber`, and when answered, fetches TwiML from
 * `${SERVER_URL}/incoming-call` — which greets and opens the Media Stream.
 * We pass agentName + propertyAddresses as query params so /incoming-call can
 * inject them into the stream's custom parameters (personalizing the prompt).
 *
 * Prereqs:
 *   - The voice agent is running (pnpm run voice:dev) and reachable at SERVER_URL
 *     (e.g. an ngrok tunnel to port 5050).
 *   - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER set.
 *
 * Usage:
 *   pnpm run call:test +14165551234
 *   pnpm run call:test +14165551234 "Jane Smith" "123 King St, 88 Queen Ave"
 */
async function main(): Promise<void> {
  const phoneNumber = process.argv[2] ?? process.env.TEST_CALL_TO;
  const agentName = process.argv[3] ?? 'there';
  const propertyAddresses = process.argv.slice(4).join(', ') || 'your current listing';

  if (!phoneNumber) {
    throw new Error('Usage: pnpm run call:test <phoneNumber> [agentName] [propertyAddresses...]');
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const serverUrl = process.env.SERVER_URL;

  if (!accountSid || !authToken || !from) {
    throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER are required');
  }
  if (!serverUrl) {
    throw new Error('SERVER_URL is required (public URL of the voice agent, e.g. your ngrok https URL)');
  }

  const base = serverUrl.replace(/\/$/, '');
  const params = new URLSearchParams({ agentName, addresses: propertyAddresses });
  const url = `${base}/incoming-call?${params.toString()}`;

  const client = twilio(accountSid, authToken);

  logger.info('placing outbound call', { to: phoneNumber, from, url, agentName, propertyAddresses });

  const call = await client.calls.create({ to: phoneNumber, from, url });

  console.log('✅ Call initiated.');
  console.log(`   SID     : ${call.sid}`);
  console.log(`   To      : ${phoneNumber}`);
  console.log(`   From    : ${from}`);
  console.log(`   Webhook : ${url}`);
  console.log(`   Status  : ${call.status}`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(`\n❌ Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
