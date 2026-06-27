import { describe, expect, it } from "vitest";

import { decideHseBackstop, hasExplicitTurnHandoff } from "./hse-backstop";

const BASE = {
  pendingText: "話の続きです。",
  waitedMs: 0,
  thinking: 0,
  vadSpeaking: false,
  sinceLastSegmentMs: Number.POSITIVE_INFINITY,
  softMaxWaitMs: 10_000,
  hardMaxWaitMs: 18_000,
  hardWaitSegmentGraceMs: 3_000,
};

describe("decideHseBackstop", () => {
  it("does not release at the hard max right after a mid-thought segment lands", () => {
    const decision = decideHseBackstop({
      ...BASE,
      pendingText: "教訓となったっていう言い方が",
      waitedMs: 18_001,
      thinking: 0.9,
      sinceLastSegmentMs: 500,
    });

    expect(decision).toEqual({
      release: false,
      reason: "hard-wait-mid-thought",
    });
  });

  it("releases mid-thought answers once the short segment grace has elapsed", () => {
    const decision = decideHseBackstop({
      ...BASE,
      pendingText: "教訓となったっていう言い方が",
      waitedMs: 18_001,
      thinking: 0.9,
      sinceLastSegmentMs: 3_500,
    });

    expect(decision).toEqual({ release: true, reason: "max-wait-hard" });
  });

  it("does not let high thinking alone block the hard max", () => {
    const decision = decideHseBackstop({
      ...BASE,
      pendingText: "話の続きです。",
      waitedMs: 18_001,
      thinking: 0.9,
      sinceLastSegmentMs: 500,
    });

    expect(decision).toEqual({ release: true, reason: "max-wait-hard" });
  });

  it("keeps explicit handoffs eligible for release", () => {
    const decision = decideHseBackstop({
      ...BASE,
      pendingText: "こんな感じです。",
      waitedMs: 18_001,
      thinking: 0.9,
    });

    expect(decision).toEqual({ release: true, reason: "max-wait-hard" });
  });

  it("preserves the soft backstop for low-thinking silence", () => {
    const decision = decideHseBackstop({
      ...BASE,
      pendingText: "話の続きです。",
      waitedMs: 10_001,
      thinking: 0.1,
    });

    expect(decision).toEqual({ release: true, reason: "max-wait" });
  });
});

describe("hasExplicitTurnHandoff", () => {
  it("recognizes common Japanese turn handoff phrases", () => {
    expect(hasExplicitTurnHandoff("以上です。")).toBe(true);
    expect(hasExplicitTurnHandoff("一旦以上です")).toBe(true);
    expect(hasExplicitTurnHandoff("まだ途中なんですが")).toBe(false);
  });
});
