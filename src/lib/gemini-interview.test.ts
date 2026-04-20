import { describe, expect, it } from "vitest";

import {
  buildGeminiInterviewSystemInstruction,
  createGeminiInterviewState,
  getGeminiInitialPrompt,
  runGeminiNextQuestion,
} from "./gemini-interview";

describe("gemini interview helpers", () => {
  it("builds an initial prompt with the welcome phrase and opening question", () => {
    const prompt = getGeminiInitialPrompt("general");

    expect(prompt).toContain("本日はお話を伺えることを楽しみにしていました");
    expect(prompt).toContain("今日はいい感じだな");
  });

  it("includes speed, tone, and speech style guidance in the system instruction", () => {
    const instructions = buildGeminiInterviewSystemInstruction({
      speed: "fast",
      tone: "firm",
      speechStyle: "kansai",
    });

    expect(instructions).toContain("関西弁");
    expect(instructions).toContain("少し速め");
    expect(instructions).toContain("語尾はやや言い切る");
    expect(instructions).toContain("get_next_question");
  });

  it("updates the current agent when the decision triggers a handoff", () => {
    const state = {
      ...createGeminiInterviewState("general"),
      currentTopicIndex: 1,
      currentQuestionIndex: 1,
    };
    const result = runGeminiNextQuestion(state, {
      currentAnswerSummary: "最近は対話の場づくりを特に意識しています。",
      currentAgentName: "InterviewAgent",
      sentiment: "positive",
      topicCovered: true,
      answerQuality: "detailed",
    });

    expect(result.decision.shouldHandoff).toBe(true);
    expect(result.nextState.currentAgentName).toBe("LeadershipWellbeingAgent");
  });
});
