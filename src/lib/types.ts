export type InterviewMode = "auto" | "support" | "online_support";
export type InterviewProvider =
  | "openai"
  | "gemini"
  | "inworld"
  | "wellbeing"
  | "natural"
  | "natural2";
export type RealtimeVoice =
  | "marin"
  | "cedar"
  | "alloy"
  | "ash"
  | "ballad"
  | "coral"
  | "echo"
  | "sage"
  | "shimmer"
  | "verse";
export type GeminiLiveVoice = "Kore" | "Puck" | "Aoede" | "Orus" | "Leda";
export type InworldRealtimeVoice = "Asuka" | "Haruto" | "Hina" | "Satoshi";
export type InterviewVoice =
  | RealtimeVoice
  | GeminiLiveVoice
  | InworldRealtimeVoice;
export type RealtimeSpeedPreset = "slow" | "normal" | "fast";
export type RealtimeTonePreset = "calm" | "bright" | "soft" | "firm";
export type RealtimeSpeechStylePreset = "standard" | "kansai";
export type NaturalVoiceTtsProvider = "elevenlabs" | "fish";
export type NaturalVoiceBrainModel =
  | "gemini-3.5-flash"
  | "claude-fable-5"
  | "gpt-5.5"
  | "claude-opus-4-8";
export type ServerVadSilenceDurationMs = 300 | 500 | 800 | 1200 | 1500;
export type InworldRealtimeVadEagerness = "low" | "medium" | "high";
export type RealtimeTurnDetectionMode = "server_vad" | "semantic_vad";
export type RealtimeVadEagerness = "low" | "medium" | "high";
export interface RealtimeSessionStyleContext {
  speechStyle?: RealtimeSpeechStylePreset;
  tone?: RealtimeTonePreset;
}

export type Sentiment = "positive" | "neutral" | "negative";

export type EmotionLabel =
  | "enthusiastic"
  | "confident"
  | "nervous"
  | "hesitant"
  | "disengaged"
  | "neutral";

export interface EmotionState {
  excitement: number;
  nervousness: number;
  confidence: number;
  engagement: number;
  label: EmotionLabel;
  timestamp: number;
}

/**
 * Type 6 only. The fused estimate produced by the Human State Engine from
 * VAD, the LiveKit turn detector, audio features, and emotion. All scores are
 * 0..1. `recommendedAction` is a soft hint; the Response Orchestrator owns the
 * final decision (cooldowns, suppression, speaking state).
 */
export interface HumanState {
  /** Confidence that the interviewee has actually finished their turn. */
  endOfTurn: number;
  /** How strongly we should keep waiting (high while thinking / mid-thought). */
  waitScore: number;
  /** Likelihood the interviewee is mid-thought (hesitation / trailing pause). */
  thinking: number;
  /** Latest emotion estimate, if fresh. */
  emotion: EmotionState | null;
  /** Engagement 0..1 (passed through from emotion when available). */
  engagement: number;
  /** Soft suggestion; the orchestrator may override it. */
  recommendedAction: OrchestratorActionKind;
  updatedAt: number;
  /** Per-signal explainability for the debug panel. */
  signals: {
    openAiVad: HumanStateSignalContribution;
    livekit: HumanStateSignalContribution;
    audio: HumanStateSignalContribution;
    emotion: HumanStateSignalContribution;
  };
  /** Raw derived prosodic/transcript features (debug + tuning). */
  features: {
    silenceMs: number | null;
    /** Characters per second of the latest speech segment. */
    speechRate: number | null;
    /** Filler ("えーと"/"あのー"…) occurrences in the pending utterance. */
    fillerCount: number;
    /** Recent pitch range in Hz. */
    pitchRange: number | null;
    /** Recent loudness trend, -1 (falling) .. 1 (rising). */
    volumeTrend: number | null;
  };
}

/** Debug view of one signal's freshness-adjusted contribution to endOfTurn. */
export interface HumanStateSignalContribution {
  /** Whether the signal was present and fresh enough to count. */
  active: boolean;
  /** Freshness weight 0..1 after staleness decay. */
  weight: number;
  /** The signal's own end-of-turn estimate 0..1 (null when inactive). */
  value: number | null;
  /** Age in ms of the signal at evaluation time (null when never set). */
  ageMs: number | null;
}

export type OrchestratorActionKind =
  | "WAIT"
  | "BACKCHANNEL"
  | "EMPATHY"
  | "FOLLOW_UP";

/**
 * Type 6 only. The Response Orchestrator's decision for the current tick.
 * BACKCHANNEL/EMPATHY carry a templated `phrase` to speak immediately via TTS;
 * FOLLOW_UP releases the reasoning brain; WAIT does nothing.
 */
export interface OrchestratorAction {
  kind: OrchestratorActionKind;
  reason: string;
  /** Phrase to speak for BACKCHANNEL / EMPATHY. */
  phrase?: string;
}

export interface InterviewQuestion {
  id: string;
  text: string;
  topic: string;
  followUps: Record<string, string>;
}

export interface InterviewScenario {
  id: string;
  title: string;
  description: string;
  topics: InterviewTopic[];
}

export interface InterviewTopic {
  id: string;
  name: string;
  questions: InterviewQuestion[];
}

export interface AudioFeatures {
  rms: number;
  energy: number;
  spectralCentroid: number;
  spectralFlatness: number;
  zcr: number;
  loudness: number;
  pitch: number | null;
  timestamp: number;
}

export interface SpeechAudioMetrics {
  avgPitch: number | null;
  maxPitch: number | null;
  minPitch: number | null;
  pitchRange: number | null;
  avgEnergy: number;
  maxEnergy: number;
  avgLoudness: number;
  avgSpectralCentroid: number;
  excitementScore: number;
  sampleCount: number;
}

export interface TranscriptEntry {
  id: string;
  role: "interviewer" | "interviewee";
  text: string;
  timestamp: number;
  audioFeatures?: Partial<AudioFeatures>;
  speechMetrics?: SpeechAudioMetrics;
  emotionState?: EmotionState;
  sentiment?: Sentiment;
  speaker?: string;
}

export interface InterviewResult {
  id: string;
  scenario: string;
  mode: InterviewMode;
  startedAt: number;
  endedAt?: number;
  transcript: TranscriptEntry[];
  audioAnalysis: AudioFeatures[];
  emotionTimeline?: EmotionState[];
  summary?: string;
}

export interface BranchDecision {
  nextQuestionId: string;
  reason: string;
  nextQuestionText?: string;
  suggestedTopic?: string;
  shouldHandoff: boolean;
  handoffTarget?: string;
}

export interface SessionState {
  isConnected: boolean;
  isRecording: boolean;
  currentAgent: string;
  currentQuestionIndex: number;
  currentTopic: string;
  transcript: TranscriptEntry[];
  audioFeatures: AudioFeatures | null;
  audioHistory: AudioFeatures[];
}
