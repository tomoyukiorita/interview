import type { GeminiLiveVoice } from "./types";

export const GEMINI_LIVE_VOICES: GeminiLiveVoice[] = [
  "Kore",
  "Puck",
  "Aoede",
  "Orus",
  "Leda",
];
export const DEFAULT_GEMINI_LIVE_VOICE: GeminiLiveVoice = "Kore";

export function normalizeGeminiLiveVoice(
  value: string | null | undefined
): GeminiLiveVoice {
  return GEMINI_LIVE_VOICES.includes(value as GeminiLiveVoice)
    ? (value as GeminiLiveVoice)
    : DEFAULT_GEMINI_LIVE_VOICE;
}
