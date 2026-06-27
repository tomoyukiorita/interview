import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

export const runtime = "nodejs";

interface LivekitTokenRequest {
  room?: string;
  identity?: string;
}

/**
 * Issues a short-lived LiveKit access token so a Type 6 client can join a room
 * and publish its mic to the turn-detector worker. When LiveKit env vars are
 * not configured the route returns 503 — the client treats that as "LiveKit
 * disabled" and the interview proceeds on VAD + audio signals alone (graceful
 * degradation), so this is intentionally not a hard error.
 */
export async function POST(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !url) {
    return NextResponse.json(
      { error: "LiveKit is not configured", configured: false },
      { status: 503 }
    );
  }

  let body: LivekitTokenRequest = {};
  try {
    body = (await request.json()) as LivekitTokenRequest;
  } catch {
    // Empty/invalid body is fine; fall back to generated defaults below.
  }

  const room = (body.room ?? "").trim() || `type6-${Date.now()}`;
  const identity =
    (body.identity ?? "").trim() || `interviewee-${Math.random().toString(36).slice(2, 10)}`;

  const at = new AccessToken(apiKey, apiSecret, {
    identity,
    // Tokens are only used to bootstrap a single interview session.
    ttl: "2h",
  });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  const token = await at.toJwt();
  return NextResponse.json({ url, token, room, identity, configured: true });
}
