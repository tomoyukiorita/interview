import type { SidecarMemo } from "./interview-sidecar";

type Lean = SidecarMemo["intervieweeLean"];
type EnergyTrend = SidecarMemo["energyTrend"];
type Depth = SidecarMemo["currentDepth"];
type NextMove = SidecarMemo["nextMove"];
type Fatigue = SidecarMemo["topicFatigue"];
type Chapter = SidecarMemo["currentChapter"];
type ChapterProgress = SidecarMemo["chapterProgress"];
type EditorialPriority = SidecarMemo["editorialPriority"];
type ForbiddenQuestionType = SidecarMemo["forbiddenQuestionTypes"][number];
type QuestionType = SidecarMemo["questionType"];

export type EmotionalEnergy = "high" | "neutral" | "low";

/**
 * A concrete, researched fact (named product, distinctive word, founding story,
 * customer promise, etc.) that the model can anchor a transition question to.
 * The whole point: a transition should land on a specific fact or the
 * interviewee's own words, never an abstract "what is the promise you want to
 * keep?" template.
 */
export type ResearchAnchorKind =
  | "business"
  | "productAngle"
  | "recentInitiative"
  | "foundingStory"
  | "formativeTheme"
  | "mission"
  | "vision"
  | "bet"
  | "customerPromise"
  | "distinctiveWord"
  | "cultureSignal"
  | "leaderQuote"
  | "connection"
  | "value";

export interface ResearchAnchor {
  kind: ResearchAnchorKind;
  text: string;
}

/**
 * Maximum number of consecutive deepen_scene moves allowed on the same thread.
 * The (MAX_DEEPEN + 1)th deepen is blocked and forced into a lift, so a single
 * concrete example can be developed for at most this many turns before the
 * conversation must climb back to meaning / origin / philosophy.
 */
export const MAX_DEEPEN = 2;

/** Answers at or below this normalized length count as "short" answers. */
export const SHORT_ANSWER_MAX_CHARS = 12;

/**
 * Maximum number of turns the interview may dwell in one chapter before a lift
 * is forced — regardless of whether the model keeps relabeling the "thread".
 * This stops the failure mode where the model walks sideways through many
 * sub-topics (research → RAG → clinic → night support → reaction → expansion)
 * while never leaving the concrete-example chapter for origin / philosophy /
 * future.
 */
export const MAX_TURNS_PER_CHAPTER = 2;

const MAX_COVERED_TOPICS = 16;
const MAX_USED_RESEARCH_ANCHORS = 16;

const CHAPTER_ORDER: Chapter[] = [
  "opening_philosophy",
  "concrete_example",
  "origin",
  "company_culture",
  "future",
  "closing",
];

const NEXT_MOVE_TO_ALLOWED_MOVE: Record<NextMove, string> = {
  deepen_scene: "ask_episode",
  lift_to_value: "ask_value",
  ask_origin: "ask_origin",
  connect_company_philosophy: "connect_company_philosophy",
  shift_future: "ask_future",
  close_thread: "close_thread",
};

const CHAPTER_TO_LIFT_MOVE: Record<Chapter, NextMove> = {
  opening_philosophy: "connect_company_philosophy",
  concrete_example: "ask_origin",
  origin: "connect_company_philosophy",
  company_culture: "shift_future",
  future: "shift_future",
  closing: "close_thread",
};

const CHAPTER_TO_ANCHOR_KINDS: Record<Chapter, ResearchAnchorKind[]> = {
  opening_philosophy: ["mission", "distinctiveWord", "vision", "value"],
  concrete_example: ["business", "productAngle", "recentInitiative"],
  origin: ["foundingStory", "formativeTheme", "connection"],
  company_culture: [
    "cultureSignal",
    "distinctiveWord",
    "customerPromise",
    "leaderQuote",
    "value",
  ],
  future: ["vision", "bet", "customerPromise"],
  closing: ["customerPromise", "vision"],
};

