import { describe, expect, it } from "vitest";

import { appendUniqueTranscriptEntries } from "./transcript-dedupe";
import type { TranscriptEntry } from "./types";

describe("transcript dedupe helpers", () => {
  const baseEntry: TranscriptEntry = {
    id: "ai-1",
    role: "interviewer",
    text: "ええですね、その感覚は大事やと思います。",
    timestamp: 1000,
  };

  it("skips exact duplicate entries from the same speaker within a short window", () => {
    const duplicate: TranscriptEntry = {
      ...baseEntry,
      id: "ai-2",
      timestamp: 2000,
    };

    expect(appendUniqueTranscriptEntries([baseEntry], [duplicate])).toEqual([
      baseEntry,
    ]);
  });

  it("keeps the same text when it appears later in the conversation", () => {
    const later: TranscriptEntry = {
      ...baseEntry,
      id: "ai-2",
      timestamp: 30000,
    };

    expect(appendUniqueTranscriptEntries([baseEntry], [later])).toEqual([
      baseEntry,
      later,
    ]);
  });
});
