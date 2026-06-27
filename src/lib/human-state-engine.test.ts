import { describe, expect, it } from "vitest";

import {
  DEFAULT_HUMAN_STATE_CONFIG,
  computeHumanState,
  freshness,
  type HumanStateInput,
} from "./human-state-engine";
import type { EmotionState } from "./types";

const NOW = 1_000_000;

function baseInput(overrides: Partial<HumanStateInput> = {}): HumanStateInput {
  return {
    now: NOW,
    vadSpeaking: false,
    vadSpeechEndedAt: null,
    vadUpdatedAt: NOW,
    livekitEndOfTurn: null,
    livekitUpdatedAt: null,
    silenceMs: null,
    endsWithHesitation: false,
    endsMidThought: false,
    fillerCount: 0,
    speechRate: null,
    pitchRange: null,
    volumeTrend: null,
    audioUpdatedAt: null,
    emotion: null,
    emotionUpdatedAt: null,
    ...overrides,
  };
}

function emotion(overrides: Partial<EmotionState> = {}): EmotionState {
  return {
    excitement: 40,
    nervousness: 30,
    confidence: 50,
    engagement: 60,
    label: "neutral",
    timestamp: NOW,
    ...overrides,
  };
}

describe("freshness decay", () => {
  it("is 1 within the fresh window and 0 past the stale bound", () => {
    expect(freshness(0)).toBe(1);
    expect(freshness(DEFAULT_HUMAN_STATE_CONFIG.freshFullMs)).toBe(1);
    expect(freshness(DEFAULT_HUMAN_STATE_CONFIG.freshZeroMs)).toBe(0);
    expect(freshness(DEFAULT_HUMAN_STATE_CONFIG.freshZeroMs + 5000)).toBe(0);
  });

  it("decays linearly between the bounds", () => {
    const mid =
      (DEFAULT_HUMAN_STATE_CONFIG.freshFullMs +
        DEFAULT_HUMAN_STATE_CONFIG.freshZeroMs) /
      2;
    expect(freshness(mid)).toBeCloseTo(0.5, 5);
  });
});

describe("computeHumanState end-of-turn", () => {
  it("is low while the interviewee is speaking", () => {
    const state = computeHumanState(
      baseInput({ vadSpeaking: true, vadUpdatedAt: NOW })
    );
    expect(state.endOfTurn).toBeLessThan(0.1);
    expect(state.recommendedAction).toBe("WAIT");
  });

  it("rises as silence after speech grows", () => {
    const shortPause = computeHumanState(
      baseInput({
        vadSpeaking: false,
        vadSpeechEndedAt: NOW - 300,
        vadUpdatedAt: NOW - 300,
      })
    );
    const longPause = computeHumanState(
      baseInput({
        vadSpeaking: false,
        vadSpeechEndedAt: NOW - 2200,
        vadUpdatedAt: NOW - 2200,
      })
    );
    expect(longPause.endOfTurn).toBeGreaterThan(shortPause.endOfTurn);
    expect(longPause.endOfTurn).toBeGreaterThanOrEqual(
      DEFAULT_HUMAN_STATE_CONFIG.eotHigh
    );
    expect(longPause.recommendedAction).toBe("FOLLOW_UP");
  });

  it("trusts a fresh high LiveKit signal more than a long silence", () => {
    // No silence yet, but the audio turn detector is confident.
    const state = computeHumanState(
      baseInput({
        vadSpeaking: false,
        vadSpeechEndedAt: NOW - 300,
        vadUpdatedAt: NOW - 300,
        livekitEndOfTurn: 0.95,
        livekitUpdatedAt: NOW,
      })
    );
    expect(state.endOfTurn).toBeGreaterThan(0.5);
  });

  it("discards a stale LiveKit signal (freshness)", () => {
    const stale = computeHumanState(
      baseInput({
        vadSpeaking: true,
        vadUpdatedAt: NOW,
        livekitEndOfTurn: 0.95,
        livekitUpdatedAt: NOW - 10_000,
      })
    );
    // The stale 0.95 must not override the live "still speaking" VAD value.
    expect(stale.endOfTurn).toBeLessThan(0.1);
    expect(stale.signals.livekit.active).toBe(false);
  });
});

