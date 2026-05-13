import { describe, expect, it } from "vitest";

import {
  DEFAULT_REALTIME_SPEED_PRESET,
  DEFAULT_REALTIME_SPEECH_STYLE_PRESET,
  DEFAULT_REALTIME_TONE_PRESET,
  DEFAULT_REALTIME_TURN_DETECTION_MODE,
  DEFAULT_REALTIME_VAD_EAGERNESS,
  DEFAULT_SERVER_VAD_SILENCE_DURATION_MS,
  REALTIME_SPEED_PRESETS,
  REALTIME_SPEECH_STYLE_PRESETS,
  REALTIME_TONE_PRESETS,
  REALTIME_TURN_DETECTION_OPTIONS,
  REALTIME_VAD_EAGERNESS_OPTIONS,
  SERVER_VAD_SILENCE_OPTIONS,
  getRealtimeSpeedInstruction,
  getRealtimeSpeedValue,
  getRealtimeSpeechStyleInstruction,
  getRealtimeToneInstruction,
  normalizeRealtimeSpeedPreset,
  normalizeRealtimeSpeechStylePreset,
  normalizeRealtimeTonePreset,
  normalizeRealtimeTurnDetectionMode,
  normalizeRealtimeVadEagerness,
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
    expect(getRealtimeToneInstruction("calm")).toContain("声の温度感");
    expect(getRealtimeToneInstruction("calm")).toContain("深刻な話題");
    expect(getRealtimeToneInstruction("bright")).toContain("相づちは少し明るめ");
    expect(getRealtimeToneInstruction("bright")).toContain("前向きな話題");
    expect(getRealtimeToneInstruction("soft")).toContain("断定を少しやわらげ");
    expect(getRealtimeToneInstruction("soft")).toContain("考え込んでいる");
    expect(getRealtimeToneInstruction("firm")).toContain("語尾はやや言い切る");
    expect(getRealtimeToneInstruction("firm")).toContain("無駄なクッションを減らし");

    expect(getRealtimeSpeechStyleInstruction("standard")).toContain("標準語");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("関西弁");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("必ず");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("丁寧な関西弁");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain(
      "標準語のですますに着地したら関西弁失敗"
    );
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("純粋な標準語に戻さない");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("発話直前のセルフチェック");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("禁止する文末");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("必須形");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("思てはりますか？");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("感じてはりますか？");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("何やと思いますか？");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("聞かせてもらえますか？");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("ですわ");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("イントネーション");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("文末イントネーション");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain(
      "語尾を弱く飲み込まない"
    );
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("抑揚の幅");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("高起式");
    expect(getRealtimeSpeechStyleInstruction("kansai")).toContain("語頭");
  });

  it("exposes Type 1 turn-detection options with semantic_vad as default", () => {
    expect(DEFAULT_REALTIME_TURN_DETECTION_MODE).toBe("semantic_vad");
    expect(DEFAULT_REALTIME_VAD_EAGERNESS).toBe("medium");

    expect(REALTIME_TURN_DETECTION_OPTIONS.map((option) => option.value)).toEqual([
      "server_vad",
      "semantic_vad",
    ]);
    expect(REALTIME_VAD_EAGERNESS_OPTIONS.map((option) => option.id)).toEqual([
      "low",
      "medium",
      "high",
    ]);
  });

  it("normalizes turn detection and eagerness values", () => {
    expect(normalizeRealtimeTurnDetectionMode("server_vad")).toBe("server_vad");
    expect(normalizeRealtimeTurnDetectionMode("semantic_vad")).toBe(
      "semantic_vad"
    );
    expect(normalizeRealtimeTurnDetectionMode("other")).toBe("semantic_vad");
    expect(normalizeRealtimeTurnDetectionMode(null)).toBe("semantic_vad");

    expect(normalizeRealtimeVadEagerness("low")).toBe("low");
    expect(normalizeRealtimeVadEagerness("medium")).toBe("medium");
    expect(normalizeRealtimeVadEagerness("high")).toBe("high");
    expect(normalizeRealtimeVadEagerness("other")).toBe("medium");
    expect(normalizeRealtimeVadEagerness(null)).toBe("medium");
  });
});
