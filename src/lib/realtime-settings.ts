import type {
  RealtimeSpeedPreset,
  RealtimeSpeechStylePreset,
  RealtimeTonePreset,
  ServerVadSilenceDurationMs,
} from "./types";

export const REALTIME_SPEED_PRESETS: Array<{
  id: RealtimeSpeedPreset;
  label: string;
  description: string;
  value: number;
  instruction: string;
}> = [
  {
    id: "slow",
    label: "ゆっくり",
    description: "落ち着いて丁寧に聞こえる速度です。",
    value: 0.9,
    instruction:
      "話すテンポは少しゆっくりめにし、間もやや丁寧に取ってください。",
  },
  {
    id: "normal",
    label: "標準",
    description: "自然でバランスのよい速度です。",
    value: 1,
    instruction: "話すテンポは標準的で自然な速さにしてください。",
  },
  {
    id: "fast",
    label: "速め",
    description: "テンポよく軽快に進めたいとき向けです。",
    value: 1.15,
    instruction:
      "話すテンポは少し速めにしつつ、聞き取りやすさは崩さないでください。",
  },
];

export const REALTIME_TONE_PRESETS: Array<{
  id: RealtimeTonePreset;
  label: string;
  description: string;
  instruction: string;
}> = [
  {
    id: "calm",
    label: "落ち着いた",
    description: "自然で安定感のある話し方です。",
    instruction:
      "声のトーンは落ち着いた方向にし、間を急がず、相づちは短く穏やかにしてください。抑揚は控えめにし、全体を安定したテンポで進めてください。",
  },
  {
    id: "bright",
    label: "明るい",
    description: "親しみやすく前向きな印象です。",
    instruction:
      "声のトーンは明るく親しみやすくし、相づちは少し明るめにしてください。橋渡しや次の質問への入り方は軽やかにし、全体をテンポよく進めてください。",
  },
  {
    id: "soft",
    label: "やわらかい",
    description: "安心感のあるやさしい印象です。",
    instruction:
      "声のトーンはやわらかく穏やかにし、相づちはやさしく返してください。断定を少しやわらげ、語尾も丸くして、相手が安心感を持てる話し方にしてください。",
  },
  {
    id: "firm",
    label: "しっかり",
    description: "芯のある自信を感じる印象です。",
    instruction:
      "声のトーンは落ち着きを保ちながらもしっかりと、自信のある話し方にしてください。語尾はやや言い切る方向にし、無駄なクッションを減らし、質問は簡潔に出してください。",
  },
];

export const REALTIME_SPEECH_STYLE_PRESETS: Array<{
  id: RealtimeSpeechStylePreset;
  label: string;
  description: string;
  instruction: string;
}> = [
  {
    id: "standard",
    label: "標準語",
    description: "自然な標準語で、落ち着いて聞きやすい話し方です。",
    instruction:
      "日本語は必ず自然な標準語で話してください。受け、橋渡し、質問の語尾まで標準語で統一し、言い回しは素直で聞き取りやすくしてください。",
  },
  {
    id: "kansai",
    label: "関西弁",
    description: "自然な関西弁の言い回しに寄せた話し方です。",
    instruction:
      "日本語は必ず自然な関西弁で話してください。受け、橋渡し、質問の語尾まで関西弁にしてください。nextQuestionText を使うときも意味は変えずに関西弁の自然な言い回しへ整えてください。過度に誇張したキャラクター口調にはせず、会話として自然な表現にしてください。",
  },
];

export const SERVER_VAD_SILENCE_OPTIONS: Array<{
  value: ServerVadSilenceDurationMs;
  label: string;
  description: string;
}> = [
  {
    value: 300,
    label: "0.3秒",
    description: "かなり素早く反応しますが、短い間でも切りやすくなります。",
  },
  {
    value: 500,
    label: "0.5秒",
    description: "反応は速いですが、短い間でも切りやすくなります。",
  },
  {
    value: 800,
    label: "0.8秒",
    description: "現在の既定値です。テンポと自然さの中間です。",
  },
  {
    value: 1200,
    label: "1.2秒",
    description: "言い淀みや余韻も比較的待つ設定です。",
  },
  {
    value: 1500,
    label: "1.5秒",
    description: "かなり長めに待つので、考える間を取りやすい設定です。",
  },
];

export const DEFAULT_REALTIME_SPEED_PRESET: RealtimeSpeedPreset = "normal";
export const DEFAULT_REALTIME_TONE_PRESET: RealtimeTonePreset = "calm";
export const DEFAULT_REALTIME_SPEECH_STYLE_PRESET: RealtimeSpeechStylePreset =
  "standard";
export const DEFAULT_SERVER_VAD_SILENCE_DURATION_MS: ServerVadSilenceDurationMs =
  800;

