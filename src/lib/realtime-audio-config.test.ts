import { describe, expect, it } from "vitest";

import {
  buildMicrophoneConstraints,
  buildRealtimeInputAudioConfig,
  buildRealtimeTurnDetectionConfig,
} from "./realtime-audio-config";

describe("realtime audio config helpers", () => {
  it("enables browser-side audio cleanup for microphone capture", () => {
    expect(buildMicrophoneConstraints()).toEqual({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  });

  it("builds a server_vad turn detection config when mode is server_vad", () => {
    expect(
      buildRealtimeTurnDetectionConfig({
        mode: "server_vad",
        silenceDurationMs: 1000,
        eagerness: "medium",
      })
    ).toEqual({
      type: "server_vad",
      threshold: 0.5,
      prefixPaddingMs: 300,
      silenceDurationMs: 1000,
    });
  });

  it("builds a semantic_vad turn detection config when mode is semantic_vad", () => {
    expect(
      buildRealtimeTurnDetectionConfig({
        mode: "semantic_vad",
        silenceDurationMs: 1000,
        eagerness: "low",
      })
    ).toEqual({
      type: "semantic_vad",
      eagerness: "low",
    });
  });

  it("enables near-field noise reduction and embeds the provided turnDetection", () => {
    const turnDetection = buildRealtimeTurnDetectionConfig({
      mode: "server_vad",
      silenceDurationMs: 1000,
      eagerness: "medium",
    });
    expect(
      buildRealtimeInputAudioConfig({
        transcriptionModel: "gpt-4o-transcribe",
        turnDetection,
      })
    ).toEqual({
      noiseReduction: {
        type: "near_field",
      },
      transcription: {
        model: "gpt-4o-transcribe",
      },
      turnDetection: {
        type: "server_vad",
        threshold: 0.5,
        prefixPaddingMs: 300,
        silenceDurationMs: 1000,
      },
    });
  });

  it("forwards a semantic_vad turnDetection without altering it", () => {
    const turnDetection = buildRealtimeTurnDetectionConfig({
      mode: "semantic_vad",
      silenceDurationMs: 1000,
      eagerness: "high",
    });
    expect(
      buildRealtimeInputAudioConfig({
        transcriptionModel: "gpt-4o-transcribe",
        turnDetection,
      }).turnDetection
    ).toEqual({
      type: "semantic_vad",
      eagerness: "high",
    });
  });
});
