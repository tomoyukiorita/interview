import { describe, expect, it } from "vitest";

import {
  buildGeminiInterviewSystemInstruction,
  createGeminiInterviewState,
  getGeminiInitialPrompt,
  getGeminiResumePrompt,
  runGeminiNextQuestion,
} from "./gemini-interview";

describe("gemini interview helpers", () => {
  it("builds an initial prompt with the welcome phrase and opening question", () => {
    const prompt = getGeminiInitialPrompt("general");

    expect(prompt).toContain("本日はお話を伺えることを楽しみにしていました");
    expect(prompt).toContain("今日はいい感じだな");
  });

  it("builds a resume prompt that asks Gemini to briefly restate the previous question", () => {
    const prompt = getGeminiResumePrompt(
      "最近、仕事をしていて「今日はいい感じだな」と思えた瞬間って、どんなときですか。"
    );

    expect(prompt).toContain("歓迎は繰り返さない");
    expect(prompt).toContain("短く言い直して");
    expect(prompt).toContain("今日はいい感じだな");
  });

  it("falls back to a generic continuation prompt when no previous question is available", () => {
    const prompt = getGeminiResumePrompt(null);

    expect(prompt).toContain("少し間が空いた");
    expect(prompt).toContain("自然に次の一言");
    expect(prompt).not.toContain("直前の質問:");
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

  it("prevents internal role and handoff wording from leaking to the user", () => {
    const instructions = buildGeminiInterviewSystemInstruction();

    expect(instructions).toContain("内部用語をユーザーに言わない");
    expect(instructions).toContain("エージェント");
    expect(instructions).toContain("引き継ぎ");
    expect(instructions).toContain("自然な一言で視点を変え");
    expect(instructions).toContain("ユーザーには内部切替を説明しない");
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
