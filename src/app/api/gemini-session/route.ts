import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY or GOOGLE_API_KEY is not configured" },
      { status: 500 }
    );
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      apiVersion: "v1alpha",
    });

    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
      },
    });

    if (!token.name) {
      return NextResponse.json(
        { error: "Failed to create Gemini auth token" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      apiKey: token.name,
    });
  } catch (error) {
    console.error("Gemini session creation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
