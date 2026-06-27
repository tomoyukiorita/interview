import {
  BACKCHANNEL_PHRASES,
  EMPATHY_PHRASES,
  pickPhrase,
} from "./backchannel-phrases";
import type { HumanState, OrchestratorAction } from "./types";

/**
 * Response Orchestrator (Type 6 only).
 *
 * Turns a fused {@link HumanState} into a concrete action while enforcing the
 * social rules a single LLM turn-taker tends to violate: it does not interrupt
 * its own speech, it spaces out backchannels and empathy lines (cooldowns),
 * never backchannels while a follow-up question is already being generated, and
 * only asks a follow-up when there is unanswered content to ask about.
 *
 * The decision is pure (`decide`) so it is easy to test; the hook arms the
 * cooldowns afterwards via `notePerformed` once an action was actually executed
 * (which also lets it skip arming if a barge-in cancelled the action).
 */

export interface OrchestratorContext {
  now: number;
  /** Fish TTS is currently playing — never start a second utterance. */
  aiSpeaking: boolean;
  /** A follow-up question (brain turn) is already scheduled or in flight. */
  brainPending: boolean;
  /** There is interviewee content that has not been responded to yet. */
  hasPendingAnswer: boolean;
  /**
   * Milliseconds since the last ASR segment finalized for the current pending
   * turn. A freshly-landed segment means the speaker just paused (which is why
   * ASR finalized) and very likely continues — do not follow up yet.
   */
  sinceLastSegmentMs: number;
  /**
   * How many ASR segments the current pending turn is made of. More segments =
   * the speaker is in storytelling mode, so the grace window scales up.
   */
  segmentCount: number;
  /** Milliseconds since the last detected speech energy (null if unknown). */
  silenceMs: number | null;
  /** Character length of the accumulated pending answer. */
  pendingTextLength: number;
  /**
   * The speaker explicitly handed the turn back ("以上です", "こんな感じです").
   * Lets long-answer patience release promptly when the human says they are done.
   */
  hasExplicitTurnHandoff: boolean;
}

export interface ResponseOrchestratorConfig {
  /** Minimum gap between backchannels. */
  backchannelCooldownMs: number;
  /** Minimum gap between empathy responses. */
  empathyCooldownMs: number;
  /** Lower bound on end-of-turn for a mid-pause backchannel to be eligible. */
  backchannelMinEot: number;
  /** Upper bound on end-of-turn: above this we are likely about to follow up. */
  backchannelMaxEot: number;
  /** Above this thinking score we stay silent (clearly mid-thought). */
  backchannelMaxThinking: number;
  /** End-of-turn at/above which a follow-up question may fire. */
  followUpMinEot: number;
  /**
   * Even with a high end-of-turn, never follow up until the interviewee has
   * been silent at least this long. A floor against the LiveKit detector
   * reporting "complete" the instant a clean sentence ends.
   */
  followUpMinSilenceMs: number;
  /** Base grace after the latest ASR segment before a follow-up may fire. */
  segmentGraceBaseMs: number;
  /** Extra grace per additional segment (storytelling mode). */
  segmentGraceStepMs: number;
  /** Cap on the total segment grace. */
  segmentGraceMaxMs: number;
  /**
   * Extra dwell for long/multi-segment answers. A multi-segment answer often
   * contains sentence-like pauses; require a human-sized pause before follow-up
   * unless the speaker explicitly hands the turn back.
   */
  storyAnswerGraceMs: number;
  /** Pending text length from which a single segment still counts as story-like. */
  storyAnswerMinChars: number;
}

export const DEFAULT_ORCHESTRATOR_CONFIG: ResponseOrchestratorConfig = {
  backchannelCooldownMs: 3000,
  empathyCooldownMs: 10000,
  backchannelMinEot: 0.2,
  backchannelMaxEot: 0.55,
  backchannelMaxThinking: 0.8,
  followUpMinEot: 0.7,
  followUpMinSilenceMs: 1200,
  segmentGraceBaseMs: 1500,
  segmentGraceStepMs: 400,
  segmentGraceMaxMs: 3000,
  storyAnswerGraceMs: 6500,
  storyAnswerMinChars: 80,
};

type PhrasePicker = (
  pool: readonly string[],
  lastIndex: number
) => { phrase: string; index: number };

const wait = (reason: string): OrchestratorAction => ({ kind: "WAIT", reason });

