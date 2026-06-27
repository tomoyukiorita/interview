import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  buildSidecarMessages,
  normalizeSidecarMemo,
  SIDECAR_MODEL,
  sidecarRequestSchema,
} from "@/lib/interview-sidecar";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      enabled: false,
      error: "OPENAI_API_KEY is not configured",
    });
  }

  let parsedBody: ReturnType<typeof sidecarRequestSchema.safeParse>;
  try {
    parsedBody = sidecarRequestSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json(
      { enabled: false, error: "invalid json body" },
      { status: 400 }
    );
  }

  if (!parsedBody.success) {
    return NextResponse.json(
      { enabled: false, error: "invalid sidecar request" },
      { status: 400 }
    );
  }

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: SIDECAR_MODEL,
      messages: buildSidecarMessages(parsedBody.data),
      response_format: { type: "json_object" },
      temperature: 0.4,
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ enabled: false, error: "empty sidecar result" });
    }

    return NextResponse.json({
      enabled: true,
      memo: normalizeSidecarMemo(JSON.parse(content)),
      model: SIDECAR_MODEL,
    });
  } catch (error) {
    console.warn("[interview-sidecar] disabled by runtime error", error);
    return NextResponse.json({
      enabled: false,
      error: "sidecar unavailable",
    });
  }
}
