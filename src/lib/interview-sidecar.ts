import { z } from "zod";

const MAX_FIELD_LENGTH = 80;
const MAX_TRANSCRIPT_ITEMS = 8;
const MAX_SKELETON_LENGTH = 2200;
const SIDECAR_LEANS = ["past", "present", "future", "leadership", "unclear"] as const;
const SIDECAR_ENERGY_TRENDS = ["rising", "steady", "dropping"] as const;
const SIDECAR_QUESTION_TYPES = [
  "episode",
  "origin",
  "value",
  "work",
  "people",
  "future",
] as const;
const SIDECAR_CURRENT_DEPTHS = ["shallow", "active", "enough"] as const;
const SIDECAR_NEXT_MOVES = [
  "deepen_scene",
  "lift_to_value",
  "ask_origin",
  "connect_company_philosophy",
  "shift_future",
  "close_thread",
] as const;
const SIDECAR_TOPIC_FATIGUES = ["low", "medium", "high"] as const;
const SIDECAR_CHAPTERS = [
  "opening_philosophy",
  "concrete_example",
  "origin",
  "company_culture",
  "future",
  "closing",
] as const;
const SIDECAR_CHAPTER_PROGRESS = ["start", "developing", "complete"] as const;
const SIDECAR_EDITORIAL_PRIORITIES = ["normal", "strong", "override"] as const;
const SIDECAR_FORBIDDEN_QUESTION_TYPES = [
  "implementation_detail",
  "workflow_detail",
  "reaction_chasing",
  "same_branch_deepening",
  "mental_coaching",
] as const;

export const SIDECAR_MODEL = process.env.SIDECAR_MODEL ?? "gpt-5.5";

export const sidecarTranscriptEntrySchema = z.object({
  role: z.enum(["interviewer", "interviewee"]),
  text: z.string(),
});

export const sidecarRequestSchema = z.object({
  latestIntervieweeText: z.string().min(1),
  latestInterviewerText: z.string().optional().default(""),
  transcript: z.array(sidecarTranscriptEntrySchema).optional().default([]),
  skeletonInstructions: z.string().optional().default(""),
  editorState: z
    .object({
      articleTheme: z.string().default(""),
      coveredTopics: z.array(z.string()).default([]),
      openThreads: z.array(z.string()).default([]),
      lastChapter: z.enum(SIDECAR_CHAPTERS).optional(),
      nextChapter: z.enum(SIDECAR_CHAPTERS).nullable().optional(),
      lastNextMove: z.enum(SIDECAR_NEXT_MOVES).optional(),
      lastDepth: z.enum(SIDECAR_CURRENT_DEPTHS).optional(),
      lastTopicFatigue: z.enum(SIDECAR_TOPIC_FATIGUES).optional(),
      usedResearchAnchors: z.array(z.string()).default([]),
      pendingResearchAnchors: z.array(z.string()).default([]),
      lastResearchReturnPoint: z.string().default(""),
    })
    .optional()
    .default({
      articleTheme: "",
      coveredTopics: [],
      openThreads: [],
      usedResearchAnchors: [],
      pendingResearchAnchors: [],
      lastResearchReturnPoint: "",
    }),
});