export class ResponseOrchestrator {
  private readonly config: ResponseOrchestratorConfig;
  private readonly selectPhrase: PhrasePicker;
  private lastBackchannelAt = -Infinity;
  private lastEmpathyAt = -Infinity;
  private lastBackchannelIndex = -1;
  private lastEmpathyIndex = -1;

  constructor(
    config: Partial<ResponseOrchestratorConfig> = {},
    selectPhrase: PhrasePicker = pickPhrase
  ) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.selectPhrase = selectPhrase;
  }

  decide(state: HumanState, ctx: OrchestratorContext): OrchestratorAction {
    const cfg = this.config;

    // Never speak over ourselves; barge-in is handled by the hook separately.
    if (ctx.aiSpeaking) return wait("ai-speaking");
    // A follow-up is already being generated — suppress backchannels/empathy.
    if (ctx.brainPending) return wait("brain-pending");

    // Clearly finished: ask the next question (only if there is new content).
    if (state.endOfTurn >= cfg.followUpMinEot) {
      if (!ctx.hasPendingAnswer) return wait("eot-no-pending-answer");
      // Floor: a clean sentence boundary alone is not enough — require real
      // trailing silence before treating the turn as handed back.
      if (ctx.silenceMs != null && ctx.silenceMs < cfg.followUpMinSilenceMs) {
        return wait("min-silence");
      }
      // Segment grace: a freshly-landed segment means the speaker just paused
      // mid-answer. Hold longer the more segments they have produced (they are
      // telling a story). The hook's hard backstop still guarantees an eventual
      // commit, so this only delays, never stalls.
      const grace = Math.min(
        cfg.segmentGraceBaseMs +
          cfg.segmentGraceStepMs * Math.max(0, ctx.segmentCount - 1),
        cfg.segmentGraceMaxMs
      );
      if (ctx.sinceLastSegmentMs < grace) return wait("segment-grace");
      const isStoryAnswer =
        ctx.segmentCount >= 2 || ctx.pendingTextLength >= cfg.storyAnswerMinChars;
      if (
        isStoryAnswer &&
        !ctx.hasExplicitTurnHandoff &&
        ctx.sinceLastSegmentMs < cfg.storyAnswerGraceMs
      ) {
        return wait("story-grace");
      }
      return { kind: "FOLLOW_UP", reason: "end-of-turn" };
    }

    // Mid-turn with a nervous/hesitant tone: a short empathic reflection.
    if (
      state.recommendedAction === "EMPATHY" &&
      ctx.now - this.lastEmpathyAt >= cfg.empathyCooldownMs
    ) {
      const { phrase } = this.selectPhrase(
        EMPATHY_PHRASES,
        this.lastEmpathyIndex
      );
      return { kind: "EMPATHY", reason: "empathy", phrase };
    }

    // A brief, natural pause while still mid-answer: drop a light backchannel
    // to show we are listening, but only when not clearly mid-word.
    if (
      state.endOfTurn >= cfg.backchannelMinEot &&
      state.endOfTurn < cfg.backchannelMaxEot &&
      state.thinking <= cfg.backchannelMaxThinking &&
      ctx.now - this.lastBackchannelAt >= cfg.backchannelCooldownMs
    ) {
      const { phrase } = this.selectPhrase(
        BACKCHANNEL_PHRASES,
        this.lastBackchannelIndex
      );
      return { kind: "BACKCHANNEL", reason: "mid-pause", phrase };
    }

    return wait("default");
  }

  /** Arm cooldowns after an action was actually executed. */
  notePerformed(action: OrchestratorAction, now: number): void {
    if (action.kind === "BACKCHANNEL") {
      this.lastBackchannelAt = now;
      this.lastBackchannelIndex = BACKCHANNEL_PHRASES.indexOf(
        action.phrase ?? ""
      );
    } else if (action.kind === "EMPATHY") {
      this.lastEmpathyAt = now;
      this.lastEmpathyIndex = EMPATHY_PHRASES.indexOf(action.phrase ?? "");
      // Empathy also counts as a recent verbal turn, so hold backchannels.
      this.lastBackchannelAt = now;
    }
  }

  reset(): void {
    this.lastBackchannelAt = -Infinity;
    this.lastEmpathyAt = -Infinity;
    this.lastBackchannelIndex = -1;
    this.lastEmpathyIndex = -1;
  }
}
