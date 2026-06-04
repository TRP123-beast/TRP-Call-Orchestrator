import 'dotenv/config';
import { getSmsService } from './services/sms';

/**
 * Sends a test SMS via the configured provider (SMS_PROVIDER=mock|twilio).
 *
 * Usage:
 *   pnpm run test:sms                 # uses TEST_SMS_TO / TRIAL_NUMBER
 *   pnpm run test:sms +15551234567 "Custom message body"
 */
async function main(): Promise<void> {
  const to = process.argv[2] ?? process.env.TEST_SMS_TO ?? process.env.TRIAL_NUMBER ?? '+15555550123';
  const body =
    process.argv[3] ??
    'Hi, this is Nestr Realty following up about your listing — is it still available?';

  const sms = getSmsService();
  console.log(`Provider : ${sms.providerName}`);
  console.log(`Sending to ${to}...`);

  const result = await sms.send(to, body);
  console.log('Result   :', result);

  if (sms.providerName === 'twilio') {
    const status = await sms.getMessageStatus(result.sid);
    console.log('Status   :', status);
  }

  console.log('\n✅ Test message sent.');
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(`\n❌ Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
