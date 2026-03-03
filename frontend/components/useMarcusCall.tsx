import { useCallback, useRef, useState } from "react";
import { Room, RoomEvent, createLocalAudioTrack } from "livekit-client";

type CallState = "idle" | "connecting" | "in-call" | "ended" | "error";

type UseMarcusCallArgs = {
  leadId?: string;
};

type UseMarcusCallValue = {
  state: CallState;
  error?: string;
  start: () => Promise<void>;
  end: () => Promise<void>;
  logs: string[];
};

async function fetchToken(
  leadId?: string,
): Promise<{ token: string; url: string }> {
  const res = await fetch("/api/livekit-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadId }),
  });

  if (!res.ok) {
    throw new Error("Failed to get LiveKit token");
  }

  const data = (await res.json()) as { token?: string; url?: string };

  if (!data.url) {
    throw new Error("LiveKit URL missing in token response");
  }

  if (!data.token) {
    throw new Error("LiveKit token missing in token response");
  }

  return { token: data.token, url: data.url };
}

async function connectRoom(url: string, token: string): Promise<Room> {
  const room = new Room();
  await room.connect(url, token);
  return room;
}

async function publishMicrophone(room: Room): Promise<void> {
  const micTrack = await createLocalAudioTrack();
  await room.localParticipant.publishTrack(micTrack);
}

function attachRemoteAudio(room: Room, onLog: (message: string) => void): void {
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === "audio") {
      const el = track.attach();
      document.body.appendChild(el);
      onLog("Remote audio track subscribed");
    }
  });
}

function registerDisconnect(
  room: Room,
  onDisconnect: () => void,
  onLog: (message: string) => void,
): void {
  room.on(RoomEvent.Disconnected, onDisconnect);
  room.on(RoomEvent.Disconnected, () => {
    onLog("Disconnected from LiveKit room");
  });
}

export function useMarcusCall({ leadId }: UseMarcusCallArgs): UseMarcusCallValue {
  const [state, setState] = useState<CallState>("idle");
  const [error, setError] = useState<string | undefined>();
  const [logs, setLogs] = useState<string[]>([]);
  const roomRef = useRef<Room | null>(null);

  const pushLog = useCallback((message: string) => {
    setLogs((prev) => [...prev, message]);
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle" && state !== "ended" && state !== "error") {
      return;
    }

    setState("connecting");
    setError(undefined);
    pushLog(
      `Starting call for lead "${leadId ?? "demo"}" at ${new Date().toISOString()}`,
    );

    try {
      pushLog("Requesting LiveKit token from /api/livekit-token");
      const { token, url } = await fetchToken(leadId);
      pushLog(`Received token, connecting to LiveKit at ${url}`);

      const room = await connectRoom(url, token);
      pushLog("Signal connection established");

      roomRef.current = room;

      await publishMicrophone(room);
      pushLog("Local microphone track published");

      attachRemoteAudio(room, (message) => pushLog(message));
      registerDisconnect(
        room,
        () => setState("ended"),
        (message) => pushLog(message),
      );

      setState("in-call");
      pushLog("Call state set to in-call");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error starting call";

      setError(message);
      setState("error");
      pushLog(`Call failed: ${message}`);
    }
  }, [leadId, pushLog, state]);

  const end = useCallback(async () => {
    const room = roomRef.current;
    if (!room) {
      return;
    }

    await room.disconnect();
    roomRef.current = null;
    setState("ended");
    pushLog("Call ended by client");
  }, [pushLog]);

  return {
    state,
    error,
    start,
    end,
    logs,
  };
}

