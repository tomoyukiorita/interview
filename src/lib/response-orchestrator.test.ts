import { describe, expect, it } from "vitest";

import {
  DEFAULT_ORCHESTRATOR_CONFIG,
  ResponseOrchestrator,
  type OrchestratorContext,
} from "./response-orchestrator";
import type { HumanState, OrchestratorActionKind } from "./types";

const NOW = 1_000_000;

function humanState(overrides: Partial<HumanState> = {}): HumanState {
  return {
    endOfTurn: 0,
    waitScore: 1,
    thinking: 0,
    emotion: null,
    engagement: 0,
    recommendedAction: "WAIT",
    updatedAt: NOW,
    signals: {
      openAiVad: { active: false, weight: 0, value: null, ageMs: null },
      livekit: { active: false, weight: 0, value: null, ageMs: null },
      audio: { active: false, weight: 0, value: null, ageMs: null },
      emotion: { active: false, weight: 0, value: null, ageMs: null },
    },
    features: {
      silenceMs: null,
      speechRate: null,
      fillerCount: 0,
      pitchRange: null,
      volumeTrend: null,
    },
    ...overrides,
  };
}

function ctx(overrides: Partial<OrchestratorContext> = {}): OrchestratorContext {
  return {
    now: NOW,
    aiSpeaking: false,
    brainPending: false,
    hasPendingAnswer: true,
    // Permissive defaults: segment grace already elapsed, silence unknown.
    sinceLastSegmentMs: Number.POSITIVE_INFINITY,
    segmentCount: 1,
    silenceMs: null,
    pendingTextLength: 0,
    hasExplicitTurnHandoff: false,
    ...overrides,
  };
}

function featuresWithSilence(silenceMs: number): HumanState["features"] {
  return {
    silenceMs,
    speechRate: null,
    fillerCount: 0,
    pitchRange: null,
    volumeTrend: null,
  };
}

// Deterministic phrase picker for tests.
const firstPhrase = (pool: readonly string[]) => ({
  phrase: pool[0],
  index: 0,
});

describe("ResponseOrchestrator gating", () => {
  it("waits while the AI is speaking", () => {
    const o = new ResponseOrchestrator();
    const action = o.decide(
      humanState({ endOfTurn: 0.9 }),
      ctx({ aiSpeaking: true })
    );
    expect(action.kind).toBe<OrchestratorActionKind>("WAIT");
  });

  it("waits (no backchannel) while a follow-up is pending", () => {
    const o = new ResponseOrchestrator();
    const action = o.decide(
      humanState({ endOfTurn: 0.4 }),
      ctx({ brainPending: true })
    );
    expect(action.kind).toBe("WAIT");
  });

  it("follows up when end-of-turn is high and there is content", () => {
    const o = new ResponseOrchestrator();
    const action = o.decide(humanState({ endOfTurn: 0.85 }), ctx());
    expect(action.kind).toBe("FOLLOW_UP");
  });

  it("does not follow up with no pending answer", () => {
    const o = new ResponseOrchestrator();
    const action = o.decide(
      humanState({ endOfTurn: 0.85 }),
      ctx({ hasPendingAnswer: false })
    );
    expect(action.kind).toBe("WAIT");
  });
});

describe("ResponseOrchestrator follow-up patience (segment grace + min silence)", () => {
  it("holds follow-up right after a fresh segment lands (segment grace)", () => {
    const o = new ResponseOrchestrator();
    const action = o.decide(
      humanState({ endOfTurn: 0.85, features: featuresWithSilence(2000) }),
      ctx({ sinceLastSegmentMs: 300, segmentCount: 1, silenceMs: 2000 })
    );
    expect(action.kind).toBe("WAIT");
    expect(action.reason).toBe("segment-grace");
  });

  it("scales the grace window up with more segments (storytelling)", () => {
    const o = new ResponseOrchestrator();
    // 1700ms passes the single-segment grace (1500) but not a 3-segment grace
    // (1500 + 2*400 = 2300).
    const state = humanState({
      endOfTurn: 0.85,
      features: featuresWithSilence(2000),
    });
    const single = o.decide(
      state,
      ctx({ sinceLastSegmentMs: 1700, segmentCount: 1, silenceMs: 2000 })
    );
    expect(single.kind).toBe("FOLLOW_UP");
    const many = o.decide(
      state,
      ctx({ sinceLastSegmentMs: 1700, segmentCount: 3, silenceMs: 2000 })
    );
    expect(many.kind).toBe("WAIT");
    expect(many.reason).toBe("segment-grace");
  });

  it("holds follow-up until minimum trailing silence is reached", () => {
    const o = new ResponseOrchestrator();
    const action = o.decide(
      humanState({ endOfTurn: 0.95, features: featuresWithSilence(400) }),
      ctx({ sinceLastSegmentMs: 9999, segmentCount: 1, silenceMs: 400 })
    );
    expect(action.kind).toBe("WAIT");
    expect(action.reason).toBe("min-silence");
  });

  it("follows up once grace elapsed and silence is sufficient", () => {
    const o = new ResponseOrchestrator();
    const action = o.decide(
      humanState({ endOfTurn: 0.85, features: featuresWithSilence(2000) }),
      ctx({
        sinceLastSegmentMs: 9999,
        segmentCount: 2,
        silenceMs: 2000,
        pendingTextLength: 120,
      })
    );
    expect(action.kind).toBe("FOLLOW_UP");
  });

  it("holds long multi-segment answers longer unless explicitly handed off", () => {
    const o = new ResponseOrchestrator();
    const state = humanState({
      endOfTurn: 0.9,
      features: featuresWithSilence(3000),
    });
    const stillStory = o.decide(
      state,
      ctx({
        sinceLastSegmentMs: 6000,
        segmentCount: 3,
        silenceMs: 3000,
        pendingTextLength: 140,
      })
    );
    expect(stillStory.kind).toBe("WAIT");
    expect(stillStory.reason).toBe("story-grace");

    const handedOff = o.decide(
      state,
      ctx({
        sinceLastSegmentMs: 6000,
        segmentCount: 3,
        silenceMs: 3000,
        pendingTextLength: 140,
        hasExplicitTurnHandoff: true,
      })
    );
    expect(handedOff.kind).toBe("FOLLOW_UP");
  });
});

