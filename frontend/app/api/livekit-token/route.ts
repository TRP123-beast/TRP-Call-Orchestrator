import { NextRequest, NextResponse } from "next/server";
import { createMarcusToken } from "@/lib/livekitServer";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { leadId?: string };
    const leadId = body.leadId || "demo";
    const roomName = `listing-${leadId}`;
    const identity = `client-${leadId}`;
    const token = await createMarcusToken({ roomName, identity });

    const url =
      process.env.NEXT_PUBLIC_LIVEKIT_URL ?? process.env.LIVEKIT_URL ?? "";

    if (!url) {
      return NextResponse.json(
        { error: "LIVEKIT_URL / NEXT_PUBLIC_LIVEKIT_URL not configured" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      token,
      url,
      roomName,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to create token" },
      { status: 500 },
    );
  }
}

