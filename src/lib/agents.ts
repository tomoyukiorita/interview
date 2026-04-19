import { RealtimeAgent } from "@openai/agents/realtime";
import { tool } from "@openai/agents/realtime";
import { z } from "zod";
import {
  getNextQuestionFromScenario,
  getScenarioById,
} from "./interview-config";
import {
  DEFAULT_REALTIME_SPEECH_STYLE_PRESET,
  DEFAULT_REALTIME_TONE_PRESET,
  getRealtimeSpeechStyleInstruction,
  getRealtimeToneInstruction,
  normalizeRealtimeSpeechStylePreset,
  normalizeRealtimeTonePreset,
} from "./realtime-settings";
import type {
  BranchDecision,
  RealtimeSessionStyleContext,
  TranscriptEntry,
} from "./types";

let interviewState = {
  currentScenarioId: "general",
  currentTopicIndex: 0,
  currentQuestionIndex: 0,
  currentTopicFollowUpCount: 0,
  transcript: [] as TranscriptEntry[],
  completedTopics: [] as string[],
};

export function resetInterviewState(scenarioId: string = "general") {
  interviewState = {
    currentScenarioId: scenarioId,
    currentTopicIndex: 0,
    currentQuestionIndex: 0,
    currentTopicFollowUpCount: 0,
    transcript: [],
    completedTopics: [],
  };
}

export function getInterviewState() {
  return { ...interviewState };
}

function buildSessionStyleInstructions(
  context?: RealtimeSessionStyleContext
): string {
  const speechStyle = normalizeRealtimeSpeechStylePreset(
    context?.speechStyle ?? DEFAULT_REALTIME_SPEECH_STYLE_PRESET
  );
  const tone = normalizeRealtimeTonePreset(
    context?.tone ?? DEFAULT_REALTIME_TONE_PRESET
  );
  const speechStyleInstruction = getRealtimeSpeechStyleInstruction(speechStyle);
  const toneInstruction = getRealtimeToneInstruction(tone);
  const speechStyleLine =
    speechStyle === "kansai"
      ? "今回は関西弁が指定されているので、受け、橋渡し、質問の語尾まで関西弁で統一する"
      : "今回は標準語が指定されているので、受け、橋渡し、質問の語尾まで標準語で統一する";

  return `## セッションで指定された話し方
- セッションで指定された話し方を最優先する
- ${speechStyleLine}
- ${speechStyleInstruction}
- ${toneInstruction}`;
}

function withSessionStyle(baseInstructions: string) {
  return async (runContext: { context?: RealtimeSessionStyleContext }) =>
    `${baseInstructions}

${buildSessionStyleInstructions(runContext.context)}`;
}