describe("computeHumanState thinking suppression", () => {
  it("keeps end-of-turn low when the partial trails into a filler", () => {
    const withFiller = computeHumanState(
      baseInput({
        vadSpeaking: false,
        vadSpeechEndedAt: NOW - 1500,
        vadUpdatedAt: NOW - 1500,
        endsWithHesitation: true,
      })
    );
    expect(withFiller.thinking).toBeGreaterThan(0.5);
    expect(withFiller.recommendedAction).toBe("WAIT");
    expect(withFiller.endOfTurn).toBeLessThan(
      DEFAULT_HUMAN_STATE_CONFIG.eotHigh
    );
  });

  it("treats several fillers in one utterance as still-composing", () => {
    const state = computeHumanState(
      baseInput({
        vadSpeaking: false,
        vadSpeechEndedAt: NOW - 1500,
        vadUpdatedAt: NOW - 1500,
        fillerCount: 3,
      })
    );
    expect(state.thinking).toBeGreaterThan(0.5);
    expect(state.recommendedAction).toBe("WAIT");
    expect(state.features.fillerCount).toBe(3);
  });

  it("registers thinking when paused but LiveKit still judges the turn open", () => {
    // ASR cleaned the fillers and the sentence looks complete, but the audio
    // turn detector says the turn is not over (0.0) during the pause.
    const state = computeHumanState(
      baseInput({
        vadSpeaking: false,
        vadSpeechEndedAt: NOW - 900,
        vadUpdatedAt: NOW - 900,
        silenceMs: 900,
        audioUpdatedAt: NOW,
        livekitEndOfTurn: 0.0,
        livekitUpdatedAt: NOW,
      })
    );
    expect(state.thinking).toBeGreaterThanOrEqual(0.8);
    expect(state.recommendedAction).toBe("WAIT");
  });

  it("waits through a long silence when the turn ends mid-thought", () => {
    // A grammatically incomplete turn after a long pause must NOT follow up —
    // this is the "interrupts a thinking interviewee" regression.
    const state = computeHumanState(
      baseInput({
        vadSpeaking: false,
        vadSpeechEndedAt: NOW - 2500,
        vadUpdatedAt: NOW - 1500,
        endsMidThought: true,
      })
    );
    expect(state.thinking).toBeGreaterThanOrEqual(0.9);
    expect(state.recommendedAction).toBe("WAIT");
    expect(state.endOfTurn).toBeLessThan(
      DEFAULT_HUMAN_STATE_CONFIG.eotHigh
    );
  });
});

describe("computeHumanState LiveKit silence gate", () => {
  it("discounts a high LiveKit verdict more the less trailing silence there is", () => {
    // Hold everything else constant so only the silence-driven gate differs:
    // vad value is fixed (speech ended 200ms ago -> below floor, value 0), the
    // verdict is high (0.9, so pausedMidTurn never fires), and both silences sit
    // below the floor so the `justPaused` thinking cue is identical (0.6).
    const lessSilence = computeHumanState(
      baseInput({
        vadSpeaking: false,
        vadSpeechEndedAt: NOW - 200,
        vadUpdatedAt: NOW,
        livekitEndOfTurn: 0.9,
        livekitUpdatedAt: NOW,
        silenceMs: 100,
        audioUpdatedAt: null,
      })
    );
    const moreSilence = computeHumanState(
      baseInput({
        vadSpeaking: false,
        vadSpeechEndedAt: NOW - 200,
        vadUpdatedAt: NOW,
        livekitEndOfTurn: 0.9,
        livekitUpdatedAt: NOW,
        silenceMs: 350,
        audioUpdatedAt: null,
      })
    );
    expect(lessSilence.endOfTurn).toBeLessThan(moreSilence.endOfTurn);
  });

  it("keeps end-of-turn low when LiveKit says the turn is still open", () => {
    // A low verdict (turn open) must keep us waiting even after long silence —
    // the gate never inflates a low verdict.
    const state = computeHumanState(
      baseInput({
        vadSpeaking: false,
        vadSpeechEndedAt: NOW - 1500,
        vadUpdatedAt: NOW,
        livekitEndOfTurn: 0.1,
        livekitUpdatedAt: NOW,
        silenceMs: 1500,
        audioUpdatedAt: NOW,
      })
    );
    expect(state.endOfTurn).toBeLessThan(DEFAULT_HUMAN_STATE_CONFIG.eotHigh);
    expect(state.recommendedAction).toBe("WAIT");
  });
});

describe("computeHumanState emotion + empathy", () => {
  it("recommends empathy on a finished-ish turn with nervous emotion", () => {
    const state = computeHumanState(
      baseInput({
        vadSpeaking: false,
        vadSpeechEndedAt: NOW - 1200,
        vadUpdatedAt: NOW - 1200,
        emotion: emotion({ label: "nervous", nervousness: 80 }),
        emotionUpdatedAt: NOW,
      })
    );
    expect(state.endOfTurn).toBeGreaterThanOrEqual(
      DEFAULT_HUMAN_STATE_CONFIG.eotLow
    );
    expect(state.endOfTurn).toBeLessThan(DEFAULT_HUMAN_STATE_CONFIG.eotHigh);
    expect(state.recommendedAction).toBe("EMPATHY");
  });

  it("passes through normalized engagement and drops stale emotion", () => {
    const fresh = computeHumanState(
      baseInput({ emotion: emotion({ engagement: 70 }), emotionUpdatedAt: NOW })
    );
    expect(fresh.engagement).toBeCloseTo(0.7, 5);

    const stale = computeHumanState(
      baseInput({
        emotion: emotion({ engagement: 70 }),
        emotionUpdatedAt: NOW - 10_000,
      })
    );
    expect(stale.emotion).toBeNull();
    expect(stale.engagement).toBe(0);
  });
});

describe("computeHumanState with no signals", () => {
  it("defaults to WAIT and zero end-of-turn", () => {
    const state = computeHumanState(baseInput({ vadUpdatedAt: NOW - 10_000 }));
    expect(state.endOfTurn).toBe(0);
    expect(state.recommendedAction).toBe("WAIT");
  });
});
