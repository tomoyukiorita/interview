import type { InworldRealtimeVadEagerness } from "./types";

export const INWORLD_REALTIME_VAD_EAGERNESS_OPTIONS: Array<{
  id: InworldRealtimeVadEagerness;
  label: string;
  description: string;
}> = [
  {
    id: "low",
    label: "低",
    description: "相手の発話を長めに待ち、途中で区切りにくくします。",
  },
  {
    id: "medium",
    label: "中",
    description: "自然な会話テンポと待ち時間のバランスを取ります。",
  },
  {
    id: "high",
    label: "高",
    description: "発話終了を早めに判定し、テンポよく返答します。",
  },
];

export const DEFAULT_INWORLD_REALTIME_VAD_EAGERNESS: InworldRealtimeVadEagerness =
  "medium";

export function normalizeInworldRealtimeVadEagerness(
  value: string | null | undefined
): InworldRealtimeVadEagerness {
  return INWORLD_REALTIME_VAD_EAGERNESS_OPTIONS.some(
    (option) => option.id === value
  )
    ? (value as InworldRealtimeVadEagerness)
    : DEFAULT_INWORLD_REALTIME_VAD_EAGERNESS;
}
