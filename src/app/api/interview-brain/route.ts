import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  buildBrainMessages,
  brainRequestSchema,
  resolveBrainModel,
} from "@/lib/interview-brain";

export const runtime = "nodejs";

// Gemini models are served through Google's OpenAI-compatible endpoint, so the
// same client/streaming code works for both providers.
const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

// Anthropic (Claude / Fable) models are served through Anthropic's
// OpenAI-compatible endpoint.
const ANTHROPIC_OPENAI_BASE_URL = "https://api.anthropic.com/v1/";

function isAnthropicModel(model: string): boolean {
  return model.startsWith("claude") || model.startsWith("fable");
}

// Caps Fable/Claude adaptive thinking so the spoken turn starts sooner.
const ANTHROPIC_EFFORT = process.env.INTERVIEW_BRAIN_EFFORT ?? "low";

function isOpenAiReasoningModel(model: string): boolean {
  return model.startsWith("gpt-5") || model.startsWith("o");
}

// GPT-5.x defaults to "medium" reasoning effort, which adds silent TTFT and
// then dumps the whole utterance — the same streaming-killer as Gemini's
// thinking. The brain's reasoning is externalized (chapter clock, hypothesis
// memo, exemplar prompt), so a low effort keeps voice turns responsive.
// Overridable per deployment.
const OPENAI_REASONING_EFFORT =
  process.env.INTERVIEW_BRAIN_OPENAI_EFFORT ?? "low";

// Gemini thinks before answering by default (thinking_level "medium"), which
// adds 1-3s of silent TTFT and then dumps the whole utterance at once —
// killing the sentence-by-sentence TTS streaming. The brain's "thinking" is
// externalized in this design (chapter clock, hypothesis memo, exemplar
// prompt), so near-zero thinking is the right default. Overridable per
// deployment if quality ever needs the extra reasoning.
const GEMINI_THINKING_LEVEL =
  process.env.INTERVIEW_BRAIN_THINKING_LEVEL ?? "minimal";

function buildGeminiExtraBody(model: string): Record<string, unknown> {
  if (!model.startsWith("gemini")) return {};
  return {
    extra_body: {
      google: {
        thinking_config: { thinking_level: GEMINI_THINKING_LEVEL },
      },
    },
  };
}

function resolveProvider(model: string): {
  apiKey: string | undefined;
  baseURL: string | undefined;
  missingKeyError: string;
} {
  if (model.startsWith("gemini")) {
    return {
      apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
      baseURL: GEMINI_OPENAI_BASE_URL,
      missingKeyError: "GEMINI_API_KEY is not configured",
    };
  }
  if (isAnthropicModel(model)) {
    return {
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: ANTHROPIC_OPENAI_BASE_URL,
      missingKeyError: "ANTHROPIC_API_KEY is not configured",
    };
  }
  return {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: undefined,
    missingKeyError: "OPENAI_API_KEY is not configured",
  };
}

/**
 * The reasoning "brain" that authors the next interviewer utterance. Takes the
 * full conversation transcript + research + a chapter hint and streams back the
 * next question as UTF-8 text, so the client can pipe it straight into the TTS
 * chunker while it is still being written.
 */
export async function POST(request: Request) {
  let parsed: ReturnType<typeof brainRequestSchema.safeParse>;
  try {
    parsed = brainRequestSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid json body" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid brain request" },
      { status: 400 }
    );
  }

  // The settings screen can request a specific brain model per session
  // (model comparison demos); anything not allowlisted falls back to the
  // deployment default.
  const model = resolveBrainModel(parsed.data.model);
  const { apiKey, baseURL, missingKeyError } = resolveProvider(model);
  if (!apiKey) {
    return NextResponse.json({ error: missingKeyError }, { status: 500 });
  }

  const client = new OpenAI({ apiKey, baseURL });
  const messages = buildBrainMessages(parsed.data);
  const encoder = new TextEncoder();
  const openAiReasoningEffort =
    parsed.data.openAiReasoningEffort ?? OPENAI_REASONING_EFFORT;
  const anthropicEffort = parsed.data.anthropicEffort ?? ANTHROPIC_EFFORT;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const completion = await client.chat.completions.create(
          {
            model,
            messages,
            stream: true,
            // Anthropic's OpenAI-compat layer requires max_tokens. Three
            // spoken sentences plus the hypothesis memo fit comfortably.
            // output_config.effort caps adaptive thinking: measured TTFT
            // drops from ~5-10s (default) to ~5s (low) with quality intact.
            ...(isAnthropicModel(model)
              ? {
                  max_tokens: 1024,
                  output_config: { effort: anthropicEffort },
                }
              : {}),
            // GPT-5.x reasoning models: cap effort so the spoken turn starts
            // sooner (default is "medium", which stalls streaming).
            ...(isOpenAiReasoningModel(model)
              ? {
                  reasoning_effort:
                    openAiReasoningEffort as OpenAI.ReasoningEffort,
                }
              : {}),
            // Gemini-only extension field; passes through the OpenAI SDK
            // body untouched and is ignored by other providers.
            ...buildGeminiExtraBody(model),
          },
          { signal: request.signal }
        );
        for await (const part of completion) {
          const delta = part.choices[0]?.delta?.content ?? "";
          if (delta) controller.enqueue(encoder.encode(delta));
        }
        controller.close();
      } catch (error) {
        if (request.signal.aborted) {
          try {
            controller.close();
          } catch {
            // already closed
          }
          return;
        }
        console.warn("[interview-brain] stream failed", error);
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
