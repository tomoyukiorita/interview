import { describe, expect, it } from "vitest";
import {
  createInitialEditorialState,
  decideEditorialDirective,
  MAX_DEEPEN,
  MAX_TURNS_PER_CHAPTER,
  type EditorialSelfReport,
  type EditorialState,
  type ResearchAnchor,
} from "./editorial-director";

function baseReport(
  overrides: Partial<EditorialSelfReport> = {}
): EditorialSelfReport {
  return {
    intervieweeLean: "present",
    emotionalEnergy: "neutral",
    currentThread: "Beyond Intelligence の理念",
    noticedConnection: null,
    threadDepth: "active",
    concreteExampleCovered: false,
    proposedNextMove: "deepen_scene",
    currentChapter: "concrete_example",
    researchAnchorUsed: null,
    ...overrides,
  };
}

function richAnswer(): string {
  return "KPIを超えた時に、計画もプロダクトもよくできて、お客さんの反応もいいと感じました。";
}

describe("decideEditorialDirective", () => {
  it("allows deepening up to the cap, then forces a lift on the next deepen", () => {
    let state: EditorialState = createInitialEditorialState();

    for (let turn = 1; turn <= MAX_DEEPEN; turn += 1) {
      const decision = decideEditorialDirective(
        baseReport(),
        state,
        { latestIntervieweeText: richAnswer() }
      );
      expect(decision.directive.editorialControl.priority).not.toBe("override");
      expect(decision.directive.nextMove).toBe("deepen_scene");
      state = decision.nextState;
    }

    // The (MAX_DEEPEN + 1)th consecutive deepen on the same thread is blocked.
    const blocked = decideEditorialDirective(baseReport(), state, {
      latestIntervieweeText: richAnswer(),
    });
    expect(blocked.directive.editorialControl.priority).toBe("override");
    expect(blocked.directive.currentDepth).toBe("enough");
    expect(blocked.directive.topicFatigue).toBe("high");
    expect(blocked.directive.chapterProgress).toBe("complete");
    expect(blocked.directive.nextMove).toBe("ask_origin");
    expect(blocked.directive.nextChapter).toBe("origin");
    expect(blocked.directive.editorialControl.forbiddenQuestionTypes).toContain(
      "same_branch_deepening"
    );
    expect(blocked.directive.editorialControl.forbiddenQuestionTypes).toContain(
      "reaction_chasing"
    );
    expect(blocked.nextState.sameThreadDeepenCount).toBe(0);
  });

  it("forces a lift after dwelling too long in one chapter even when the thread keeps changing", () => {
    let state = createInitialEditorialState();
    const threads = [
      "最初のリサーチ",
      "ラグの使い方",
      "クリニックの導入",
      "深夜対応の反応",
    ];

    // Each turn relabels the thread but stays in concrete_example, so the
    // same-thread deepen counter never trips. The chapter dwell budget must.
    let dwellTurns = 0;
    let lastDecision = decideEditorialDirective(
      baseReport({ currentThread: threads[0] }),
      state,
      { latestIntervieweeText: richAnswer() }
    );
    state = lastDecision.nextState;
    dwellTurns += 1;

    let i = 1;
    while (
      lastDecision.directive.editorialControl.priority !== "override" &&
      i < threads.length
    ) {
      lastDecision = decideEditorialDirective(
        baseReport({ currentThread: threads[i] }),
        state,
        { latestIntervieweeText: richAnswer() }
      );
      state = lastDecision.nextState;
      dwellTurns += 1;
      i += 1;
    }

    expect(lastDecision.directive.editorialControl.priority).toBe("override");
    expect(lastDecision.directive.nextChapter).toBe("origin");
    // It lifts once the dwell exceeds the budget, regardless of relabeling.
    expect(dwellTurns).toBe(MAX_TURNS_PER_CHAPTER + 1);
  });

  it("resets the chapter dwell counter when the chapter advances", () => {
    let state = createInitialEditorialState();
    // Two turns in concrete_example.
    state = decideEditorialDirective(baseReport(), state, {
      latestIntervieweeText: richAnswer(),
    }).nextState;
    state = decideEditorialDirective(baseReport(), state, {
      latestIntervieweeText: richAnswer(),
    }).nextState;
    expect(state.turnsInChapter).toBe(2);

    // Model moves to a new chapter -> counter restarts.
    const moved = decideEditorialDirective(
      baseReport({ currentChapter: "origin", currentThread: "前職の原体験" }),
      state,
      { latestIntervieweeText: richAnswer() }
    );
    expect(moved.nextState.turnsInChapter).toBe(1);
  });

  it("forces a lift on negative / hesitant answers without chasing reactions", () => {
    const state = createInitialEditorialState();
    const decision = decideEditorialDirective(
      baseReport({ proposedNextMove: "deepen_scene" }),
      state,
      { latestIntervieweeText: "それちょっとよくわからなかったですね。" }
    );
    expect(decision.directive.editorialControl.priority).toBe("override");
    expect(decision.directive.researchReturnPoint).not.toBe("");
    expect(decision.directive.editorialControl.forbiddenQuestionTypes).toContain(
      "reaction_chasing"
    );
  });

  it("does not lift on a short answer during the opening philosophy chapter", () => {
    const state = createInitialEditorialState();
    const decision = decideEditorialDirective(
      baseReport({ currentChapter: "opening_philosophy", currentThread: "理念" }),
      state,
      { latestIntervieweeText: "はい、そうです。" }
    );
    expect(decision.directive.editorialControl.priority).not.toBe("override");
  });

  it("resets the deepen counter when the thread changes", () => {
    let state = createInitialEditorialState();
    state = decideEditorialDirective(baseReport(), state, {
      latestIntervieweeText: richAnswer(),
    }).nextState;
    expect(state.sameThreadDeepenCount).toBe(1);

    const switched = decideEditorialDirective(
      baseReport({ currentThread: "まったく別の事業の話" }),
      state,
      { latestIntervieweeText: richAnswer() }
    );
    expect(switched.nextState.sameThreadDeepenCount).toBe(1);
  });

  it("honors the model's own 'depth enough' signal", () => {
    const state = createInitialEditorialState();
    const decision = decideEditorialDirective(
      baseReport({ threadDepth: "enough" }),
      state,
      { latestIntervieweeText: richAnswer() }
    );
    expect(decision.directive.editorialControl.priority).toBe("override");
    expect(decision.directive.chapterProgress).toBe("complete");
  });

  it("accumulates used research anchors and avoids duplicates", () => {
    let state = createInitialEditorialState();
    state = decideEditorialDirective(
      baseReport({ researchAnchorUsed: "Beyond Intelligence" }),
      state,
      { latestIntervieweeText: richAnswer() }
    ).nextState;
    state = decideEditorialDirective(
      baseReport({ researchAnchorUsed: "Beyond Intelligence" }),
      state,
      { latestIntervieweeText: richAnswer() }
    ).nextState;
    expect(state.usedResearchAnchors).toEqual(["Beyond Intelligence"]);

    state = decideEditorialDirective(
      baseReport({ researchAnchorUsed: "知性のその先へ" }),
      state,
      { latestIntervieweeText: richAnswer() }
    ).nextState;
    expect(state.usedResearchAnchors).toEqual([
      "Beyond Intelligence",
      "知性のその先へ",
    ]);
  });

  it("selects a chapter-matched unused research anchor on a forced lift", () => {
    const anchors: ResearchAnchor[] = [
      { kind: "distinctiveWord", text: "知性のその先へ" },
      { kind: "foundingStory", text: "雑誌編集で台割を作っていた前職" },
      { kind: "vision", text: "人が自然に力を発揮できる未来" },
    ];
    const decision = decideEditorialDirective(
      baseReport({ threadDepth: "enough", currentChapter: "concrete_example" }),
      createInitialEditorialState(),
      { latestIntervieweeText: richAnswer(), researchAnchors: anchors }
    );

    // Moving into the origin chapter -> prefers the foundingStory anchor.
    expect(decision.directive.nextChapter).toBe("origin");
    expect(decision.directive.researchAnchor).toBe(
      "雑誌編集で台割を作っていた前職"
    );
    expect(decision.directive.researchReturnPoint).toContain(
      "雑誌編集で台割を作っていた前職"
    );
    expect(decision.nextState.usedResearchAnchors).toContain(
      "雑誌編集で台割を作っていた前職"
    );
  });

  it("does not reuse an anchor already consumed", () => {
    const anchors: ResearchAnchor[] = [
      { kind: "foundingStory", text: "雑誌編集で台割を作っていた前職" },
      { kind: "connection", text: "前職の締め切り感覚 → 今のプラン重視" },
    ];
    const state: EditorialState = {
      ...createInitialEditorialState(),
      usedResearchAnchors: ["雑誌編集で台割を作っていた前職"],
    };
    const decision = decideEditorialDirective(
      baseReport({ threadDepth: "enough", currentChapter: "concrete_example" }),
      state,
      { latestIntervieweeText: richAnswer(), researchAnchors: anchors }
    );

    expect(decision.directive.researchAnchor).toBe(
      "前職の締め切り感覚 → 今のプラン重視"
    );
  });

  it("falls back to a generic return point when no anchors remain", () => {
    const decision = decideEditorialDirective(
      baseReport({ threadDepth: "enough" }),
      createInitialEditorialState(),
      { latestIntervieweeText: richAnswer(), researchAnchors: [] }
    );

    expect(decision.directive.researchAnchor).toBe("");
    expect(decision.directive.researchReturnPoint).not.toBe("");
  });

  it("advances the chapter on a forced lift", () => {
    const state: EditorialState = {
      ...createInitialEditorialState(),
      lastThread: "KPIと問い合わせの話",
      sameThreadDeepenCount: MAX_DEEPEN,
    };
    const decision = decideEditorialDirective(
      baseReport({ currentThread: "KPIと問い合わせの話", currentChapter: "concrete_example" }),
      state,
      { latestIntervieweeText: richAnswer() }
    );
    expect(decision.directive.nextChapter).toBe("origin");
    expect(decision.nextState.lastChapter).toBe("origin");
  });
});
