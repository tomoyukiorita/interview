import { describe, expect, it } from "vitest";

import {
  closingAgent,
  interviewAgent,
  leadershipWellbeingAgent,
  organizationCultureAgent,
  supportAgent,
} from "./agents";
import { getScenarioById } from "./interview-config";

function getInstructions(agent: unknown): string {
  return String((agent as { instructions?: string }).instructions ?? "");
}

describe("interviewer character prompts", () => {
  it("gives the main interviewer a warm but restrained style", () => {
    const instructions = getInstructions(interviewAgent);

    expect(instructions).toContain("本日はお話を伺えることを楽しみにしていました");
    expect(instructions).toContain("そもそも");
    expect(instructions).toContain("nextQuestionText");
    expect(instructions).toContain("shouldHandoff");
    expect(instructions).toContain("自分では読み上げない");
    expect(instructions).toContain("次のエージェントに引き継ぐ");
    expect(instructions).toContain("最近、仕事をしていて");
    expect(instructions).toContain("今日はいい感じだな");
    expect(instructions).toContain("最初のアイスブレイク");
    expect(instructions).toContain("同じ言い回しを連続で使わない");
    expect(instructions).toContain("1ターン");
    expect(instructions).toContain("クッション言葉を置かない");
    expect(instructions).toContain("自然な言い換え");
    expect(instructions).toContain("共感したときは無機質に流さず");
    expect(instructions).toContain("それは素敵ですね");
    expect(instructions).toContain("受けだけで終わらせない");
    expect(instructions).toContain("同じ発話の中で次の質問まで続ける");
    expect(instructions).not.toContain("ほんとですね");
    expect(instructions).not.toContain("これは私の仮説なのですが");
  });

  it("guides specialized agents to cover themes without overusing stock phrases", () => {
    const leadershipInstructions = getInstructions(leadershipWellbeingAgent);
    const organizationInstructions = getInstructions(organizationCultureAgent);

    expect(leadershipInstructions).toContain("会社の成長や利益");
    expect(leadershipInstructions).toContain("handoff直後");
    expect(leadershipInstructions).toContain("経営者自身");
    expect(leadershipInstructions).toContain("社会");
    expect(leadershipInstructions).toContain("まず短く受ける");
    expect(leadershipInstructions).toContain("1文だけ");
    expect(leadershipInstructions).toContain("ワクワクしますね");
    expect(leadershipInstructions).toContain("次の質問まで続ける");
    expect(leadershipInstructions).toContain("同じ言い回しを連続で使わない");
    expect(organizationInstructions).toContain("候補者体験");
    expect(organizationInstructions).toContain("handoff直後");
    expect(organizationInstructions).toContain("心理的安全性");
    expect(organizationInstructions).toContain("多様性");
    expect(organizationInstructions).toContain("まず短く受ける");
    expect(organizationInstructions).toContain("受けてから次の質問");
    expect(organizationInstructions).toContain("ほんとうにそうですね");
    expect(organizationInstructions).toContain("受けだけで終わらせない");
    expect(organizationInstructions).toContain("質問の前に毎回");
  });

  it("guides support mode to propose a natural editorial style", () => {
    const instructions = getInstructions(supportAgent);

    expect(instructions).toContain("原体験");
    expect(instructions).toContain("言い換え確認");
    expect(instructions).toContain("同じような状況の人");
    expect(instructions).toContain("同じ言い回しを繰り返さない");
  });

  it("asks for a closing message without cramming multiple stock reactions", () => {
    const scenario = getScenarioById("general");

    expect(getInstructions(closingAgent)).toContain("同じような状況の人");
    expect(getInstructions(closingAgent)).toContain("一息で詰め込みすぎない");
    expect(scenario?.topics.at(-1)?.questions[0]?.text).toContain(
      "同じような状況の人"
    );
    expect(scenario?.topics.at(-1)?.questions[0]?.text).toContain(
      "約束できること"
    );
  });
});
