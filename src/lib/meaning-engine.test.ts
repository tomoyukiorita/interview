import { describe, expect, it } from "vitest";

import {
  advanceInterviewClock,
  createInterviewClock,
  type InterviewClockState,
} from "./meaning-engine";

const RICH =
  "私たちは効率より、使う人の体験を一番大事にしています。理由はいくつもあります。";

describe("meaning engine depth clock", () => {
  it("starts at FACT in the philosophy chapter", () => {
    expect(createInterviewClock()).toEqual({
      chapter: "philosophy",
      turnsInChapter: 0,
      depth: "FACT",
      lessonAsked: false,
    });
  });

  it("opens at FACT/clarify_fact on the icebreak reply (never move_topic)", () => {
    const step = advanceInterviewClock(createInterviewClock(), "終わりました。");
    expect(step.depth).toBe("FACT");
    expect(step.intent).toBe("clarify_fact");
    expect(step.chapter).toBe("philosophy");
  });

  it("climbs one rung per substantive answer within a chapter", () => {
    let state = createInterviewClock();

    // Opening turn: FACT.
    let step = advanceInterviewClock(state, RICH);
    expect(step.depth).toBe("FACT");
    state = step.state;

    // Same chapter, rich answer -> EMOTION.
    step = advanceInterviewClock(state, RICH);
    expect(step.depth).toBe("EMOTION");
    expect(step.intent).toBe("explore_emotion");
    expect(step.chapter).toBe("philosophy");
    state = step.state;

    // Still philosophy -> VALUE.
    step = advanceInterviewClock(state, RICH);
    expect(step.depth).toBe("VALUE");
    expect(step.intent).toBe("extract_value");
    state = step.state;
  });

  it("resets depth to FACT and signals move_topic when the chapter lifts", () => {
    // philosophy budget is 3; the 4th substantive turn lifts to origin.
    let state = createInterviewClock();
    for (let i = 0; i < 3; i += 1) {
      state = advanceInterviewClock(state, RICH).state;
    }
    const lift = advanceInterviewClock(state, RICH);
    expect(lift.chapter).toBe("origin");
    expect(lift.depth).toBe("FACT");
    expect(lift.intent).toBe("move_topic");
  });

  it("treats a weak answer as a topic lift: reset to FACT/move_topic", () => {
    // Advance once past the opening so a weak answer can lift.
    let state = advanceInterviewClock(createInterviewClock(), RICH).state;
    const step = advanceInterviewClock(state, "特にないです。");
    expect(step.chapter).not.toBe("philosophy");
    expect(step.depth).toBe("FACT");
    expect(step.intent).toBe("move_topic");
  });

  it("asks one universalizing lesson question at the future->closing boundary", () => {
    const future: InterviewClockState = {
      chapter: "future",
      turnsInChapter: 3, // at budget -> next substantive turn lifts to closing
      depth: "PHILOSOPHY",
      lessonAsked: false,
    };
    const step = advanceInterviewClock(future, RICH);
    expect(step.chapter).toBe("closing");
    expect(step.depth).toBe("LESSON");
    expect(step.intent).toBe("derive_lesson");
    expect(step.state.lessonAsked).toBe(true);
    // This turn must still pose a question (universalize the lesson).
    expect(step.hint).toContain("もう1問");
  });

  it("wraps up (no new question) once the lesson question has been asked", () => {
    const closing: InterviewClockState = {
      chapter: "closing",
      turnsInChapter: 1,
      depth: "LESSON",
      lessonAsked: true,
    };
    const step = advanceInterviewClock(closing, RICH);
    expect(step.chapter).toBe("closing");
    expect(step.depth).toBe("LESSON");
    expect(step.intent).toBe("derive_lesson");
    // The wrap-up hint forbids a new question and asks for a grateful close.
    expect(step.hint).toContain("感謝");
    expect(step.hint).not.toContain("もう1問");
  });

  it("embeds the chapter hint plus the depth guidance line for non-closing turns", () => {
    let state = advanceInterviewClock(createInterviewClock(), RICH).state;
    const step = advanceInterviewClock(state, RICH); // EMOTION
    expect(step.hint).toContain("感情");
    expect(step.hint).toContain("受け切る");
  });

  it("never climbs past LESSON", () => {
    let state: InterviewClockState = {
      chapter: "future",
      turnsInChapter: 1,
      depth: "LESSON",
      lessonAsked: false,
    };
    const step = advanceInterviewClock(state, RICH);
    expect(step.depth).toBe("LESSON");
  });
});
