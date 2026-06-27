import type {
  EmotionState,
  HumanState,
  HumanStateSignalContribution,
  OrchestratorActionKind,
} from "./types";

/**
 * Human State Engine (Type 6 only).
 *
 * Fuses several noisy, asynchronously-updated signals into a single estimate
 * of "where is the interviewee right now": have they finished their turn, are
 * they mid-thought, how do they feel. It is a pure function so it can be unit
 * tested and so the React hook can call it on every tick without owning the
 * heuristics.
 *
 * Each input signal carries its own `*UpdatedAt` timestamp. A signal that has
 * not refreshed recently is faded out (freshness decay) and its weight is
 * removed from the fused average — this prevents a stale LiveKit / audio value
 * from pinning end-of-turn high (or low) after the underlying source dies.
 */

/** Raw, timestamped signals fed into the engine on each tick. */
export interface HumanStateInput {
  now: number;

  // --- OpenAI Realtime server VAD ---
  /** True while server VAD reports the interviewee is speaking. */
  vadSpeaking: boolean;
  /** When server VAD last fired speech_stopped (null if never / mid-speech). */
  vadSpeechEndedAt: number | null;
  /** Last time any VAD event updated the above. */
  vadUpdatedAt: number;

  // --- LiveKit turn detector (audio model, Phase 3; optional) ---
  /** End-of-turn probability 0..1 from the LiveKit worker, or null if absent. */
  livekitEndOfTurn: number | null;
  /** When the LiveKit value last arrived (null if never). */
  livekitUpdatedAt: number | null;

  // --- Audio feature analysis ---
  /** Milliseconds since the last detected speech energy (null if unknown). */
  silenceMs: number | null;
  /** The latest ASR partial trails off with a filler ("えーと", "うーん"…). */
  endsWithHesitation: boolean;
  /**
   * The pending utterance ends mid-thought: a dangling connective / particle
   * ("…のに", "…ので", "…を") or a filler-only turn. Strong "will continue" cue.
   */
  endsMidThought: boolean;
  /** Count of filler tokens in the pending utterance (thinking signal). */
  fillerCount: number;
  /** Characters per second of the latest speech segment (null if unknown). */
  speechRate: number | null;
  /** Recent pitch range in Hz (null if unknown). */
  pitchRange: number | null;
  /** Recent loudness trend, -1 (falling) .. 1 (rising). */
  volumeTrend: number | null;
  /** When audio-derived values last refreshed (null if never). */
  audioUpdatedAt: number | null;

  // --- Emotion ---
  emotion: EmotionState | null;
  emotionUpdatedAt: number | null;
}

export interface HumanStateConfig {
  /** Age (ms) at/under which a signal has full weight (VAD baseline window). */
  freshFullMs: number;
  /** Age (ms) at/over which a signal is fully discarded (VAD baseline). */
  freshZeroMs: number;
  // Per-signal freshness windows. Different sources update at very different
  // cadences and go stale at different rates, so each gets its own bounds.
  freshLivekitFullMs: number;
  freshLivekitZeroMs: number;
  freshAudioFullMs: number;
  freshAudioZeroMs: number;
  freshEmotionFullMs: number;
  freshEmotionZeroMs: number;
  /**
   * Silence (ms) below which the LiveKit end-of-turn signal is discounted: a
   * "turn complete" verdict the instant a clean sentence ends, with no trailing
   * silence yet, is treated as low-confidence (it often precedes the speaker
   * resuming). Full LiveKit weight is restored once silence reaches this.
   */
  freshLivekitSilenceMs: number;
  /** Base weights per source before freshness decay. */
  weightVad: number;
  weightLivekit: number;
  weightAudio: number;
  /** Silence below this contributes 0 end-of-turn; above the ceiling, 1. */
  silenceFloorMs: number;
  silenceCeilMs: number;
  /** Soft recommendedAction thresholds on the fused end-of-turn score. */
  eotHigh: number;
  eotLow: number;
}

