import { getNextQuestionFromScenario, getScenarioById } from "./interview-config";
import {
  DEFAULT_REALTIME_SPEED_PRESET,
  DEFAULT_REALTIME_SPEECH_STYLE_PRESET,
  DEFAULT_REALTIME_TONE_PRESET,
  getRealtimeSpeedInstruction,
  getRealtimeSpeechStyleInstruction,
  getRealtimeToneInstruction,
  normalizeRealtimeSpeedPreset,
  normalizeRealtimeSpeechStylePreset,
  normalizeRealtimeTonePreset,
} from "./realtime-settings";
import type {
  BranchDecision,
  RealtimeSpeedPreset,
  RealtimeSpeechStylePreset,
  RealtimeTonePreset,
  Sentiment,
  TranscriptEntry,
} from "./types";

export type GeminiInterviewAgentName =
  | "InterviewAgent"
  | "LeadershipWellbeingAgent"
  | "OrganizationCultureAgent"
  | "ClosingAgent";

type GeminiAnswerQuality = "detailed" | "adequate" | "brief" | "off_topic";

export interface GeminiInterviewToolArgs {
  currentAnswerSummary: string;
  currentAgentName: "InterviewAgent" | "LeadershipWellbeingAgent" | "OrganizationCultureAgent";
  sentiment: Sentiment;
  topicCovered: boolean;
  answerQuality: GeminiAnswerQuality;
}

export interface GeminiInterviewState {
  currentScenarioId: string;
  currentTopicIndex: number;
  currentQuestionIndex: number;
  currentTopicFollowUpCount: number;
  currentAgentName: GeminiInterviewAgentName;
  transcript: TranscriptEntry[];
  completedTopics: string[];
}

interface GeminiInterviewStyleContext {
  speechStyle?: RealtimeSpeechStylePreset;
  tone?: RealtimeTonePreset;
  speed?: RealtimeSpeedPreset;
}

const GEMINI_EDITORIAL_STYLE_RULES = `
## インタビュースタイル
- オープニングでは「本日はお話を伺えることを楽しみにしていました」と歓迎と期待を短く伝える
- 今の活動や考え方の話が出たら、そもそものきっかけや原体験、動機に戻って聞く
- 相手の発言を受けて、必要なときだけ短いラベル化や言い換え確認を返す
- 回答のあとにすぐ次の質問へ行かず、まず短く受ける
- 自分の見立てや第三者視点を添えるのは、本当に深掘りが必要なときだけにする
- 共感や要約は、会話を前に進めるために必要な場面だけ短く使う
- 共感したときは無機質に流さず、「それは素敵ですね」「ワクワクしますね」「ほんとうにそうですね」などの短い感情表現で返してよい
- 仕事の話が一段落したら、プライベートや影響を受けた人、価値観の背景にも自然に踏み込む
- 最後は、同じような状況の人へのメッセージや、その人のwell-beingが周囲へどう広がるかに触れて締める

## 話し方の制約
- 主役は相手なので、あなた自身が長く話しすぎない
- 共感や自論は短く入れ、問いを開いたまま相手に返す
- 固定の口癖を繰り返さない
- 1ターンでラベル化、要約、仮説を詰め込みすぎない
- 受けは1文だけにし、次の質問があるときは同じ発話の中で続ける
- 質問の前に毎回クッション言葉を置かない
- 設定された質問文を、抽象的な言い回しへ勝手に置き換えすぎない
- nextQuestionText が返ってきたら、その意味を保ったまま自然な言い回しに整える
`;

export function createGeminiInterviewState(
  scenarioId: string = "general"
): GeminiInterviewState {
  return {
    currentScenarioId: scenarioId,
    currentTopicIndex: 0,
    currentQuestionIndex: 0,
    currentTopicFollowUpCount: 0,
    currentAgentName: "InterviewAgent",
    transcript: [],
    completedTopics: [],
  };
}

export function getGeminiInitialPrompt(scenarioId: string): string {
  const scenario = getScenarioById(scenarioId);
  const openingQuestion =
    scenario?.topics[0]?.questions[0]?.text ??
    "最近、仕事をしていて「今日はいい感じだな」と思えた瞬間って、どんなときですか。";

  return `インタビューを開始してください。最初は「本日はお話を伺えることを楽しみにしていました」と短く伝えてから、${openingQuestion}`;
}

