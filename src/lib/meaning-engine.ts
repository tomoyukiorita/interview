import {
  advanceBrainClock,
  createBrainClock,
  type BrainChapter,
  type BrainClockState,
} from "./interview-brain";

/**
 * Type 6 only. The "meaning depth" axis, orthogonal to the chapter clock's
 * topic axis. Where the chapter clock decides WHICH topic the interview is on
 * (philosophy -> origin -> present -> future -> closing), this decides HOW DEEP
 * to probe the current topic, climbing the Wellulu-style ladder:
 *
 *   FACT (何が起きた) -> EMOTION (どう感じた) -> VALUE (なぜ/原体験)
 *   -> DECISION (何を基準に決めた=その人独自のOS) -> PHILOSOPHY (人生観/経営観)
 *   -> LESSON (誰でも使える学びへ普遍化)
 *
 * The progression is fully deterministic (no extra LLM call): the brain still
 * authors the question, but the host hands it the target depth so the line of
 * questioning reliably climbs from facts to values to a reusable lesson rather
 * than stalling on surface facts.
 */
export const INTERVIEW_DEPTHS = [
  "FACT",
  "EMOTION",
  "VALUE",
  "DECISION",
  "PHILOSOPHY",
  "LESSON",
] as const;

export type InterviewDepth = (typeof INTERVIEW_DEPTHS)[number];

export type FollowUpIntent =
  | "clarify_fact"
  | "explore_emotion"
  | "extract_value"
  | "probe_decision"
  | "reflect_philosophy"
  | "derive_lesson"
  | "move_topic";

const DEPTH_TO_INTENT: Record<InterviewDepth, FollowUpIntent> = {
  FACT: "clarify_fact",
  EMOTION: "explore_emotion",
  VALUE: "extract_value",
  DECISION: "probe_decision",
  PHILOSOPHY: "reflect_philosophy",
  LESSON: "derive_lesson",
};

/**
 * The single-line instruction handed to the brain for each intent. Encodes the
 * Wellulu nuances explicitly: EMOTION never stops at the fact, VALUE digs the
 * root ONCE (so it does not collide with the system prompt's "no two
 * consecutive origin-seeking questions" rule), DECISION asks for the decision
 * criteria (the person's own OS) rather than what they did, and LESSON
 * universalizes "私の場合" into something anyone can use.
 */
const INTENT_GUIDANCE: Record<FollowUpIntent, string> = {
  clarify_fact:
    "今は【事実】の層。何が起きたか・いつ・誰と・何を、を1点に絞って具体に確かめる。",
  explore_emotion:
    "今は【感情】の層。事実確認で止めず『その時どう感じたか（不安・迷い・手応え・葛藤）』へ一段上げる。",
  extract_value:
    "今は【価値観】の層。『なぜそう感じたのか』を1回だけ掘り、その感情の根にある価値観・原体験へ。由来の遡りはこの1手に限定する。",
  probe_decision:
    "今は【意思決定】の層。『何をしたか』ではなく『決断の瞬間、何を基準に・何を優先して決めたか』を聞き、その人独自の判断のものさしを引き出す。由来の遡りには戻らない。",
  reflect_philosophy:
    "今は【人生観・経営観】の層。その判断や経験が、今の経営観・人生観にどうつながっているかへ接続する。",
  derive_lesson:
    "今は【学び】の層。『私の場合は〜』を『同じ状況の人が誰でも使える考え方』へ普遍化して引き出す。",
  move_topic:
    "前の話題は十分に掘れた。次の話題の事実から、具体を1点だけ確かめて入る。",
};

const DEPTH_GUIDANCE_TAIL =
  "ただし相手がまだ同じ話を続けたそうなら、話題を移さず受け切る。";

/**
 * The one "universalize the lesson" question asked at the future->closing
 * boundary, BEFORE the wrap-up turn. The closing chapter itself suppresses new
 * questions, so without this gate the LESSON rung (derive a transferable
 * takeaway anyone could use) never actually gets asked.
 */