const CHAPTER_TO_ALLOWED_TYPES: Record<Chapter, QuestionType[]> = {
  opening_philosophy: ["value", "origin"],
  concrete_example: ["episode", "work"],
  origin: ["origin", "value"],
  company_culture: ["value", "people"],
  future: ["future", "people"],
  closing: ["value"],
};

const LIFT_FORBIDDEN_TYPES: ForbiddenQuestionType[] = [
  "same_branch_deepening",
  "reaction_chasing",
  "implementation_detail",
  "workflow_detail",
];

const NEGATIVE_ANSWER = /(特には?ない|わからない|分からない|わからなかった|分からなかった|覚えて(?:い)?ない|思い出せない|うーん|うーむ|ちょっと(?:待っ|考え)|よく(?:わからな|分からな))/u;
const ENDS_WITH_QUESTION = /[？?]$/u;

export interface EditorialSelfReport {
  intervieweeLean: Lean;
  emotionalEnergy: EmotionalEnergy;
  currentThread: string;
  noticedConnection: string | null;
  threadDepth: Depth;
  concreteExampleCovered: boolean;
  proposedNextMove: NextMove;
  currentChapter: Chapter;
  researchAnchorUsed: string | null;
}

export interface EditorialState {
  lastThread: string;
  sameThreadDeepenCount: number;
  turnsInChapter: number;
  usedResearchAnchors: string[];
  coveredTopics: string[];
  lastChapter: Chapter;
}

export interface EditorialContext {
  latestIntervieweeText: string;
  researchAnchors?: ResearchAnchor[];
}

export interface EditorialControl {
  priority: EditorialPriority;
  currentChapter: Chapter;
  chapterProgress: ChapterProgress;
  nextChapter: Chapter | null;
  chapterInstruction: string;
  researchAnchor: string;
  researchReturnPoint: string;
  allowedQuestionTypes: QuestionType[];
  forbiddenQuestionTypes: ForbiddenQuestionType[];
}

export interface EditorialDirective {
  thread: string;
  lean: Lean;
  energy: EnergyTrend;
  currentDepth: Depth;
  nextMove: NextMove;
  allowedMove: string;
  topicFatigue: Fatigue;
  currentChapter: Chapter;
  chapterProgress: ChapterProgress;
  nextChapter: Chapter | null;
  chapterInstruction: string;
  researchAnchor: string;
  researchReturnPoint: string;
  usedResearchAnchors: string[];
  noticedConnection: string;
  editorialControl: EditorialControl;
  speechContract: {
    outputShape: string;
    maxAssistantMessages: number;
    forbiddenSpeech: string[];
  };
}

export interface EditorialDecision {
  directive: EditorialDirective;
  nextState: EditorialState;
}

export function createInitialEditorialState(): EditorialState {
  return {
    lastThread: "",
    sameThreadDeepenCount: 0,
    turnsInChapter: 0,
    usedResearchAnchors: [],
    coveredTopics: [],
    lastChapter: "opening_philosophy",
  };
}

function normalizeThread(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/[、。,.・!！?？「」『』()（）]/g, "")
    .trim();
}

