"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PitchDetector } from "pitchy";
import {
  buildRealtimeInputAudioConfig,
  buildRealtimeTurnDetectionConfig,
  requestMicrophoneStream,
} from "@/lib/realtime-audio-config";
import {
  DEFAULT_REALTIME_REASONING_EFFORT,
  OPENAI_REALTIME_MODEL,
} from "@/lib/realtime-model";
import {
  DEFAULT_REALTIME_SPEED_PRESET,
  DEFAULT_REALTIME_SPEECH_STYLE_PRESET,
  DEFAULT_REALTIME_TONE_PRESET,
  DEFAULT_REALTIME_TURN_DETECTION_MODE,
  DEFAULT_REALTIME_VAD_EAGERNESS,
  DEFAULT_SERVER_VAD_SILENCE_DURATION_MS,
  getRealtimeSpeechStyleInstruction,
  getRealtimeSpeedValue,
  getRealtimeToneInstruction,
  normalizeRealtimeSpeedPreset,
  normalizeRealtimeSpeechStylePreset,
  normalizeRealtimeTonePreset,
  normalizeRealtimeTurnDetectionMode,
  normalizeRealtimeVadEagerness,
  normalizeServerVadSilenceDurationMs,
} from "@/lib/realtime-settings";
import { appendUniqueTranscriptEntries } from "@/lib/transcript-dedupe";
import { JapaneseTtsChunker } from "@/lib/japanese-tts-chunker";
import { StreamingAudioPlayer } from "@/lib/streaming-audio-player";
import {
  buildProperNounAllowlist,
  QuoteGroundingGuard,
  getUnspokenAssistantText,
  sanitizeTtsText,
  scrubNamePlaceholders,
  scrubUngroundedProperNouns,
  shouldSkipQueuedTtsText,
} from "@/lib/tts-text-sanitizer";
import {
  createAssistantTurnCoalescer,
  type AssistantTurnCoalescer,
} from "@/lib/assistant-turn-coalescer";
import { buildWellbeingAgent } from "@/lib/wellbeing-agent";
import {
  advanceBrainClock,
  BrainStreamSplitter,
  countFillers,
  endsMidThought,
  endsWithHesitation,
  isFillerOnly,
  ICEBREAK_TEXT,
  parseMeaningSignals,
  SingleTurnGuard,
  type MeaningSignals,
} from "@/lib/interview-brain";
import {
  decideHseBackstop,
  hasExplicitTurnHandoff,
} from "@/lib/hse-backstop";
import {
  advanceInterviewClock,
  createInterviewClock,
  type FollowUpIntent,
  type InterviewClockState,
  type InterviewDepth,
} from "@/lib/meaning-engine";
import {
  createInitialEditorialState,
  type EditorialState,
  type ResearchAnchor,
} from "@/lib/editorial-director";
import {
  buildResearchAnchorsFromSkeleton,
  type InterviewSkeleton,
} from "@/lib/interview-prep";
import {
  computeHumanState,
  type HumanStateInput,
} from "@/lib/human-state-engine";
import { ResponseOrchestrator } from "@/lib/response-orchestrator";
import type {
  EmotionState,
  HumanState,
  InterviewMode,
  NaturalVoiceTtsProvider,
  OrchestratorAction,
  RealtimeSessionStyleContext,
  TranscriptEntry,
} from "@/lib/types";
import type {
  ConnectOptions,
  RealtimeSessionActions,
  RealtimeSessionState,
} from "./useRealtimeSession";

type RealtimeSessionType =
  import("@openai/agents/realtime").RealtimeSession<RealtimeSessionStyleContext>;
type RealtimeItemType = import("@openai/agents/realtime").RealtimeItem;
type RealtimeMessageItemType =
  import("@openai/agents/realtime").RealtimeMessageItem;
type RealtimeClientMessageType =
  import("@openai/agents/realtime").RealtimeClientMessage;

interface TtsSessionResponse {
  configured?: boolean;
  error?: string;
}

// How long to wait after a response completes before speaking it. A new
// response that begins within this window (e.g. the post-tool real question)
// supersedes the previous one, so only the final response of a turn is spoken.
const SETTLE_ASSISTANT_TEXT_MS = 800;
const MAX_QUEUED_TTS_HISTORY = 12;

// How many transcript turns to send to the reasoning brain each turn. Enough to
// keep the whole arc in view without bloating the request.
const BRAIN_TRANSCRIPT_LIMIT = 24;

// After the last ASR segment completes, wait this long for the interviewee to
// resume before releasing the brain's answer. Absorbs natural mid-answer
// pauses so the AI does not cut in on a brief silence. Stacks on top of the
// VAD's own silence window. The brain + first TTS chunk are speculated during
// this window, so it gates only when speech starts, not when work starts.
const BRAIN_TURN_DEBOUNCE_MS = 600;
// When the pending answer looks cut off mid-thought (ends in a connective like
// 「〜とか」「〜そういう瞬間が」), wait much longer — the speaker is almost
// certainly still composing the rest of the sentence. Long storytelling
// answers routinely pause 2-3s mid-sentence, so this must comfortably cover
// that.
const BRAIN_TURN_DEBOUNCE_MIDTHOUGHT_MS = 3600;
// A long answer that ends cleanly still often continues ("...と思います。
// それで、..."): the speaker is in storytelling mode, not done. Give long
// answers a bit more room than short crisp ones.
const BRAIN_TURN_DEBOUNCE_LONG_ANSWER_MS = 1100;
const LONG_ANSWER_MIN_CHARS = 80;
// When the turn so far is nothing but a thinking noise (「うーん」「えっと」),
// the speaker hasn't even started the answer. Give them the longest grace
// period — a human interviewer would simply wait through this.
const BRAIN_TURN_DEBOUNCE_FILLER_MS = 5000;

// Slow, high-reasoning brain models (gpt-5.5) feel like they cut in because
// the speaker is mid-thought when the wall-clock window expires. For these,
// wait noticeably longer and also treat trailing hesitations as "still
// composing". Fast models (Gemini/Fable/Opus) keep the snappy defaults.
const PATIENT_BRAIN_MODELS = new Set<string>(["gpt-5.5"]);
const BRAIN_TURN_DEBOUNCE_PATIENT_MS = 1200;
const BRAIN_TURN_DEBOUNCE_LONG_ANSWER_PATIENT_MS = 1800;
const BRAIN_TURN_DEBOUNCE_MIDTHOUGHT_PATIENT_MS = 4500;
const BRAIN_TURN_DEBOUNCE_FILLER_PATIENT_MS = 6000;

// --- Type 6 (natural2): Human State Engine + Response Orchestrator ---
// How often the orchestrator re-evaluates the fused human state while waiting
// for the interviewee to finish. Fast enough to feel responsive, cheap enough
// to run as a setInterval.
const HSE_TICK_MS = 160;
// Window over which the mic RMS is checked to derive an audio-only silence
// signal that is independent of the OpenAI VAD.
const HSE_AUDIO_WINDOW_MS = 350;
// Soft backstop: once the interviewee has clearly handed the turn back (no
// "still thinking" / "still speaking" evidence), commit after this so the
// interview never stalls on a decayed trailing hesitation.
const HSE_MAX_WAIT_MS = 10000;
// Absolute ceiling: even while the human state keeps signalling "still
// thinking", commit the turn after this so a genuinely stuck pause can never
// hang the interview. Generous because some interviewees compose answers in
// long, deliberate silences.
const HSE_HARD_MAX_WAIT_MS = 18000;
const HSE_HARD_WAIT_SEGMENT_GRACE_MS = 3000;

// Master switch for spoken interjections (backchannels "はい/なるほど" and
// empathy lines). The orchestrator keeps computing them so the debug panel and
// cooldown logic stay intact, but when this is false the hook never voices
// them. Flip back to true to re-enable the feature.
const HSE_INTERJECTIONS_ENABLED = false;

// How many leading TTS chunks of a gated brain run to synthesize
// speculatively, so their audio is buffered and ready the moment the debounce
// releases the turn.
const MAX_SPECULATIVE_TTS_FETCHES = 2;

// A compliant brain turn ends after one question; its memo arrives via the
// "---" separator and never reaches onSpeech. So once SingleTurnGuard has
// closed the turn, any further *spoken* text means the model is role-playing
// the rest of the dialogue with no memo coming. After this many discarded
// characters we cancel the read to stop wasting the (capped) generation.
const ROLE_PLAY_EXCESS_ABORT_CHARS = 24;

// If a new interviewee ASR segment lands within this window after a brain
// turn was released, it is almost certainly the continuation of the same
// answer (captured just before the echo guard muted the mic) — the release
// was premature. The host then retracts the stale question, stops its
// playback, and re-runs the brain on the merged answer.
const LATE_CONTINUATION_WINDOW_MS = 4000;

// Type 6 only. For story-like answers (multi-segment or long), hold the first
// TTS audio this long after the turn is released. Storytellers often finish a
// grammatically complete sentence, pause, then resume with a connective
// ("そこで…/そこから…"); the turn detector commits end-of-turn on that pause and
// releases prematurely. During this silent hold the mic is still live, so a
// resume fires speech_started → cancelCurrentSpeech (or a late ASR continuation
// retracts the turn) before any audio plays, converting an audible cut-in into
// a silent retraction. Synthesis runs during the hold, so the added latency is
// at most this value and only on long answers.
const STORY_PRESPEECH_HOLD_MS = 800;
// A single-segment answer counts as story-like for the hold once it is at least
// this long (mirrors the orchestrator's storyAnswerMinChars).
const STORY_PRESPEECH_HOLD_MIN_CHARS = 80;

// Base hint so the transcription model keeps proper nouns / jargon intact
// instead of collapsing them into common words (e.g. "RAG" → "ラグ" → "遅れ").
// The interviewee's industry varies, so domain terms are derived per-session
// from the research anchors rather than hard-coded.
const TRANSCRIPTION_BASE_PROMPT =
  "日本語のビジネスインタビューです。会社名・商品名・サービス名・専門用語などの固有名詞は、一般的な言葉に置き換えず、できるだけ正確に書き起こしてください。";
const MAX_TRANSCRIPTION_TERMS = 12;
const MAX_TRANSCRIPTION_TERM_CHARS = 24;

function buildTranscriptionTerms(anchors: ResearchAnchor[]): string[] {
  return Array.from(
    new Set(
      anchors
        .map((anchor) => anchor.text.trim())
        .filter((text) => text.length > 0 && text.length <= MAX_TRANSCRIPTION_TERM_CHARS)
    )
  ).slice(0, MAX_TRANSCRIPTION_TERMS);
}

function buildTranscriptionPrompt(terms: string[]): string {
  if (terms.length === 0) return TRANSCRIPTION_BASE_PROMPT;
  return `${TRANSCRIPTION_BASE_PROMPT} 次の語が出ることがあります: ${terms.join("、")}。`;
}

// ---------------------------------------------------------------------------
// ASR hallucination gate.
//
// gpt-4o-transcribe hallucinates on near-silence: the VAD fires on faint
// noise and the model emits either an echo of its transcription prompt (a
// research term spoken back verbatim) or a plausible interview line the
// interviewee never said. Two deterministic checks catch these: a segment
// that exactly matches a prompt term, and a segment that arrives when the
// microphone has captured nothing but the noise floor.
// ---------------------------------------------------------------------------

/** RMS sampling cadence and retention for the mic level monitor. */
const MIC_LEVEL_SAMPLE_INTERVAL_MS = 100;
const MIC_LEVEL_RETENTION_MS = 20000;
/**
 * Fallback lookback when no VAD speech window is known for a segment. Kept
 * short: a long window lets real speech from a previous turn mask a
 * hallucinated near-silent segment (the model-3 "広報DX…" bug).
 */
const ASR_ENERGY_LOOKBACK_MS = 2500;
/** Padding added around the VAD speech window before measuring its peak. */
const ASR_SPEECH_WINDOW_PADDING_MS = 300;
/**
 * Peak RMS below this within the segment's audio window means the mic
 * captured only the noise floor — real speech peaks well above it (quiet
 * speakers measured ~0.05+; hallucinated-from-silence segments measured
 * ~0.001-0.005).
 */
const ASR_SILENCE_RMS_FLOOR = 0.01;
// Pitch acceptance gate. Tight bounds + a high clarity floor reject Pitchy's
// occasional unvoiced / noise readings before they reach the HSE.
const PITCH_MIN_HZ = 70;
const PITCH_MAX_HZ = 450;
const PITCH_MIN_CLARITY = 0.85;
/** Reference RMS used to normalize the loudness trend into -1..1. */
const VOLUME_TREND_SCALE = 0.05;

