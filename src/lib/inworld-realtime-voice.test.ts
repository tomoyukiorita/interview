import { describe, expect, it } from "vitest";

import {
  DEFAULT_INWORLD_REALTIME_VOICE,
  INWORLD_REALTIME_VOICES,
  normalizeInworldRealtimeVoice,
} from "./inworld-realtime-voice";

describe("inworld realtime voice helpers", () => {
  it("defines the supported Japanese Inworld realtime voices", () => {
    expect(INWORLD_REALTIME_VOICES).toEqual([
      "Asuka",
      "Haruto",
      "Hina",
      "Satoshi",
    ]);
    expect(DEFAULT_INWORLD_REALTIME_VOICE).toBe("Satoshi");
  });

  it("normalizes unsupported Inworld voice values to the default", () => {
    expect(normalizeInworldRealtimeVoice("Asuka")).toBe("Asuka");
    expect(normalizeInworldRealtimeVoice("Haruto")).toBe("Haruto");
    expect(normalizeInworldRealtimeVoice("Hina")).toBe("Hina");
    expect(normalizeInworldRealtimeVoice("Satoshi")).toBe("Satoshi");
    expect(normalizeInworldRealtimeVoice(null)).toBe("Satoshi");
    expect(normalizeInworldRealtimeVoice("other")).toBe("Satoshi");
  });
});
