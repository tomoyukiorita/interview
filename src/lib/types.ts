export type InterviewMode = "auto" | "support" | "online_support";
export type InterviewProvider = "openai" | "gemini";
export type RealtimeVoice = "cedar" | "marin";
export type GeminiLiveVoice = "Kore" | "Puck" | "Aoede" | "Orus" | "Leda";
export type InterviewVoice = RealtimeVoice | GeminiLiveVoice;
export type RealtimeSpeedPreset = "slow" | "normal" | "fast";
export type RealtimeTonePreset = "calm" | "bright" | "soft" | "firm";
export type RealtimeSpeechStylePreset = "standard" | "kansai";
export type ServerVadSilenceDurationMs = 300 | 500 | 800 | 1200 | 1500;
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