function normalizeForHallucinationMatch(text: string): string {
  return text
    .replace(/[\s「」『』“”"'’‘、。・,.!?！？:：;；（）()\[\]【】〜～\-ー]/g, "")
    .toLowerCase();
}

/**
 * Tracks recent microphone RMS so ASR segments can be checked against what
 * the mic actually captured. Fails open: if audio analysis is unavailable,
 * `peakSince` reports +Infinity and no segment is ever dropped for silence.
 */
class MicLevelMonitor {
  private samples: { t: number; rms: number; pitch: number | null }[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private context: AudioContext | null = null;

  constructor(stream: MediaStream) {
    try {
      this.context = new AudioContext();
      const source = this.context.createMediaStreamSource(stream);
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      const sampleRate = this.context.sampleRate;
      // YIN/MPM pitch detector (pitchy) — far fewer octave errors than plain
      // autocorrelation, so pitch_mean/range are stable enough for the HSE.
      const pitchDetector = PitchDetector.forFloat32Array(analyser.fftSize);
      this.timer = setInterval(() => {
        analyser.getFloatTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
        const now = Date.now();
        const rms = Math.sqrt(sum / buffer.length);
        let pitch: number | null = null;
        if (rms >= ASR_SILENCE_RMS_FLOOR) {
          const [hz, clarity] = pitchDetector.findPitch(buffer, sampleRate);
          if (
            clarity >= PITCH_MIN_CLARITY &&
            hz >= PITCH_MIN_HZ &&
            hz <= PITCH_MAX_HZ
          ) {
            pitch = hz;
          }
        }
        this.samples.push({ t: now, rms, pitch });
        while (
          this.samples.length > 0 &&
          this.samples[0].t < now - MIC_LEVEL_RETENTION_MS
        ) {
          this.samples.shift();
        }
      }, MIC_LEVEL_SAMPLE_INTERVAL_MS);
    } catch {
      this.context = null;
      this.timer = null;
    }
  }

  peakSince(since: number): number {
    return this.peakBetween(since, Number.POSITIVE_INFINITY);
  }

  /** Loudness trend over the last `windowMs`: -1 (falling) .. 1 (rising). */
  volumeTrend(windowMs: number): number | null {
    if (!this.timer) return null;
    const now = Date.now();
    const window = this.samples.filter((s) => s.t >= now - windowMs);
    if (window.length < 4) return null;
    const half = Math.floor(window.length / 2);
    const mean = (arr: { rms: number }[]) =>
      arr.reduce((acc, s) => acc + s.rms, 0) / arr.length;
    const delta = mean(window.slice(half)) - mean(window.slice(0, half));
    const norm = delta / VOLUME_TREND_SCALE;
    return Math.max(-1, Math.min(1, norm));
  }

  /**
   * Mean / range of voiced pitch over the last `windowMs` (null if scarce).
   * Range uses the p10..p90 spread, not raw max-min, so a single octave-error
   * outlier cannot make the range jump.
   */
  pitchStats(windowMs: number): { mean: number | null; range: number | null } {
    if (!this.timer) return { mean: null, range: null };
    const now = Date.now();
    const pitches = this.samples
      .filter((s) => s.t >= now - windowMs && s.pitch != null)
      .map((s) => s.pitch as number);
    if (pitches.length < 3) return { mean: null, range: null };
    const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
    const sorted = [...pitches].sort((a, b) => a - b);
    const percentile = (p: number) => {
      const idx = (sorted.length - 1) * p;
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      if (lo === hi) return sorted[lo];
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    };
    const range = percentile(0.9) - percentile(0.1);
    return { mean, range };
  }

  /** Peak RMS within [start, end]. +Infinity if analysis is unavailable. */
  peakBetween(start: number, end: number): number {
    if (!this.timer) return Number.POSITIVE_INFINITY;
    const window = this.samples.filter(
      (sample) => sample.t >= start && sample.t <= end
    );
    if (window.length === 0) return Number.POSITIVE_INFINITY;
    return window.reduce((peak, sample) => Math.max(peak, sample.rms), 0);
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    void this.context?.close().catch(() => {});
    this.context = null;
    this.samples = [];
  }
}

/**
 * Type 6 only. Connects to a LiveKit room, publishes the interviewee's mic to
 * the turn-detector worker, and forwards end-of-turn probabilities (data
 * channel, topic "turn") via `onEndOfTurn`. Returns null on any failure or when
 * LiveKit is not configured — the caller then runs on VAD + audio signals
 * alone (graceful degradation). livekit-client is dynamically imported so it is
 * never bundled/loaded for the other interview providers.
 */
async function connectLiveKitTurnDetector(
  micStream: MediaStream,
  onEndOfTurn: (value: number) => void
): Promise<{ disconnect: () => void } | null> {
  try {
    const res = await fetch("/api/livekit-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      console.info("[t6-livekit] disabled (token route not configured)");
      return null;
    }
    const { url, token } = (await res.json()) as { url: string; token: string };
    const { Room, RoomEvent, Track } = await import("livekit-client");
    const room = new Room();
    await room.connect(url, token);
    const track = micStream.getAudioTracks()[0];
    if (track) {
      // Publish a CLONE, never the shared mic track. The same MediaStreamTrack
      // also feeds the energy analyzer and the OpenAI transcription input; if we
      // published it directly, room.disconnect() (worker OFF toggle, network
      // drop) would stop the shared track by default and silence the mic for the
      // whole session (energy 0.000, no speech detected). A clone is owned by
      // LiveKit and can be stopped independently without harming the original.
      //
      // Must tag the source as Microphone: the turn-detector worker's
      // AgentSession only accepts SOURCE_MICROPHONE tracks. Publishing a raw
      // MediaStreamTrack defaults to SOURCE_UNKNOWN, which the worker ignores
      // (so no user_state_changed → no end-of-turn ever reaches the client).
      const clone = track.clone();
      await room.localParticipant.publishTrack(clone, {
        source: Track.Source.Microphone,
        name: "microphone",
      });
    }
    room.on(
      RoomEvent.DataReceived,
      (
        payload: Uint8Array,
        _participant?: unknown,
        _kind?: unknown,
        topic?: string
      ) => {
        if (topic && topic !== "turn") return;
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload)) as {
            end_of_turn?: number;
          };
          if (typeof msg.end_of_turn === "number") {
            onEndOfTurn(msg.end_of_turn);
          }
        } catch {
          // Ignore malformed data-channel messages.
        }
      }
    );
    console.info("[t6-livekit] connected; turn detector signal active");
    return room;
  } catch (error) {
    console.warn("[t6-livekit] connect failed; degrading to VAD+audio", error);
    return null;
  }
}

function isMessageItem(item: RealtimeItemType): item is RealtimeMessageItemType {
  return item.type === "message";
}

function extractTranscriptFromItem(
  item: RealtimeItemType
): TranscriptEntry | null {
  if (!isMessageItem(item)) return null;
  if (item.role === "system") return null;
  if ("status" in item && item.status !== "completed") return null;

  let text = "";
  for (const content of item.content) {
    if ("text" in content && content.text) {
      text += content.text;
    }
    if ("transcript" in content && content.transcript) {
      text += content.transcript;
    }
  }

  if (!text.trim()) return null;

  return {
    id: `t-${item.itemId}`,
    role: item.role === "assistant" ? "interviewer" : "interviewee",
    text: text.trim(),
    timestamp: Date.now(),
  };
}

interface SkeletonPrep {
  instructions: string;
  researchAnchors: ResearchAnchor[];
}

async function fetchSkeletonPrep(url?: string): Promise<SkeletonPrep> {
  const empty: SkeletonPrep = { instructions: "", researchAnchors: [] };
  if (!url || !url.trim()) return empty;
  try {
    const res = await fetch("/api/interview-prep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });
    if (!res.ok) return empty;
    const data = (await res.json()) as {
      instructions?: string;
      skeleton?: InterviewSkeleton;
    };
    return {
      instructions:
        typeof data.instructions === "string" ? data.instructions : "",
      researchAnchors: data.skeleton
        ? buildResearchAnchorsFromSkeleton(data.skeleton)
        : [],
    };
  } catch (error) {
    console.warn("[Type5 Natural] interview-prep fetch failed", error);
    return empty;
  }
}

async function assertTtsConfigured(provider: NaturalVoiceTtsProvider) {
  if (provider === "fish") return;
  const response = await fetch("/api/elevenlabs-session", { method: "POST" });
  const data = (await response.json()) as TtsSessionResponse;
  if (!response.ok || !data.configured) {
    throw new Error(data.error || "Type 5 音声設定が不足しています");
  }
}

async function fetchTtsAudio(
  provider: NaturalVoiceTtsProvider,
  text: string,
  speed: number,
  signal?: AbortSignal
): Promise<Response> {
  const response = await fetch(
    provider === "fish" ? "/api/fish-audio-tts" : "/api/elevenlabs-tts",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, speed }),
      signal,
    }
  );

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(data?.error || "Type 5 音声生成に失敗しました");
  }

  return response;
}

// Drain an already-started TTS response into the player. The fetch itself is
// kicked off earlier (at enqueue time, or speculatively during the debounce
// gate) so synthesis overlaps with whatever is currently playing.
async function playTtsAudio({
  provider,
  response,
  player,
  isCurrent,
}: {
  provider: NaturalVoiceTtsProvider;
  response: Response;
  player: StreamingAudioPlayer;
  isCurrent: () => boolean;
}) {
  if (!isCurrent()) return;

  if (provider === "elevenlabs") {
    const audio = await response.arrayBuffer();
    if (!isCurrent()) return;
    player.enqueue(audio);
    return;
  }

  const sampleRate = Number(response.headers.get("X-Audio-Sample-Rate") ?? "44100");
  if (!response.body) {
    player.enqueuePcm16(await response.arrayBuffer(), sampleRate);
    return;
  }

  const reader = response.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!isCurrent()) {
      await reader.cancel();
      break;
    }
    if (value?.byteLength) {
      player.enqueuePcm16(
        value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
        sampleRate
      );
    }
  }
}

function upsertTranscriptEntry(
  entries: TranscriptEntry[],
  entry: TranscriptEntry
): TranscriptEntry[] {
  const index = entries.findIndex((existing) => existing.id === entry.id);
  if (index === -1) {
    const normalizedIncoming = entry.text.replace(/\s+/g, " ").trim();
    const nearbyIndex = entries.findIndex((existing) => {
      if (existing.role !== entry.role) return false;
      if (Math.abs(existing.timestamp - entry.timestamp) > 10_000) return false;
      const normalizedExisting = existing.text.replace(/\s+/g, " ").trim();
      return (
        normalizedExisting === normalizedIncoming ||
        normalizedExisting.startsWith(normalizedIncoming) ||
        normalizedIncoming.startsWith(normalizedExisting)
      );
    });
    if (nearbyIndex !== -1) {
      const next = [...entries];
      const existing = next[nearbyIndex];
      next[nearbyIndex] = {
        ...existing,
        ...entry,
        id: existing.id,
        text:
          entry.text.length >= existing.text.length ? entry.text : existing.text,
      };
      return next;
    }
    return appendUniqueTranscriptEntries(entries, [entry]);
  }
  const next = [...entries];
  next[index] = { ...next[index], ...entry };
  return next;
}