describe("ResponseOrchestrator backchannel cooldown", () => {
  it("emits a backchannel on a mid pause, then suppresses within cooldown", () => {
    const o = new ResponseOrchestrator({}, firstPhrase);
    const first = o.decide(humanState({ endOfTurn: 0.4, thinking: 0.2 }), ctx());
    expect(first.kind).toBe("BACKCHANNEL");
    expect(first.phrase).toBeTruthy();

    o.notePerformed(first, NOW);

    const tooSoon = o.decide(
      humanState({ endOfTurn: 0.4, thinking: 0.2 }),
      ctx({ now: NOW + 1000 })
    );
    expect(tooSoon.kind).toBe("WAIT");

    const afterCooldown = o.decide(
      humanState({ endOfTurn: 0.4, thinking: 0.2 }),
      ctx({ now: NOW + DEFAULT_ORCHESTRATOR_CONFIG.backchannelCooldownMs + 1 })
    );
    expect(afterCooldown.kind).toBe("BACKCHANNEL");
  });

  it("stays silent when clearly mid-thought (high thinking)", () => {
    const o = new ResponseOrchestrator({}, firstPhrase);
    const action = o.decide(
      humanState({ endOfTurn: 0.4, thinking: 0.9 }),
      ctx()
    );
    expect(action.kind).toBe("WAIT");
  });
});

describe("ResponseOrchestrator empathy cooldown", () => {
  it("emits empathy when recommended, then respects the longer cooldown", () => {
    const o = new ResponseOrchestrator({}, firstPhrase);
    // endOfTurn below backchannelMinEot so only empathy can fire here, which
    // isolates the empathy cooldown from the backchannel fallback.
    const first = o.decide(
      humanState({ endOfTurn: 0.15, recommendedAction: "EMPATHY" }),
      ctx()
    );
    expect(first.kind).toBe("EMPATHY");
    o.notePerformed(first, NOW);

    const tooSoon = o.decide(
      humanState({ endOfTurn: 0.15, recommendedAction: "EMPATHY" }),
      ctx({ now: NOW + 4000 })
    );
    expect(tooSoon.kind).toBe("WAIT");

    const afterCooldown = o.decide(
      humanState({ endOfTurn: 0.15, recommendedAction: "EMPATHY" }),
      ctx({ now: NOW + DEFAULT_ORCHESTRATOR_CONFIG.empathyCooldownMs + 1 })
    );
    expect(afterCooldown.kind).toBe("EMPATHY");
  });

  it("falls back to a backchannel when empathy is on cooldown but a pause is open", () => {
    const o = new ResponseOrchestrator({}, firstPhrase);
    const first = o.decide(
      humanState({ endOfTurn: 0.5, recommendedAction: "EMPATHY" }),
      ctx()
    );
    expect(first.kind).toBe("EMPATHY");
    o.notePerformed(first, NOW);

    // Empathy still on cooldown, but the open mid-pause warrants a light aizuchi
    // once the (shorter) backchannel cooldown has elapsed.
    const fallback = o.decide(
      humanState({ endOfTurn: 0.5, recommendedAction: "EMPATHY" }),
      ctx({ now: NOW + DEFAULT_ORCHESTRATOR_CONFIG.backchannelCooldownMs + 1 })
    );
    expect(fallback.kind).toBe("BACKCHANNEL");
  });
});
