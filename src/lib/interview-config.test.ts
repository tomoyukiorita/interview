import { describe, expect, it } from "vitest";

import {
  getNextQuestionFromScenario,
  getScenarioById,
} from "./interview-config";

describe("general executive well-being scenario", () => {
  const scenario = getScenarioById("general");

  it("defines the general scenario as a compressed executive well-being interview", () => {
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
    expect(
      scenario?.topics.reduce((count, topic) => count + topic.questions.length, 0)
    ).toBe(11);
    expect(scenario?.topics[0]?.questions[0]?.text).toBe(
      "最近、仕事をしていて「今日はいい感じだな」と思えた瞬間って、どんなときですか。"
    );
    expect(scenario?.topics[2]?.questions[0]?.text).toBe(
      "経営者として健やかに働き続けるために、日々の習慣や、プレッシャーが高い時期の立て直しで意識していることを教えてください。"
    );
    expect(scenario?.topics[3]?.questions[1]?.text).toBe(
      "良いことだけでなく難しさも含めて、社内や候補者に誠実に伝えるために意識していることは何ですか。"
    );
    expect(scenario?.topics[4]?.questions[1]?.text).toBe(
      "社員の心身の健康を守りながら、挑戦や失敗から学ぶ文化をどうつくっていますか。"
    );
    expect(scenario?.topics[5]?.questions[0]?.text).toBe(
      "異なる価値観の摩擦や対立を、組織の成長や新しい価値につなげながら、多様な背景を持つ人が尊重し合って共創できるように、どんな対話の場や仕組みをつくっていますか。"
    );
    expect(scenario?.topics[6]?.questions[0]?.text).toBe(
      "御社の事業や働き方、人への投資は、社員や社会の未来のwell-beingにどうつながると考えていますか。"
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
        "社員のウェルビーイングを、会社の成長や利益とどう結びつけて考えていますか。",
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
        "経営者として健やかに働き続けるために、日々の習慣や、プレッシャーが高い時期の立て直しで意識していることを教えてください。",
      suggestedTopic: "executive_self",
      shouldHandoff: true,
      handoffTarget: "LeadershipWellbeingAgent",
    });
  });

  it("hands off from executive self to culture questions", () => {
    expect(scenario).toBeDefined();

    const decision = getNextQuestionFromScenario(scenario!, 2, 0, {
      answerSummary: "睡眠や運動に加えて、負荷が高い時期には相談相手を増やしています。",
      sentiment: "neutral",
      topicCovered: true,
      answerQuality: "adequate",
      currentAgentName: "LeadershipWellbeingAgent",
    });

    expect(decision).toMatchObject({
      nextQuestionId: "culture-1",
      nextQuestionText:
        "社員が無理をせず、自然体で働けていると感じるのは、どんな場面ですか。",
      suggestedTopic: "culture_trust",
      shouldHandoff: true,
      handoffTarget: "OrganizationCultureAgent",
    });
  });

  it("hands off from diversity questions to social impact questions", () => {
    expect(scenario).toBeDefined();

    const decision = getNextQuestionFromScenario(scenario!, 5, 0, {
      answerSummary: "違いをぶつけ合うことで、新しい施策に進化した経験があります。",
      sentiment: "neutral",
      topicCovered: true,
      answerQuality: "adequate",
    });

    expect(decision).toMatchObject({
      nextQuestionId: "impact-1",
      nextQuestionText:
        "御社の事業や働き方、人への投資は、社員や社会の未来のwell-beingにどうつながると考えていますか。",
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
      "そう感じるとき、組織の空気やマネジメント、安心して話せる関係性にどんな特徴がありますか。"
    );
    expect(decision.shouldHandoff).toBe(false);
    expect(decision.reason).toContain("フォローアップ");
  });

  it("moves to the next question when the topic follow-up budget is already used", () => {
    expect(scenario).toBeDefined();

    const decision = getNextQuestionFromScenario(scenario!, 3, 0, {
      answerSummary: "あります。",
      sentiment: "neutral",
      topicCovered: false,
      answerQuality: "brief",
      topicFollowUpCount: 1,
    });

    expect(decision).toMatchObject({
      nextQuestionId: "culture-2",
      nextQuestionText:
        "良いことだけでなく難しさも含めて、社内や候補者に誠実に伝えるために意識していることは何ですか。",
      shouldHandoff: false,
    });
    expect(decision.reason).toContain("トピック内の次の質問");
  });

  it("does not request a self-handoff when the same specialist should continue", () => {
    expect(scenario).toBeDefined();

    const decision = getNextQuestionFromScenario(scenario!, 3, 1, {
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
