import { AccessToken } from "livekit-server-sdk";

type CreateMarcusTokenArgs = {
  roomName: string;
  identity: string;
};

export async function createMarcusToken({
  roomName,
  identity,
}: CreateMarcusTokenArgs): Promise<string> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required");
  }

  const token = new AccessToken(apiKey, apiSecret, { identity });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  return await token.toJwt();
}

