import { RealtimeAgent } from "@openai/agents/realtime";
import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import {
  getNextQuestionFromScenario,
  getScenarioById,
} from "./interview-config";
import type { BranchDecision, TranscriptEntry } from "./types";

let interviewState = {
  currentScenarioId: "general",
  currentTopicIndex: 0,
  currentQuestionIndex: 0,
  transcript: [] as TranscriptEntry[],
  completedTopics: [] as string[],
};

export function resetInterviewState(scenarioId: string = "general") {
  interviewState = {
    currentScenarioId: scenarioId,
    currentTopicIndex: 0,
    currentQuestionIndex: 0,
    transcript: [],
    completedTopics: [],
  };
}

export function getInterviewState() {
  return { ...interviewState };
}

const getNextQuestion = tool({
  name: "get_next_question",
  description:
    "回答者の回答内容と感情を評価し、次に聞くべき質問を決定する。質問が分岐する場合は適切な分岐先を選択する。",
  parameters: z.object({
    currentAnswerSummary: z
      .string()
      .describe("回答者の回答の要約"),
    sentiment: z
      .enum(["positive", "neutral", "negative"])
      .describe("回答者の感情（声のトーンや内容から判断）"),
    topicCovered: z
      .boolean()
      .describe("現在のトピックが十分にカバーされたか"),
    answerQuality: z
      .enum(["detailed", "adequate", "brief", "off_topic"])
      .describe("回答の質・深さの評価"),
  }),
  execute: async ({
    currentAnswerSummary,
    sentiment,
    topicCovered,
    answerQuality,
  }): Promise<string> => {
    const scenario = getScenarioById(interviewState.currentScenarioId);
    if (!scenario) {
      return JSON.stringify({
        nextQuestion: "インタビューを終了します。ご協力ありがとうございました。",
        shouldHandoff: true,
        handoffTarget: "closing",
        reason: "シナリオが見つかりません",
      });
    }

    const decision: BranchDecision = getNextQuestionFromScenario(
      scenario,
      interviewState.currentTopicIndex,
      interviewState.currentQuestionIndex,
      {
        answerSummary: currentAnswerSummary,
        sentiment,
        topicCovered,
        answerQuality,
      }
    );

    if (decision.suggestedTopic) {
      const topicIdx = scenario.topics.findIndex(
        (t) => t.id === decision.suggestedTopic
      );
      if (topicIdx >= 0) {
        interviewState.currentTopicIndex = topicIdx;
        interviewState.currentQuestionIndex = 0;
      }
    } else if (topicCovered) {
      interviewState.currentTopicIndex++;
      interviewState.currentQuestionIndex = 0;
      if (decision.suggestedTopic) {
        interviewState.completedTopics.push(decision.suggestedTopic);
      }
    } else {
      interviewState.currentQuestionIndex++;
    }

    interviewState.transcript.push({
      id: `answer-${Date.now()}`,
      role: "interviewee",
      text: currentAnswerSummary,
      timestamp: Date.now(),
      sentiment,
    });

    return JSON.stringify(decision);
  },
});

const recordObservation = tool({
  name: "record_observation",
  description:
    "インタビュー中に気づいた回答者の特徴や注目すべきポイントを記録する",
  parameters: z.object({
    observation: z.string().describe("観察メモ"),
    category: z
      .enum([
        "communication_style",
        "expertise",
        "enthusiasm",
        "concern",
        "notable_response",
      ])
      .describe("観察カテゴリ"),
    importance: z
      .enum(["high", "medium", "low"])
      .describe("重要度"),
  }),
  execute: async ({ observation, category, importance }): Promise<string> => {
    return JSON.stringify({
      recorded: true,
      observation,
      category,
      importance,
      timestamp: Date.now(),
    });
  },
});

const suggestFollowUp = tool({
  name: "suggest_follow_up",
  description:
    "サポートモードで、人間のインタビュアーに次の質問やフォローアップを提案する",
  parameters: z.object({
    suggestion: z.string().describe("提案する質問やフォローアップ"),
    reason: z.string().describe("提案の理由"),
    priority: z.enum(["high", "medium", "low"]).describe("優先度"),
  }),
  execute: async ({ suggestion, reason, priority }): Promise<string> => {
    return JSON.stringify({
      suggestion,
      reason,
      priority,
      timestamp: Date.now(),
    });
  },
});

export const closingAgent = new RealtimeAgent({
  name: "ClosingAgent",
  instructions: `あなたはインタビューのクロージングを担当するエージェントです。
以下の手順でインタビューを締めくくってください：

1. 回答者にこれまでの回答への感謝を伝える
2. 何か質問や補足があるか確認する
3. 今後の流れを簡潔に説明する
4. 丁寧にお別れの挨拶をする

声のトーンは温かく、プロフェッショナルに保ってください。`,
  tools: [recordObservation],
});

