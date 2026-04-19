export function buildMicrophoneConstraints(): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  };
}

export function buildRealtimeInputAudioConfig({
  transcriptionModel,
  silenceDurationMs,
}: {
  transcriptionModel: string;
  silenceDurationMs: number;
}) {
  return {
    noiseReduction: {
      type: "near_field" as const,
    },
    transcription: {
      model: transcriptionModel,
    },
    turnDetection: {
      type: "server_vad" as const,
      threshold: 0.5,
      prefixPaddingMs: 300,
      silenceDurationMs,
    },
  };
}
