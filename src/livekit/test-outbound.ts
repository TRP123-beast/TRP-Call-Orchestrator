import 'dotenv/config';
import { AccessToken, RoomServiceClient, AgentDispatchClient, SipClient } from 'livekit-server-sdk';

/**
 * Simulates the outbound-call flow end to end without a real phone number:
 *   1. Create a room
 *   2. Dispatch the TRP agent into it
 *   3. Add the "callee": a real SIP participant IF a trunk is configured,
 *      otherwise a simulated WebRTC callee token you can join from the playground
 *   4. Monitor the room (participant join/leave, agent presence, tracks)
 *
 * Run the agent worker first:  pnpm run livekit:dev
 * Then:  pnpm run livekit:test-outbound
 */

const AGENT_NAME = 'marcus-listing-agent';
const MONITOR_SECONDS = Number(process.env.MONITOR_SECONDS ?? 60);

// ParticipantInfo.state and .kind are protobuf enums; map for readable logs.
const STATE_NAMES = ['JOINING', 'JOINED', 'ACTIVE', 'DISCONNECTED'];
const KIND_NAMES = ['STANDARD', 'INGRESS', 'EGRESS', 'SIP', 'AGENT'];

function toHttp(wsUrl: string): string {
  return wsUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
}
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const wsUrl = process.env.LIVEKIT_URL ?? 'ws://127.0.0.1:7880';
  const apiKey = process.env.LIVEKIT_API_KEY ?? 'devkey';
  const apiSecret = process.env.LIVEKIT_API_SECRET ?? 'secret';
  const httpUrl = toHttp(wsUrl);
  const roomName = process.env.OUTBOUND_ROOM_NAME ?? 'outbound-test-room';

  const rooms = new RoomServiceClient(httpUrl, apiKey, apiSecret);
  const dispatcher = new AgentDispatchClient(httpUrl, apiKey, apiSecret);

  // 1. Create the room.
  const room = await rooms.createRoom({ name: roomName, emptyTimeout: 600 });
  console.log(`✓ Room created: ${room.name} (sid=${room.sid})`);

  // 2. Dispatch the agent (simulates the system kicking off the outbound call).
  try {
    const dispatch = await dispatcher.createDispatch(roomName, AGENT_NAME, {
      metadata: JSON.stringify({ scenario: 'outbound-call', callee: 'listing-agent' }),
    });
    const id = (dispatch as { id?: string }).id ?? '(unknown)';
    console.log(`✓ Dispatched agent "${AGENT_NAME}" (dispatch id=${id})`);
  } catch (err) {
    console.warn(`⚠ Agent dispatch failed: ${err instanceof Error ? err.message : String(err)}`);
    console.warn('  Make sure the agent worker is running: pnpm run livekit:dev');
  }

  // 3. Add the callee.
  const trunkId = process.env.SIP_OUTBOUND_TRUNK_ID;
  const phoneNumber = process.env.OUTBOUND_PHONE_NUMBER ?? process.env.TRIAL_NUMBER;

  if (trunkId && phoneNumber) {
    // Real SIP path — only works with a configured outbound trunk.
    const sip = new SipClient(httpUrl, apiKey, apiSecret);
    try {
      const p = await sip.createSipParticipant(trunkId, phoneNumber, roomName, {
        participantIdentity: 'PhoneCallee',
        participantName: 'Listing Agent (phone)',
      });
      console.log(`✓ SIP participant dialing ${phoneNumber} via trunk ${trunkId} (sid=${(p as { participantId?: string }).participantId ?? 'n/a'})`);
    } catch (err) {
      console.warn(`⚠ SIP participant creation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    // No trunk configured — simulate the callee with a WebRTC token.
    console.log('\nℹ No SIP trunk configured (set SIP_OUTBOUND_TRUNK_ID + OUTBOUND_PHONE_NUMBER for a real call).');
    console.log('  Simulating the callee with a browser/WebRTC token instead.');
    const at = new AccessToken(apiKey, apiSecret, {
      identity: 'PhoneCallee_Sim',
      name: 'Listing Agent (simulated)',
      ttl: '2h',
    });
    at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
    const calleeToken = await at.toJwt();
    const bar = '─'.repeat(70);
    console.log(`\n${bar}`);
    console.log('Join as the simulated callee (the "listing agent") from the playground:');
    console.log(`  Playground : https://agents-playground.livekit.io/`);
    console.log(`  Server URL : ${wsUrl}`);
    console.log(`  Room       : ${roomName}`);
    console.log(`  Identity   : PhoneCallee_Sim`);
    console.log(`  Token      : ${calleeToken}`);
    console.log(bar);
  }

  // 4. Monitor the room by polling the participant list.
  console.log(`\n── Monitoring "${roomName}" for ${MONITOR_SECONDS}s (Ctrl+C to stop early) ──`);
  console.log('   (REST polling: shows joins/leaves, agent presence, and track counts.');
  console.log('    Live "is-speaking" events require a realtime client; not shown here.)');

  const seen = new Map<string, string>();
  const startedAt = Date.now();

  while (Date.now() - startedAt < MONITOR_SECONDS * 1000) {
    let participants;
    try {
      participants = await rooms.listParticipants(roomName);
    } catch (err) {
      console.warn(`  (poll error: ${err instanceof Error ? err.message : String(err)})`);
      break;
    }

    const current = new Set<string>();
    for (const p of participants) {
      current.add(p.identity);
      const kindNum = (p as { kind?: number }).kind ?? 0;
      const kind = KIND_NAMES[kindNum] ?? `KIND_${kindNum}`;
      const state = STATE_NAMES[p.state as number] ?? `STATE_${p.state}`;
      const trackCount = (p.tracks ?? []).length;
      const sig = `${state}|${kind}|tracks=${trackCount}`;

      if (!seen.has(p.identity)) {
        console.log(`  [+] joined: ${p.identity}  (${sig})`);
      } else if (seen.get(p.identity) !== sig) {
        console.log(`  [~] update: ${p.identity}  (${sig})`);
      }
      seen.set(p.identity, sig);
    }

    for (const identity of [...seen.keys()]) {
      if (!current.has(identity)) {
        console.log(`  [-] left:   ${identity}`);
        seen.delete(identity);
      }
    }

    await sleep(2000);
  }

  console.log('\n✓ Monitoring complete.');
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(`\n❌ Failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error('Is the LiveKit server running? Start it with: ./start-livekit.sh');
    process.exit(1);
  });
