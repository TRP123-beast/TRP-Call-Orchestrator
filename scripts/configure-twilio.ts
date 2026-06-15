import 'dotenv/config';
import twilio from 'twilio';

/**
 * Point your Twilio phone number's Voice webhook at the running voice agent.
 *
 * Usage:
 *   pnpm twilio:configure https://abc123.ngrok-free.app
 *
 * It looks up the IncomingPhoneNumber resource for TWILIO_PHONE_NUMBER and sets
 * its Voice webhook to <ngrokUrl>/incoming-call (POST). After this, calls to the
 * number are routed to the agent.
 */
async function main(): Promise<void> {
  const ngrokUrl = process.argv[2] ?? process.env.SERVER_URL;
  if (!ngrokUrl) {
    throw new Error('Usage: pnpm twilio:configure <ngrokUrl>  (e.g. https://abc.ngrok-free.app)');
  }
  if (!/^https?:\/\//.test(ngrokUrl)) {
    throw new Error(`"${ngrokUrl}" is not a valid URL (expected https://...)`);
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !phoneNumber) {
    throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER are required in .env');
  }

  const voiceUrl = `${ngrokUrl.replace(/\/$/, '')}/incoming-call`;
  const client = twilio(accountSid, authToken);

  // Find the IncomingPhoneNumber SID for our configured number.
  const matches = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 20 });
  if (matches.length === 0) {
    throw new Error(
      `No Twilio number matching ${phoneNumber} was found on this account. ` +
        'Check TWILIO_PHONE_NUMBER (E.164, e.g. +14165551234).',
    );
  }

  const target = matches[0];
  const updated = await client.incomingPhoneNumbers(target.sid).update({
    voiceUrl,
    voiceMethod: 'POST',
  });

  console.log('✅ Twilio Voice webhook updated');
  console.log(`   Number    : ${updated.phoneNumber}`);
  console.log(`   Number SID : ${updated.sid}`);
  console.log(`   Voice URL  : ${updated.voiceUrl}`);
  console.log(`   Method     : ${updated.voiceMethod}`);
  console.log('');
  console.log(`📞 Now call ${updated.phoneNumber} from any phone to talk to the agent.`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(`\n❌ Failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