const PRE_CLOSING_LESSON_HINT =
  "インタビューの締めに入る直前です。まだ感謝やまとめには入らず、最後にもう1問だけ。ここまで語られた経験・価値観・判断から『同じ状況にいる人が誰でも応用できる考え方・ヒント』を1つ引き出す、開いた問いを投げてください（はい/いいえで終わる確認にしない）。";

export interface InterviewClockState extends BrainClockState {
  depth: InterviewDepth;
  /**
   * Whether the one universal-lesson question (asked at the future->closing
   * boundary) has already been posed. Gates the LESSON-then-wrap sequence.
   */
  lessonAsked: boolean;
}

export function createInterviewClock(): InterviewClockState {
  return { ...createBrainClock(), depth: "FACT", lessonAsked: false };
}

function withDepthGuidance(base: string, intent: FollowUpIntent): string {
  return `${base}\n${INTENT_GUIDANCE[intent]}${DEPTH_GUIDANCE_TAIL}`;
}

function nextDepth(depth: InterviewDepth): InterviewDepth {
  const index = INTERVIEW_DEPTHS.indexOf(depth);
  if (index < 0) return "FACT";
  return INTERVIEW_DEPTHS[Math.min(index + 1, INTERVIEW_DEPTHS.length - 1)];
}

export interface InterviewClockAdvance {
  state: InterviewClockState;
  chapter: BrainChapter;
  chapterLabel: string;
  depth: InterviewDepth;
  intent: FollowUpIntent;
  /** Combined hint: the chapter (topic) hint plus the depth guidance line. */
  hint: string;
}

/**
 * Decide the next interviewer turn's chapter (topic) AND depth. Called once per
 * interviewee answer, before authoring the next question. The chapter axis is
 * delegated to the existing, tested {@link advanceBrainClock}; the depth axis
 * is layered on top:
 *
 * - opening turn (icebreak reply): start at FACT / clarify_fact.
 * - closing chapter: pinned at LESSON / derive_lesson (the chapter hint forbids
 *   a new question, so no depth question is appended).
 * - chapter lifted (topic changed — incl. weak/short answers, which the chapter
 *   clock treats as a lift): reset depth to FACT and signal move_topic.
 * - otherwise: climb one rung up the ladder (capped at LESSON).
 */
export function advanceInterviewClock(
  state: InterviewClockState,
  intervieweeText: string
): InterviewClockAdvance {
  const isOpeningTurn =
    state.chapter === "philosophy" && state.turnsInChapter === 0;
  const chapterAdvance = advanceBrainClock(state, intervieweeText);
  const lifted = chapterAdvance.chapter !== state.chapter;
  const inClosing = chapterAdvance.chapter === "closing";

  let depth: InterviewDepth;
  let intent: FollowUpIntent;
  let lessonAsked = state.lessonAsked;
  let hint: string;

  if (isOpeningTurn) {
    depth = "FACT";
    intent = "clarify_fact";
    hint = withDepthGuidance(chapterAdvance.hint, intent);
  } else if (inClosing && !state.lessonAsked) {
    // future -> closing boundary: ask ONE universalizing lesson question before
    // wrapping up. The chapter clock has already moved to closing, but we
    // override its (no-question) hint for this single turn.
    depth = "LESSON";
    intent = "derive_lesson";
    lessonAsked = true;
    hint = PRE_CLOSING_LESSON_HINT;
  } else if (inClosing) {
    // The lesson question was already asked: now actually wrap up (no new
    // question), driven entirely by the closing chapter hint.
    depth = "LESSON";
    intent = "derive_lesson";
    hint = chapterAdvance.hint;
  } else if (lifted) {
    depth = "FACT";
    intent = "move_topic";
    hint = withDepthGuidance(chapterAdvance.hint, intent);
  } else {
    depth = nextDepth(state.depth);
    intent = DEPTH_TO_INTENT[depth];
    hint = withDepthGuidance(chapterAdvance.hint, intent);
  }

  return {
    state: { ...chapterAdvance.state, depth, lessonAsked },
    chapter: chapterAdvance.chapter,
    chapterLabel: chapterAdvance.chapterLabel,
    depth,
    intent,
    hint,
  };
}
