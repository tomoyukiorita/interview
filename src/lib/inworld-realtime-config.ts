import type { InworldRealtimeVadEagerness, InworldRealtimeVoice } from "./types";
import { getScenarioById } from "./interview-config";
import { DEFAULT_INWORLD_REALTIME_VAD_EAGERNESS } from "./inworld-realtime-vad";

export const INWORLD_REALTIME_LLM_MODEL =
  process.env.NEXT_PUBLIC_INWORLD_REALTIME_LLM_MODEL ?? "openai/gpt-4.1-mini";
export const INWORLD_REALTIME_FALLBACK_LLM_MODEL =
  process.env.NEXT_PUBLIC_INWORLD_REALTIME_FALLBACK_LLM_MODEL ??
  "openai/gpt-4o-mini";
export const INWORLD_TTS_MODEL = "inworld-tts-2";
export const INWORLD_STT_MODEL = "inworld/inworld-stt-1";
export const INWORLD_TTS_LANGUAGE = "ja";

export interface InworldRealtimeSessionConfigOptions {
  instructions: string;
  voice: InworldRealtimeVoice;
  speed: number;
  vadEagerness?: InworldRealtimeVadEagerness;
}

export function buildInworldRealtimeSessionConfig({
  instructions,
  voice,
  speed,
  vadEagerness = DEFAULT_INWORLD_REALTIME_VAD_EAGERNESS,
}: InworldRealtimeSessionConfigOptions) {
  return {
    type: "realtime",
    model: INWORLD_REALTIME_LLM_MODEL,
    instructions,
    outputModalities: ["audio", "text"],
    output_modalities: ["audio", "text"],
    audio: {
      input: {
        transcription: {
          model: INWORLD_STT_MODEL,
        },
        turnDetection: {
          type: "semantic_vad",
          eagerness: vadEagerness,
          createResponse: true,
          interruptResponse: true,
        },
        turn_detection: {
          type: "semantic_vad",
          eagerness: vadEagerness,
          create_response: true,
          interrupt_response: true,
        },
      },
      output: {
        model: INWORLD_TTS_MODEL,
        voice,
        language: INWORLD_TTS_LANGUAGE,
        speed,
      },
    },
    providerData: {
      audio: {
        input: {
          transcription: {
            model: INWORLD_STT_MODEL,
          },
          turn_detection: {
            type: "semantic_vad",
            eagerness: vadEagerness,
            create_response: true,
            interrupt_response: true,
          },
        },
        output: {
          model: INWORLD_TTS_MODEL,
          voice,
          language: INWORLD_TTS_LANGUAGE,
          speed,
        },
      },
    },
  } as const;
}

export function getInworldRealtimeInitialMessage(scenarioId: string): string {
  const scenario = getScenarioById(scenarioId);
  const openingQuestion =
    scenario?.topics[0]?.questions[0]?.text ??
    "最近、仕事をしていて「今日はいい感じだな」と思えた瞬間って、どんなときですか。";

  return `インタビューを開始してください。最初は「本日はお話を伺えることを楽しみにしていました」と短く伝えてから、${openingQuestion}`;
}
