import type { RealtimeVoice } from "./types";

export const REALTIME_VOICES: RealtimeVoice[] = ["cedar", "marin"];
export const DEFAULT_REALTIME_VOICE: RealtimeVoice = "cedar";

export function normalizeRealtimeVoice(
  value: string | null | undefined
): RealtimeVoice {
  return REALTIME_VOICES.includes(value as RealtimeVoice)
    ? (value as RealtimeVoice)
    : DEFAULT_REALTIME_VOICE;
}
