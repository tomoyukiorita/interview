import { describe, expect, it } from "vitest";

import {
  getNextQuestionFromScenario,
  getScenarioById,
} from "./interview-config";

describe("general executive well-being scenario", () => {
  const scenario = getScenarioById("general");

  it("defines the general scenario as an executive well-being interview", () => {
    expect(scenario).toBeDefined();
    expect(scenario?.title).toBe("経営者向けwell-beingインタビュー");
    expect(scenario?.topics.map((topic) => topic.id)).toEqual([
      "opening_checkin",
      "leadership_philosophy",
      "executive_self",
      "culture_trust",
      "challenge_growth",
      "diversity_cocreation",
      "social_impact",
      "closing",
    ]);
    expect(scenario?.topics[0]?.questions[0]?.text).toBe(
      "最近、仕事をしていて「今日はいい感じだな」と思えた瞬間って、どんなときですか。"
    );
    expect(scenario?.topics[2]?.questions[1]?.text).toBe(
      "プレッシャーが高い時期に、自分を立て直すために意識していることは何ですか。"
    );
    expect(scenario?.topics[4]?.questions[2]?.text).toBe(
      "社員の心身の健康を守るために、何に一番力を入れていますか。"
    );
    expect(scenario?.topics[4]?.questions[3]?.text).toBe(
      "社員が挑戦しやすくなるように、どんな仕組みがありますか。"
    );
  });

  it("moves from the opening check-in to the first main question without handing off", () => {
    expect(scenario).toBeDefined();

    const decision = getNextQuestionFromScenario(scenario!, 0, 0, {
      answerSummary: "朝に集中できて、周囲とのやりとりもスムーズだった日です。",
      sentiment: "positive",
      topicCovered: true,
      answerQuality: "adequate",
      currentAgentName: "InterviewAgent",
    });

    expect(decision).toMatchObject({
      nextQuestionId: "lead-1",
      nextQuestionText:
        "社員や生活者のウェルビーイングを、会社の成長や利益とどう結びつけて考えていますか。",
      suggestedTopic: "leadership_philosophy",
      shouldHandoff: false,
    });
  });

  it("hands off from leadership questions to executive self questions", () => {
    expect(scenario).toBeDefined();

    const decision = getNextQuestionFromScenario(scenario!, 1, 1, {
      answerSummary: "経営判断の軸として、利益と持続可能性の両立を見ています。",
      sentiment: "neutral",
      topicCovered: true,
      answerQuality: "adequate",
    });

    expect(decision).toMatchObject({
      nextQuestionId: "self-1",
      nextQuestionText:
        "経営者として健やかに働き続けるために、日々意識していることは何ですか。",
      suggestedTopic: "executive_self",
      shouldHandoff: true,
      handoffTarget: "LeadershipWellbeingAgent",
    });
  });

  it("moves from the first executive self question to the second one before handing off", () => {
    expect(scenario).toBeDefined();

    const decision = getNextQuestionFromScenario(scenario!, 2, 0, {
      answerSummary: "睡眠や運動を意識していますが、まだ話せることがあります。",
      sentiment: "neutral",
      topicCovered: false,
      answerQuality: "adequate",
      currentAgentName: "LeadershipWellbeingAgent",
    });

    expect(decision).toMatchObject({
      nextQuestionId: "self-2",
      nextQuestionText:
        "プレッシャーが高い時期に、自分を立て直すために意識していることは何ですか。",
      shouldHandoff: false,
    });
  });

  it("hands off from diversity questions to social impact questions", () => {
    expect(scenario).toBeDefined();

    const decision = getNextQuestionFromScenario(scenario!, 5, 3, {
      answerSummary: "違いをぶつけ合うことで、新しい施策に進化した経験があります。",
      sentiment: "neutral",
      topicCovered: true,
      answerQuality: "adequate",
    });

    expect(decision).toMatchObject({
      nextQuestionId: "impact-1",
      nextQuestionText:
        "御社の事業や働き方は、地域や社会のウェルビーイングにどうつながっていると思いますか。",
      suggestedTopic: "social_impact",
      shouldHandoff: true,
      handoffTarget: "LeadershipWellbeingAgent",
    });
  });

  it("re-asks the same question with a follow-up when the answer is brief", () => {
    expect(scenario).toBeDefined();

    const decision = getNextQuestionFromScenario(scenario!, 3, 0, {
      answerSummary: "あります。",
      sentiment: "neutral",
      topicCovered: false,
      answerQuality: "brief",
    });

    expect(decision.nextQuestionId).toBe("culture-1");
    expect(decision.nextQuestionText).toBe(
      "そう感じるとき、組織の空気やマネジメントにどんな特徴がありますか。"
    );
    expect(decision.shouldHandoff).toBe(false);
    expect(decision.reason).toContain("フォローアップ");
  });

  it("does not request a self-handoff when the same specialist should continue", () => {
    expect(scenario).toBeDefined();

    const decision = getNextQuestionFromScenario(scenario!, 3, 3, {
      answerSummary: "候補者や社員に対して、難しさも含めて誠実に伝えるようにしています。",
      sentiment: "neutral",
      topicCovered: true,
      answerQuality: "adequate",
      currentAgentName: "OrganizationCultureAgent",
    });

    expect(decision).toMatchObject({
      nextQuestionId: "challenge-1",
      suggestedTopic: "challenge_growth",
      shouldHandoff: false,
    });
    expect(decision.handoffTarget).toBeUndefined();
  });
});