export function useNaturalVoiceRealtimeSession(): [
  RealtimeSessionState,
  RealtimeSessionActions
] {
  const [state, setState] = useState<RealtimeSessionState>({
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
    isSpeaking: false,
    currentAgent: "",
    mode: null,
    transcript: [],
    aiSuggestions: [],
    error: null,
    resumeFailed: false,
    goAwayTimeLeft: null,
    hasResumableSession: false,
    researchStatus: "idle",
    interruptions: { count: 0 },
  });

  const sessionRef = useRef<RealtimeSessionType | null>(null);
  const transportRef = useRef<{
    sendEvent: (event: RealtimeClientMessageType) => void;
  } | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioPlayerRef = useRef<StreamingAudioPlayer | null>(null);
  const processedItemIds = useRef<Set<string>>(new Set());
  const transcriptSnapshotRef = useRef<Array<Pick<TranscriptEntry, "role" | "text">>>(
    []
  );
  const chunkerRef = useRef<JapaneseTtsChunker | null>(null);
  const coalescerRef = useRef<AssistantTurnCoalescer>(
    createAssistantTurnCoalescer()
  );
  const responseHadToolCallRef = useRef(false);
  const pendingResponseFinalTextRef = useRef<string | undefined>(undefined);
  const spokenAssistantTextRef = useRef("");
  const latestInterviewerTextRef = useRef("");
  const latestIntervieweeTextRef = useRef("");
  const editorialStateRef = useRef<EditorialState>(createInitialEditorialState());
  const researchAnchorsRef = useRef<ResearchAnchor[]>([]);
  // Research prefetched before connect (Type 5 UX: research runs first, the
  // start button unlocks when it completes). Keyed by URL so a prefetch for a
  // different URL is never reused.
  const preparedResearchRef = useRef<{
    url: string;
    promise: Promise<SkeletonPrep>;
  } | null>(null);
  // Brain-driven interview: the host authors questions via the reasoning model,
  // so it owns the canonical conversation log (interviewer = brain output,
  // interviewee = finalized ASR transcript).
  const conversationRef = useRef<
    Array<{ role: "interviewer" | "interviewee"; text: string }>
  >([]);
  const brainClockRef = useRef<InterviewClockState>(createInterviewClock());
  const brainAbortRef = useRef<AbortController | null>(null);
  const brainTurnSeqRef = useRef(0);
  // The brain's running hypothesis about the interviewee ("what does this
  // person believe"). Written by each brain turn, fed back into the next one,
  // never spoken or shown.
  const brainHypothesisRef = useRef("");
  // Type 6 only: the latest committed meaning-depth (debug panel). Signals come
  // from the brain's optional "観測:" memo line; depth/intent from the clock.
  const meaningRef = useRef<{
    depth: InterviewDepth;
    intent: FollowUpIntent;
    signals: MeaningSignals;
  }>({ depth: "FACT", intent: "clarify_fact", signals: {} });
  const processedAsrIdsRef = useRef<Set<string>>(new Set());
  // Accumulate ASR segments for one interviewee turn, then fire the brain once
  // the speaker has truly stopped (debounce). VAD splits a single answer into
  // several segments on brief pauses; without this the brain fires mid-thought
  // and asks near-duplicate questions.
  const pendingIntervieweeTextRef = useRef("");
  const brainDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  // Releases the emission gate of the current speculative brain run (see
  // scheduleBrainTurn): the brain starts authoring as soon as an ASR segment
  // lands, but nothing is spoken/shown until the debounce confirms the
  // interviewee is done.
  const brainReleaseRef = useRef<(() => void) | null>(null);
  // Aborts speculative TTS fetches of the current gated brain run. Cleared
  // (without aborting) at release, when ownership moves to the TTS chain.
  const brainSpecAbortRef = useRef<AbortController | null>(null);
  // In-flight prefetch fetches of queued TTS chunks, aborted on barge-in.
  const ttsFetchAbortsRef = useRef<Set<AbortController>>(new Set());
  // Latency instrumentation: last ASR completion → release → first audio.
  const turnTimingRef = useRef<{ asrAt: number; releaseAt: number | null } | null>(
    null
  );
  // The most recently released brain turn, kept briefly so a late ASR
  // continuation of the same answer can retract it (see
  // LATE_CONTINUATION_WINDOW_MS).
  const lastReleasedTurnRef = useRef<{
    releasedAt: number;
    intervieweeText: string;
    turnId: string;
    clockBefore: InterviewClockState;
  } | null>(null);
  // Type 6 interruption diagnostics: every time a released AI question is
  // retracted because the interviewee kept talking (a confirmed premature
  // release / "the AI cut in"), we record it here so the debug panel and
  // console can surface what the transcript alone hides.
  const interruptionEventsRef = useRef<
    Array<{
      at: number;
      kind: "barge-in-retracted" | "suspected-premature";
      msAfterRelease: number;
      retractedText: string;
      intervieweeTail: string;
    }>
  >([]);
  const ttsChainRef = useRef(Promise.resolve());
  const queuedTtsTextsRef = useRef<string[]>([]);
  const generationRef = useRef(0);
  const activeResponseRef = useRef(false);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startupEchoGuardRef = useRef(false);
  const startupEchoGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  // "type6" enables the Human State Engine + Response Orchestrator turn-taking
  // and the LiveKit turn detector. "type5" keeps the original behavior.
  const variantRef = useRef<"type5" | "type6">("type5");
  // Type 6 only. The orchestrator instance persists across turns so its
  // backchannel/empathy cooldowns carry over.
  const orchestratorRef = useRef<ResponseOrchestrator | null>(null);
  const hseTickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Throttle clock for the [t6-hse] tick trace.
  const hseTraceAtRef = useRef(0);
  // Live OpenAI VAD state, mirrored into refs so the HSE tick can read it.
  const vadSpeakingRef = useRef(false);
  const vadSpeechEndedAtRef = useRef<number | null>(null);
  const vadUpdatedAtRef = useRef(0);
  // Last time the mic RMS exceeded the speech floor (audio-only silence signal).
  const audioLastLoudAtRef = useRef<number | null>(null);
  // Latest LiveKit turn-detector reading (Phase 3); null until the worker pushes.
  const livekitEotRef = useRef<{ value: number; at: number } | null>(null);
  // The connected LiveKit room (Type 6, when configured). Typed loosely to keep
  // livekit-client a dynamic import that never loads for other providers.
  const livekitRoomRef = useRef<{ disconnect: () => void } | null>(null);
  // Type 6 demo switch: when false, the LiveKit turn detector is not connected
  // (forced VAD+audio degradation) so the difference can be felt live. Toggled
  // at runtime via setLiveKitTurnDetectorEnabled.
  const liveKitEnabledRef = useRef(true);
  // Mirror of state.isSpeaking for synchronous reads inside the HSE tick.
  const aiSpeakingRef = useRef(false);
  // Wall-clock start of the current wait (set when an ASR segment arrives).
  const hseWaitStartRef = useRef(0);
  // Type 6: when the latest ASR segment of the current pending turn landed, and
  // how many segments that turn is made of. Feeds the orchestrator's segment
  // grace so a multi-segment storytelling answer is not cut into mid-pause.
  const lastSegmentAtRef = useRef(0);
  const segmentCountRef = useRef(0);
  const interjectionSeqRef = useRef(0);
  // Latest fused emotion (from the UI layer via pushHumanSignals) + freshness.
  const emotionRef = useRef<{ state: EmotionState; at: number } | null>(null);
  // Characters/sec of the most recent completed speech segment (Transcript+VAD).
  const speechRateRef = useRef<number | null>(null);
  const micLevelMonitorRef = useRef<MicLevelMonitor | null>(null);
  // The most recent VAD speech window, used to measure the energy of exactly
  // the audio that produced the next ASR segment (so a hallucinated
  // near-silent segment is not masked by real speech from a prior turn).
  const speechWindowRef = useRef<{ startedAt: number; endedAt: number | null }>(
    { startedAt: 0, endedAt: null }
  );
  // End timestamp of the VAD window of the last ACCEPTED interviewee segment.
  // A finalized segment that reuses this exact window carries no new mic audio
  // of its own — it is a Whisper hallucination piggybacking on the prior (loud)
  // utterance's energy, which the amplitude gate cannot catch. See the
  // completed-transcription handler.
  const lastGatedSpeechWindowEndRef = useRef<number | null>(null);

  const setMicrophoneTracksEnabled = useCallback((enabled: boolean) => {
    mediaStreamRef.current
      ?.getAudioTracks()
      .forEach((track) => {
        track.enabled = enabled;
      });
  }, []);

  const cleanup = useCallback(() => {
    generationRef.current += 1;
    if (startupEchoGuardTimerRef.current) {
      clearTimeout(startupEchoGuardTimerRef.current);
      startupEchoGuardTimerRef.current = null;
    }
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    coalescerRef.current.cancel();
    brainAbortRef.current?.abort();
    brainAbortRef.current = null;
    if (brainDebounceTimerRef.current) {
      clearTimeout(brainDebounceTimerRef.current);
      brainDebounceTimerRef.current = null;
    }
    brainReleaseRef.current = null;
    brainSpecAbortRef.current?.abort();
    brainSpecAbortRef.current = null;
    if (hseTickTimerRef.current) {
      clearInterval(hseTickTimerRef.current);
      hseTickTimerRef.current = null;
    }
    orchestratorRef.current?.reset();
    livekitRoomRef.current?.disconnect();
    livekitRoomRef.current = null;
    vadSpeakingRef.current = false;
    vadSpeechEndedAtRef.current = null;
    audioLastLoudAtRef.current = null;
    livekitEotRef.current = null;
    aiSpeakingRef.current = false;
    for (const abort of ttsFetchAbortsRef.current) abort.abort();
    ttsFetchAbortsRef.current.clear();
    turnTimingRef.current = null;
    lastReleasedTurnRef.current = null;
    pendingIntervieweeTextRef.current = "";
    lastGatedSpeechWindowEndRef.current = null;
    responseHadToolCallRef.current = false;
    pendingResponseFinalTextRef.current = undefined;
    startupEchoGuardRef.current = false;
    setMicrophoneTracksEnabled(true);
    sessionRef.current?.close();
    sessionRef.current = null;
    transportRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    micLevelMonitorRef.current?.dispose();
    micLevelMonitorRef.current = null;
    speechWindowRef.current = { startedAt: 0, endedAt: null };
    emotionRef.current = null;
    speechRateRef.current = null;
    audioPlayerRef.current?.destroy();
    audioPlayerRef.current = null;
    latestIntervieweeTextRef.current = "";
    editorialStateRef.current = createInitialEditorialState();
    researchAnchorsRef.current = [];
    conversationRef.current = [];
    brainClockRef.current = createInterviewClock();
    meaningRef.current = { depth: "FACT", intent: "clarify_fact", signals: {} };
    brainTurnSeqRef.current = 0;
    brainHypothesisRef.current = "";
    processedAsrIdsRef.current.clear();
    chunkerRef.current?.reset();
    chunkerRef.current = null;
    spokenAssistantTextRef.current = "";
    queuedTtsTextsRef.current = [];
  }, [setMicrophoneTracksEnabled]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const connect = useCallback(
    async (_mode: InterviewMode, _scenarioId: string, options?: ConnectOptions) => {
      if (sessionRef.current) cleanup();

      setState((prev) => ({
        ...prev,
        isConnecting: true,
        error: null,
        mode: "auto",
        interruptions: { count: 0 },
      }));
      interruptionEventsRef.current = [];
      processedItemIds.current.clear();
      transcriptSnapshotRef.current = [];
      coalescerRef.current = createAssistantTurnCoalescer();
      responseHadToolCallRef.current = false;
      pendingResponseFinalTextRef.current = undefined;
      spokenAssistantTextRef.current = "";
      latestInterviewerTextRef.current = "";
      latestIntervieweeTextRef.current = "";
      editorialStateRef.current = createInitialEditorialState();
      researchAnchorsRef.current = [];
      conversationRef.current = [];
      brainClockRef.current = createInterviewClock();
      meaningRef.current = { depth: "FACT", intent: "clarify_fact", signals: {} };
      brainAbortRef.current?.abort();
      brainAbortRef.current = null;
      brainTurnSeqRef.current = 0;
      brainHypothesisRef.current = "";
      processedAsrIdsRef.current.clear();
      pendingIntervieweeTextRef.current = "";
      if (brainDebounceTimerRef.current) {
        clearTimeout(brainDebounceTimerRef.current);
        brainDebounceTimerRef.current = null;
      }
      brainReleaseRef.current = null;
      brainSpecAbortRef.current?.abort();
      brainSpecAbortRef.current = null;
      for (const abort of ttsFetchAbortsRef.current) abort.abort();
      ttsFetchAbortsRef.current.clear();
      turnTimingRef.current = null;
      lastReleasedTurnRef.current = null;
      ttsChainRef.current = Promise.resolve();
      queuedTtsTextsRef.current = [];
      activeResponseRef.current = false;
      startupEchoGuardRef.current = false;
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }

      // Type 6 turn-taking state (orchestrator + HSE signal mirrors).
      if (hseTickTimerRef.current) {
        clearInterval(hseTickTimerRef.current);
        hseTickTimerRef.current = null;
      }
      vadSpeakingRef.current = false;
      vadSpeechEndedAtRef.current = null;
      vadUpdatedAtRef.current = 0;
      audioLastLoudAtRef.current = null;
      livekitRoomRef.current?.disconnect();
      livekitRoomRef.current = null;
      livekitEotRef.current = null;
      aiSpeakingRef.current = false;
      hseWaitStartRef.current = 0;
      lastSegmentAtRef.current = 0;
      segmentCountRef.current = 0;

      try {
        variantRef.current = options?.variant ?? "type5";
        orchestratorRef.current =
          variantRef.current === "type6" ? new ResponseOrchestrator() : null;
        const ttsProvider = options?.ttsProvider ?? "elevenlabs";
        // Per-session brain model (settings screen; server validates against
        // its allowlist and falls back to the deployment default).
        const brainModel = options?.brainModel;
        // Reuse research prefetched via prepareResearch (same URL); fall back
        // to fetching here for callers that skip the research phase.
        const requestedUrl = (options?.url ?? "").trim();
        const skeletonPrepPromise =
          preparedResearchRef.current?.url === requestedUrl &&
          preparedResearchRef.current
            ? preparedResearchRef.current.promise
            : fetchSkeletonPrep(options?.url);
        const [
          { RealtimeSession, OpenAIRealtimeWebRTC },
          micStream,
          skeletonPrep,
        ] = await Promise.all([
          import("@openai/agents/realtime"),
          requestMicrophoneStream(),
          skeletonPrepPromise,
          assertTtsConfigured(ttsProvider),
        ]);

        const skeletonInstructions = skeletonPrep.instructions;
        researchAnchorsRef.current = skeletonPrep.researchAnchors;
        // Terms fed to the ASR prompt — kept around because gpt-4o-transcribe
        // echoes them back verbatim when it hallucinates on silence.
        const transcriptionTerms = buildTranscriptionTerms(
          researchAnchorsRef.current
        );

        // Returns why a finalized ASR segment looks hallucinated, or null if
        // it looks like real interviewee speech.
        const classifyAsrHallucination = (
          text: string
        ): "prompt-echo" | "silence" | "echo-guard" | null => {
          const normalized = normalizeForHallucinationMatch(text);
          if (!normalized) return null;
          if (
            transcriptionTerms.some(
              (term) => normalizeForHallucinationMatch(term) === normalized
            )
          ) {
            return "prompt-echo";
          }
          // The mic is muted while the echo guard is engaged (AI is/just was
          // speaking). A completed transcription that lands with no pending
          // answer AND no recently-released turn cannot be live interviewee
          // speech — it is the AI's own voice bleeding back through the
          // speakers, or a Whisper hallucination from silence. Amplitude alone
          // can't tell echo from speech (echo is loud), so we trust the mute.
          // We deliberately keep the late-continuation path (a segment that
          // continues a just-released answer) untouched: that needs a pending
          // turn or lastReleased context, neither of which is present here.
          if (
            startupEchoGuardRef.current &&
            !lastReleasedTurnRef.current &&
            pendingIntervieweeTextRef.current.trim().length === 0
          ) {
            return "echo-guard";
          }
          const monitor = micLevelMonitorRef.current;
          if (!monitor) return null;
          // Measure energy across exactly the segment's VAD window (the audio
          // that produced this transcription). Falls back to a short recent
          // window if no window was recorded.
          const speechWindow = speechWindowRef.current;
          const usedVadWindow = speechWindow.startedAt > 0;
          const peak = usedVadWindow
            ? monitor.peakBetween(
                speechWindow.startedAt - ASR_SPEECH_WINDOW_PADDING_MS,
                (speechWindow.endedAt ?? Date.now()) +
                  ASR_SPEECH_WINDOW_PADDING_MS
              )
            : monitor.peakSince(Date.now() - ASR_ENERGY_LOOKBACK_MS);
          console.debug(
            `[t6-asr-gate] peak=${
              peak === Number.POSITIVE_INFINITY ? "inf" : peak.toFixed(4)
            } floor=${ASR_SILENCE_RMS_FLOOR} window=${
              usedVadWindow ? "vad" : "lookback"
            } ai=${aiSpeakingRef.current} guard=${
              startupEchoGuardRef.current
            } text="${text}"`
          );
          if (peak < ASR_SILENCE_RMS_FLOOR) return "silence";
          return null;
        };

        const dropHallucinatedSegment = (
          text: string,
          reason: "prompt-echo" | "silence" | "echo-guard"
        ) => {
          console.warn(
            `[t5-asr] dropped hallucinated segment (${reason}): ${text}`
          );
        };

        mediaStreamRef.current = micStream;
        micLevelMonitorRef.current?.dispose();
        micLevelMonitorRef.current = new MicLevelMonitor(micStream);
        // Type 6: feed the LiveKit turn detector if configured (and not disabled
        // via the demo toggle). Fire-and-forget so a missing/slow worker never
        // blocks the interview from starting.
        if (variantRef.current === "type6" && liveKitEnabledRef.current) {
          void connectLiveKitTurnDetector(micStream, (value) => {
            livekitEotRef.current = { value, at: Date.now() };
          }).then((room) => {
            livekitRoomRef.current = room;
          });
        }
        const sessionGeneration = generationRef.current;
        const speedPreset = normalizeRealtimeSpeedPreset(
          options?.speed ?? DEFAULT_REALTIME_SPEED_PRESET
        );
        const speechStylePreset = normalizeRealtimeSpeechStylePreset(
          options?.speechStyle ?? DEFAULT_REALTIME_SPEECH_STYLE_PRESET
        );
        const tonePreset = normalizeRealtimeTonePreset(
          options?.tone ?? DEFAULT_REALTIME_TONE_PRESET
        );
        const speed = getRealtimeSpeedValue(speedPreset);
        const vadEagerness = normalizeRealtimeVadEagerness(
          options?.vadEagerness ?? DEFAULT_REALTIME_VAD_EAGERNESS
        );
        const turnDetectionMode = normalizeRealtimeTurnDetectionMode(
          options?.turnDetectionMode ?? DEFAULT_REALTIME_TURN_DETECTION_MODE
        );
        const silenceDurationMs = normalizeServerVadSilenceDurationMs(
          String(
            options?.silenceDurationMs ?? DEFAULT_SERVER_VAD_SILENCE_DURATION_MS
          )
        );
        const styleInstructions = [
          getRealtimeSpeechStyleInstruction(speechStylePreset),
          getRealtimeToneInstruction(tonePreset),
          "【最優先・進行の主役】一本の弧を通す:【理念・方針】→【その理念に至った原体験】→【そこから生まれる未来像】。具体的なエピソードはこの弧を語らせる踏み台で、目的地ではありません。具体が出たら2〜3手で必ず『なぜ大事か（理念）』『どこで生まれたか（原体験）』『どんな未来にしたいか（未来像）』へ持ち上げてください。機能・技術・数値を横に辿り続けないでください。",
          "純粋な一問一答にしないでください。相手の答えに軽い見立て・共感を一言そえてから1問。線が見えたら短く確かめる。ただし喋りすぎない（1発話2文まで）。相手の熱量を読み、熱が落ちたら迷わず弧の次の段へ橋を架けてください。",
          "【最優先】直前の発話だけに機械的に反応しないでください。会話の最初からの流れを覚え、『この人は何を信じている人か』という仮説を1つ持ち、答えのたびに更新し、その仮説を確かめる・揺さぶるために問うてください。1〜2ターンに一度は前に出た言葉を引いてつなぎ（『さっき〇〇とおっしゃったのは…』）、新しい名詞を拾って毎回ゼロから聞き直さないでください。",
          "受けはオウム返しでなく『見立て』にしてください。相手の話を自分の言葉で言い換え、その人の世界観を名指しで返す（例:『あなたにとって技術は、道具というより“概念を書き換えるもの”なんですね』）。既出の話・矛盾・通説との違いに気づいたら、遠慮せず軽くぶつけて本人の核を引き出してください（例:『それ、もう多くの会社がやっていますよね。あなたが足したいものは？』）。",
          "【最優先】質問は1文・1問だけ。だいたい15〜40字で、一息で言い切れる長さにしてください。長くなりそうなら必ず切ってください。",
          "【最優先】質問は必ず相手が今言った言葉に紐づけ、的は次の2種類のどちらかにしてください。①話を開くとき＝現場の出来事・場面（どんな時／何を見て）。②弧を上げるとき＝その人の考え・理由・原体験・未来（なぜそれを大事にするんですか／その考えはどこで生まれたんですか／これからどうなってほしいですか）。同じ場面の詳細（反応・数値・次の手順）を続けて聞かず、①を1〜2手で②へ上げてください。",
          "②は抽象テンプレとは違います。錨のない抽象名詞（「価値」「基準」「軸」「あり方」だけを宙に浮かせる問い）は禁止。必ず相手の固有の言葉に結びつけ、平易な言葉で『なぜ・どこから・どんな未来』を聞いてください。",
          "【最優先】名詞の前に説明を積み重ねないでください（例:「〜と社内で判断する、いちばんシンプルな基準」は禁止）。条件節（「もし〜だとしたら」「〜が当たったとき」「結果がどうであれ」）で問いを始めないでください。",
          "【最優先】相手が即答できる、的の絞れた問いにしてください。中学生にそのまま伝わる言葉だけを使い、ひとつの文に意味は1つにしてください。",
          "事業の運用の細部（誰に問い合わせが来るか、誰の顧客か等）を決めつけないでください。B2Bでは相手の顧客のさらに先に利用者がいることも多いです。分からないときは前提を作らず、相手に確認するか、相手が話した範囲だけで聞いてください。",
          "【最優先】相手の業種は様々です（製造・飲食・IT・医療・小売・士業など）。どの業種でも、知らない言葉・略語・社名・商品名・専門用語の意味を勝手に決めつけないでください。例:『RAG（ラグ）』は検索拡張生成のことで『遅れ（lag）』ではありません。聞き慣れた一般語に引きずられて意味を捏造しないでください。意味が分からない・聞き取れないときは、自分の解釈で質問を進めず『それは〇〇のことですか？』と確認するか、素直に意味を尋ねてください。",
          "【最優先】相手が『違います』『〜じゃない』『知らないんですか？』と訂正・指摘したら、同じ解釈で質問を続けないでください。まず短く受け直し（『失礼しました、〇〇のことですね』）、相手の訂正に合わせて聞き直してください。",
          "書き起こしは誤変換することがあります。文脈に合わない単語が来ても、そのまま内容として復唱しないでください。文脈で補うか、確認してから進んでください。",
          "受け方を毎回変えてください。『〇〇なんですね。』のオウム返しを毎ターン繰り返さないでください。同じ言い回しを2回続けて使わないでください。時には受けを省いてすぐ問い、時には『なるほど』『面白いですね』など別の受けにしてください。",
          "【最優先】『〜という言葉が印象に残りました』『〜という言葉が残りました』『〜が大事に聞こえました』などの定型の受けを繰り返さないでください。多用しがちなので意識的に避け、受けるなら相手の中身を自分の言葉で言い換えてください。",
          "未来を聞くときは『どんな場面ですか』ではなく『これから何を変えたいですか』『お客さんや働く人にどうなってほしいですか』のように、変えたいこと・どうなってほしいかを聞いてください。",
          "導入質問をYes/Noで終わる確認にしないでください。『〜は大切な考え方ですか？』のように『はい』で終わる聞き方は禁止です。相手が語り出せる開いた1問にしてください。",
          "リサーチの固有語に触れるときは、短い一語・短いフレーズだけにし、理念の長い一文をそのまま読み上げないでください。触れ方は毎回変え、「〜という言葉に照らして」を繰り返さないでください。",
          "最初は必ず『まずはアイスブレイクから始めますね』と短く宣言してください。この開始宣言だけは許可します。",
          "アイスブレイクは長く続けません。背伸びと深呼吸のあと、会社や本人が大切にしている考え方に入る導入質問を1つだけ出してください。",
          "最初の発話では質問を出さないでください。『まずはアイスブレイクから始めますね。よければ一度、背伸びをして、ゆっくり深呼吸してみてください。終わったら教えてくださいね。』のように、背伸びと深呼吸だけを促して待ちます。",
          "相手が終わったと返したら、『ありがとうございます。では早速ですが』のように短く受けてください。会社リサーチに冒頭質問候補や特徴的な言葉があれば、それを使って会社固有の理念・哲学から聞き始めてください。",
          "リサーチがある場合は、『最近の仕事で手応えがあった場面』という汎用質問から始めないでください。サイトで見えた言葉、ミッション、顧客への約束、事業の思想をとっかかりにしてください。",
          "リサーチが弱い場合だけ、最近の仕事で大切にしている考え方や、顧客にどうなってほしいかを聞いてください。",
          "チョコレート、買ってよかったものなど、本題から遠い雑談を3問続けないでください。",
          "入り口は具体（事業・プロダクト・現場・反応・判断の瞬間）から入ってかまいません。ただしそこに留まらず、1〜2手で『なぜそれを大事にするのか（理念）』『その考えはどこから来たのか（原体験）』へ必ず上げてください。",
          "アプリケーションやプロダクトの話が出たら、機能の細部に潜る前に、まず何のアプリか・誰のためのものかを一度だけ確認し、そのあとは機能を掘らずに『なぜ作るのか』『どんな思いがあるのか』へ上げてください。",
          "ログ、画面状態、データベース、QRコードなどの実装確認に潜りすぎないでください。読者が知りたいのは、その人や会社がなぜその体験を大事にするのかという理念や哲学です。",
          "音声合成は別システムが行います。読み上げやすいように、自然な句読点を入れ、長すぎる文を避けてください。",
          "音声では、1ターンは最大2文を基本にしてください。短い受けを1文、具体的な質問を1文だけ出します。",
          "1つの相手発話に対して、AI発話は1つだけにしてください。前置きだけを先に言い、その後に別発話で質問する二段構えは禁止です。",
          "本題中は『ありがとうございます。』だけの単独発話を絶対に出さないでください。相づちを言う場合も、同じ発話内で具体的な質問まで続けてください。",
          "本題で未来を聞くときは、抽象的な理想論にしないでください。事業、プロダクト、顧客体験、チーム、働き方がどう変わるかを具体的に聞いてください。",
          "抽象的な整理コメントや宣言は避けてください。「一緒に探しますね」「具体にしていきますね」ではなく、すぐ相手が答えられる質問にしてください。ただしアイスブレイク開始と本筋への移行の宣言だけは短く言ってよいです。",
          "「少しだけ整理してから」「少しだけ方向づけてから」「少し考えを整えてから」「少しだけ具体にしてみますね」のような進行実況は絶対に言わないでください。",
          "「最後に一言にまとめてうかがいますね」「ここでまとめます」のような、質問のない予告だけの発話は締めでも禁止です。まとめるなら、その発話の中で短く束ねて感謝まで言い切ってください。",
          "「今の切り替え方を起点にして」「その意味や原点に少し寄せて聞いてみますね」「少し寄せて聞きますね」のような、質問の意図説明も絶対に言わないでください。内部判断は黙って行い、相手には短い受けと質問だけを出してください。",
          "「その感触をもう一歩、あなたの内側に寄せて聞いてみますね」「その好奇心に触れながら、少しだけ原点をたどる質問をしますね」「その進め方をそのまま受けて、次の一歩を具体的に聞きますね」も禁止です。",
          "Markdown、コードブロック、バッククォート、引用符だけの装飾は絶対に出さないでください。",
          "「日本語で話します」「承知しました」「大丈夫です」のようなメタ発言や準備完了の宣言は言わず、すぐ自然な会話に入ってください。",
        ].join("\n");

        const engageTtsEchoGuard = () => {
          if (startupEchoGuardTimerRef.current) {
            clearTimeout(startupEchoGuardTimerRef.current);
            startupEchoGuardTimerRef.current = null;
          }
          startupEchoGuardRef.current = true;
          setMicrophoneTracksEnabled(false);
        };

        const scheduleTtsEchoGuardRelease = () => {
          const guardGeneration = generationRef.current;
          if (startupEchoGuardTimerRef.current) return;
          startupEchoGuardTimerRef.current = setTimeout(() => {
            if (guardGeneration !== generationRef.current) return;
            startupEchoGuardRef.current = false;
            startupEchoGuardTimerRef.current = null;
            setMicrophoneTracksEnabled(true);
          }, 500);
        };

        engageTtsEchoGuard();

        const agent = buildWellbeingAgent({
          skeletonInstructions,
          styleInstructions,
          tone: tonePreset,
          editorialController: {
            getState: () => editorialStateRef.current,
            getLatestIntervieweeText: () => latestIntervieweeTextRef.current,
            getResearchAnchors: () => researchAnchorsRef.current,
            commit: (next) => {
              editorialStateRef.current = next;
            },
          },
        });

        audioPlayerRef.current = new StreamingAudioPlayer({
          onPlaybackStart: () => {
            const timing = turnTimingRef.current;
            if (timing?.releaseAt) {
              const now = Date.now();
              console.debug(
                `[t5-latency] audio start +${now - timing.asrAt}ms from ASR ` +
                  `(+${now - timing.releaseAt}ms after release)`
              );
              turnTimingRef.current = null;
            }
            engageTtsEchoGuard();
            aiSpeakingRef.current = true;
            setState((prev) => ({ ...prev, isSpeaking: true }));
          },
          onPlaybackEnd: () => {
            scheduleTtsEchoGuardRelease();
            aiSpeakingRef.current = false;
            setState((prev) => ({ ...prev, isSpeaking: false }));
          },
        });
        chunkerRef.current =
          ttsProvider === "fish"
            ? new JapaneseTtsChunker({
                minClauseLength: 24,
                maxChunkLength: 84,
                idleFlushMs: 320,
                preferSafeSplit: true,
              })
            : new JapaneseTtsChunker();

        const audioElement = document.createElement("audio");
        audioElement.autoplay = true;
        audioElement.setAttribute("playsinline", "true");
        const transport = new OpenAIRealtimeWebRTC({
          mediaStream: micStream,
          audioElement,
        });
        transportRef.current = transport;

        const session = new RealtimeSession(agent, {
          model: OPENAI_REALTIME_MODEL,
          transport,
          context: {
            speechStyle: speechStylePreset,
            tone: tonePreset,
          },
          config: {
            reasoning: {
              effort: DEFAULT_REALTIME_REASONING_EFFORT,
            },
            audio: {
              input: buildRealtimeInputAudioConfig({
                transcriptionModel: "gpt-4o-transcribe",
                transcriptionPrompt: buildTranscriptionPrompt(
                  transcriptionTerms
                ),
                turnDetection: buildRealtimeTurnDetectionConfig({
                  mode: turnDetectionMode,
                  silenceDurationMs,
                  eagerness: vadEagerness,
                  // The reasoning brain authors questions; the Realtime model is
                  // ears + voice only. Detect/transcribe turns but never let it
                  // auto-generate its own response.
                  createResponse: false,
                  interruptResponse: false,
                }),
              }),
            },
          } as never,
        });
        sessionRef.current = session;

        const appendTranscriptSnapshot = (entries: TranscriptEntry[]) => {
          for (const entry of entries) {
            const last = transcriptSnapshotRef.current.at(-1);
            if (last?.role === entry.role && last.text === entry.text) continue;
            transcriptSnapshotRef.current.push({
              role: entry.role,
              text: entry.text,
            });
          }
          transcriptSnapshotRef.current = transcriptSnapshotRef.current.slice(-16);
        };

        // Queue a TTS chunk for ordered playback. The network fetch starts
        // immediately (prefetch) — or is handed in already-started from the
        // speculative gate — so synthesis of chunk N+1 overlaps the playback
        // of chunk N; the promise chain only enforces playback order.
        const queueTtsChunk = (text: string, prefetched?: Promise<Response>) => {
          const ttsText = text.trim();
          if (!ttsText) return;
          if (shouldSkipQueuedTtsText(queuedTtsTextsRef.current, ttsText)) return;
          queuedTtsTextsRef.current = [
            ...queuedTtsTextsRef.current,
            ttsText.replace(/\s+/g, " ").trim(),
          ].slice(-MAX_QUEUED_TTS_HISTORY);
          const chunkGeneration = generationRef.current;
          const abort = new AbortController();
          ttsFetchAbortsRef.current.add(abort);
          const responsePromise =
            prefetched ?? fetchTtsAudio(ttsProvider, ttsText, speed, abort.signal);
          // Swallow rejections that occur before the chain awaits the promise
          // (e.g. a barge-in abort) so they never surface as unhandled.
          responsePromise.catch(() => {});
          ttsChainRef.current = ttsChainRef.current
            .then(async () => {
              if (chunkGeneration !== generationRef.current) return;
              const player = audioPlayerRef.current;
              if (!player) return;
              await playTtsAudio({
                provider: ttsProvider,
                response: await responsePromise,
                player,
                isCurrent: () => chunkGeneration === generationRef.current,
              });
            })
            .catch((error) => {
              if ((error as Error)?.name === "AbortError") return;
              if (chunkGeneration !== generationRef.current) return;
              console.error("[Type5 Natural] TTS chunk failed", error);
              setState((prev) => ({
                ...prev,
                error:
                  error instanceof Error
                    ? error.message
                    : "Type 5 音声生成に失敗しました",
              }));
            })
            .finally(() => {
              ttsFetchAbortsRef.current.delete(abort);
            });
        };

        // Last line of defense against the brain hallucinating proper nouns
        // (e.g. presenting a real-world service from training data as the
        // interviewee's product). Any Latin-script name it speaks must appear
        // in the research material or the conversation itself.
        const scrubBrainProperNouns = (text: string): string => {
          const allowlist = buildProperNounAllowlist([
            skeletonInstructions,
            researchAnchorsRef.current.map((anchor) => anchor.text).join(" "),
            conversationRef.current.map((entry) => entry.text).join(" "),
            pendingIntervieweeTextRef.current,
          ]);
          const { text: scrubbed, removed } = scrubUngroundedProperNouns(
            text,
            allowlist
          );
          if (removed.length > 0) {
            console.warn(
              `[t5-fabrication] brain spoke ungrounded proper noun(s): ${removed.join(", ")}`
            );
          }
          return scrubbed;
        };

        // Prepare a chunk from the host/brain stream for speaking. The chunker
        // emits clause-level fragments (ending in 、) for low latency.
        // sanitizeTtsText is built for whole utterances and treats a fragment
        // as "pending" → empty, which would silently drop it. So only sanitize
        // complete sentences (where a stray meta-preamble would appear); pass
        // fragments through verbatim.
        const prepareSpeakableText = (chunk: string): string => {
          // Fragments bypass sanitizeTtsText, so scrub placeholders here too.
          const trimmed = scrubNamePlaceholders(scrubBrainProperNouns(chunk.trim()));
          if (!trimmed) return "";
          const isCompleteSentence = /[。！？!?]$/u.test(trimmed);
          return (isCompleteSentence ? sanitizeTtsText(trimmed) : trimmed) ?? "";
        };

        const queueSpeakableChunk = (chunk: string) => {
          const out = prepareSpeakableText(chunk);
          if (out) queueTtsChunk(out);
        };

        // --- Type 6 (natural2): Human State Engine + Response Orchestrator ---
        // Gather the current, timestamped signals for the HSE. Audio silence is
        // derived from the mic RMS independently of the OpenAI VAD so the two
        // can corroborate (or, via freshness decay, drop out) on their own.
        const computeHseInput = (now: number): HumanStateInput => {
          let silenceMs: number | null = null;
          let audioUpdatedAt: number | null = null;
          const monitor = micLevelMonitorRef.current;
          if (monitor) {
            const peak = monitor.peakSince(now - HSE_AUDIO_WINDOW_MS);
            if (Number.isFinite(peak)) {
              if (peak >= ASR_SILENCE_RMS_FLOOR) audioLastLoudAtRef.current = now;
              if (audioLastLoudAtRef.current != null) {
                silenceMs = now - audioLastLoudAtRef.current;
                audioUpdatedAt = now;
              }
            }
          }
          let pitchRange: number | null = null;
          let volumeTrend: number | null = null;
          if (monitor) {
            pitchRange = monitor.pitchStats(HSE_AUDIO_WINDOW_MS).range;
            volumeTrend = monitor.volumeTrend(HSE_AUDIO_WINDOW_MS);
            if (pitchRange != null || volumeTrend != null) {
              audioUpdatedAt = now;
            }
          }
          const livekit = livekitEotRef.current;
          const pendingText = pendingIntervieweeTextRef.current;
          // Emotion is fused from the UI layer (useAudioAnalysis +
          // emotion-analyzer) via pushHumanSignals; null is handled gracefully.
          const emotion = emotionRef.current;
          return {
            now,
            vadSpeaking: vadSpeakingRef.current,
            vadSpeechEndedAt: vadSpeechEndedAtRef.current,
            vadUpdatedAt: vadUpdatedAtRef.current,
            livekitEndOfTurn: livekit?.value ?? null,
            livekitUpdatedAt: livekit?.at ?? null,
            silenceMs,
            endsWithHesitation: endsWithHesitation(pendingText),
            endsMidThought:
              pendingText.trim().length > 0 && endsMidThought(pendingText),
            fillerCount: countFillers(pendingText),
            speechRate: speechRateRef.current,
            pitchRange,
            volumeTrend,
            audioUpdatedAt,
            emotion: emotion?.state ?? null,
            emotionUpdatedAt: emotion?.at ?? null,
          };
        };

        // Speak a short templated line (backchannel / empathy) immediately via
        // the TTS pipeline. It is intentionally NOT pushed to the brain's
        // conversation log so the reasoning model never thinks it asked a
        // question; barge-in handling (speech_started → cancelCurrentSpeech)
        // stops it the instant the interviewee resumes.
        const speakInterjection = (phrase: string) => {
          interjectionSeqRef.current += 1;
          queueTtsChunk(phrase);
        };

        const stopHseTick = () => {
          if (hseTickTimerRef.current) {
            clearInterval(hseTickTimerRef.current);
            hseTickTimerRef.current = null;
          }
        };

        const publishHseDebug = (
          hs: HumanState,
          action: OrchestratorAction | null,
          now: number
        ) => {
          setState((prev) => ({
            ...prev,
            humanState: hs,
            livekitTurnDetectorActive: hs.signals.livekit.active,
            orchestratorAction: action
              ? { kind: action.kind, reason: action.reason, at: now }
              : prev.orchestratorAction,
          }));
        };

        const orchestratorTick = () => {
          const orchestrator = orchestratorRef.current;
          if (!orchestrator) return;
          const now = Date.now();
          const hs = computeHumanState(computeHseInput(now));
          const pending = pendingIntervieweeTextRef.current.trim();
          const hasPendingAnswer = pending.length > 0;

          // Adaptive backstop. The fixed soft timeout is suppressed while the
          // interviewee is demonstrably still in their turn — actively
          // speaking (VAD) or visibly composing (high "thinking": a dangling
          // mid-thought, a hesitation, or LiveKit still judging the turn open.
          // Cutting in here is exactly the "食い込み" the user reports). Only
          // the generous absolute ceiling can commit while they are still
          // thinking, so a truly stuck pause never hangs the interview.
          const waited = now - hseWaitStartRef.current;
          const sinceLastSegmentMs = now - lastSegmentAtRef.current;
          const backstop = decideHseBackstop({
            pendingText: pending,
            waitedMs: waited,
            thinking: hs.thinking,
            vadSpeaking: vadSpeakingRef.current,
            sinceLastSegmentMs,
            softMaxWaitMs: HSE_MAX_WAIT_MS,
            hardMaxWaitMs: HSE_HARD_MAX_WAIT_MS,
            hardWaitSegmentGraceMs: HSE_HARD_WAIT_SEGMENT_GRACE_MS,
          });
          if (hasPendingAnswer && backstop.reason === "hard-wait-mid-thought") {
            publishHseDebug(hs, { kind: "WAIT", reason: backstop.reason }, now);
            if (now - hseTraceAtRef.current >= 500) {
              hseTraceAtRef.current = now;
              console.debug(
                `[t6-hse] backstop ${backstop.reason} waited=${waited}ms ` +
                  `thinking=${hs.thinking.toFixed(2)} vad=${vadSpeakingRef.current} ` +
                  `sinceSeg=${sinceLastSegmentMs}ms`
              );
            }
            return;
          }
          if (hasPendingAnswer && backstop.release) {
            const reason = backstop.reason;
            console.debug(
              `[t6-hse] backstop ${reason} waited=${waited}ms ` +
                `thinking=${hs.thinking.toFixed(2)} vad=${vadSpeakingRef.current} ` +
                `sinceSeg=${sinceLastSegmentMs}ms`
            );
            publishHseDebug(hs, { kind: "FOLLOW_UP", reason }, now);
            stopHseTick();
            brainReleaseRef.current?.();
            return;
          }

          const action = orchestrator.decide(hs, {
            now,
            aiSpeaking: aiSpeakingRef.current,
            brainPending: false,
            hasPendingAnswer,
            sinceLastSegmentMs,
            segmentCount: segmentCountRef.current,
            silenceMs: hs.features.silenceMs,
            pendingTextLength: pending.length,
            hasExplicitTurnHandoff: hasExplicitTurnHandoff(pending),
          });
          // Throttled trace so we can see why "思考中" does/doesn't rise: the
          // raw thinking score, the LiveKit end-of-turn signal feeding it, and
          // the orchestrator's resulting decision.
          if (now - hseTraceAtRef.current >= 500) {
            hseTraceAtRef.current = now;
            console.debug(
              `[t6-hse] thinking=${hs.thinking.toFixed(2)} eot=${hs.endOfTurn.toFixed(
                2
              )} lk=${
                hs.signals.livekit.active
                  ? hs.signals.livekit.value?.toFixed(2) ?? "—"
                  : "off"
              } silenceMs=${hs.features.silenceMs ?? "—"} vad=${
                vadSpeakingRef.current
              } sinceSeg=${sinceLastSegmentMs}ms segN=${
                segmentCountRef.current
              } chars=${pending.length} handoff=${hasExplicitTurnHandoff(
                pending
              )} action=${action.kind}/${action.reason}`
            );
          }
          publishHseDebug(hs, action, now);

          switch (action.kind) {
            case "FOLLOW_UP":
              stopHseTick();
              brainReleaseRef.current?.();
              break;
            case "BACKCHANNEL":
            case "EMPATHY":
              if (HSE_INTERJECTIONS_ENABLED && action.phrase) {
                speakInterjection(action.phrase);
                orchestrator.notePerformed(action, now);
              }
              break;
            default:
              break; // WAIT
          }
        };

        const startHseTick = () => {
          if (hseTickTimerRef.current) return;
          hseTickTimerRef.current = setInterval(orchestratorTick, HSE_TICK_MS);
        };

        const queueVisibleAssistantText = (visibleText: string) => {
          const normalizedVisibleText = sanitizeTtsText(visibleText);
          const ttsText = getUnspokenAssistantText(
            spokenAssistantTextRef.current,
            normalizedVisibleText
          );
          if (!ttsText) return;
          spokenAssistantTextRef.current = normalizedVisibleText;
          for (const chunk of chunkerRef.current?.push(ttsText) ?? []) {
            queueTtsChunk(chunk);
          }
        };

        const emitAssistantText = (id: string, visibleText: string) => {
          queueVisibleAssistantText(visibleText);
          setState((prev) => ({
            ...prev,
            transcript: upsertTranscriptEntry(prev.transcript, {
              id,
              role: "interviewer",
              text: visibleText,
              timestamp: Date.now(),
            }),
          }));
          for (const chunk of chunkerRef.current?.flush() ?? []) {
            queueTtsChunk(chunk);
          }
          latestInterviewerTextRef.current = visibleText;
          appendTranscriptSnapshot([
            {
              id,
              role: "interviewer",
              text: visibleText,
              timestamp: Date.now(),
            },
          ]);
        };

        const flushAssistantTurn = () => {
          if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
          }
          const utterance = coalescerRef.current.flush();
          if (utterance) {
            emitAssistantText(utterance.id, utterance.text);
          }
        };

        const armSettleTimer = () => {
          if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
          }
          const settleGeneration = generationRef.current;
          settleTimerRef.current = setTimeout(() => {
            settleTimerRef.current = null;
            if (settleGeneration !== generationRef.current) return;
            flushAssistantTurn();
          }, SETTLE_ASSISTANT_TEXT_MS);
        };

        const cancelCurrentSpeech = () => {
          generationRef.current += 1;
          brainAbortRef.current?.abort();
          brainAbortRef.current = null;
          brainSpecAbortRef.current?.abort();
          brainSpecAbortRef.current = null;
          for (const abort of ttsFetchAbortsRef.current) abort.abort();
          ttsFetchAbortsRef.current.clear();
          turnTimingRef.current = null;
          // Cancel a scheduled brain turn (the interviewee resumed). Keep the
          // pending buffer so the resumed speech merges into the same turn.
          if (brainDebounceTimerRef.current) {
            clearTimeout(brainDebounceTimerRef.current);
            brainDebounceTimerRef.current = null;
          }
          if (settleTimerRef.current) {
            clearTimeout(settleTimerRef.current);
            settleTimerRef.current = null;
          }
          coalescerRef.current.cancel();
          audioPlayerRef.current?.stop();
          chunkerRef.current?.reset();
          if (activeResponseRef.current) {
            transportRef.current?.sendEvent({ type: "response.cancel" });
            activeResponseRef.current = false;
          }
          ttsChainRef.current = Promise.resolve();
          queuedTtsTextsRef.current = [];
          aiSpeakingRef.current = false;
          // Type 6: a barge-in / new turn cancels the wait loop too; the next
          // ASR segment re-arms it via scheduleBrainTurn.
          stopHseTick();
          setState((prev) => ({ ...prev, isSpeaking: false }));
        };

        // Speak a fixed host utterance (the icebreak) directly through the TTS
        // pipeline — no reasoning model needed for scripted lines.
        const speakHostLine = (id: string, text: string) => {
          conversationRef.current.push({ role: "interviewer", text });
          latestInterviewerTextRef.current = text;
          setState((prev) => ({
            ...prev,
            transcript: upsertTranscriptEntry(prev.transcript, {
              id,
              role: "interviewer",
              text,
              timestamp: Date.now(),
            }),
          }));
          appendTranscriptSnapshot([
            { id, role: "interviewer", text, timestamp: Date.now() },
          ]);
          chunkerRef.current?.reset();
          for (const chunk of chunkerRef.current?.push(text) ?? []) {
            queueSpeakableChunk(chunk);
          }
          for (const chunk of chunkerRef.current?.flush() ?? []) {
            queueSpeakableChunk(chunk);
          }
        };

        // Author the next interviewer question with the reasoning brain. The
        // run starts speculatively as soon as an ASR segment lands: the model
        // writes while the debounce window is still open, but nothing is
        // spoken or shown until release() confirms the interviewee is done.
        // If they resume speaking, the run is aborted and restarted with the
        // merged text — the head start costs nothing, and the debounce drops
        // out of the perceived latency. The host owns progression via the
        // deterministic chapter clock; the brain owns the wording.
        const runBrainTurn = (
          intervieweeText: string,
          { speculateTts }: { speculateTts: boolean }
        ) => {
          brainAbortRef.current?.abort();
          // Abort the previous gated run's speculative TTS fetches (a released
          // run has already cleared this ref, so live playback is untouched).
          brainSpecAbortRef.current?.abort();
          const abort = new AbortController();
          brainAbortRef.current = abort;
          const specAbort = new AbortController();
          brainSpecAbortRef.current = specAbort;
          const myGeneration = generationRef.current;
          // Compute (but do not commit) the chapter advance; the clock and the
          // conversation log only move when this run is released.
          const clockBefore = brainClockRef.current;
          // Type 6 layers the meaning-depth axis on top of the chapter clock so
          // the questioning climbs FACT -> EMOTION -> VALUE -> DECISION ->
          // PHILOSOPHY -> LESSON. Type 5 keeps the plain chapter clock.
          const isType6 = variantRef.current === "type6";
          const advance = isType6
            ? advanceInterviewClock(clockBefore, intervieweeText)
            : (() => {
                const chapter = advanceBrainClock(clockBefore, intervieweeText);
                return {
                  ...chapter,
                  state: {
                    ...chapter.state,
                    depth: clockBefore.depth,
                    lessonAsked: clockBefore.lessonAsked,
                  },
                  depth: clockBefore.depth,
                  intent: "clarify_fact" as FollowUpIntent,
                };
              })();
          const turnId = `brain-${(brainTurnSeqRef.current += 1)}`;
          chunkerRef.current?.reset();

          let released = false;
          let finished = false;
          let full = "";
          let memo = "";
          let speculativeFetches = 0;
          // Chunks prepared while gated: text plus (for the first few) an
          // already-started TTS fetch so the audio is ready at release time.
          const prepared: { text: string; response: Promise<Response> | null }[] =
            [];

          const updateUi = () => {
            setState((prev) => ({
              ...prev,
              transcript: upsertTranscriptEntry(prev.transcript, {
                id: turnId,
                role: "interviewer",
                text: scrubNamePlaceholders(scrubBrainProperNouns(full)),
                timestamp: Date.now(),
              }),
            }));
          };

          const handleChunk = (chunk: string) => {
            const out = prepareSpeakableText(chunk);
            if (!out) return;
            if (released) {
              queueTtsChunk(out);
              return;
            }
            let response: Promise<Response> | null = null;
            if (speculateTts && speculativeFetches < MAX_SPECULATIVE_TTS_FETCHES) {
              speculativeFetches += 1;
              response = fetchTtsAudio(ttsProvider, out, speed, specAbort.signal);
              // Never consumed if this run is superseded; keep the rejection
              // from surfacing as unhandled.
              response.catch(() => {});
            }
            prepared.push({ text: out, response });
          };

          // Quoted spans the brain attributes to the site (「…」というミッション)
          // must exist verbatim in the research or the conversation; fabricated
          // ones are swapped for a real research quote before TTS/UI.
          // Only anchor kinds that the prep filter verifies verbatim against
          // the page text count as grounding — paraphrase/inference fields
          // (customerPromise, themes, ...) can themselves contain prep-side
          // fabrications, so a quote matching them is not proof it's real.
          const verbatimAnchorKinds = new Set([
            "mission",
            "vision",
            "distinctiveWord",
            "leaderQuote",
            "business",
          ]);
          const quoteReplacement = researchAnchorsRef.current.find(
            (anchor) =>
              anchor.kind === "mission" || anchor.kind === "distinctiveWord"
          )?.text;
          // 「…」 spans inside the skeleton (e.g. opening question candidates)
          // are verbatim-verified by the prep filter, so they ground quotes
          // too — but the surrounding paraphrase prose does not.
          const instructionQuoteSpans =
            (skeletonInstructions ?? "").match(/「[^」]+」/g)?.join(" ") ?? "";
          const quoteGuard = new QuoteGroundingGuard({
            allowlistTexts: [
              researchAnchorsRef.current
                .filter((anchor) => verbatimAnchorKinds.has(anchor.kind))
                .map((anchor) => anchor.text)
                .join(" "),
              instructionQuoteSpans,
              conversationRef.current.map((entry) => entry.text).join(" "),
              intervieweeText,
            ],
            replacementQuote: quoteReplacement,
            onScrub: (quote) => {
              console.warn(
                `[t5-fabrication] brain attributed an ungrounded quote: 「${quote}」`
              );
            },
          });

          // Trims the brain's speech to a single interviewer turn — stronger
          // models occasionally role-play the whole dialogue (the interviewee's
          // replies and several more turns); only the first turn is spoken.
          const turnGuard = new SingleTurnGuard();
          let discardedSpeechChars = 0;

          const emitSpeech = (speech: string) => {
            if (!speech) return;
            full += speech;
            if (released) updateUi();
            for (const chunk of chunkerRef.current?.push(speech) ?? []) {
              handleChunk(chunk);
            }
          };

          const onSpeech = (speech: string) => {
            const allowed = turnGuard.push(speech);
            if (allowed) emitSpeech(quoteGuard.push(allowed));
            discardedSpeechChars += speech.length - allowed.length;
          };

          const completeEmission = () => {
            if (memo) {
              // The memo may carry an optional second "観測:" line (Type 6).
              // Splitting is a no-op for Type 5 memos (no marker present).
              const parsed = parseMeaningSignals(memo);
              brainHypothesisRef.current = parsed.hypothesis || memo;
              if (isType6) {
                meaningRef.current = {
                  ...meaningRef.current,
                  signals: parsed.signals,
                };
                setState((prev) => ({
                  ...prev,
                  meaning: { ...meaningRef.current },
                }));
              }
            }
            const finalText = scrubNamePlaceholders(
              scrubBrainProperNouns(full.trim())
            );
            // Generation-truncation diagnostic: a short committed question with
            // discarded chars means a guard (single-turn / fabrication) trimmed
            // the real question — not a Fish TTS dropout (which leaves the text
            // intact). Surfaces the guard-trim case so a truncated bubble can be
            // told apart from an audio gap.
            if (isType6) {
              console.debug(
                `[t6-gen] committed ${finalText.length} chars (finished=${finished}, discarded=${discardedSpeechChars})` +
                  (discardedSpeechChars > 0
                    ? ` | guard trimmed — possible truncation, tail="${finalText.slice(
                        -40
                      )}"`
                    : "")
              );
            }
            if (!finalText) return;
            conversationRef.current.push({
              role: "interviewer",
              text: finalText,
            });
            latestInterviewerTextRef.current = finalText;
            setState((prev) => ({
              ...prev,
              transcript: upsertTranscriptEntry(prev.transcript, {
                id: turnId,
                role: "interviewer",
                text: finalText,
                timestamp: Date.now(),
              }),
            }));
            appendTranscriptSnapshot([
              {
                id: turnId,
                role: "interviewer",
                text: finalText,
                timestamp: Date.now(),
              },
            ]);
          };

          const release = () => {
            if (released || myGeneration !== generationRef.current) return;
            released = true;
            // Ownership of speculative fetches moves to the TTS chain; the
            // next gated run must not abort them mid-playback.
            if (brainSpecAbortRef.current === specAbort) {
              brainSpecAbortRef.current = null;
            }
            if (turnTimingRef.current) {
              turnTimingRef.current.releaseAt = Date.now();
              console.debug(
                `[t5-latency] release +${
                  turnTimingRef.current.releaseAt - turnTimingRef.current.asrAt
                }ms from ASR (brain ${finished ? "finished" : "streaming"}, ${
                  prepared.length
                } chunk(s) prepared, ${speculativeFetches} prefetched)`
              );
            }
            brainClockRef.current = advance.state;
            // Decide BEFORE resetting segment tracking whether this answer is
            // story-like and should get a pre-speech hold (see below).
            const storyHold =
              isType6 &&
              (segmentCountRef.current >= 2 ||
                intervieweeText.trim().length >= STORY_PRESPEECH_HOLD_MIN_CHARS);
            // The pending turn is committed; reset segment tracking for the next.
            segmentCountRef.current = 0;
            lastSegmentAtRef.current = 0;
            if (isType6) {
              meaningRef.current = {
                depth: advance.depth,
                intent: advance.intent,
                signals: meaningRef.current.signals,
              };
              setState((prev) => ({
                ...prev,
                meaning: { ...meaningRef.current },
              }));
            }
            // Suspected (not confirmed) premature release: the turn was let go
            // on a grammatically incomplete answer. Logged for diagnosis only —
            // unlike the confirmed barge-in retraction, this is heuristic and is
            // intentionally NOT counted in the panel to keep that signal clean.
            if (
              isType6 &&
              intervieweeText.trim().length > 0 &&
              endsMidThought(intervieweeText)
            ) {
              console.debug(
                `[t6-interrupt] suspected-premature: released on incomplete answer | tail="${intervieweeText
                  .trim()
                  .slice(-40)}"`
              );
            }
            pendingIntervieweeTextRef.current = "";
            conversationRef.current.push({
              role: "interviewee",
              text: intervieweeText,
            });
            latestIntervieweeTextRef.current = intervieweeText;
            lastReleasedTurnRef.current = {
              releasedAt: Date.now(),
              intervieweeText,
              turnId,
              clockBefore,
            };
            if (full) updateUi();
            // Story-mode pre-speech hold: delay the first audio so a late
            // continuation (speech_started or ASR) can retract this turn before
            // any sound plays. The chunk play steps already bail on a generation
            // bump (from cancelCurrentSpeech), so a hold that is cancelled mid-way
            // simply never emits audio. Prefetch already kicked off, so synthesis
            // overlaps the hold.
            if (storyHold) {
              ttsChainRef.current = ttsChainRef.current.then(
                () =>
                  new Promise<void>((resolve) => {
                    setTimeout(resolve, STORY_PRESPEECH_HOLD_MS);
                  })
              );
            }
            for (const item of prepared) {
              queueTtsChunk(item.text, item.response ?? undefined);
            }
            prepared.length = 0;
            if (finished) completeEmission();
          };
          brainReleaseRef.current = release;

          void (async () => {
            // The brain streams "発話文 → --- → 仮説メモ"; the splitter holds the
            // memo back so only the spoken part reaches the UI and TTS.
            const splitter = new BrainStreamSplitter();
            const fetchStartedAt = Date.now();
            let deltaCount = 0;
            try {
              const res = await fetch("/api/interview-brain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: abort.signal,
                body: JSON.stringify({
                  // The interviewee turn is not committed to the log yet, so
                  // append the pending text to the request transcript here.
                  transcript: [
                    ...conversationRef.current.slice(
                      -(BRAIN_TRANSCRIPT_LIMIT - 1)
                    ),
                    { role: "interviewee", text: intervieweeText },
                  ],
                  skeletonInstructions,
                  researchAnchors: researchAnchorsRef.current,
                  hint: advance.hint,
                  hypothesis: brainHypothesisRef.current,
                  model: brainModel,
                  // Type 6: Rogerian reflection is currently disabled so the
                  // brain does not add LLM-generated aizuchi before questions.
                  rogerian: false,
                  // Type 6: allow the optional "観測:" memo line (debug only).
                  meaningSignals: isType6,
                  // Type 6 trial: give GPT-5.x a bit more reasoning depth for
                  // better question selection. The API only applies this to
                  // OpenAI reasoning models; other providers ignore it.
                  openAiReasoningEffort: isType6 ? "medium" : undefined,
                  // Anthropic/Fable/Claude models such as Opus 4.8 run at medium
                  // effort in Type 6: low effort let Opus's dialogue-continuation
                  // prior override the "one interviewer turn only" constraint, so
                  // it role-played the whole exchange (fake interviewee lines,
                  // host meta, "user:"/"assistant:" labels). Medium gives enough
                  // deliberate constraint-checking to stop at --- after one turn,
                  // at a small latency cost. The API only applies this field to
                  // Anthropic-compatible models.
                  anthropicEffort: isType6 ? "medium" : undefined,
                }),
              });
              if (!res.ok || !res.body) {
                throw new Error(`brain request failed: ${res.status}`);
              }
              const reader = res.body.getReader();
              const decoder = new TextDecoder();
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (myGeneration !== generationRef.current) {
                  await reader.cancel();
                  return;
                }
                const text = decoder.decode(value, { stream: true });
                if (!text) continue;
                deltaCount += 1;
                if (deltaCount === 1) {
                  console.debug(
                    `[t5-latency] brain first delta +${
                      Date.now() - fetchStartedAt
                    }ms`
                  );
                }
                const speech = splitter.push(text);
                if (speech) onSpeech(speech);
                // The model kept producing spoken dialogue well past its one
                // turn (no memo separator → it's role-playing the rest of the
                // conversation). We already have the real turn; stop reading so
                // the wasted generation doesn't delay the log commit.
                if (
                  turnGuard.isDone &&
                  discardedSpeechChars > ROLE_PLAY_EXCESS_ABORT_CHARS
                ) {
                  console.debug(
                    `[t5-brain] aborting role-play overrun (${discardedSpeechChars} excess chars discarded)`
                  );
                  await reader.cancel();
                  break;
                }
              }
              if (myGeneration !== generationRef.current) return;
              const tail = splitter.finalize();
              if (tail) onSpeech(tail);
              emitSpeech(quoteGuard.finalize());
              for (const chunk of chunkerRef.current?.flush() ?? []) {
                handleChunk(chunk);
              }
              memo = splitter.memo;
              finished = true;
              // A low delta count (1-2) means the model dumped its answer in
              // one burst instead of streaming token-by-token.
              console.debug(
                `[t5-latency] brain done +${
                  Date.now() - fetchStartedAt
                }ms (${deltaCount} deltas)`
              );
              if (released) completeEmission();
            } catch (error) {
              if ((error as Error)?.name === "AbortError") {
                // Barge-in / supersede aborted generation mid-stream. If we had
                // already emitted some speech, the visible bubble is left as a
                // truncated fragment — log it so this is distinguishable from a
                // guard trim or a Fish TTS dropout.
                const partial = full.trim();
                if (isType6 && partial.length > 0) {
                  console.debug(
                    `[t6-gen] generation aborted mid-stream (${partial.length} chars so far, released=${released}), tail="${partial.slice(
                      -40
                    )}"`
                  );
                }
                return;
              }
              if (myGeneration !== generationRef.current) return;
              console.warn("[Type5 Natural] brain turn failed", error);
            }
          })();
        };

        // Each ASR segment extends the pending interviewee turn, restarts the
        // speculative brain run with the merged text, and re-arms the release
        // timer. The brain authors during the debounce window; the timer only
        // opens the emission gate, so a brief mid-answer pause neither cuts in
        // nor adds latency. The wait is adaptive: a turn that ends mid-thought
        // (dangling connective) or is just a thinking noise gets a much longer
        // grace period than a cleanly finished sentence.
        // Type 6: the brain still authors speculatively as soon as an ASR
        // segment lands, but the release timing (and any backchannel/empathy
        // interjections) is governed by the Human State Engine + orchestrator
        // tick rather than a fixed debounce.
        const scheduleBrainTurnType6 = () => {
          const pending = pendingIntervieweeTextRef.current.trim();
          if (!pending) return;
          const filler = isFillerOnly(pending);
          runBrainTurn(pending, { speculateTts: !filler });
          startHseTick();
        };

        const scheduleBrainTurn = () => {
          if (variantRef.current === "type6") {
            scheduleBrainTurnType6();
            return;
          }
          if (brainDebounceTimerRef.current) {
            clearTimeout(brainDebounceTimerRef.current);
          }
          const scheduledGeneration = generationRef.current;
          const pending = pendingIntervieweeTextRef.current.trim();
          if (!pending) return;
          const filler = isFillerOnly(pending);
          // A filler-only turn ("うーん") rarely survives the long grace
          // period, so don't burn TTS synthesis on it speculatively.
          runBrainTurn(pending, { speculateTts: !filler });
          // Slow brain models wait longer and also treat trailing
          // hesitations ("…想像する。あの、そうですね。") as still composing.
          const patient = brainModel ? PATIENT_BRAIN_MODELS.has(brainModel) : false;
          const stillComposing =
            endsMidThought(pending) || (patient && endsWithHesitation(pending));
          const delay = filler
            ? patient
              ? BRAIN_TURN_DEBOUNCE_FILLER_PATIENT_MS
              : BRAIN_TURN_DEBOUNCE_FILLER_MS
            : stillComposing
              ? patient
                ? BRAIN_TURN_DEBOUNCE_MIDTHOUGHT_PATIENT_MS
                : BRAIN_TURN_DEBOUNCE_MIDTHOUGHT_MS
              : pending.length >= LONG_ANSWER_MIN_CHARS
                ? patient
                  ? BRAIN_TURN_DEBOUNCE_LONG_ANSWER_PATIENT_MS
                  : BRAIN_TURN_DEBOUNCE_LONG_ANSWER_MS
                : patient
                  ? BRAIN_TURN_DEBOUNCE_PATIENT_MS
                  : BRAIN_TURN_DEBOUNCE_MS;
          brainDebounceTimerRef.current = setTimeout(() => {
            brainDebounceTimerRef.current = null;
            if (scheduledGeneration !== generationRef.current) return;
            brainReleaseRef.current?.();
          }, delay);
        };

        session.on("agent_start", (_ctx, ag) => {
          setState((prev) => ({ ...prev, currentAgent: ag.name }));
        });

        session.on("history_added", (item) => {
          if (processedItemIds.current.has(item.itemId)) return;
          const entry = extractTranscriptFromItem(item);
          if (!entry) return;
          processedItemIds.current.add(item.itemId);
          if (entry.role !== "interviewee") return;
          {
            const hallucination = classifyAsrHallucination(entry.text);
            if (hallucination) {
              dropHallucinatedSegment(entry.text, hallucination);
              return;
            }
          }
          coalescerRef.current.noteUserTurn();
          queuedTtsTextsRef.current = [];
          appendTranscriptSnapshot([entry]);
          latestIntervieweeTextRef.current = entry.text;
          setState((prev) => ({
            ...prev,
            transcript: appendUniqueTranscriptEntries(prev.transcript, [entry]),
          }));
        });

        session.on("history_updated", (history) => {
          const newTranscripts: TranscriptEntry[] = [];
          for (const item of history) {
            if (processedItemIds.current.has(item.itemId)) continue;
            const entry = extractTranscriptFromItem(item);
            if (!entry) continue;
            processedItemIds.current.add(item.itemId);
            if (entry.role !== "interviewee") continue;
            const hallucination = classifyAsrHallucination(entry.text);
            if (hallucination) {
              dropHallucinatedSegment(entry.text, hallucination);
              continue;
            }
            newTranscripts.push(entry);
          }
          if (newTranscripts.length > 0) {
            coalescerRef.current.noteUserTurn();
            appendTranscriptSnapshot(newTranscripts);
            queuedTtsTextsRef.current = [];
            latestIntervieweeTextRef.current =
              newTranscripts[newTranscripts.length - 1].text;
            setState((prev) => ({
              ...prev,
              transcript: appendUniqueTranscriptEntries(
                prev.transcript,
                newTranscripts
              ),
            }));
          }
        });

        session.on("transport_event", (event: unknown) => {
          const realtimeEvent = event as {
            type?: string;
            delta?: string;
            text?: string;
            item_id?: string;
            response_id?: string;
            transcript?: string;
            item?: { type?: string };
          };
          if (!realtimeEvent.type) return;

          if (realtimeEvent.type === "input_audio_buffer.speech_started") {
            // Open a fresh VAD window so the next ASR segment's energy is
            // measured against exactly the audio that produced it.
            speechWindowRef.current = { startedAt: Date.now(), endedAt: null };
            vadSpeakingRef.current = true;
            vadUpdatedAtRef.current = Date.now();
            if (startupEchoGuardRef.current) return;
            cancelCurrentSpeech();
            return;
          }

          if (realtimeEvent.type === "input_audio_buffer.speech_stopped") {
            const stoppedAt = Date.now();
            if (speechWindowRef.current.startedAt) {
              speechWindowRef.current.endedAt = stoppedAt;
            }
            vadSpeakingRef.current = false;
            vadSpeechEndedAtRef.current = stoppedAt;
            vadUpdatedAtRef.current = stoppedAt;
            return;
          }

          // A finalized ASR segment extends the pending interviewee turn and
          // (re)arms the debounce timer. The brain fires only after the speaker
          // truly stops (scheduleBrainTurn), so a brief mid-answer pause does
          // not cut in. The Realtime model never auto-responds
          // (create_response=false); the host drives every turn.
          if (
            realtimeEvent.type ===
            "conversation.item.input_audio_transcription.completed"
          ) {
            const transcript = realtimeEvent.transcript?.trim();
            if (!transcript) return;
            const itemId = realtimeEvent.item_id;
            if (itemId) {
              if (processedAsrIdsRef.current.has(itemId)) return;
              processedAsrIdsRef.current.add(itemId);
            }
            // Hallucinated-from-silence segments must never reach the brain:
            // it would answer a question the interviewee did not ask.
            const hallucination = classifyAsrHallucination(transcript);
            if (hallucination) {
              dropHallucinatedSegment(transcript, hallucination);
              return;
            }
            // Stale-window phantom guard. Every real finalized segment is
            // delimited by its own speech_started/speech_stopped, so it owns a
            // fresh VAD window. A near-silent Whisper hallucination fires no
            // VAD, so speechWindowRef still points at the PREVIOUS (real, loud)
            // utterance — and the amplitude gate above is fooled by that
            // borrowed energy. If this segment's window end matches the last
            // accepted segment's, it produced no microphone audio of its own:
            // drop it before it reaches the brain.
            {
              const win = speechWindowRef.current;
              if (
                win.startedAt > 0 &&
                win.endedAt != null &&
                win.endedAt === lastGatedSpeechWindowEndRef.current
              ) {
                console.warn(
                  `[t6-asr] dropped stale-window segment (no new audio): ${transcript}`
                );
                return;
              }
              if (win.endedAt != null) {
                lastGatedSpeechWindowEndRef.current = win.endedAt;
              }
            }
            // A segment landing just after a release is the continuation of
            // the answer we already reacted to (its audio was captured before
            // the echo guard muted the mic): the release was premature.
            // Retract the stale question — stop its playback, remove it from
            // the log and UI — and re-run the brain on the merged answer.
            // While the question is still being voiced (echo guard engaged,
            // mic muted) ANY arriving segment was captured pre-mute, so the
            // fixed window only applies once playback has finished. With a
            // slow brain model, release → audio can take several seconds and
            // the wall-clock window alone expires before the audio even
            // starts — the model-2 "keeps talking over me" bug.
            const lastReleased = lastReleasedTurnRef.current;
            if (
              lastReleased &&
              (startupEchoGuardRef.current ||
                Date.now() - lastReleased.releasedAt <
                  LATE_CONTINUATION_WINDOW_MS)
            ) {
              const msAfterRelease = Date.now() - lastReleased.releasedAt;
              // The TRUE silence the AI gave the speaker: release → the moment
              // they actually resumed (VAD speech_started), NOT the ASR commit.
              // msAfterRelease is inflated by however long the continuation
              // sentence took to say; this gap is what tells us whether the AI
              // released too eagerly (small/negative gap = it cut in almost
              // immediately, or while they were still talking) vs the speaker
              // truly paused (large gap).
              const resumeStartedAt = speechWindowRef.current.startedAt;
              const resumeGapMs =
                resumeStartedAt > 0
                  ? resumeStartedAt - lastReleased.releasedAt
                  : null;
              lastReleasedTurnRef.current = null;
              cancelCurrentSpeech();
              brainClockRef.current = lastReleased.clockBefore;
              const conversation = conversationRef.current;
              let retractedText = "";
              if (conversation.at(-1)?.role === "interviewer") {
                retractedText = conversation.at(-1)?.text ?? "";
                conversation.pop();
              }
              if (
                conversation.at(-1)?.role === "interviewee" &&
                conversation.at(-1)?.text === lastReleased.intervieweeText
              ) {
                conversation.pop();
              }
              // Record this as a confirmed interruption: the AI was voiced (or
              // about to be) but the interviewee was still talking, so the turn
              // was premature. Surface it loudly (warn shows at default console
              // level) and feed the debug panel via state.
              const event = {
                at: Date.now(),
                kind: "barge-in-retracted" as const,
                msAfterRelease,
                resumeGapMs,
                retractedText,
                intervieweeTail: transcript,
              };
              interruptionEventsRef.current.push(event);
              console.warn(
                `[t6-interrupt] barge-in: AI question retracted | resumeGap=${
                  resumeGapMs == null ? "?" : `${resumeGapMs}ms`
                } (release→resume, the real silence)` +
                  ` | commit=+${msAfterRelease}ms (incl. speaking time)` +
                  ` (total ${interruptionEventsRef.current.length}) | continuation="${transcript}"` +
                  ` | retracted="${retractedText}"`
              );
              const interruptionCount = interruptionEventsRef.current.length;
              setState((prev) => ({
                ...prev,
                transcript: prev.transcript.filter(
                  (entry) => entry.id !== lastReleased.turnId
                ),
                interruptions: {
                  count: interruptionCount,
                  last: { msAfterRelease, resumeGapMs, at: event.at },
                },
              }));
              pendingIntervieweeTextRef.current = lastReleased.intervieweeText;
            }
            pendingIntervieweeTextRef.current = [
              pendingIntervieweeTextRef.current.trim(),
              transcript,
            ]
              .filter(Boolean)
              .join(" ");
            latestIntervieweeTextRef.current =
              pendingIntervieweeTextRef.current;
            turnTimingRef.current = { asrAt: Date.now(), releaseAt: null };
            // Type 6: (re)start the wait window for the orchestrator backstop,
            // and record this segment's arrival for the segment-grace gate.
            hseWaitStartRef.current = Date.now();
            lastSegmentAtRef.current = Date.now();
            segmentCountRef.current += 1;
            // Characters/sec of this segment (Transcript length over the VAD
            // speech window) — a "speech rate" cue for the Human State Engine.
            const win = speechWindowRef.current;
            if (win.startedAt && win.endedAt && win.endedAt > win.startedAt) {
              const seconds = (win.endedAt - win.startedAt) / 1000;
              if (seconds >= 0.3) {
                speechRateRef.current = transcript.length / seconds;
              }
            }
            scheduleBrainTurn();
            return;
          }

          if (realtimeEvent.type === "response.created") {
            // A new response within the settle window supersedes the previous
            // one, so cancel any pending flush and begin a fresh accumulation.
            if (settleTimerRef.current) {
              clearTimeout(settleTimerRef.current);
              settleTimerRef.current = null;
            }
            activeResponseRef.current = true;
            responseHadToolCallRef.current = false;
            pendingResponseFinalTextRef.current = undefined;
            spokenAssistantTextRef.current = "";
            coalescerRef.current.noteResponseStart();
            chunkerRef.current?.reset();
            return;
          }

          if (realtimeEvent.type === "response.output_item.added") {
            // Text emitted in the same response as a tool call is a bridge /
            // preamble; mark it so it cannot override the post-tool answer.
            if (realtimeEvent.item?.type === "function_call") {
              responseHadToolCallRef.current = true;
            }
            return;
          }

          if (realtimeEvent.type === "response.output_text.delta") {
            activeResponseRef.current = true;
            const delta = realtimeEvent.delta ?? "";
            if (!delta) return;
            // Accumulate only; do not speak live. The single utterance for the
            // turn is spoken once the settle timer fires. We still update the
            // on-screen transcript under a stable per-turn id.
            const { id, liveText } = coalescerRef.current.noteDelta(delta);
            if (liveText) {
              setState((prev) => ({
                ...prev,
                transcript: upsertTranscriptEntry(prev.transcript, {
                  id,
                  role: "interviewer",
                  text: liveText,
                  timestamp: Date.now(),
                }),
              }));
            }
            return;
          }

          if (realtimeEvent.type === "response.output_text.done") {
            const rawFinal = realtimeEvent.text?.trim();
            // Defer recording the turn candidate until response.done, when this
            // response's tool-call status is final. A bridge / preamble whose
            // text completes BEFORE its function_call item is added would
            // otherwise be mis-tagged as a clean answer and spoken aloud — the
            // "internal monologue before the real question" bug.
            pendingResponseFinalTextRef.current =
              rawFinal && rawFinal.length > 0 ? rawFinal : undefined;
            activeResponseRef.current = false;
            return;
          }

          if (realtimeEvent.type === "response.done") {
            // All output items (including any function_call) are known now, so
            // hadToolCall is accurate. Record the candidate here so a tool-call
            // response (which carries the bridge / internal monologue) can never
            // override the real post-tool answer.
            coalescerRef.current.noteResponseComplete(
              pendingResponseFinalTextRef.current,
              { hadToolCall: responseHadToolCallRef.current }
            );
            pendingResponseFinalTextRef.current = undefined;
            activeResponseRef.current = false;
            // A follow-up response.created cancels this timer, so only the last
            // (real question) response of the turn is ever committed/spoken.
            armSettleTimer();
            return;
          }

          if (realtimeEvent.type === "response.cancelled") {
            activeResponseRef.current = false;
          }
        });

        session.on("error", (err: unknown) => {
          const errObj = err as Record<string, unknown>;
          const errorPayload = errObj?.error as Record<string, unknown> | undefined;
          const innerError = errorPayload?.error as
            | Record<string, unknown>
            | undefined;
          const code =
            (innerError?.code as string | undefined) ??
            (errorPayload?.code as string | undefined);
          const message =
            (innerError?.message as string | undefined) ??
            (errorPayload?.message as string | undefined) ??
            (errObj?.message as string | undefined);
          const knownBenign =
            code === "conversation_already_has_active_response" ||
            code === "response_not_found" ||
            message?.includes("conversation_already_has_active_response") ||
            message?.includes("response_not_found") ||
            message?.includes("no active response");
          if (knownBenign) return;
          if (!code && !message) return;
          if (message) {
            console.warn("[Type5 Natural] RealtimeSession warning:", {
              code,
              message,
            });
            setState((prev) => ({ ...prev, error: message }));
          }
        });

        const apiKeyFn = async () => {
          const tokenRes = await fetch("/api/session", { method: "POST" });
          if (!tokenRes.ok) {
            throw new Error("セッションの作成に失敗しました");
          }
          const data = await tokenRes.json();
          if (!data.apiKey) {
            throw new Error("エフェメラルトークンの取得に失敗しました");
          }
          return data.apiKey as string;
        };

        await session.connect({ apiKey: apiKeyFn });

        // Type 5では音声表現をElevenLabsへ外出しするため、Realtime側の
        // 後続自動応答もtext-onlyに固定する。初回response.createだけの指定だと、
        // 次ターン以降にRealtime内蔵音声が復活することがある。
        transport.sendEvent({
          type: "session.update",
          session: {
            type: "realtime",
            output_modalities: ["text"],
          },
        });

        // The icebreak is a fixed host line (no reasoning needed). The brain
        // takes over from the first real question, once the interviewee replies.
        if (sessionGeneration === generationRef.current) {
          speakHostLine("brain-icebreak", ICEBREAK_TEXT);
        }

        if (sessionGeneration === generationRef.current) {
          setState((prev) => ({
            ...prev,
            isConnected: true,
            isConnecting: false,
            currentAgent: agent.name,
          }));
        }
      } catch (err) {
        cleanup();
        const message = err instanceof Error ? err.message : "接続に失敗しました";
        setState((prev) => ({
          ...prev,
          isConnecting: false,
          error: message,
        }));
      }
    },
    [cleanup, setMicrophoneTracksEnabled]
  );

  const disconnect = useCallback(() => {
    cleanup();
    processedItemIds.current.clear();
    setState((prev) => ({
      isConnected: false,
      isConnecting: false,
      isReconnecting: false,
      isSpeaking: false,
      currentAgent: "",
      mode: null,
      transcript: [],
      aiSuggestions: [],
      error: null,
      resumeFailed: false,
      goAwayTimeLeft: null,
      hasResumableSession: false,
      // Prepared research survives disconnect; it is keyed by URL.
      researchStatus: prev.researchStatus,
    }));
  }, [cleanup]);

  // Run company research ahead of the interview. The start button stays
  // locked until this resolves; connect() then consumes the same promise, so
  // the interview starts without re-fetching.
  const prepareResearch = useCallback(async (url?: string) => {
    const normalized = (url ?? "").trim();
    if (!normalized) {
      preparedResearchRef.current = null;
      setState((prev) => ({ ...prev, researchStatus: "ready" }));
      return;
    }
    if (preparedResearchRef.current?.url === normalized) return;
    const promise = fetchSkeletonPrep(normalized);
    preparedResearchRef.current = { url: normalized, promise };
    setState((prev) => ({ ...prev, researchStatus: "loading" }));
    const prep = await promise;
    // A newer prepareResearch call for another URL supersedes this one.
    if (preparedResearchRef.current?.url !== normalized) return;
    setState((prev) => ({
      ...prev,
      researchStatus: prep.instructions ? "ready" : "failed",
    }));
  }, []);

  const getMediaStream = useCallback(() => mediaStreamRef.current, []);

  const mute = useCallback((muted: boolean) => {
    mediaStreamRef.current
      ?.getAudioTracks()
      .forEach((track) => (track.enabled = !muted));
  }, []);

  const isMuted = useCallback(() => {
    return mediaStreamRef.current?.getAudioTracks().every((track) => !track.enabled) ?? false;
  }, []);

  const resume = useCallback(async () => {
    return Promise.resolve();
  }, []);

  const pushHumanSignals = useCallback(
    (signals: { emotion?: EmotionState | null }) => {
      if (signals.emotion) {
        emotionRef.current = { state: signals.emotion, at: Date.now() };
      } else if (signals.emotion === null) {
        emotionRef.current = null;
      }
    },
    []
  );

  // Type 6 demo control: connect/disconnect the LiveKit turn detector live so
  // the difference between full-quality turn-taking and the VAD+audio
  // degradation can be felt without restarting the interview. Disabling drops
  // the room and clears the stale signal so the HSE falls back immediately;
  // enabling reconnects using the active mic stream.
  const setLiveKitTurnDetectorEnabled = useCallback((enabled: boolean) => {
    liveKitEnabledRef.current = enabled;
    if (!enabled) {
      livekitRoomRef.current?.disconnect();
      livekitRoomRef.current = null;
      livekitEotRef.current = null;
      setState((prev) => ({ ...prev, livekitTurnDetectorActive: false }));
      return;
    }
    if (variantRef.current !== "type6") return;
    const micStream = mediaStreamRef.current;
    if (!micStream || livekitRoomRef.current) return;
    void connectLiveKitTurnDetector(micStream, (value) => {
      livekitEotRef.current = { value, at: Date.now() };
    }).then((room) => {
      livekitRoomRef.current = room;
    });
  }, []);

  return [
    state,
    {
      connect,
      disconnect,
      resume,
      getMediaStream,
      mute,
      isMuted,
      prepareResearch,
      pushHumanSignals,
      setLiveKitTurnDetectorEnabled,
    },
  ];
}
