export type InterviewMode = "auto" | "support";

export type Sentiment = "positive" | "neutral" | "negative";

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
  summary?: string;
}

export interface BranchDecision {
  nextQuestionId: string;
  reason: string;
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
