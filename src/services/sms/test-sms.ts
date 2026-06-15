import 'dotenv/config';
import { sendSMS } from './twilio-sms';

/**
 * Quick outbound SMS check via the configured provider (SMS_PROVIDER=mock|twilio).
 *
 * Usage:
 *   pnpm run sms:test +14165551234
 *   pnpm run sms:test +14165551234 "Custom message body"
 */
async function main(): Promise<void> {
  const testNumber = process.argv[2];
  if (!testNumber) {
    console.error('Usage: pnpm run sms:test +1PHONENUMBER ["message"]');
    process.exit(1);
  }
  const body = process.argv[3] ?? 'Hello from TRP! This is a test message.';

  console.log('Sending test SMS...');
  const sid = await sendSMS(testNumber, body);
  console.log(`✅ Test SMS sent. SID: ${sid}`);
}

main().catch((err: unknown) => {
  console.error(`\n❌ Failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