export const technicalTopicAgent = new RealtimeAgent({
  name: "TechnicalTopicAgent",
  instructions: `あなたは技術的なトピックについて深掘りするインタビュアーです。
  
以下のガイドラインに従ってください：
- 回答者の技術的な経験について具体的なエピソードを引き出す
- 抽象的な回答にはフォローアップで具体例を求める
- 回答者が詰まった場合は、別の角度から質問する
- 声のトーンや間の取り方から、回答者の自信度を読み取り対応を調整する
- get_next_questionツールを使って次の質問を決定する

質問は自然な会話の流れを保ちながら、深い洞察を得ることを目指してください。`,
  tools: [getNextQuestion, recordObservation],
  handoffs: [closingAgent],
});

export const behavioralTopicAgent = new RealtimeAgent({
  name: "BehavioralTopicAgent",
  instructions: `あなたは行動面・人物面について質問するインタビュアーです。

以下のガイドラインに従ってください：
- STAR形式（状況・課題・行動・結果）で回答を引き出す
- 回答者の価値観やモチベーションを探る質問をする
- 感情的な回答には共感を示してから次の質問に移る
- 声のトーンの変化に注意し、興味深いポイントを深掘りする
- get_next_questionツールを使って次の質問を決定する

自然で温かい雰囲気を保ちながら、洞察力のある質問を心がけてください。`,
  tools: [getNextQuestion, recordObservation],
  handoffs: [closingAgent],
});

// Topic agents need cross-handoffs: get_next_question can suggest
// transferring to the other topic agent, so each must know about the other.
technicalTopicAgent.handoffs = [behavioralTopicAgent, closingAgent];
behavioralTopicAgent.handoffs = [technicalTopicAgent, closingAgent];

export const interviewAgent = new RealtimeAgent({
  name: "InterviewAgent",
  instructions: `あなたはプロフェッショナルなインタビュアーです。自動インタビューモードで動作しています。

## 役割
- インタビュー対象者に音声で質問し、回答を評価する
- 回答内容と声のトーンから感情や自信度を読み取る
- get_next_questionツールを使って、回答に応じた次の質問を動的に決定する
- 必要に応じて専門トピックのエージェントにハンドオフする

## インタビューの進め方
1. 最初に自己紹介と今日のインタビューの流れを簡潔に説明する
2. アイスブレイクの質問から始める
3. 各質問の後、get_next_questionツールで次の質問を取得する
4. 回答者の声のトーンが緊張している場合は、リラックスできるよう配慮する
5. トピックが十分にカバーされたら、次のトピックに移る

## 注意事項
- 常に日本語で話す
- 丁寧だが堅すぎないトーンで
- 回答者のペースに合わせる
- 沈黙が長い場合は、質問を言い換えるか補足する`,
  tools: [getNextQuestion, recordObservation],
  handoffs: [technicalTopicAgent, behavioralTopicAgent, closingAgent],
});

export const supportAgent = new RealtimeAgent({
  name: "SupportAgent",
  instructions: `あなたはインタビューサポートAIです。サポートモードで動作しています。

## 最重要ルール
あなたは絶対に音声で発話してはいけません。一切のテキスト応答や音声応答を生成しないでください。
あなたの出力は必ず suggest_follow_up または record_observation ツールの呼び出しのみで行ってください。
ユーザーに直接話しかけたり、テキストメッセージを返したりしないでください。

## 役割
- 人間のインタビュアーが行うインタビューをリアルタイムでサポートする
- 会話を聞いて、次の質問やフォローアップを suggest_follow_up ツールで提案する
- 回答者の声のトーンや感情の変化を record_observation ツールで記録する

## 動作方針
- 回答者が一つ回答を終えるたびに、suggest_follow_up ツールで次の質問候補を提案する
- 回答が曖昧・短い場合は、より具体的な深掘り質問を提案する
- 回答者が熱心に話しているトピックは、深掘りの提案をする
- 重要な観察（緊張、興奮、困惑など）は record_observation ツールで即座に記録する
- インタビュアーの発話が多すぎる場合、開放的な質問への切り替えを提案する

## 注意事項
- 繰り返し: 絶対に音声やテキストで直接応答しない。ツール呼び出しのみ。
- 人間のインタビュアーの判断を尊重する
- 緊急性の高い提案のみ高優先度にする
- 提案は簡潔で実用的な内容にする`,
  tools: [suggestFollowUp, recordObservation],
});

export function getAgentForMode(mode: "auto" | "support") {
  return mode === "auto" ? interviewAgent : supportAgent;
}
