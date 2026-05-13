import { describe, expect, it } from "vitest";

import {
  DEFAULT_INWORLD_REALTIME_VAD_EAGERNESS,
  INWORLD_REALTIME_VAD_EAGERNESS_OPTIONS,
  normalizeInworldRealtimeVadEagerness,
} from "./inworld-realtime-vad";

describe("inworld realtime VAD helpers", () => {
  it("defines Type 3 semantic VAD eagerness options", () => {
    expect(INWORLD_REALTIME_VAD_EAGERNESS_OPTIONS.map((option) => option.id)).toEqual([
      "low",
      "medium",
      "high",
    ]);
    expect(DEFAULT_INWORLD_REALTIME_VAD_EAGERNESS).toBe("medium");
  });

  it("normalizes unsupported eagerness values to medium", () => {
    expect(normalizeInworldRealtimeVadEagerness("low")).toBe("low");
    expect(normalizeInworldRealtimeVadEagerness("medium")).toBe("medium");
    expect(normalizeInworldRealtimeVadEagerness("high")).toBe("high");
    expect(normalizeInworldRealtimeVadEagerness(null)).toBe("medium");
    expect(normalizeInworldRealtimeVadEagerness("fast")).toBe("medium");
  });
});