export const sidecarMemoSchema = z.object({
  currentThread: z.string().default(""),
  intervieweeLean: z
    .enum(["past", "present", "future", "leadership", "unclear"])
    .default("unclear"),
  energyTrend: z.enum(["rising", "steady", "dropping"]).default("steady"),
  shouldStay: z.boolean().default(false),
  shouldShift: z.boolean().default(false),
  shiftTo: z
    .enum(["past", "present", "future", "leadership", "unclear"])
    .nullable()
    .default(null),
  reason: z.string().default(""),
  interviewerMove: z.string().default(""),
  articleTheme: z.string().default(""),
  currentDepth: z.enum(["shallow", "active", "enough"]).default("active"),
  nextMove: z
    .enum([
      "deepen_scene",
      "lift_to_value",
      "ask_origin",
      "connect_company_philosophy",
      "shift_future",
      "close_thread",
    ])
    .default("deepen_scene"),
  topicFatigue: z.enum(["low", "medium", "high"]).default("low"),
  currentChapter: z.enum(SIDECAR_CHAPTERS).default("concrete_example"),
  chapterProgress: z.enum(SIDECAR_CHAPTER_PROGRESS).default("developing"),
  nextChapter: z.enum(SIDECAR_CHAPTERS).nullable().default(null),
  chapterInstruction: z.string().default(""),
  researchAnchor: z.string().default(""),
  usedResearchAnchors: z.array(z.string()).default([]),
  pendingResearchAnchors: z.array(z.string()).default([]),
  researchReturnPoint: z.string().default(""),
  editorialPriority: z.enum(SIDECAR_EDITORIAL_PRIORITIES).default("normal"),
  allowedQuestionTypes: z
    .array(z.enum(["episode", "origin", "value", "work", "people", "future"]))
    .default([]),
  forbiddenQuestionTypes: z
    .array(z.enum(SIDECAR_FORBIDDEN_QUESTION_TYPES))
    .default([]),
  coveredTopics: z.array(z.string()).default([]),
  openThreads: z.array(z.string()).default([]),
  questionType: z
    .enum(["episode", "origin", "value", "work", "people", "future"])
    .default("episode"),
  anchor: z.string().default(""),
  probe: z.string().default(""),
  avoid: z.string().default(""),
  articleAngle: z.string().default(""),
  bestScene: z.string().default(""),
  humanReaction: z.string().default(""),
  decisionPoint: z.string().default(""),
  followUp: z.string().default(""),
  anchorWords: z.array(z.string()).default([]),
  nextAngle: z.string().default(""),
  forbiddenJump: z.string().default(""),
});

export type SidecarRequest = z.infer<typeof sidecarRequestSchema>;
type SidecarRequestInput = z.input<typeof sidecarRequestSchema>;
export type SidecarMemo = z.infer<typeof sidecarMemoSchema>;
type SidecarLean = SidecarMemo["intervieweeLean"];
type SidecarEnergyTrend = SidecarMemo["energyTrend"];
type SidecarQuestionType = SidecarMemo["questionType"];
type SidecarCurrentDepth = SidecarMemo["currentDepth"];
type SidecarNextMove = SidecarMemo["nextMove"];
type SidecarTopicFatigue = SidecarMemo["topicFatigue"];
type SidecarChapter = SidecarMemo["currentChapter"];
type SidecarChapterProgress = SidecarMemo["chapterProgress"];
type SidecarEditorialPriority = SidecarMemo["editorialPriority"];
type SidecarForbiddenQuestionType = SidecarMemo["forbiddenQuestionTypes"][number];

function compactText(text: string, maxLength = MAX_FIELD_LENGTH): string {
  const compacted = text.replace(/\s+/g, " ").trim();
  return compacted.length > maxLength
    ? `${compacted.slice(0, maxLength - 1)}…`
    : compacted;
}

function normalizeLean(value: unknown, fallback: SidecarLean): SidecarLean {
  return SIDECAR_LEANS.includes(value as SidecarLean)
    ? (value as SidecarLean)
    : fallback;
}

function normalizeEnergyTrend(
  value: unknown,
  fallback: SidecarEnergyTrend
): SidecarEnergyTrend {
  return SIDECAR_ENERGY_TRENDS.includes(value as SidecarEnergyTrend)
    ? (value as SidecarEnergyTrend)
    : fallback;
}

function normalizeQuestionType(
  value: unknown,
  fallback: SidecarQuestionType
): SidecarQuestionType {
  return SIDECAR_QUESTION_TYPES.includes(value as SidecarQuestionType)
    ? (value as SidecarQuestionType)
    : fallback;
}

