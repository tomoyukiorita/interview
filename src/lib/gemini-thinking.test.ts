import { describe, expect, it } from "vitest";

import {
  DEFAULT_GEMINI_THINKING_LEVEL,
  GEMINI_THINKING_LEVELS,
  normalizeGeminiThinkingLevel,
} from "./gemini-thinking";

describe("gemini thinking settings", () => {
  it("defaults Gemini Live thinking to minimal for low-latency interviews", () => {
    expect(DEFAULT_GEMINI_THINKING_LEVEL).toBe("minimal");
    expect(normalizeGeminiThinkingLevel(undefined)).toBe("minimal");
  });

  it("accepts supported Gemini Live thinking levels", () => {
    expect(GEMINI_THINKING_LEVELS).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
    ]);
    expect(normalizeGeminiThinkingLevel("low")).toBe("low");
  });

  it("falls back to minimal for unsupported values", () => {
    expect(normalizeGeminiThinkingLevel("deep")).toBe("minimal");
  });
});
