import type { InworldRealtimeVoice } from "./types";

export const INWORLD_REALTIME_VOICES: InworldRealtimeVoice[] = [
  "Asuka",
  "Haruto",
  "Hina",
  "Satoshi",
];
export const DEFAULT_INWORLD_REALTIME_VOICE: InworldRealtimeVoice = "Satoshi";

export function normalizeInworldRealtimeVoice(
  value: string | null | undefined
): InworldRealtimeVoice {
  return INWORLD_REALTIME_VOICES.includes(value as InworldRealtimeVoice)
    ? (value as InworldRealtimeVoice)
    : DEFAULT_INWORLD_REALTIME_VOICE;
}