function normalizeCurrentDepth(
  value: unknown,
  fallback: SidecarCurrentDepth
): SidecarCurrentDepth {
  return SIDECAR_CURRENT_DEPTHS.includes(value as SidecarCurrentDepth)
    ? (value as SidecarCurrentDepth)
    : fallback;
}

function normalizeNextMove(value: unknown, fallback: SidecarNextMove): SidecarNextMove {
  return SIDECAR_NEXT_MOVES.includes(value as SidecarNextMove)
    ? (value as SidecarNextMove)
    : fallback;
}

function normalizeTopicFatigue(
  value: unknown,
  fallback: SidecarTopicFatigue
): SidecarTopicFatigue {
  return SIDECAR_TOPIC_FATIGUES.includes(value as SidecarTopicFatigue)
    ? (value as SidecarTopicFatigue)
    : fallback;
}

function normalizeChapter(value: unknown, fallback: SidecarChapter): SidecarChapter {
  return SIDECAR_CHAPTERS.includes(value as SidecarChapter)
    ? (value as SidecarChapter)
    : fallback;
}

function normalizeChapterProgress(
  value: unknown,
  fallback: SidecarChapterProgress
): SidecarChapterProgress {
  return SIDECAR_CHAPTER_PROGRESS.includes(value as SidecarChapterProgress)
    ? (value as SidecarChapterProgress)
    : fallback;
}

function normalizeEditorialPriority(
  value: unknown,
  fallback: SidecarEditorialPriority
): SidecarEditorialPriority {
  return SIDECAR_EDITORIAL_PRIORITIES.includes(value as SidecarEditorialPriority)
    ? (value as SidecarEditorialPriority)
    : fallback;
}

function compactQuestionTypes(value: unknown): SidecarQuestionType[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is SidecarQuestionType =>
          SIDECAR_QUESTION_TYPES.includes(item as SidecarQuestionType)
        )
        .slice(0, 4)
    : [];
}

function compactForbiddenQuestionTypes(
  value: unknown
): SidecarForbiddenQuestionType[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is SidecarForbiddenQuestionType =>
          SIDECAR_FORBIDDEN_QUESTION_TYPES.includes(
            item as SidecarForbiddenQuestionType
          )
        )
        .slice(0, 6)
    : [];
}

function compactList(value: unknown, maxItems = 6): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => compactText(String(item), 40))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];
}

function compactTranscript(transcript: SidecarRequestInput["transcript"]): string {
  return (transcript ?? [])
    .slice(-MAX_TRANSCRIPT_ITEMS)
    .map((entry) => {
      const speaker = entry.role === "interviewee" ? "相手" : "AI";
      return `${speaker}: ${compactText(entry.text, 120)}`;
    })
    .join("\n");
}

