import { describe, expect, it } from "vitest";

import { buildWellbeingAgent, type EditorialController } from "./wellbeing-agent";
import {
  createInitialEditorialState,
  type EditorialState,
  type ResearchAnchor,
} from "./editorial-director";

function createController(
  initial: EditorialState = createInitialEditorialState(),
  latestIntervieweeText = "",
  researchAnchors: ResearchAnchor[] = []
): EditorialController & { state: EditorialState } {
  const box = { state: initial };
  return {
    state: box.state,
    getState: () => box.state,
    getLatestIntervieweeText: () => latestIntervieweeText,
    getResearchAnchors: () => researchAnchors,
    commit: (next) => {
      box.state = next;
    },
  };
}

async function callNoteInterviewFocus(
  agent: ReturnType<typeof buildWellbeingAgent>,
  args: Record<string, unknown>
) {
  const tool = agent.tools.find((t) => t.name === "note_interview_focus");
  if (!tool || tool.type !== "function") {
    throw new Error("note_interview_focus tool not found");
  }
  const raw = await tool.invoke({} as never, JSON.stringify(args));
  return JSON.parse(String(raw)) as {
    nextMove: string;
    currentDepth: string;
    topicFatigue: string;
    chapterProgress: string;
    nextChapter: string | null;
    researchAnchor: string;
    researchReturnPoint: string;
    editorialControl: {
      priority: string;
      researchAnchor: string;
      forbiddenQuestionTypes: string[];
    };
  };
}

describe("wellbeing realtime editorial brain", () => {
  it("forces a lift via the tool when the model honestly reports depth is enough", async () => {
    const controller = createController(
      createInitialEditorialState(),
      "KPIを超えた時に、計画もプロダクトもよくできていると感じました。"
    );
    const agent = buildWellbeingAgent({ editorialController: controller });

    const result = await callNoteInterviewFocus(agent, {
      intervieweeLean: "present",
      emotionalEnergy: "neutral",
      currentThread: "KPIを超えた手応え",
      noticedConnection: null,
      threadDepth: "enough",
      concreteExampleCovered: true,
      proposedNextMove: "deepen_scene",
      currentChapter: "concrete_example",
      researchAnchorUsed: null,
    });

    expect(result.editorialControl.priority).toBe("override");
    expect(result.currentDepth).toBe("enough");
    expect(result.chapterProgress).toBe("complete");
    expect(result.nextChapter).toBe("origin");
    expect(result.editorialControl.forbiddenQuestionTypes).toContain(
      "same_branch_deepening"
    );
  });

  it("hands the model a concrete research anchor on a forced lift", async () => {
    const controller = createController(
      createInitialEditorialState(),
      "KPIを超えた時に、計画もプロダクトもよくできていると感じました。",
      [
        { kind: "foundingStory", text: "雑誌編集で台割を作っていた前職" },
        { kind: "distinctiveWord", text: "知性のその先へ" },
      ]
    );
    const agent = buildWellbeingAgent({ editorialController: controller });

    const result = await callNoteInterviewFocus(agent, {
      intervieweeLean: "present",
      emotionalEnergy: "neutral",
      currentThread: "KPIを超えた手応え",
      noticedConnection: null,
      threadDepth: "enough",
      concreteExampleCovered: true,
      proposedNextMove: "deepen_scene",
      currentChapter: "concrete_example",
      researchAnchorUsed: null,
    });

    expect(result.editorialControl.priority).toBe("override");
    expect(result.nextChapter).toBe("origin");
    expect(result.researchAnchor).toBe("雑誌編集で台割を作っていた前職");
    expect(result.researchReturnPoint).toContain("雑誌編集で台割を作っていた前職");
    expect(controller.getState().usedResearchAnchors).toContain(
      "雑誌編集で台割を作っていた前職"
    );
  });

  it("commits updated editorial state back to the controller", async () => {
    const controller = createController(
      createInitialEditorialState(),
      "KPIを超えた時に、計画もプロダクトもよくできていると感じました。"
    );
    const agent = buildWellbeingAgent({ editorialController: controller });

    await callNoteInterviewFocus(agent, {
      intervieweeLean: "present",
      emotionalEnergy: "high",
      currentThread: "KPIを超えた手応え",
      noticedConnection: null,
      threadDepth: "active",
      concreteExampleCovered: false,
      proposedNextMove: "deepen_scene",
      currentChapter: "concrete_example",
      researchAnchorUsed: "Beyond Intelligence",
    });

    expect(controller.getState().lastThread).toBe("KPIを超えた手応え");
    expect(controller.getState().sameThreadDeepenCount).toBe(1);
    expect(controller.getState().usedResearchAnchors).toContain(
      "Beyond Intelligence"
    );
  });

  it("instructs the realtime model that editorial control outranks its own urge to deepen", () => {
    const instructions = String(buildWellbeingAgent().instructions ?? "");

    expect(instructions).toContain("editorialControl");
    expect(instructions).toContain("上位");
    expect(instructions).toContain("override");
    expect(instructions).toContain("最大2手");
    expect(instructions).toContain("同じ章の質問を続けない");
    expect(instructions).toContain("researchReturnPoint");
  });

  it("forbids abstract transition templates and requires a concrete anchor", () => {
    const instructions = String(buildWellbeingAgent().instructions ?? "");

    expect(instructions).toContain("researchAnchor");
    expect(instructions).toContain("抽象テンプレ");
    expect(instructions).toContain("即答できる");
  });

  it("puts a dominant plain-question-shape rule before everything else", () => {
    const instructions = String(buildWellbeingAgent().instructions ?? "");

    expect(instructions).toContain("問いの形");
    expect(instructions).toContain("一息で言い切れる");
    expect(instructions).toContain("連体修飾を積まない");
    expect(instructions).toContain("条件節を使わない");
  });

  it("makes the narrative arc the spine, with concrete details as a springboard", () => {
    const instructions = String(buildWellbeingAgent().instructions ?? "");

    expect(instructions).toContain("インタビューの背骨");
    expect(instructions).toContain("原体験");
    expect(instructions).toContain("未来像");
    expect(instructions).toContain("踏み台");
    expect(instructions).toContain("進め方の手本");
    // The editorial tool is reframed as a backstop, not the primary driver.
    expect(instructions).toContain("横滑りの安全網");
  });

  it("treats unfamiliar AI/IT terms without inventing meanings", () => {
    const instructions = String(buildWellbeingAgent().instructions ?? "");

    expect(instructions).toContain("用語・聞き取り");
    expect(instructions).toContain("RAG");
    expect(instructions).toContain("決めつけ");
  });
});