export function normalizeRealtimeSpeedPreset(
  value: string | null | undefined
): RealtimeSpeedPreset {
  return REALTIME_SPEED_PRESETS.some((preset) => preset.id === value)
    ? (value as RealtimeSpeedPreset)
    : DEFAULT_REALTIME_SPEED_PRESET;
}

export function normalizeRealtimeTonePreset(
  value: string | null | undefined
): RealtimeTonePreset {
  return REALTIME_TONE_PRESETS.some((preset) => preset.id === value)
    ? (value as RealtimeTonePreset)
    : DEFAULT_REALTIME_TONE_PRESET;
}

export function normalizeRealtimeSpeechStylePreset(
  value: string | null | undefined
): RealtimeSpeechStylePreset {
  return REALTIME_SPEECH_STYLE_PRESETS.some((preset) => preset.id === value)
    ? (value as RealtimeSpeechStylePreset)
    : DEFAULT_REALTIME_SPEECH_STYLE_PRESET;
}

export function normalizeServerVadSilenceDurationMs(
  value: string | null | undefined
): ServerVadSilenceDurationMs {
  const parsed = Number(value);

  return SERVER_VAD_SILENCE_OPTIONS.some((option) => option.value === parsed)
    ? (parsed as ServerVadSilenceDurationMs)
    : DEFAULT_SERVER_VAD_SILENCE_DURATION_MS;
}

export function getRealtimeSpeedValue(preset: RealtimeSpeedPreset): number {
  return (
    REALTIME_SPEED_PRESETS.find((candidate) => candidate.id === preset)?.value ??
    REALTIME_SPEED_PRESET_MAP[DEFAULT_REALTIME_SPEED_PRESET]
  );
}

export function getRealtimeSpeedInstruction(
  preset: RealtimeSpeedPreset
): string {
  return (
    REALTIME_SPEED_PRESETS.find((candidate) => candidate.id === preset)
      ?.instruction ??
    REALTIME_SPEED_PRESET_INSTRUCTION_MAP[DEFAULT_REALTIME_SPEED_PRESET]
  );
}

export function getRealtimeToneInstruction(
  preset: RealtimeTonePreset
): string {
  return (
    REALTIME_TONE_PRESETS.find((candidate) => candidate.id === preset)
      ?.instruction ??
    REALTIME_TONE_PRESET_MAP[DEFAULT_REALTIME_TONE_PRESET]
  );
}

export function getRealtimeSpeechStyleInstruction(
  preset: RealtimeSpeechStylePreset
): string {
  return (
    REALTIME_SPEECH_STYLE_PRESETS.find((candidate) => candidate.id === preset)
      ?.instruction ??
    REALTIME_SPEECH_STYLE_PRESET_MAP[DEFAULT_REALTIME_SPEECH_STYLE_PRESET]
  );
}

const REALTIME_SPEED_PRESET_MAP: Record<RealtimeSpeedPreset, number> = {
  slow: 0.9,
  normal: 1,
  fast: 1.15,
};

const REALTIME_SPEED_PRESET_INSTRUCTION_MAP: Record<RealtimeSpeedPreset, string> =
  {
    slow:
      "話すテンポは少しゆっくりめにし、間もやや丁寧に取ってください。",
    normal: "話すテンポは標準的で自然な速さにしてください。",
    fast:
      "話すテンポは少し速めにしつつ、聞き取りやすさは崩さないでください。",
  };

const REALTIME_TONE_PRESET_MAP: Record<RealtimeTonePreset, string> = {
  calm:
    "声のトーンは落ち着いた方向にし、間を急がず、相づちは短く穏やかにしてください。抑揚は控えめにし、全体を安定したテンポで進めてください。",
  bright:
    "声のトーンは明るく親しみやすくし、相づちは少し明るめにしてください。橋渡しや次の質問への入り方は軽やかにし、全体をテンポよく進めてください。",
  soft:
    "声のトーンはやわらかく穏やかにし、相づちはやさしく返してください。断定を少しやわらげ、語尾も丸くして、相手が安心感を持てる話し方にしてください。",
  firm:
    "声のトーンは落ち着きを保ちながらもしっかりと、自信のある話し方にしてください。語尾はやや言い切る方向にし、無駄なクッションを減らし、質問は簡潔に出してください。",
};

const REALTIME_SPEECH_STYLE_PRESET_MAP: Record<
  RealtimeSpeechStylePreset,
  string
> = {
  standard:
    "日本語は必ず自然な標準語で話してください。受け、橋渡し、質問の語尾まで標準語で統一し、言い回しは素直で聞き取りやすくしてください。",
  kansai:
    "日本語は必ず自然な関西弁で話してください。受け、橋渡し、質問の語尾まで関西弁にしてください。nextQuestionText を使うときも意味は変えずに関西弁の自然な言い回しへ整えてください。過度に誇張したキャラクター口調にはせず、会話として自然な表現にしてください。",
};
