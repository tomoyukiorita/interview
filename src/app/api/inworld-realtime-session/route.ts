import { NextResponse } from "next/server";

const INWORLD_API_BASE_URL = "https://api.inworld.ai";
const INWORLD_REALTIME_CALLS_URL = `${INWORLD_API_BASE_URL}/v1/realtime/calls`;
const INWORLD_ICE_SERVERS_URL = `${INWORLD_API_BASE_URL}/v1/realtime/ice-servers`;

interface InworldIceServersResponse {
  ice_servers?: RTCIceServer[];
}

function getInworldClientAuthToken(): string | null {
  const clientToken = process.env.INWORLD_REALTIME_AUTH_TOKEN;
  if (clientToken) return clientToken;

  if (process.env.NODE_ENV !== "production") {
    return process.env.INWORLD_API_KEY ?? null;
  }

  return null;
}

export async function POST() {
  const serverApiKey = process.env.INWORLD_API_KEY;
  const authToken = getInworldClientAuthToken();

  if (!serverApiKey) {
    return NextResponse.json(
      { error: "INWORLD_API_KEY is not configured" },
      { status: 500 }
    );
  }

  if (!authToken) {
    return NextResponse.json(
      { error: "INWORLD_REALTIME_AUTH_TOKEN is not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(INWORLD_ICE_SERVERS_URL, {
      headers: {
        Authorization: `Bearer ${serverApiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Failed to fetch Inworld ICE servers:", error);
      return NextResponse.json(
        { error: "Failed to create Inworld realtime session" },
        { status: response.status }
      );
    }

    const data = (await response.json()) as InworldIceServersResponse;

    return NextResponse.json({
      url: INWORLD_REALTIME_CALLS_URL,
      authToken,
      iceServers: data.ice_servers ?? [],
    });
  } catch (error) {
    console.error("Inworld realtime session creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
