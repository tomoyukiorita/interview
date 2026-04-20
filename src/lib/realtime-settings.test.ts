import { describe, expect, it } from "vitest";

import {
  DEFAULT_REALTIME_SPEED_PRESET,
  DEFAULT_REALTIME_SPEECH_STYLE_PRESET,
  DEFAULT_REALTIME_TONE_PRESET,
  DEFAULT_SERVER_VAD_SILENCE_DURATION_MS,
  REALTIME_SPEED_PRESETS,
  REALTIME_SPEECH_STYLE_PRESETS,
  REALTIME_TONE_PRESETS,
  SERVER_VAD_SILENCE_OPTIONS,
  getRealtimeSpeedInstruction,
  getRealtimeSpeedValue,
  getRealtimeSpeechStyleInstruction,
  getRealtimeToneInstruction,
  normalizeRealtimeSpeedPreset,
  normalizeRealtimeSpeechStylePreset,
  normalizeRealtimeTonePreset,
  normalizeServerVadSilenceDurationMs,
} from "./realtime-settings";

describe("realtime settings helpers", () => {
  it("defines speed, tone, speech style, and pause presets", () => {
    expect(DEFAULT_REALTIME_SPEED_PRESET).toBe("normal");
    expect(DEFAULT_REALTIME_TONE_PRESET).toBe("calm");
    expect(DEFAULT_REALTIME_SPEECH_STYLE_PRESET).toBe("standard");
    expect(DEFAULT_SERVER_VAD_SILENCE_DURATION_MS).toBe(800);

    expect(REALTIME_SPEED_PRESETS.map((preset) => preset.id)).toEqual([
      "slow",
      "normal",
      "fast",
    ]);
    expect(REALTIME_TONE_PRESETS.map((preset) => preset.id)).toEqual([
      "calm",
      "bright",
      "soft",
      "firm",
    ]);
    expect(REALTIME_SPEECH_STYLE_PRESETS.map((preset) => preset.id)).toEqual([
      "standard",
      "kansai",
    ]);
    expect(SERVER_VAD_SILENCE_OPTIONS.map((option) => option.value)).toEqual([
      300,
      500,
      800,
      1200,
      1500,
    ]);
  });

  it("normalizes unsupported values to the defaults", () => {
    expect(normalizeRealtimeSpeedPreset("slow")).toBe("slow");
    expect(normalizeRealtimeSpeedPreset("other")).toBe("normal");

    expect(normalizeRealtimeTonePreset("firm")).toBe("firm");
    expect(normalizeRealtimeTonePreset("other")).toBe("calm");

    expect(normalizeRealtimeSpeechStylePreset("kansai")).toBe("kansai");
    expect(normalizeRealtimeSpeechStylePreset("other")).toBe("standard");

    expect(normalizeServerVadSilenceDurationMs("1500")).toBe(1500);
    expect(normalizeServerVadSilenceDurationMs("333")).toBe(800);
    expect(normalizeServerVadSilenceDurationMs(null)).toBe(800);
  });

  it("maps presets to session-ready values", () => {
    expect(getRealtimeSpeedValue("slow")).toBe(0.9);
    expect(getRealtimeSpeedValue("normal")).toBe(1);
    expect(getRealtimeSpeedValue("fast")).toBe(1.15);
    expect(getRealtimeSpeedInstruction("slow")).toContain("少しゆっくり");
    expect(getRealtimeSpeedInstruction("normal")).toContain("標準的");
    expect(getRealtimeSpeedInstruction("fast")).toContain("少し速め");

    expect(getRealtimeToneInstruction("calm")).toContain("間を急がず");
    expect(getRealtimeToneInstruction("calm")).toContain("抑揚は控えめ");
    expect(getRealtimeToneInstruction("bright")).toContain("相づちは少し明るめ");
    expect(getRealtimeToneInstruction("bright")).toContain("テンポよく");
    expect(getRealtimeToneInstruction("soft")).toContain("断定を少しやわらげ");
    expect(getRealtimeToneInstruction("soft")).toContain("安心感");
    expect(getRealtimeToneInstruction("firm")).toContain("語尾はやや言い切る");
    expect(getRealtimeToneInstruction("firm")).toContain("無駄なクッションを減らし");

    expect(getRealtimeSpeechStyleInstruction("standard")).toContain("標準語");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("関西弁");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("必ず");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("受け");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("質問の語尾");
  });
});