export function buildGeminiInterviewSystemInstruction(
  context?: GeminiInterviewStyleContext
): string {
  const speechStyle = normalizeRealtimeSpeechStylePreset(
    context?.speechStyle ?? DEFAULT_REALTIME_SPEECH_STYLE_PRESET
  );
  const tone = normalizeRealtimeTonePreset(
    context?.tone ?? DEFAULT_REALTIME_TONE_PRESET
  );
  const speed = normalizeRealtimeSpeedPreset(
    context?.speed ?? DEFAULT_REALTIME_SPEED_PRESET
  );

  return `あなたは、経営者向けwell-beingインタビューを行う音声インタビュアーです。
このセッションでは単一の音声モデルとして振る舞いますが、内部ロールとして InterviewAgent / LeadershipWellbeingAgent / OrganizationCultureAgent / ClosingAgent を持ちます。

${GEMINI_EDITORIAL_STYLE_RULES}

## 役割
- 経営者に対して、well-beingを経営・組織文化・採用・社会への広がりと結びつけて語ってもらう
- 会話開始時の内部ロールは InterviewAgent
- 最初のアイスブレイクは InterviewAgent が担当する
- 各回答のあと、次の質問を決める前に必ず get_next_question を1回呼ぶ
- get_next_question を呼ぶときは、現在の内部ロール名を currentAgentName に正確に渡す
- get_next_question の返り値 nextQuestionText を次の質問の土台にする
- shouldHandoff が true の場合は、短く橋渡ししてから handoffTarget のロールへ内部的に切り替える
- shouldHandoff が false の場合は、現在のロールを維持する
- shouldHandoff が true のときも、会話の流れは途切れさせない

## ロールごとの重点
- InterviewAgent: アイスブレイク、経営とwell-beingの接続、原体験への導入を担う
- LeadershipWellbeingAgent: 経営者自身の習慣、意思決定、社会への広がりを深掘りする
- OrganizationCultureAgent: 組織文化、採用、心理的安全性、多様性、共創を深掘りする
- ClosingAgent: 感謝を伝え、同じような状況の人へのメッセージや約束できることを聞いて締める

## 運用ルール
- 最初の発話では get_next_question を呼ばず、歓迎の一言と最初の質問だけを行う
- 端的な nextQuestionText は端的なまま聞く
- 抽象的な回答には、経営判断、採用、制度、対話の場、危機対応など具体的な場面へ戻す
- ネガティブな内容が出ても詰めずに受け止める
- 健康状態を診断したり、医療的な助言をしたりしない
- システムや技術的トラブルには言及しない
- 常に日本語で話す

## セッションで指定された話し方
- ${getRealtimeSpeechStyleInstruction(speechStyle)}
- ${getRealtimeToneInstruction(tone)}
- ${getRealtimeSpeedInstruction(speed)}`;
}

export function runGeminiNextQuestion(
  state: GeminiInterviewState,
  args: GeminiInterviewToolArgs
): { decision: BranchDecision; nextState: GeminiInterviewState } {
  const scenario = getScenarioById(state.currentScenarioId);
  if (!scenario) {
    return {
      decision: {
        nextQuestionId: "end",
        reason: "シナリオが見つかりません",
        nextQuestionText: "インタビューを終了します。ご協力ありがとうございました。",
        shouldHandoff: true,
        handoffTarget: "closing",
      },
      nextState: {
        ...state,
        currentAgentName: "ClosingAgent",
      },
    };
  }

  const decision = getNextQuestionFromScenario(
    scenario,
    state.currentTopicIndex,
    state.currentQuestionIndex,
    {
      answerSummary: args.currentAnswerSummary,
      currentAgentName: args.currentAgentName,
      sentiment: args.sentiment,
      topicCovered: args.topicCovered,
      answerQuality: args.answerQuality,
      topicFollowUpCount: state.currentTopicFollowUpCount,
    }
  );

  const currentQuestion =
    scenario.topics[state.currentTopicIndex]?.questions[state.currentQuestionIndex];
  const consumedTopicFollowUp =
    Boolean(currentQuestion) &&
    (args.answerQuality === "brief" || args.answerQuality === "off_topic") &&
    state.currentTopicFollowUpCount < 1 &&
    decision.nextQuestionId === currentQuestion?.id &&
    decision.nextQuestionText !== currentQuestion?.text;

  const nextState: GeminiInterviewState = {
    ...state,
    transcript: [
      ...state.transcript,
      {
        id: `answer-${Date.now()}`,
        role: "interviewee",
        text: args.currentAnswerSummary,
        timestamp: Date.now(),
        sentiment: args.sentiment,
      },
    ],
  };

  if (decision.suggestedTopic) {
    const topicIdx = scenario.topics.findIndex(
      (topic) => topic.id === decision.suggestedTopic
    );
    if (topicIdx >= 0) {
      nextState.currentTopicIndex = topicIdx;
      nextState.currentQuestionIndex = 0;
      nextState.currentTopicFollowUpCount = 0;
    }
  } else if (args.topicCovered) {
    nextState.currentTopicIndex++;
    nextState.currentQuestionIndex = 0;
    nextState.currentTopicFollowUpCount = 0;
    if (decision.suggestedTopic) {
      nextState.completedTopics = [
        ...nextState.completedTopics,
        decision.suggestedTopic,
      ];
    }
  } else if (consumedTopicFollowUp) {
    nextState.currentTopicFollowUpCount++;
  } else {
    nextState.currentQuestionIndex++;
  }

  if (decision.shouldHandoff) {
    nextState.currentAgentName = mapDecisionTargetToAgentName(
      decision.handoffTarget
    );
  } else {
    nextState.currentAgentName = args.currentAgentName;
  }

  return { decision, nextState };
}

function mapDecisionTargetToAgentName(
  target: string | undefined
): GeminiInterviewAgentName {
  if (target === "LeadershipWellbeingAgent") {
    return "LeadershipWellbeingAgent";
  }

  if (target === "OrganizationCultureAgent") {
    return "OrganizationCultureAgent";
  }

  if (target === "closing") {
    return "ClosingAgent";
  }

  return "InterviewAgent";
}