export function normalizeSidecarMemo(value: unknown): SidecarMemo {
  const parsed = sidecarMemoSchema.safeParse(value);
  const memo = parsed.success ? parsed.data : {};

  return {
    currentThread:
      "currentThread" in memo ? compactText(String(memo.currentThread)) : "",
    intervieweeLean: normalizeLean(
      "intervieweeLean" in memo ? memo.intervieweeLean : null,
      "unclear"
    ),
    energyTrend: normalizeEnergyTrend(
      "energyTrend" in memo ? memo.energyTrend : null,
      "steady"
    ),
    shouldStay: "shouldStay" in memo ? Boolean(memo.shouldStay) : false,
    shouldShift: "shouldShift" in memo ? Boolean(memo.shouldShift) : false,
    shiftTo:
      "shiftTo" in memo && memo.shiftTo !== null
        ? normalizeLean(memo.shiftTo, "unclear")
        : null,
    reason: compactText("reason" in memo ? String(memo.reason) : ""),
    interviewerMove: compactText(
      "interviewerMove" in memo ? String(memo.interviewerMove) : ""
    ),
    articleTheme: compactText(
      "articleTheme" in memo ? String(memo.articleTheme) : ""
    ),
    currentDepth: normalizeCurrentDepth(
      "currentDepth" in memo ? memo.currentDepth : null,
      "active"
    ),
    nextMove: normalizeNextMove("nextMove" in memo ? memo.nextMove : null, "deepen_scene"),
    topicFatigue: normalizeTopicFatigue(
      "topicFatigue" in memo ? memo.topicFatigue : null,
      "low"
    ),
    currentChapter: normalizeChapter(
      "currentChapter" in memo ? memo.currentChapter : null,
      "concrete_example"
    ),
    chapterProgress: normalizeChapterProgress(
      "chapterProgress" in memo ? memo.chapterProgress : null,
      "developing"
    ),
    nextChapter:
      "nextChapter" in memo && memo.nextChapter !== null
        ? normalizeChapter(memo.nextChapter, "concrete_example")
        : null,
    chapterInstruction: compactText(
      "chapterInstruction" in memo ? String(memo.chapterInstruction) : ""
    ),
    researchAnchor: compactText(
      "researchAnchor" in memo ? String(memo.researchAnchor) : ""
    ),
    usedResearchAnchors: compactList(
      "usedResearchAnchors" in memo ? memo.usedResearchAnchors : [],
      8
    ),
    pendingResearchAnchors: compactList(
      "pendingResearchAnchors" in memo ? memo.pendingResearchAnchors : [],
      8
    ),
    researchReturnPoint: compactText(
      "researchReturnPoint" in memo ? String(memo.researchReturnPoint) : ""
    ),
    editorialPriority: normalizeEditorialPriority(
      "editorialPriority" in memo ? memo.editorialPriority : null,
      "normal"
    ),
    allowedQuestionTypes: compactQuestionTypes(
      "allowedQuestionTypes" in memo ? memo.allowedQuestionTypes : []
    ),
    forbiddenQuestionTypes: compactForbiddenQuestionTypes(
      "forbiddenQuestionTypes" in memo ? memo.forbiddenQuestionTypes : []
    ),
    coveredTopics: compactList(
      "coveredTopics" in memo ? memo.coveredTopics : [],
      8
    ),
    openThreads: compactList("openThreads" in memo ? memo.openThreads : [], 8),
    questionType: normalizeQuestionType(
      "questionType" in memo ? memo.questionType : null,
      "episode"
    ),
    anchor: compactText(
      "anchor" in memo
        ? String(memo.anchor)
        : "anchorWords" in memo && Array.isArray(memo.anchorWords)
        ? String(memo.anchorWords[0] ?? "")
        : ""
    ),
    probe: compactText(
      "probe" in memo
        ? String(memo.probe)
        : "nextAngle" in memo
        ? String(memo.nextAngle)
        : ""
    ),
    avoid: compactText(
      "avoid" in memo
        ? String(memo.avoid)
        : "forbiddenJump" in memo
        ? String(memo.forbiddenJump)
        : ""
    ),
    articleAngle: compactText(
      "articleAngle" in memo ? String(memo.articleAngle) : ""
    ),
    bestScene: compactText(
      "bestScene" in memo
        ? String(memo.bestScene)
        : "anchor" in memo
        ? String(memo.anchor)
        : ""
    ),
    humanReaction: compactText(
      "humanReaction" in memo ? String(memo.humanReaction) : ""
    ),
    decisionPoint: compactText(
      "decisionPoint" in memo ? String(memo.decisionPoint) : ""
    ),
    followUp: compactText(
      "followUp" in memo
        ? String(memo.followUp)
        : "probe" in memo
        ? String(memo.probe)
        : ""
    ),
    anchorWords:
      "anchorWords" in memo && Array.isArray(memo.anchorWords)
        ? memo.anchorWords
            .map((item) => compactText(String(item), 24))
            .filter(Boolean)
            .slice(0, 4)
        : [],
    nextAngle: compactText("nextAngle" in memo ? String(memo.nextAngle) : ""),
    forbiddenJump: compactText(
      "forbiddenJump" in memo
        ? String(memo.forbiddenJump)
        : "avoid" in memo
        ? String(memo.avoid)
        : ""
    ),
  };
}

