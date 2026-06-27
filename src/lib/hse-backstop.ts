import { endsMidThought, endsWithHesitation } from "./interview-brain";

export type HseBackstopReleaseReason = "max-wait" | "max-wait-hard";
export type HseBackstopWaitReason = "default" | "hard-wait-mid-thought";

export interface HseBackstopInput {
  pendingText: string;
  waitedMs: number;
  thinking: number;
  vadSpeaking: boolean;
  sinceLastSegmentMs: number;
  softMaxWaitMs: number;
  hardMaxWaitMs: number;
  hardWaitSegmentGraceMs: number;
}

export interface HseBackstopDecision {
  release: boolean;
  reason: HseBackstopReleaseReason | HseBackstopWaitReason;
}

const EXPLICIT_TURN_HANDOFF =
  /(?:以上です|こんな感じです|そんな感じです|ここまでです|これで大丈夫です|一旦以上です)[。．.!！\s]*$/u;

const STILL_IN_TURN_THINKING_THRESHOLD = 0.5;

export function hasExplicitTurnHandoff(text: string): boolean {
  return EXPLICIT_TURN_HANDOFF.test((text ?? "").trim());
}

function hasStrongContinuationSignal(pendingText: string): boolean {
  const pending = pendingText.trim();
  if (!pending) return false;
  if (hasExplicitTurnHandoff(pending)) return false;
  return endsMidThought(pending) || endsWithHesitation(pending);
}

export function decideHseBackstop(input: HseBackstopInput): HseBackstopDecision {
  const pending = input.pendingText.trim();
  if (!pending) return { release: false, reason: "default" };

  const stillInTurn =
    input.vadSpeaking || input.thinking >= STILL_IN_TURN_THINKING_THRESHOLD;
  const strongContinuation = hasStrongContinuationSignal(pending);
  const freshSegmentContinuation =
    strongContinuation && input.sinceLastSegmentMs < input.hardWaitSegmentGraceMs;

  if (input.waitedMs >= input.hardMaxWaitMs) {
    return freshSegmentContinuation
      ? { release: false, reason: "hard-wait-mid-thought" }
      : { release: true, reason: "max-wait-hard" };
  }

  if (input.waitedMs >= input.softMaxWaitMs && !stillInTurn) {
    return { release: true, reason: "max-wait" };
  }

  return { release: false, reason: "default" };
}
