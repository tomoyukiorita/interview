import type {
  RealtimeTurnDetectionMode,
  RealtimeVadEagerness,
} from "./types";

export function buildMicrophoneConstraints(): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };
}

interface ServerVadTurnDetection {
  type: "server_vad";
  threshold: number;
  prefixPaddingMs: number;
  silenceDurationMs: number;
}

interface SemanticVadTurnDetection {
  type: "semantic_vad";
  eagerness: RealtimeVadEagerness;
}

export type RealtimeTurnDetectionConfig =
  | ServerVadTurnDetection
  | SemanticVadTurnDetection;

export function buildRealtimeTurnDetectionConfig({
  mode,
  silenceDurationMs,
  eagerness,
}: {
  mode: RealtimeTurnDetectionMode;
  silenceDurationMs: number;
  eagerness: RealtimeVadEagerness;
}): RealtimeTurnDetectionConfig {
  if (mode === "semantic_vad") {
    return {
      type: "semantic_vad",
      eagerness,
    };
  }

  return {
    type: "server_vad",
    threshold: 0.5,
    prefixPaddingMs: 300,
    silenceDurationMs,
  };
}

export function buildRealtimeInputAudioConfig({
  transcriptionModel,
  turnDetection,
}: {
  transcriptionModel: string;
  turnDetection: RealtimeTurnDetectionConfig;
}) {
  return {
    noiseReduction: {
      type: "near_field" as const,
    },
    transcription: {
      model: transcriptionModel,
    },
    turnDetection,
  };
}
