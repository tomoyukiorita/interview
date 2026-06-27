import { NextResponse } from "next/server";

const ELEVENLABS_API_BASE_URL = "https://api.elevenlabs.io";
const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_flash_v2_5";

interface ElevenLabsTtsRequest {
  text?: string;
  speed?: number;
}

export async function POST(request: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID ?? DEFAULT_ELEVENLABS_MODEL_ID;

  if (!apiKey || !voiceId) {
    return NextResponse.json(
      { error: "Type 5 音声設定が不足しています" },
      { status: 500 }
    );
  }

  const body = (await request.json()) as ElevenLabsTtsRequest;
  const text = body.text?.trim();

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const response = await fetch(
    `${ELEVENLABS_API_BASE_URL}/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128&enable_logging=false`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        language_code: "ja",
        voice_settings: {
          stability: 0.55,
          similarity_boost: 0.78,
          style: 0.08,
          speed: body.speed ?? 1,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok || !response.body) {
    const error = await response.text();
    console.error("ElevenLabs TTS failed:", error);
    return NextResponse.json(
      { error: "Type 5 音声生成に失敗しました" },
      { status: response.status }
    );
  }

  return new Response(response.body, {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