export function buildSidecarMessages(input: SidecarRequestInput) {
  const transcript = compactTranscript(input.transcript ?? []);
  const editorState = {
    articleTheme: compactText(input.editorState?.articleTheme ?? "", 180),
    coveredTopics: (input.editorState?.coveredTopics ?? [])
      .map((item) => compactText(item, 80))
      .filter(Boolean)
      .slice(0, 12),
    openThreads: (input.editorState?.openThreads ?? [])
      .map((item) => compactText(item, 80))
      .filter(Boolean)
      .slice(0, 12),
    lastChapter: input.editorState?.lastChapter ?? null,
    nextChapter: input.editorState?.nextChapter ?? null,
    lastNextMove: input.editorState?.lastNextMove ?? null,
    lastDepth: input.editorState?.lastDepth ?? null,
    lastTopicFatigue: input.editorState?.lastTopicFatigue ?? null,
    usedResearchAnchors: (input.editorState?.usedResearchAnchors ?? [])
      .map((item) => compactText(item, 80))
      .filter(Boolean)
      .slice(0, 12),
    pendingResearchAnchors: (input.editorState?.pendingResearchAnchors ?? [])
      .map((item) => compactText(item, 80))
      .filter(Boolean)
      .slice(0, 12),
    lastResearchReturnPoint: compactText(
      input.editorState?.lastResearchReturnPoint ?? "",
      120
    ),
  };
  const skeleton = (input.skeletonInstructions ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SKELETON_LENGTH);

  return [
    {
      role: "system" as const,
      content: `あなたは経営者記事インタビューのSidecar Intelligenceです。
Realtime側の会話を止めず、発話をその人や会社の理念・哲学へ戻す編集者です。

必ずJSONだけを返してください。
各値は日本語で80文字以内。
発話文を作らず、方針だけを書く。
「少しだけ整理してから」「方向づけてから」「考えを整えてから」のような進行実況を提案しない。
質問文は書かない。articleAngle / bestScene / humanReaction / decisionPoint / followUp / avoid を中心に返す。
questionType と anchor / probe は補助情報として残す。

編集長用の進行台帳:
- editorState は全文生ログの代わりに、ここまでの全体テーマ、十分聞いた話題、未回収の重要な問いを示す。
- articleTheme がある場合、次の判断は必ずその主題に戻す。
- coveredTopics にある話題は、同じ細部を繰り返して掘らない。
- openThreads にある問いは、次に展開する候補として優先する。
- currentDepth は shallow | active | enough で返す。具体例が十分なら enough にして、origin / value / future / people へ横展開する。
- nextMove は deepen_scene | lift_to_value | ask_origin | connect_company_philosophy | shift_future | close_thread から選ぶ。
- topicFatigue は low | medium | high で返す。同じ具体例を掘りすぎたら high にする。
- currentChapter は opening_philosophy | concrete_example | origin | company_culture | future | closing から選ぶ。
- chapterProgress は start | developing | complete で返す。具体例の章が十分なら complete にする。
- nextChapter は次に移る章を返す。章遷移しないなら null。
- chapterInstruction は質問文ではなく、章遷移の意図を短く書く。
- chapterProgress が complete の場合、Realtime は currentChapter と同じ章の質問を続けない。特に concrete_example が complete なら、同じ具体例の反応・手順・別側面を聞かせない。
- currentDepth が enough のときは、次案件の作業手順、実装細部、レビュー方法へ進まない。
- 相手が「覚えてない」「特にない」「うーん」「分からない」など短答・否定・迷いを返したら、さらに反応や打ち合わせの具体を聞くのは禁止。currentDepth は enough、topicFatigue は high、nextMove は lift_to_value / ask_origin / connect_company_philosophy のどれかにする。

リサーチ活用台帳:
- 会社リサーチメモは冒頭だけでなく、中盤の章遷移で使う。
- researchAnchor は今回の会話で使えそうな会社固有の言葉、理念、顧客への約束。
- usedResearchAnchors はすでに会話で使ったリサーチ語。繰り返し導入しない。
- pendingResearchAnchors はまだ本文中で回収すべきリサーチ語。
- researchReturnPoint は、具体例が十分になった時に戻る会社固有の取っかかり。
- 具体例の章が complete なら、researchReturnPoint を使って理念・哲学・源流へ戻す。

権限:
- Sidecar は章遷移と質問カテゴリの決定権を持つ。
- Realtime Agent は発話文に翻訳するだけで、Sidecar の forbiddenQuestionTypes を上書きしない。
- editorialPriority は normal | strong | override。chapterProgress が complete、currentDepth が enough、topicFatigue が high の場合は strong 以上を使う。
- allowedQuestionTypes は episode | origin | value | work | people | future から、次に許可する質問型だけを返す。
- forbiddenQuestionTypes は implementation_detail | workflow_detail | reaction_chasing | same_branch_deepening | mental_coaching から返す。

最重要:
- まず相手の発話に表れている価値観、方針、理念、哲学を読む。
- 技術者インタビューにしない。細かい機能、ログ、画面状態、DB、実装手順を掘らない。
- すぐ questionType に変換しない。
- articleAngle は、読者に伝わる理念・哲学の見出しになりそうな観点にする。
- bestScene は、記事で描けそうな具体場面にする。
- humanReaction は、顧客・社員・知人・ユーザーなど人の反応にする。なければ空。
- decisionPoint は、経営者・作り手として大切にした方針や判断にする。
- followUp は、次に聞く切り口にする。質問文ではなく素材。
- avoid は、今飛ばすと技術者インタビュー、メンタルコーチ、または浅い確認になる方向にする。

followUp の優先順位:
1. リサーチメモ内のミッション、ビジョン、特徴的な言葉、顧客への約束との接続
2. なぜその体験を大事にしたのかという理念や哲学
3. 誰にどんな状態になってほしいのか
4. 何のアプリ・サービス・事業の話か
5. そこに表れている価値観、仕事観、会社らしさ

実装細部に潜りすぎない:
- プロダクトの前提が不明なら、ログや画面状態、データベース、QRコードなどの実装確認へ進まない。
- 「何のアプリか」「誰が使うのか」「なぜその体験を大事にしたのか」を先に聞く。
- 機能の動きが出たら、細かい仕組みではなく、その人や会社の理念や哲学にどうつながるかを次の切り口にする。
- 会社リサーチメモに「理念・哲学の取っかかり」や「冒頭質問候補」があれば、そこへ戻す。
- 直近の具体例が十分に語られたら、次は「その考えがどこで培われたか」「会社として譲れない考え方か」「未来にどう広げたいか」へ移る。
- 「それは特にないです」のような短答や否定が出たら、その方向を続けず、直前に出た良い素材を articleTheme に戻して聞く。

「いつ頃からですか？」「あなたにとってどんな意味がありますか？」は多用しない。
原体験に行く場合も、まず「最初に強く感じた場面」「その時の反応」「何を見てそう思ったか」を優先する。
質問タイプは次の6つから選ぶ:
- episode: 具体的な出来事を聞く
- origin: そう考えるようになった背景や原体験を聞く
- value: その人が大事にしている価値観を聞く
- work: 仕事の進め方や判断への影響を聞く
- people: 周囲の人や組織との関わりへ広げる
- future: これからどうしていきたいかを聞く
相手の発話内容と反応から、どの方向をもっと話したそうか判断する。
固定の章立てではなく、相手の熱量が上がる方向へ寄せる。
同じ話題が続いても、熱量が上がっているなら stay を許可する。
熱量が落ちたり生活習慣の細部に寄りすぎたら、過去・経営・未来などへ転換する。
経営・組織へ転換するときも、相手がメンバー、社員、声かけ、組織を話していないなら、いきなりそこへ飛ばない。
まず本人の仕事の進み方、判断、優先順位、集中しやすい作業への影響を次の観点にする。
睡眠・運動・食事の話では、回数や時間を詰め続けない。入口にしたら origin / value / work へ展開する。
抽象語を増やさず、相手が次に答えやすい具体的な観点にする。
未来や理想を扱う場合も、「理想の状態」ではなく、量・頻度・一日の場面で考える。
例: 「どのくらい寝て、どのくらい運動できるとちょうどいいか」。

良い判断例:
相手: 「知り合いに試してもらった時に、間が広いと喋りづらそうだった」
articleAngle: "会話の間をプロダクト品質として捉えている"
bestScene: "知り合いに試してもらった時、間が広いと喋りづらそうだった場面"
humanReaction: "試した人が話しづらそうにしていた"
decisionPoint: "レイテンシ調整を必須だと判断した"
followUp: "どんな様子を見て直す必要を感じたか"
avoid: "原点や内面の意味づけへ急ぐ"
questionType: "episode"

良い判断例:
相手: 「思い通りのアプリケーションが作れて、機能同士が有機的に動いた」
articleAngle: "スムーズな体験を作り手の哲学として語れる話"
bestScene: "機能同士が有機的に動いてストレスなく使えた場面"
followUp: "誰のどんな状態を楽にしたくて、その体験を大事にしたのか"
avoid: "ログや画面状態など実装細部へ潜る"
questionType: "work"

JSON:
{
  "currentThread": "今たどっている話題",
  "intervieweeLean": "past | present | future | leadership | unclear",
  "energyTrend": "rising | steady | dropping",
  "shouldStay": true,
  "shouldShift": false,
  "shiftTo": "past | present | future | leadership | unclear | null",
  "reason": "判断理由",
  "interviewerMove": "インタビュアーへの短い操舵指示",
  "articleTheme": "この記事の主題。更新が必要なら短く書く",
  "currentDepth": "shallow | active | enough",
  "nextMove": "deepen_scene | lift_to_value | ask_origin | connect_company_philosophy | shift_future | close_thread",
  "topicFatigue": "low | medium | high",
  "currentChapter": "opening_philosophy | concrete_example | origin | company_culture | future | closing",
  "chapterProgress": "start | developing | complete",
  "nextChapter": "opening_philosophy | concrete_example | origin | company_culture | future | closing | null",
  "chapterInstruction": "章遷移の意図。質問文ではなく素材",
  "researchAnchor": "今回使う会社固有のリサーチ語",
  "usedResearchAnchors": ["すでに使ったリサーチ語", "..."],
  "pendingResearchAnchors": ["まだ回収すべきリサーチ語", "..."],
  "researchReturnPoint": "具体例から戻る会社固有の取っかかり",
  "editorialPriority": "normal | strong | override",
  "allowedQuestionTypes": ["origin", "value"],
  "forbiddenQuestionTypes": ["same_branch_deepening", "reaction_chasing"],
  "coveredTopics": ["十分聞いた話題", "..."],
  "openThreads": ["まだ聞くべき重要な問い", "..."],
  "questionType": "episode | origin | value | work | people | future",
  "articleAngle": "読者に伝わる見出しになりそうな観点",
  "bestScene": "記事で描けそうな具体場面",
  "humanReaction": "人・顧客・社員・知人・ユーザーの反応",
  "decisionPoint": "経営者・作り手として判断した瞬間",
  "followUp": "次に聞く切り口。質問文ではなく素材",
  "avoid": "今は飛ばさない方向",
  "anchor": "相手の発話で一番濃い具体素材",
  "probe": "次に聞く切り口。質問文ではなく素材",
  "anchorWords": ["相手の発話から拾う語", "..."],
  "nextAngle": "次に聞く観点",
  "forbiddenJump": "飛ばしてはいけない文脈"
}`,
    },
    {
      role: "user" as const,
      content: `直近の相手発話:
${input.latestIntervieweeText}

直近のAI発話:
${input.latestInterviewerText || "なし"}

最近の会話:
${transcript || "なし"}

編集長用の進行台帳:
${JSON.stringify(editorState, null, 2)}

会社リサーチメモ:
${skeleton || "なし"}`,
    },
  ];
}

