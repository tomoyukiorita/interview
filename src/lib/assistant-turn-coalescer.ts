import {
  filterAssistantTextForDisplay,
  sanitizeTtsText,
} from "./tts-text-sanitizer";

export interface CoalescedUtterance {
  id: string;
  text: string;
}

export interface CoalescerLiveText {
  id: string;
  liveText: string;
}

interface ResponseCandidate {
  text: string;
  hadToolCall: boolean;
}

/**
 * Whether a sanitized utterance actually asks the interviewee something.
 * A real question ends with か / ？ (or contains a question mark). Bridge
 * narration ("…うかがいますね。", "…質問しますね。") never does, so this lets
 * us drop the internal monologue that the model emits alongside a tool call.
 */
function containsQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (/[?？]/u.test(trimmed)) return true;
  return /か[。．.!！]?$/u.test(trimmed);
}

/**
 * Enforces "one spoken assistant utterance per user turn" for the Type 5
 * (Natural Voice) path.
 *
 * The Realtime model frequently emits more than one output per user turn
 * (e.g. a bridge/preamble alongside a `note_interview_focus` tool call, then
 * the real question in a follow-up response). The raw transport stream would
 * otherwise speak every one of them, producing duplicate questions.
 *
 * This coalescer keeps the last speakable response of a turn as the single
 * candidate. The host drives a short settle timer: a new response within the
 * settle window replaces the candidate, so only the final (real question)
 * response is ever spoken.
 */
export interface AssistantTurnCoalescer {
  /** A new interviewee turn started; reset candidate state. */
  noteUserTurn(): void;
  /** A new assistant response began; reset per-response accumulation. */
  noteResponseStart(): void;
  /** Accumulate a streamed delta; returns live (display-only) text. */
  noteDelta(delta: string): CoalescerLiveText;
  /** A response completed; record it as the (superseding) turn candidate. */
  noteResponseComplete(
    finalText?: string,
    options?: { hadToolCall?: boolean }
  ): void;
  /** Emit the single utterance for the turn, or null if nothing to speak. */
  flush(): CoalescedUtterance | null;
  /** Barge-in / teardown: drop any pending candidate and accumulation. */
  cancel(): void;
}

export function createAssistantTurnCoalescer(): AssistantTurnCoalescer {
  let turnId = 0;
  let currentResponseText = "";
  let candidate: ResponseCandidate | null = null;
  let spokenForTurn = false;

  const resetTurn = () => {
    currentResponseText = "";
    candidate = null;
    spokenForTurn = false;
  };

  const turnIdToId = () => `assistant-turn-${turnId}`;

  return {
    noteUserTurn() {
      turnId += 1;
      resetTurn();
    },

    noteResponseStart() {
      currentResponseText = "";
    },

    noteDelta(delta) {
      if (delta) currentResponseText += delta;
      const { visibleText } = filterAssistantTextForDisplay(currentResponseText, {
        final: false,
      });
      return { id: turnIdToId(), liveText: visibleText };
    },

    noteResponseComplete(finalText, options) {
      const raw = (finalText ?? currentResponseText).trim();
      currentResponseText = "";
      const cleaned = sanitizeTtsText(raw);
      if (!cleaned) {
        // Empty or meta-only response (often the bare tool-call response).
        // It contributes nothing; keep any earlier candidate intact.
        return;
      }
      const hadToolCall = options?.hadToolCall ?? false;
      // The tool-call response carries the bridge / internal monologue
      // ("少し整理して…次の一歩をうかがいますね。"). It is only ever speakable if
      // it actually contains a question; pure narration is dropped outright so
      // it can never be voiced, even when it is the turn's only response.
      if (hadToolCall && !containsQuestion(cleaned)) {
        return;
      }
      // A tool-call response must never override a real answer we already
      // captured. Otherwise the latest completed response wins, because the
      // post-tool real question always arrives last in a turn.
      if (candidate && !candidate.hadToolCall && hadToolCall) {
        return;
      }
      candidate = { text: cleaned, hadToolCall };
    },

    flush() {
      if (spokenForTurn || !candidate || !candidate.text) return null;
      spokenForTurn = true;
      const utterance: CoalescedUtterance = {
        id: turnIdToId(),
        text: candidate.text,
      };
      candidate = null;
      return utterance;
    },

    cancel() {
      resetTurn();
    },
  };
}