function isSameThread(previous: string, next: string): boolean {
  const a = normalizeThread(previous);
  const b = normalizeThread(next);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function isNegativeAnswer(text: string): boolean {
  const normalized = (text ?? "").replace(/\s+/g, "").trim();
  if (!normalized) return true;
  return NEGATIVE_ANSWER.test(normalized);
}

export function isShortAnswer(text: string): boolean {
  const normalized = (text ?? "").replace(/\s+/g, "").trim();
  if (!normalized) return true;
  if (ENDS_WITH_QUESTION.test(normalized)) return false;
  return normalized.length <= SHORT_ANSWER_MAX_CHARS;
}

function nextChapterAfter(chapter: Chapter): Chapter {
  const index = CHAPTER_ORDER.indexOf(chapter);
  if (index < 0) return "origin";
  return CHAPTER_ORDER[Math.min(index + 1, CHAPTER_ORDER.length - 1)];
}

function energyTrendFrom(energy: EmotionalEnergy): EnergyTrend {
  if (energy === "high") return "rising";
  if (energy === "low") return "dropping";
  return "steady";
}

/**
 * Anchors at or below this length are preferred so the model is handed a short,
 * speakable fragment (a named concept / distinctive word) rather than a full
 * mission sentence it would read verbatim.
 */
const PREFERRED_ANCHOR_MAX_CHARS = 24;

/**
 * Pick one concrete, still-unused research anchor that fits the chapter we are
 * moving into, preferring kinds most relevant to that chapter and, within a
 * kind, the shortest speakable fragment. Falls back to any unused anchor, then
 * null when the inventory is exhausted or empty.
 */
function pickResearchAnchor(
  anchors: ResearchAnchor[],
  chapter: Chapter,
  used: Set<string>
): string | null {
  if (anchors.length === 0) return null;
  const available = anchors.filter(
    (anchor) => anchor.text && !used.has(anchor.text)
  );
  if (available.length === 0) return null;

  const pickShortest = (candidates: ResearchAnchor[]): string | null => {
    if (candidates.length === 0) return null;
    const short = candidates.filter(
      (anchor) => anchor.text.length <= PREFERRED_ANCHOR_MAX_CHARS
    );
    const pool = short.length > 0 ? short : candidates;
    return pool.reduce((a, b) => (a.text.length <= b.text.length ? a : b)).text;
  };

  const kinds = CHAPTER_TO_ANCHOR_KINDS[chapter] ?? [];
  for (const kind of kinds) {
    const hit = pickShortest(available.filter((anchor) => anchor.kind === kind));
    if (hit) return hit;
  }
  return pickShortest(available);
}

function addUnique(list: string[], value: string | null, cap: number): string[] {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return list.slice(-cap);
  if (list.some((item) => item === normalized)) return list.slice(-cap);
  return [...list, normalized].slice(-cap);
}

/**
 * The deterministic editorial brain. The Realtime model self-reports its read
 * of the conversation; this function applies hard guardrails (consecutive
 * deepen cap, short/negative-answer detection, honest "depth enough" signal)
 * and, when triggered, overrides the model toward lifting back to
 * meaning / origin / company philosophy.
 */
export function decideEditorialDirective(
  report: EditorialSelfReport,
  state: EditorialState,
  context: EditorialContext
): EditorialDecision {
  const threadSame = isSameThread(state.lastThread, report.currentThread);
  const proposesDeepen = report.proposedNextMove === "deepen_scene";
  const deepenCount = proposesDeepen
    ? threadSame
      ? state.sameThreadDeepenCount + 1
      : 1
    : 0;

  const chapterSame = report.currentChapter === state.lastChapter;
  const turnsInChapter = chapterSame ? state.turnsInChapter + 1 : 1;

  const pastOpening = report.currentChapter !== "opening_philosophy";
  const negativeSignal = pastOpening && isNegativeAnswer(context.latestIntervieweeText);
  const shortSignal =
    pastOpening && threadSame && isShortAnswer(context.latestIntervieweeText);
  const tooDeep = deepenCount > MAX_DEEPEN;
  // Thread-independent budget: even when the model relabels the thread each
  // turn, dwelling in one chapter too long forces a climb to the next chapter.
  const tooLongInChapter = turnsInChapter > MAX_TURNS_PER_CHAPTER;
  const modelSaysDone =
    report.threadDepth === "enough" || report.concreteExampleCovered === true;

  const forceLift =
    tooDeep || tooLongInChapter || negativeSignal || shortSignal || modelSaysDone;

  const energy = energyTrendFrom(report.emotionalEnergy);
  const noticedConnection = report.noticedConnection ?? "";

  let currentDepth: Depth;
  let nextMove: NextMove;
  let topicFatigue: Fatigue;
  let chapterProgress: ChapterProgress;
  let nextChapter: Chapter | null;
  let chapterInstruction: string;
  let researchAnchor: string;
  let researchReturnPoint: string;
  let priority: EditorialPriority;
  let allowedQuestionTypes: QuestionType[];
  let forbiddenQuestionTypes: ForbiddenQuestionType[];

  const usedAnchorSet = new Set(state.usedResearchAnchors);

  if (forceLift) {
    nextChapter = nextChapterAfter(report.currentChapter);
    nextMove = CHAPTER_TO_LIFT_MOVE[report.currentChapter];
    currentDepth = "enough";
    topicFatigue = "high";
    chapterProgress = "complete";
    priority = "override";
    allowedQuestionTypes = CHAPTER_TO_ALLOWED_TYPES[nextChapter];
    forbiddenQuestionTypes = LIFT_FORBIDDEN_TYPES;
    chapterInstruction = "具体例は十分。理念・源流へ上げる";
    const chosen = pickResearchAnchor(
      context.researchAnchors ?? [],
      nextChapter,
      usedAnchorSet
    );
    researchAnchor = chosen ?? "";
    researchReturnPoint = chosen
      ? `リサーチにある「${chosen}」に触れ、相手が今言った言葉と結びつけて、即答できる具体的な1問にする`
      : "会社固有の理念・源流の言葉に触れ、相手の言葉と結びつけて、即答できる具体的な1問にする。使用済みのリサーチ語は繰り返さない";
  } else {
    nextChapter = null;
    nextMove = report.proposedNextMove;
    currentDepth = report.threadDepth;
    topicFatigue = deepenCount >= MAX_DEEPEN ? "medium" : "low";
    chapterProgress = "developing";
    priority = deepenCount >= MAX_DEEPEN ? "strong" : "normal";
    allowedQuestionTypes = CHAPTER_TO_ALLOWED_TYPES[report.currentChapter];
    forbiddenQuestionTypes =
      deepenCount >= MAX_DEEPEN ? ["same_branch_deepening"] : [];
    chapterInstruction = "";
    researchAnchor = "";
    researchReturnPoint = "";
  }

  let usedResearchAnchors = addUnique(
    state.usedResearchAnchors,
    report.researchAnchorUsed,
    MAX_USED_RESEARCH_ANCHORS
  );
  if (researchAnchor) {
    usedResearchAnchors = addUnique(
      usedResearchAnchors,
      researchAnchor,
      MAX_USED_RESEARCH_ANCHORS
    );
  }

  const nextState: EditorialState = {
    lastThread: report.currentThread,
    sameThreadDeepenCount: forceLift ? 0 : deepenCount,
    turnsInChapter: forceLift ? 0 : turnsInChapter,
    usedResearchAnchors,
    coveredTopics: addUnique(
      state.coveredTopics,
      report.currentThread,
      MAX_COVERED_TOPICS
    ),
    lastChapter: forceLift ? nextChapter ?? report.currentChapter : report.currentChapter,
  };

  const directive: EditorialDirective = {
    thread: report.currentThread,
    lean: report.intervieweeLean,
    energy,
    currentDepth,
    nextMove,
    allowedMove: NEXT_MOVE_TO_ALLOWED_MOVE[nextMove],
    topicFatigue,
    currentChapter: report.currentChapter,
    chapterProgress,
    nextChapter,
    chapterInstruction,
    researchAnchor,
    researchReturnPoint,
    usedResearchAnchors: nextState.usedResearchAnchors,
    noticedConnection,
    editorialControl: {
      priority,
      currentChapter: report.currentChapter,
      chapterProgress,
      nextChapter,
      chapterInstruction,
      researchAnchor,
      researchReturnPoint,
      allowedQuestionTypes,
      forbiddenQuestionTypes,
    },
    speechContract: {
      outputShape: "short_reflection_plus_one_question",
      maxAssistantMessages: 1,
      forbiddenSpeech: [
        "preamble",
        "process_narration",
        "tool_summary",
        "question_intent_explanation",
      ],
    },
  };

  return { directive, nextState };
}
