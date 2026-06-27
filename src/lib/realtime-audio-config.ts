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

export async function requestMicrophoneStream(): Promise<MediaStream> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    throw new Error("マイクはブラウザ上でのみ利用できます");
  }

  if (!window.isSecureContext) {
    throw new Error(
      "マイクを利用するには HTTPS または localhost で開く必要があります"
    );
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "このブラウザではマイク取得APIを利用できません。Safari/Chromeの最新版、またはlocalhost/HTTPSで開いてください"
    );
  }

  return navigator.mediaDevices.getUserMedia(buildMicrophoneConstraints());
}

interface ServerVadTurnDetection {
  type: "server_vad";
  threshold: number;
  prefixPaddingMs: number;
  silenceDurationMs: number;
  createResponse?: boolean;
  interruptResponse?: boolean;
}

interface SemanticVadTurnDetection {
  type: "semantic_vad";
  eagerness: RealtimeVadEagerness;
  createResponse?: boolean;
  interruptResponse?: boolean;
}

export type RealtimeTurnDetectionConfig =
  | ServerVadTurnDetection
  | SemanticVadTurnDetection;

export function buildRealtimeTurnDetectionConfig({
  mode,
  silenceDurationMs,
  eagerness,
  createResponse,
  interruptResponse,
}: {
  mode: RealtimeTurnDetectionMode;
  silenceDurationMs: number;
  eagerness: RealtimeVadEagerness;
  /**
   * When false, the model still detects turn boundaries and transcribes the
   * interviewee, but does NOT auto-generate a response. The host then drives
   * each turn (e.g. by calling an external reasoning model). Omit to keep the
   * default behavior (auto-respond).
   */
  createResponse?: boolean;
  interruptResponse?: boolean;
}): RealtimeTurnDetectionConfig {
  const responseControl = {
    ...(createResponse !== undefined ? { createResponse } : {}),
    ...(interruptResponse !== undefined ? { interruptResponse } : {}),
  };

  if (mode === "semantic_vad") {
    return {
      type: "semantic_vad",
      eagerness,
      ...responseControl,
    };
  }

  return {
    type: "server_vad",
    threshold: 0.5,
    prefixPaddingMs: 300,
    silenceDurationMs,
    ...responseControl,
  };
}

export function buildRealtimeInputAudioConfig({
  transcriptionModel,
  turnDetection,
  transcriptionPrompt,
}: {
  transcriptionModel: string;
  turnDetection: RealtimeTurnDetectionConfig;
  /**
   * Optional vocabulary hint biasing the transcription model toward domain
   * terms (e.g. "RAG", "LLM") so they are not garbled into common words.
   */
  transcriptionPrompt?: string;
}) {
  const trimmedPrompt = transcriptionPrompt?.trim();
  return {
    noiseReduction: {
      type: "near_field" as const,
    },
    transcription: {
      model: transcriptionModel,
      ...(trimmedPrompt ? { prompt: trimmedPrompt } : {}),
    },
    turnDetection,
  };
}
