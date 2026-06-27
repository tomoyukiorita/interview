import { encode, decode } from "@msgpack/msgpack";
import { NextResponse } from "next/server";
import WebSocket from "ws";

export const runtime = "nodejs";

const FISH_AUDIO_TTS_LIVE_URL = "wss://api.fish.audio/v1/tts/live";
const DEFAULT_FISH_AUDIO_MODEL = "s2-pro";
const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_CHUNK_LENGTH = 240;
const DEFAULT_MIN_CHUNK_LENGTH = 50;

interface FishAudioTtsRequest {
  text?: string;
  speed?: number;
}

type FishAudioEvent =
  | { event?: "audio"; audio?: unknown }
  | { event?: "finish"; reason?: string }
  | { event?: string; [key: string]: unknown };

function isAudioBytes(value: unknown): value is Uint8Array | ArrayBuffer {
  return value instanceof Uint8Array || value instanceof ArrayBuffer;
}

function toUint8Array(audio: Uint8Array | ArrayBuffer): Uint8Array {
  if (audio instanceof Uint8Array) return audio;
  return new Uint8Array(audio);
}

export async function POST(request: Request) {
  const apiKey = process.env.FISH_AUDIO_API_KEY;
  const referenceId = process.env.FISH_AUDIO_REFERENCE_ID;
  const model = process.env.FISH_AUDIO_MODEL ?? DEFAULT_FISH_AUDIO_MODEL;
  const latency = process.env.FISH_AUDIO_LATENCY ?? "balanced";
  const sampleRate = Number(process.env.FISH_AUDIO_SAMPLE_RATE ?? DEFAULT_SAMPLE_RATE);
  const chunkLength = Number(
    process.env.FISH_AUDIO_CHUNK_LENGTH ?? DEFAULT_CHUNK_LENGTH
  );
  const minChunkLength = Number(
    process.env.FISH_AUDIO_MIN_CHUNK_LENGTH ?? DEFAULT_MIN_CHUNK_LENGTH
  );

  if (!apiKey || !referenceId) {
    return NextResponse.json(
      { error: "Type 5 Fish Audio設定が不足しています" },
      { status: 500 }
    );
  }

  const body = (await request.json()) as FishAudioTtsRequest;
  const text = body.text?.trim();

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const ws = new WebSocket(FISH_AUDIO_TTS_LIVE_URL, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          model,
        },
      });

      const closeWithError = (message: string) => {
        try {
          controller.error(new Error(message));
        } finally {
          ws.close();
        }
      };

      request.signal.addEventListener("abort", () => {
        ws.close();
      });

      ws.on("open", () => {
        ws.send(
          encode({
            event: "start",
            request: {
              text: "",
              format: "pcm",
              sample_rate: sampleRate,
              reference_id: referenceId,
              latency,
              chunk_length: chunkLength,
              min_chunk_length: minChunkLength,
              temperature: 0.55,
              top_p: 0.75,
              prosody: {
                speed: body.speed ?? 1,
                volume: 0,
                normalize_loudness: true,
              },
            },
          })
        );
        ws.send(encode({ event: "text", text }));
        ws.send(encode({ event: "flush" }));
        ws.send(encode({ event: "stop" }));
      });

      ws.on("message", (data) => {
        try {
          const payload = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
          const event = decode(payload) as FishAudioEvent;

          if (event.event === "audio" && isAudioBytes(event.audio)) {
            controller.enqueue(toUint8Array(event.audio));
            return;
          }

          if (event.event === "finish") {
            controller.close();
            ws.close();
          }
        } catch (error) {
          closeWithError(
            error instanceof Error
              ? error.message
              : "Fish Audio response decode failed"
          );
        }
      });

      ws.on("error", (error) => {
        closeWithError(error.message);
      });

      ws.on("close", () => {
        try {
          controller.close();
        } catch {
          // already closed or errored
        }
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "audio/pcm",
      "Cache-Control": "no-store",
      "X-Audio-Sample-Rate": String(sampleRate),
    },
  });
}
