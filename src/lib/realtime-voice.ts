import type { RealtimeVoice } from "./types";

export const REALTIME_VOICE_OPTIONS: Array<{
  id: RealtimeVoice;
  label: string;
  description: string;
  tone: string;
  recommended?: boolean;
}> = [
  {
    id: "marin",
    label: "Marin",
    tone: "推奨・女性",
    recommended: true,
    description:
      "自然で表現力のある女性寄りの声です。会話のニュアンスを試したいときに向いています。",
  },
  {
    id: "cedar",
    label: "Cedar",
    tone: "推奨・男性",
    recommended: true,
    description:
      "落ち着いた男性寄りの声です。現在の既定音声で、安定した面接進行に向いています。",
  },
  {
    id: "alloy",
    label: "Alloy",
    tone: "中性的",
    description:
      "バランスのよい中性的な声です。標準的な比較用として試しやすい声です。",
  },
  {
    id: "ash",
    label: "Ash",
    tone: "落ち着き",
    description:
      "落ち着いた印象の声です。低めのテンションで自然に進めたいときに向いています。",
  },
  {
    id: "ballad",
    label: "Ballad",
    tone: "やわらかめ",
    description:
      "やわらかく丁寧な印象の声です。穏やかな聞き役に寄せたいときに向いています。",
  },
  {
    id: "coral",
    label: "Coral",
    tone: "明るめ",
    description:
      "明るく親しみやすい印象の声です。前向きな空気を出したいときに向いています。",
  },
  {
    id: "echo",
    label: "Echo",
    tone: "男性",
    description:
      "はっきりした男性寄りの声です。落ち着きと聞き取りやすさを比較したいときに向いています。",
  },
  {
    id: "sage",
    label: "Sage",
    tone: "知的",
    description:
      "落ち着きと知的な印象のある声です。深掘り型のインタビューで試しやすい声です。",
  },
  {
    id: "shimmer",
    label: "Shimmer",
    tone: "軽やか",
    description:
      "軽やかで明るい印象の声です。やさしく場をほぐしたいときに向いています。",
  },
  {
    id: "verse",
    label: "Verse",
    tone: "表現豊か",
    description:
      "表現の幅を試しやすい声です。語り口やイントネーションの違いを比較したいときに向いています。",
  },
];

export const REALTIME_VOICES: RealtimeVoice[] = REALTIME_VOICE_OPTIONS.map(
  (option) => option.id
);
export const DEFAULT_REALTIME_VOICE: RealtimeVoice = "cedar";

// UI で表示する音声のサブセット。型・正規化は全 voice を受け入れるが、
// 選択肢としては Marin / Cedar のみ表示する。
export const VISIBLE_REALTIME_VOICE_IDS: ReadonlyArray<RealtimeVoice> = [
  "marin",
  "cedar",
];

export const VISIBLE_REALTIME_VOICE_OPTIONS = REALTIME_VOICE_OPTIONS.filter(
  (option) => VISIBLE_REALTIME_VOICE_IDS.includes(option.id)
);

export function getRealtimeVoiceOption(voice: RealtimeVoice) {
  return REALTIME_VOICE_OPTIONS.find((option) => option.id === voice);
}

export function normalizeRealtimeVoice(
  value: string | null | undefined
): RealtimeVoice {
  return REALTIME_VOICES.includes(value as RealtimeVoice)
    ? (value as RealtimeVoice)
    : DEFAULT_REALTIME_VOICE;
}