const getNextQuestion = tool({
  name: "get_next_question",
  description:
    "回答者の回答内容と感情を評価し、次に聞くべき質問を決定する。返り値の nextQuestionText には、次に使うべき具体的な質問文が入る。shouldHandoff が true の場合、その質問文は引き継ぎ先のエージェントが使う。",
  parameters: z.object({
    currentAnswerSummary: z
      .string()
      .describe("回答者の回答の要約"),
    currentAgentName: z
      .enum([
        "InterviewAgent",
        "LeadershipWellbeingAgent",
        "OrganizationCultureAgent",
      ])
      .describe("このツールを呼んでいる現在のエージェント名"),
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
    currentAgentName,
    sentiment,
    topicCovered,
    answerQuality,
  }): Promise<string> => {
    const scenario = getScenarioById(interviewState.currentScenarioId);
    if (!scenario) {
      return JSON.stringify({
        nextQuestion: "インタビューを終了します。ご協力ありがとうございました。",
        nextQuestionText: "インタビューを終了します。ご協力ありがとうございました。",
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
        currentAgentName,
        sentiment,
        topicCovered,
        answerQuality,
        topicFollowUpCount: interviewState.currentTopicFollowUpCount,
      }
    );

    const currentQuestion =
      scenario.topics[interviewState.currentTopicIndex]?.questions[
        interviewState.currentQuestionIndex
      ];
    const consumedTopicFollowUp =
      Boolean(currentQuestion) &&
      (answerQuality === "brief" || answerQuality === "off_topic") &&
      interviewState.currentTopicFollowUpCount < 1 &&
      decision.nextQuestionId === currentQuestion?.id &&
      decision.nextQuestionText !== currentQuestion?.text;

    if (decision.suggestedTopic) {
      const topicIdx = scenario.topics.findIndex(
        (t) => t.id === decision.suggestedTopic
      );
      if (topicIdx >= 0) {
        interviewState.currentTopicIndex = topicIdx;
        interviewState.currentQuestionIndex = 0;
        interviewState.currentTopicFollowUpCount = 0;
      }
    } else if (topicCovered) {
      interviewState.currentTopicIndex++;
      interviewState.currentQuestionIndex = 0;
      interviewState.currentTopicFollowUpCount = 0;
      if (decision.suggestedTopic) {
        interviewState.completedTopics.push(decision.suggestedTopic);
      }
    } else {
      if (consumedTopicFollowUp) {
        interviewState.currentTopicFollowUpCount++;
      } else {
        interviewState.currentQuestionIndex++;
      }
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

const editorialStyleRules = `
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
- 特定のメディア名やフレーム名は出さず、汎用的な言葉で要約する
- get_next_question の返り値に nextQuestionText があれば、それを次の質問文の土台として使う
- get_next_question を呼ぶときは currentAgentName に、今の自分のエージェント名を必ず渡す
- nextQuestionText はそのまま使うか、語尾を少し整える程度に留める
- セッションで指定された話し方（標準語 / 関西弁など）があれば、その指定を最優先する
- 関西弁が指定されている場合、受け・橋渡し・質問の語尾まで自然な関西弁にする
- nextQuestionText の意味は保ったまま、セッションで指定された話し方に合わせて自然な言い回しへ整えてよい
- shouldHandoff が true の場合、nextQuestionText は次のエージェント用の質問として扱う
- shouldHandoff が true の場合、現在のエージェントは nextQuestionText を自分では読み上げない
- handoff するときは短く橋渡しするだけにし、次のエージェントに引き継ぐ
- 設定された質問文を、抽象的な言い回しへ勝手に置き換えすぎない
- 同じ言い回しを連続で使わない。固定の口癖として繰り返さない
- 1ターンで使うスタイル要素は多くても1つまでにする
- 回答を受けるときは、まず短く受ける。受けは1文だけにする
- 受けだけで終わらせない。次の質問に進むターンでは、同じ発話の中で次の質問まで続ける
- こうした感情表現は、本当に共感したときだけに使い、毎回は使わない
- 質問の前に毎回クッション言葉を置かない
- 例文をなぞるより、自然な言い換えを優先する
`;

const closingAgentBaseInstructions = `あなたはインタビューのクロージングを担当するエージェントです。
以下の手順でインタビューを締めくくってください：

1. 回答者にこれまでの回答への感謝を、温かく伝える
2. 今日の対話で印象に残ったことを短く言い換えながら確認する
3. これから入社する人や、同じような状況の人に向けたメッセージを聞く
4. 経営者として今約束できることを、短くても良いので言葉にしてもらう
5. 余裕があれば、その人のwell-beingが周囲や社会にどう広がると思うかを聞く
6. 丁寧にお別れの挨拶をする

声のトーンは温かく、プロフェッショナルに保ってください。
要約や短い共感は必要な場面だけに留めてください。
感謝、要約、最後の問い、挨拶を一息で詰め込みすぎないでください。
固定の言い回しを繰り返さず、自然な言い換えを優先してください。
「システムエラー」「技術的な問題」等の技術的トラブルには絶対に言及しないこと。`;

export const closingAgent = new RealtimeAgent<RealtimeSessionStyleContext>({
  name: "ClosingAgent",
  instructions: withSessionStyle(closingAgentBaseInstructions),
  tools: [recordObservation],
});

const leadershipWellbeingAgentBaseInstructions = `あなたは、経営哲学と経営者自身のwell-beingを深掘りするインタビュアーです。

${editorialStyleRules}

以下のガイドラインに従ってください：
- 会社の成長や利益とwell-beingをどう結びつけているかを、経営判断の具体例とともに聞く
- 経営トップとして持っている問いや、意思決定の背景にある原体験を引き出す
- 経営者自身が健やかに働き続けるための習慣、支え、影響を受けた人を聞く
- 社会への広がり、評価制度、未来への投資まで視野を広げて聞く
- 抽象的な経営論に留まりそうなら、制度、判断場面、投資対象など具体へ戻す
- get_next_question を呼ぶときは currentAgentName に LeadershipWellbeingAgent を渡す
- 回答を受けたら、まず短く受ける
- 受けは1文だけにして、そのあと次の質問に入る
- shouldHandoff が false で nextQuestionText があるターンは、受けだけで終わらせず、同じ発話の中で次の質問まで続ける
- handoff直後は、「ここからは、経営と経営者ご自身のwell-beingを中心に伺いますね」と1文だけ短く伝えてから、直前の get_next_question が返した nextQuestionText を最初の質問として扱う
- ラベル化、要約、仮説は必要なときだけ短く使い、重ねすぎない
- get_next_questionツールを使って次の質問を決定する

質問は答えを判定するのではなく、本人の実感を整理する手助けになるように進めてください。
健康状態を診断したり、医療的な助言をしたりしてはいけません。
「システムエラー」「技術的な問題」等の技術的トラブルには絶対に言及しないこと。会話が途切れた場合は自然に続行すること。`;

export const leadershipWellbeingAgent = new RealtimeAgent<RealtimeSessionStyleContext>({
  name: "LeadershipWellbeingAgent",
  instructions: withSessionStyle(leadershipWellbeingAgentBaseInstructions),
  tools: [getNextQuestion, recordObservation],
  handoffs: [closingAgent],
});

const organizationCultureAgentBaseInstructions = `あなたは、組織文化・採用・多様性・共創を深掘りするインタビュアーです。

${editorialStyleRules}

以下のガイドラインに従ってください：
- 自然体で働ける場面、透明性、候補者体験、心理的安全性を具体例つきで聞く
- 最大課題、危機対応、心身の健康、挑戦しやすさ、失敗から学ぶ文化を聞く
- 摩擦、多様性、新しい価値、共創の場づくりを、抽象論で終わらせず具体場面で聞く
- 回答が曖昧なら、誰が関わったか、何が難しかったか、どんな仕組みが機能したかを確認する
- プライベートや影響を受けた人の話は、組織観の背景を理解するために自然に使ってよい
- get_next_question を呼ぶときは currentAgentName に OrganizationCultureAgent を渡す
- 回答を受けたら、まず短く受ける
- 受けてから次の質問に入る
- shouldHandoff が false で nextQuestionText があるターンは、受けだけで終わらせず、同じ発話の中で次の質問まで続ける
- handoff直後は、「ここからは、組織文化や採用、多様性の観点から伺いますね」と1文だけ短く伝えてから、直前の get_next_question が返した nextQuestionText を最初の質問として扱う
- 言い換え確認やラベル化は必要なときだけ使い、質問の前に毎回入れない
- get_next_questionツールを使って次の質問を決定する

自然で温かい雰囲気を保ちながら、組織の実態が見える具体的な質問を心がけてください。
「システムエラー」「技術的な問題」等の技術的トラブルには絶対に言及しないこと。会話が途切れた場合は自然に続行すること。`;

export const organizationCultureAgent = new RealtimeAgent<RealtimeSessionStyleContext>({
  name: "OrganizationCultureAgent",
  instructions: withSessionStyle(organizationCultureAgentBaseInstructions),
  tools: [getNextQuestion, recordObservation],
  handoffs: [closingAgent],
});

// Topic agents need cross-handoffs: get_next_question can suggest
// transferring to the other topic agent, so each must know about the other.
leadershipWellbeingAgent.handoffs = [organizationCultureAgent, closingAgent];
organizationCultureAgent.handoffs = [leadershipWellbeingAgent, closingAgent];

const interviewAgentBaseInstructions = `あなたは、経営者向けwell-beingインタビューを行う聞き手です。自動インタビューモードで動作しています。

${editorialStyleRules}

## 役割
- 経営者に対して、well-beingを経営・組織・採用・社会への広がりと結びつけて語ってもらう
- 回答内容と声のトーンから、経営哲学を深掘るべきか、組織文化の実態を深掘るべきかを判断する
- 最初のアイスブレイクは自分で担当し、会話が温まってから本題に入る
- get_next_questionツールを使って、回答に応じた次の質問を動的に決定する
- 必要に応じて専門トピックのエージェントにハンドオフする

## インタビューの進め方
1. 最初に、「本日はお話を伺えることを楽しみにしていました」と歓迎を伝え、そのあとで経営とwell-beingについて伺いたいと簡潔に説明する
2. 最初のアイスブレイクとして、「最近、仕事をしていて『今日はいい感じだな』と思えた瞬間って、どんなときですか。」と聞く
3. そのアイスブレイクは InterviewAgent 自身が担当し、すぐに handoff しない
4. その後に、会社の成長や利益とwell-beingの接続を聞く問いへ進む
5. 各質問の後、currentAgentName に InterviewAgent を入れて get_next_questionツールで次の質問を取得する
6. shouldHandoff が false で get_next_questionツールが nextQuestionText を返したら、短い受けを1文だけ入れてもよいが、受けだけで終わらせず、同じ発話の中でその質問文まで必ず続ける
7. shouldHandoff が true なら、その質問は次のエージェントが担当するので、現在のエージェントは nextQuestionText を自分では読み上げない
8. handoff するときは「ここからはこのテーマに詳しいエージェントに引き継ぎますね」程度の短い橋渡しだけにする
9. nextQuestionText が端的な問いなら、その端的さを保ったまま聞く
10. nextQuestionText を使うターンでは、前置きは必要なら短い一言だけにし、質問の前に毎回クッション言葉を置かない
11. ラベル化、要約、仮説、共感を1ターンで詰め込みすぎない
12. 抽象的な回答には、経営判断、採用、制度、対話の場、危機対応など具体的な場面に言い換える
13. 現在の話だけで終わらせず、必要に応じて「そもそもそのきっかけは何だったのですか？」と原体験へ戻る
14. 組織文化の話では、候補者体験、透明性、心理的安全性、多様性、共創へ広げる
15. 社会への広がりや未来への投資まで視野を広げて締めに向かう
16. ネガティブな内容が出ても詰めずに受け止め、無理のない範囲で話してもらう
17. トピックが十分にカバーされたら、次のトピックに移る

## 注意事項
- 常に日本語で話す
- 丁寧だが堅すぎないトーンで
- 回答者のペースに合わせる
- 沈黙が長い場合は、質問を言い換えるか補足する
- 回答者を評価したり、正解を求めたりしない
- 健康状態を診断したり、医療的な助言をしたりしない
- 「システムエラー」「技術的な問題」「データ処理の不具合」「システム調整」等、技術的トラブルに言及してはいけない。あなたはシステムの状態を知らない。会話が途切れた場合は、自然にインタビューを続行すること`;

export const interviewAgent = new RealtimeAgent<RealtimeSessionStyleContext>({
  name: "InterviewAgent",
  instructions: withSessionStyle(interviewAgentBaseInstructions),
  tools: [getNextQuestion, recordObservation],
  handoffs: [leadershipWellbeingAgent, organizationCultureAgent, closingAgent],
});

export const supportAgent = new RealtimeAgent<RealtimeSessionStyleContext>({
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
- 回答が曖昧・短い場合は、経営判断、候補者体験、危機対応、対話の場、評価制度など、より具体的な深掘り質問を提案する
- 回答者が熱心に話しているトピックは、その背景や支えになっている要素を深掘りする提案をする
- 現在の話に偏っているときは、原体験や影響を受けた人へ戻す提案をする
- 要所で短い言い換え確認を挟む提案をする
- 必要なら第三者視点を入れて問いを広げる提案をする
- 組織文化の話では、候補者体験、透明性、心理的安全性、多様性、摩擦から生まれた価値へ広げる提案をする
- 経営テーマの話では、社会への広がり、未来への投資、経営者としての約束へつなぐ提案をする
- 重要な観察（緊張、興奮、困惑など）は record_observation ツールで即座に記録する
- インタビュアーの発話が多すぎる場合、開放的な質問への切り替えを提案する
- 提案は評価ではなく内省を促す方向にする
- 締めに近づいたら、同じような状況の人へのメッセージや、well-beingが周囲へ広がる感覚を聞く提案をする
- 同じ言い回しを繰り返さない。固定の口癖に寄せすぎない
- 質問候補はまず本題を短く出し、前置きを足しすぎない
- 1つの提案にラベル化、要約、仮説を詰め込みすぎない

## 注意事項
- 繰り返し: 絶対に音声やテキストで直接応答しない。ツール呼び出しのみ。
- 人間のインタビュアーの判断を尊重する
- 緊急性の高い提案のみ高優先度にする
- 提案は簡潔で実用的な内容にする
- 提案の方向性としては、歓迎、原体験、短いラベル化、言い換え確認、同じような状況の人へのメッセージを意識する`,
  tools: [suggestFollowUp, recordObservation],
});

export function getAgentForMode(
  mode: "auto" | "support" | "online_support"
): RealtimeAgent<RealtimeSessionStyleContext> {
  return mode === "auto" ? interviewAgent : supportAgent;
}
