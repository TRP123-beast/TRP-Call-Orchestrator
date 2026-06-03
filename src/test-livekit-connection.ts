import 'dotenv/config';
import { RoomServiceClient } from 'livekit-server-sdk';

/**
 * Smoke test for a local LiveKit server.
 * Connects via the RoomService API, then: create room -> list rooms -> delete room.
 * Exits 0 on success, 1 on failure.
 *
 * Requires a running server (see start-livekit.sh) and the LIVEKIT_* env vars.
 */
async function main(): Promise<void> {
  const wsUrl = process.env.LIVEKIT_URL ?? 'ws://127.0.0.1:7880';
  const apiKey = process.env.LIVEKIT_API_KEY ?? 'devkey';
  const apiSecret = process.env.LIVEKIT_API_SECRET ?? 'secret';

  // RoomServiceClient talks HTTP(S); convert the ws(s):// URL accordingly.
  const httpUrl = wsUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
  const roomName = `test-room-${Date.now()}`;

  console.log(`Connecting to LiveKit RoomService at ${httpUrl} (key: ${apiKey})`);
  const svc = new RoomServiceClient(httpUrl, apiKey, apiSecret);

  // 1. Create a room.
  const room = await svc.createRoom({ name: roomName, emptyTimeout: 60 });
  console.log(`✓ Created room "${room.name}" (sid=${room.sid})`);

  // 2. List rooms and confirm ours is present.
  const rooms = await svc.listRooms();
  console.log(`✓ Listed ${rooms.length} room(s): ${rooms.map((r) => r.name).join(', ') || '(none)'}`);
  if (!rooms.some((r) => r.name === roomName)) {
    throw new Error(`created room "${roomName}" was not found in the room listing`);
  }

  // 3. Delete the room and verify removal.
  await svc.deleteRoom(roomName);
  const after = await svc.listRooms();
  if (after.some((r) => r.name === roomName)) {
    throw new Error(`room "${roomName}" still present after deletion`);
  }
  console.log(`✓ Deleted room "${roomName}" and verified removal`);

  console.log('\n✅ SUCCESS: LiveKit connection works (create → list → delete).');
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ FAILURE: ${message}`);
    console.error('Is the LiveKit server running? Start it with: ./start-livekit.sh');
    process.exit(1);
  });
