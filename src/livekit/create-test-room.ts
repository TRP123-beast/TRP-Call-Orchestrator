import 'dotenv/config';
import { AccessToken, RoomServiceClient, AgentDispatchClient } from 'livekit-server-sdk';

/**
 * Sets up a room you can join from the LiveKit Agents Playground to talk to the
 * TRP agent via your browser microphone — no phone call required.
 *
 * Run the agent worker first (in another terminal):  pnpm run livekit:dev
 * Then:  pnpm run livekit:test-playground
 */

const ROOM_NAME = process.env.TEST_ROOM_NAME ?? 'test-call-room';
const PARTICIPANT = 'ListingAgent_TestUser';
const AGENT_NAME = 'marcus-listing-agent';
const PLAYGROUND_URL = 'https://agents-playground.livekit.io/';

function toHttp(wsUrl: string): string {
  return wsUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
}

async function main(): Promise<void> {
  const wsUrl = process.env.LIVEKIT_URL ?? 'ws://127.0.0.1:7880';
  const apiKey = process.env.LIVEKIT_API_KEY ?? 'devkey';
  const apiSecret = process.env.LIVEKIT_API_SECRET ?? 'secret';
  const httpUrl = toHttp(wsUrl);

  const rooms = new RoomServiceClient(httpUrl, apiKey, apiSecret);
  const dispatcher = new AgentDispatchClient(httpUrl, apiKey, apiSecret);

  // 1. Create (or reuse) the room.
  const room = await rooms.createRoom({ name: ROOM_NAME, emptyTimeout: 600, maxParticipants: 10 });
  console.log(`✓ Room ready: ${room.name} (sid=${room.sid})`);

  // 2. Access token for the browser test participant.
  const at = new AccessToken(apiKey, apiSecret, {
    identity: PARTICIPANT,
    name: PARTICIPANT,
    ttl: '2h',
  });
  at.addGrant({ room: ROOM_NAME, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  const token = await at.toJwt();

  // 3. Dispatch the agent into the room (explicit dispatch — the agent has an agentName).
  try {
    const dispatch = await dispatcher.createDispatch(ROOM_NAME, AGENT_NAME, {
      metadata: JSON.stringify({ source: 'playground-test' }),
    });
    const id = (dispatch as { id?: string }).id ?? '(unknown)';
    console.log(`✓ Dispatched agent "${AGENT_NAME}" to room (dispatch id=${id})`);
  } catch (err) {
    console.warn(`⚠ Agent dispatch failed: ${err instanceof Error ? err.message : String(err)}`);
    console.warn('  Make sure the agent worker is running: pnpm run livekit:dev');
  }

  // 4. Print everything needed to join.
  const bar = '─'.repeat(70);
  console.log(`\n${bar}`);
  console.log('Join from the LiveKit Agents Playground');
  console.log(bar);
  console.log(`Playground : ${PLAYGROUND_URL}`);
  console.log(`Server URL : ${wsUrl}`);
  console.log(`Room       : ${ROOM_NAME}`);
  console.log(`Identity   : ${PARTICIPANT}`);
  console.log(`Token      : ${token}`);
  console.log(bar);
  console.log('\nSteps:');
  console.log('  1. Agent worker running?   pnpm run livekit:dev   (separate terminal)');
  console.log('  2. LiveKit server running? ./start-livekit.sh     (separate terminal)');
  console.log(`  3. Open ${PLAYGROUND_URL}`);
  console.log('  4. Open settings (gear icon) → "Manual" connection mode.');
  console.log(`  5. Paste Server URL and Token above, then Connect.`);
  console.log('  6. Allow your microphone and start talking to the TRP agent.');
  console.log('\nNote: browsers permit ws://127.0.0.1 from the https playground (localhost is trusted).');
  console.log('Re-run this script to mint a fresh token / re-dispatch the agent.');
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(`\n❌ Failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error('Is the LiveKit server running? Start it with: ./start-livekit.sh');
    process.exit(1);
  });
