import { describe, expect, it } from "vitest";

import {
  DEFAULT_REALTIME_VOICE,
  REALTIME_VOICE_OPTIONS,
  REALTIME_VOICES,
  VISIBLE_REALTIME_VOICE_IDS,
  VISIBLE_REALTIME_VOICE_OPTIONS,
  getRealtimeVoiceOption,
  normalizeRealtimeVoice,
} from "./realtime-voice";

describe("realtime voice helpers", () => {
  it("defines the supported voices", () => {
    expect(REALTIME_VOICES).toEqual([
      "marin",
      "cedar",
      "alloy",
      "ash",
      "ballad",
      "coral",
      "echo",
      "sage",
      "shimmer",
      "verse",
    ]);
    expect(DEFAULT_REALTIME_VOICE).toBe("cedar");
  });

  it("exposes UI metadata for every supported voice", () => {
    expect(REALTIME_VOICE_OPTIONS).toHaveLength(REALTIME_VOICES.length);
    expect(getRealtimeVoiceOption("marin")).toMatchObject({
      id: "marin",
      recommended: true,
    });
    expect(getRealtimeVoiceOption("cedar")).toMatchObject({
      id: "cedar",
      recommended: true,
    });
    expect(getRealtimeVoiceOption("verse")?.description).toContain("表現");
  });

  it("normalizes unsupported voice values to the default", () => {
    expect(normalizeRealtimeVoice("cedar")).toBe("cedar");
    expect(normalizeRealtimeVoice("marin")).toBe("marin");
    expect(normalizeRealtimeVoice("verse")).toBe("verse");
    expect(normalizeRealtimeVoice(null)).toBe("cedar");
    expect(normalizeRealtimeVoice("other")).toBe("cedar");
  });

  it("exposes only Marin and Cedar as visible voices in the UI", () => {
    expect(VISIBLE_REALTIME_VOICE_IDS).toEqual(["marin", "cedar"]);
    expect(VISIBLE_REALTIME_VOICE_OPTIONS.map((option) => option.id)).toEqual([
      "marin",
      "cedar",
    ]);
    expect(
      VISIBLE_REALTIME_VOICE_OPTIONS.every((option) => option.recommended)
    ).toBe(true);
    expect(VISIBLE_REALTIME_VOICE_IDS).toContain(DEFAULT_REALTIME_VOICE);
  });
});
