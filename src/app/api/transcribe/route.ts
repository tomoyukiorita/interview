import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "audio file is required" },
        { status: 400 }
      );
    }

    const upstreamFormData = new FormData();
    upstreamFormData.set("file", file);
    upstreamFormData.set("model", "gpt-4o-transcribe");
    upstreamFormData.set("language", "ja");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: upstreamFormData,
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenAI transcription error:", error);
      return NextResponse.json(
        { error: "Failed to transcribe audio" },
        { status: response.status }
      );
    }

    const data = (await response.json()) as { text?: string };

    return NextResponse.json({
      text: data.text ?? "",
    });
  } catch (error) {
    console.error("Transcription route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
