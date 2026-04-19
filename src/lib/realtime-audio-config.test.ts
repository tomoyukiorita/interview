import { describe, expect, it } from "vitest";

import {
  buildMicrophoneConstraints,
  buildRealtimeInputAudioConfig,
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

  it("enables near-field noise reduction before server VAD", () => {
    expect(
      buildRealtimeInputAudioConfig({
        transcriptionModel: "gpt-4o-transcribe",
        silenceDurationMs: 1000,
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
});