export function buildSidecarSteeringSummary(memo: SidecarMemo): string {
  const direction = memo.shouldShift
    ? `転換先: ${memo.shiftTo ?? "未定"}`
    : memo.shouldStay
    ? "この話題を続ける"
    : "流れに合わせる";
  const parts = [
    memo.currentThread && `話題: ${memo.currentThread}`,
    `傾き: ${memo.intervieweeLean}`,
    `熱量: ${memo.energyTrend}`,
    direction,
    memo.reason && `理由: ${memo.reason}`,
    memo.interviewerMove && `動き: ${memo.interviewerMove}`,
    memo.articleTheme && `記事主題: ${memo.articleTheme}`,
    `深さ: ${memo.currentDepth}`,
    `次の動き: ${memo.nextMove}`,
    `疲労: ${memo.topicFatigue}`,
    `章: ${memo.currentChapter}`,
    `章進行: ${memo.chapterProgress}`,
    memo.nextChapter && `次章: ${memo.nextChapter}`,
    memo.chapterInstruction && `章指示: ${memo.chapterInstruction}`,
    memo.researchAnchor && `リサーチ取っかかり: ${memo.researchAnchor}`,
    memo.researchReturnPoint && `リサーチ戻り先: ${memo.researchReturnPoint}`,
    memo.usedResearchAnchors.length > 0 &&
      `使用済みリサーチ: ${memo.usedResearchAnchors.join("、")}`,
    memo.pendingResearchAnchors.length > 0 &&
      `未回収リサーチ: ${memo.pendingResearchAnchors.join("、")}`,
    `編集優先度: ${memo.editorialPriority}`,
    memo.allowedQuestionTypes.length > 0 &&
      `許可質問: ${memo.allowedQuestionTypes.join("、")}`,
    memo.forbiddenQuestionTypes.length > 0 &&
      `禁止質問: ${memo.forbiddenQuestionTypes.join("、")}`,
    memo.coveredTopics.length > 0 && `聞いた話題: ${memo.coveredTopics.join("、")}`,
    memo.openThreads.length > 0 && `未回収: ${memo.openThreads.join("、")}`,
    memo.articleAngle && `記事角度: ${memo.articleAngle}`,
    memo.bestScene && `場面: ${memo.bestScene}`,
    memo.humanReaction && `人の反応: ${memo.humanReaction}`,
    memo.decisionPoint && `判断点: ${memo.decisionPoint}`,
    memo.followUp && `次の切り口: ${memo.followUp}`,
    memo.anchor && `濃い素材: ${memo.anchor}`,
    memo.probe && `聞く切り口: ${memo.probe}`,
    memo.avoid && `避ける: ${memo.avoid}`,
    `質問型: ${memo.questionType}`,
    memo.anchorWords.length > 0 && `拾う語: ${memo.anchorWords.join("、")}`,
    memo.nextAngle && `次: ${memo.nextAngle}`,
    memo.forbiddenJump && `飛ばさない: ${memo.forbiddenJump}`,
  ].filter(Boolean);

  return parts.join("\n");
}