export const DEFAULT_HUMAN_STATE_CONFIG: HumanStateConfig = {
  freshFullMs: 700,
  freshZeroMs: 2500,
  // LiveKit EOT is event-driven; treat it as stale after ~3s.
  freshLivekitFullMs: 800,
  freshLivekitZeroMs: 3000,
  // Pitch / volume / silence are sampled ~10Hz; expire fast (~2s) so a frozen
  // analyser can never keep contributing.
  freshAudioFullMs: 600,
  freshAudioZeroMs: 2000,
  // Emotion is smoothed over a window and updates slowly; keep it ~5s.
  freshEmotionFullMs: 1500,
  freshEmotionZeroMs: 5000,
  // Discount a LiveKit "complete" verdict until ~0.7s of trailing silence.
  freshLivekitSilenceMs: 700,
  weightVad: 1,
  // The LiveKit audio turn-detector is the strongest single cue when present.
  weightLivekit: 1.6,
  weightAudio: 0.8,
  // Reflective interviewees pause 1.5-2.5s mid-thought. Without the LiveKit
  // semantic detector, silence is the only completion cue, so ramp it more
  // patiently: end-of-turn reaches the follow-up threshold (~0.7) only after
  // ~1.5s of silence instead of ~1s. LiveKit, when present, fires faster on a
  // genuinely complete turn so this patience does not add latency there.
  silenceFloorMs: 400,
  silenceCeilMs: 2000,
  eotHigh: 0.7,
  eotLow: 0.4,
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Linear freshness weight between explicit full/zero age bounds. */
function freshnessBetween(ageMs: number, fullMs: number, zeroMs: number): number {
  if (ageMs <= fullMs) return 1;
  if (ageMs >= zeroMs) return 0;
  return 1 - (ageMs - fullMs) / (zeroMs - fullMs);
}

/** Linear freshness weight: 1 when recent, decaying to 0 at the stale bound. */
export function freshness(
  ageMs: number,
  config: HumanStateConfig = DEFAULT_HUMAN_STATE_CONFIG
): number {
  return freshnessBetween(ageMs, config.freshFullMs, config.freshZeroMs);
}

/** Map a silence duration to an end-of-turn estimate in 0..1. */
function silenceToEndOfTurn(silenceMs: number, config: HumanStateConfig): number {
  if (silenceMs <= config.silenceFloorMs) return 0;
  if (silenceMs >= config.silenceCeilMs) return 1;
  return (
    (silenceMs - config.silenceFloorMs) /
    (config.silenceCeilMs - config.silenceFloorMs)
  );
}

const inactive = (ageMs: number | null): HumanStateSignalContribution => ({
  active: false,
  weight: 0,
  value: null,
  ageMs,
});

/** Normalize an emotion field that may be on a 0..1 or 0..100 scale. */
function normalizeEmotionScore(raw: number): number {
  return raw > 1 ? clamp01(raw / 100) : clamp01(raw);
}

function emotionNeedsEmpathy(emotion: EmotionState): boolean {
  if (
    emotion.label === "nervous" ||
    emotion.label === "hesitant" ||
    emotion.label === "disengaged"
  ) {
    return true;
  }
  return normalizeEmotionScore(emotion.nervousness) >= 0.65;
}

export function computeHumanState(
  input: HumanStateInput,
  config: HumanStateConfig = DEFAULT_HUMAN_STATE_CONFIG
): HumanState {
  const { now } = input;

  // --- OpenAI VAD contribution ---
  let vad: HumanStateSignalContribution;
  {
    const ageMs = now - input.vadUpdatedAt;
    const weight =
      config.weightVad *
      freshnessBetween(ageMs, config.freshFullMs, config.freshZeroMs);
    if (weight <= 0) {
      vad = inactive(ageMs);
    } else if (input.vadSpeaking) {
      // Actively speaking: a confident "not finished".
      vad = { active: true, weight, value: 0, ageMs };
    } else if (input.vadSpeechEndedAt != null) {
      const value = silenceToEndOfTurn(now - input.vadSpeechEndedAt, config);
      vad = { active: true, weight, value, ageMs };
    } else {
      // No speech has happened yet — no information.
      vad = inactive(ageMs);
    }
  }

  // --- LiveKit turn detector contribution ---
  let livekit: HumanStateSignalContribution;
  {
    const ageMs = input.livekitUpdatedAt == null ? null : now - input.livekitUpdatedAt;
    if (input.livekitEndOfTurn == null || ageMs == null) {
      livekit = inactive(ageMs);
    } else {
      // Discount a "complete" verdict that arrives before any trailing silence
      // (often a clean sentence boundary the speaker continues past). Only
      // discounts high values; a "turn open" (low) verdict is unaffected.
      const silenceGate =
        input.silenceMs == null
          ? 1
          : clamp01(input.silenceMs / config.freshLivekitSilenceMs);
      const value = clamp01(input.livekitEndOfTurn);
      const gate = value > 0.5 ? silenceGate : 1;
      const weight =
        config.weightLivekit *
        gate *
        freshnessBetween(
          ageMs,
          config.freshLivekitFullMs,
          config.freshLivekitZeroMs
        );
      livekit =
        weight <= 0 ? inactive(ageMs) : { active: true, weight, value, ageMs };
    }
  }

  // --- Audio (silence ramp) contribution ---
  let audio: HumanStateSignalContribution;
  {
    const ageMs = input.audioUpdatedAt == null ? null : now - input.audioUpdatedAt;
    if (input.silenceMs == null || ageMs == null) {
      audio = inactive(ageMs);
    } else {
      const weight =
        config.weightAudio *
        freshnessBetween(
          ageMs,
          config.freshAudioFullMs,
          config.freshAudioZeroMs
        );
      audio =
        weight <= 0
          ? inactive(ageMs)
          : {
              active: true,
              weight,
              value: silenceToEndOfTurn(input.silenceMs, config),
              ageMs,
            };
    }
  }

  // --- Emotion contribution (does not feed end-of-turn directly) ---
  const emotionAgeMs =
    input.emotionUpdatedAt == null ? null : now - input.emotionUpdatedAt;
  const emotionWeight =
    emotionAgeMs == null
      ? 0
      : freshnessBetween(
          emotionAgeMs,
          config.freshEmotionFullMs,
          config.freshEmotionZeroMs
        );
  const emotionFresh = input.emotion != null && emotionWeight > 0;
  const emotion = emotionFresh ? input.emotion : null;
  const emotionSignal: HumanStateSignalContribution = emotionFresh
    ? {
        active: true,
        weight: emotionWeight,
        value: null,
        ageMs: emotionAgeMs,
      }
    : inactive(emotionAgeMs);

  // --- Fuse end-of-turn over active signals ---
  const contributions = [vad, livekit, audio].filter((c) => c.active);
  const totalWeight = contributions.reduce((sum, c) => sum + c.weight, 0);
  const rawEndOfTurn =
    totalWeight > 0
      ? contributions.reduce((sum, c) => sum + c.weight * (c.value ?? 0), 0) /
        totalWeight
      : 0;

  // --- Thinking: likelihood the interviewee is mid-thought / will continue ---
  const justPaused =
    !input.vadSpeaking &&
    input.silenceMs != null &&
    input.silenceMs > 0 &&
    input.silenceMs < config.silenceFloorMs;
  // Several fillers in one utterance ("えー、その、あの…") is a strong "still
  // composing" cue even when the trailing token itself is not a filler.
  const fillerThinking = clamp01(input.fillerCount / 3) * 0.7;
  // The interviewee has gone quiet, but the LiveKit turn detector still judges
  // the turn open (value < 0.5). This is the robust "they paused to think" cue
  // when ASR has stripped the fillers and the sentence looks grammatically
  // complete — exactly the case the text signals above miss. Only meaningful
  // while LiveKit is active; without it, we fall back to the text cues.
  const pausedMidTurn =
    !input.vadSpeaking &&
    input.silenceMs != null &&
    input.silenceMs > config.silenceFloorMs &&
    livekit.active &&
    livekit.value != null &&
    livekit.value < 0.5;
  const thinking = clamp01(
    Math.max(
      // A grammatically incomplete turn ("…ユーザーの顔を", "…のに") almost
      // always continues — the single strongest "do not cut in" signal when
      // the LiveKit semantic detector is unavailable.
      input.endsMidThought ? 0.9 : 0,
      input.endsWithHesitation ? 0.85 : 0,
      pausedMidTurn ? 0.8 : 0,
      justPaused ? 0.6 : 0,
      fillerThinking
    )
  );

  // Thinking suppresses end-of-turn so trailing fillers keep us listening.
  const endOfTurn = clamp01(rawEndOfTurn * (1 - 0.7 * thinking));
  const waitScore = clamp01(Math.max(1 - endOfTurn, thinking));
  const engagement = emotion ? normalizeEmotionScore(emotion.engagement) : 0;

  // --- Soft recommendation (orchestrator owns the final call) ---
  let recommendedAction: OrchestratorActionKind;
  if (totalWeight <= 0 || thinking > 0.5) {
    recommendedAction = "WAIT";
  } else if (endOfTurn >= config.eotHigh) {
    recommendedAction = "FOLLOW_UP";
  } else if (
    endOfTurn >= config.eotLow &&
    emotion != null &&
    emotionNeedsEmpathy(emotion)
  ) {
    recommendedAction = "EMPATHY";
  } else {
    recommendedAction = "WAIT";
  }

  return {
    endOfTurn,
    waitScore,
    thinking,
    emotion,
    engagement,
    recommendedAction,
    updatedAt: now,
    signals: { openAiVad: vad, livekit, audio, emotion: emotionSignal },
    features: {
      silenceMs: input.silenceMs,
      speechRate: input.speechRate,
      fillerCount: input.fillerCount,
      pitchRange: input.pitchRange,
      volumeTrend: input.volumeTrend,
    },
  };
}
