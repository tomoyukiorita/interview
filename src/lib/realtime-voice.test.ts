import { describe, expect, it } from "vitest";

import {
  DEFAULT_REALTIME_VOICE,
  REALTIME_VOICES,
  normalizeRealtimeVoice,
} from "./realtime-voice";

describe("realtime voice helpers", () => {
  it("defines the supported voices", () => {
    expect(REALTIME_VOICES).toEqual(["cedar", "marin"]);
    expect(DEFAULT_REALTIME_VOICE).toBe("cedar");
  });

  it("normalizes unsupported voice values to the default", () => {
    expect(normalizeRealtimeVoice("cedar")).toBe("cedar");
    expect(normalizeRealtimeVoice("marin")).toBe("marin");
    expect(normalizeRealtimeVoice(null)).toBe("cedar");
    expect(normalizeRealtimeVoice("other")).toBe("cedar");
  });
});
