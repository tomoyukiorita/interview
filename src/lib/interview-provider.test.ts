import { describe, expect, it } from "vitest";

import {
  DEFAULT_INTERVIEW_PROVIDER,
  INTERVIEW_PROVIDERS,
  getInterviewProviderLabel,
  normalizeInterviewProvider,
} from "./interview-provider";

describe("interview provider helpers", () => {
  it("defines the supported providers", () => {
    expect(INTERVIEW_PROVIDERS).toEqual(["openai", "gemini", "inworld"]);
    expect(DEFAULT_INTERVIEW_PROVIDER).toBe("openai");
  });

  it("normalizes unsupported provider values to the default", () => {
    expect(normalizeInterviewProvider("openai")).toBe("openai");
    expect(normalizeInterviewProvider("gemini")).toBe("gemini");
    expect(normalizeInterviewProvider("inworld")).toBe("inworld");
    expect(normalizeInterviewProvider(null)).toBe("openai");
    expect(normalizeInterviewProvider("other")).toBe("openai");
  });

  it("maps providers to generic UI labels", () => {
    expect(getInterviewProviderLabel("openai")).toBe("Type 1");
    expect(getInterviewProviderLabel("gemini")).toBe("Type 2");
    expect(getInterviewProviderLabel("inworld")).toBe("Type 3");
  });
});
