import { describe, expect, it } from "vitest";

import {
  DEFAULT_GEMINI_LIVE_VOICE,
  GEMINI_LIVE_VOICES,
  normalizeGeminiLiveVoice,
} from "./gemini-voice";

describe("gemini live voice helpers", () => {
  it("defines the supported Gemini live voices", () => {
    expect(GEMINI_LIVE_VOICES).toEqual([
      "Kore",
      "Puck",
      "Aoede",
      "Orus",
      "Leda",
    ]);
    expect(DEFAULT_GEMINI_LIVE_VOICE).toBe("Kore");
  });

  it("normalizes unsupported Gemini voice values to the default", () => {
    expect(normalizeGeminiLiveVoice("Kore")).toBe("Kore");
    expect(normalizeGeminiLiveVoice("Puck")).toBe("Puck");
    expect(normalizeGeminiLiveVoice("Aoede")).toBe("Aoede");
    expect(normalizeGeminiLiveVoice("Orus")).toBe("Orus");
    expect(normalizeGeminiLiveVoice("Leda")).toBe("Leda");
    expect(normalizeGeminiLiveVoice(null)).toBe("Kore");
    expect(normalizeGeminiLiveVoice("other")).toBe("Kore");
  });
});
