import { describe, expect, it } from "vitest";

import {
  DEFAULT_REALTIME_REASONING_EFFORT,
  OPENAI_REALTIME_MODEL,
  buildOpenAIRealtimeSessionConfig,
  normalizeRealtimeReasoningEffort,
} from "./realtime-model";

describe("OpenAI realtime model settings", () => {
  it("defaults Type 1 to GPT-Realtime-2 with low reasoning effort", () => {
    expect(OPENAI_REALTIME_MODEL).toBe("gpt-realtime-2");
    expect(DEFAULT_REALTIME_REASONING_EFFORT).toBe("low");
  });

  it("normalizes unsupported reasoning effort values to low", () => {
    expect(normalizeRealtimeReasoningEffort("minimal")).toBe("minimal");
    expect(normalizeRealtimeReasoningEffort("medium")).toBe("medium");
    expect(normalizeRealtimeReasoningEffort("xhigh")).toBe("xhigh");
    expect(normalizeRealtimeReasoningEffort(null)).toBe("low");
    expect(normalizeRealtimeReasoningEffort("deep")).toBe("low");
  });

  it("builds the Type 1 session config for ephemeral tokens", () => {
    expect(buildOpenAIRealtimeSessionConfig()).toEqual({
      type: "realtime",
      model: "gpt-realtime-2",
      reasoning: {
        effort: "low",
      },
    });
  });
});
