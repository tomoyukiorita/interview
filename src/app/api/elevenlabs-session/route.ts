import { NextResponse } from "next/server";

export async function POST() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    return NextResponse.json(
      { error: "Type 5 音声設定が不足しています" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    configured: true,
    modelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_flash_v2_5",
    voiceIdConfigured: true,
  });
}
