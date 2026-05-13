import { describe, expect, it } from "vitest";

import {
  buildInworldRealtimeSessionConfig,
  getInworldRealtimeInitialMessage,
  INWORLD_REALTIME_FALLBACK_LLM_MODEL,
  INWORLD_REALTIME_LLM_MODEL,
  INWORLD_STT_MODEL,
  INWORLD_TTS_LANGUAGE,
  INWORLD_TTS_MODEL,
} from "./inworld-realtime-config";

describe("inworld realtime config", () => {
  it("defaults Type 3 to GPT-4.1 mini with Japanese Inworld TTS-2", () => {
    expect(INWORLD_REALTIME_LLM_MODEL).toBe("openai/gpt-4.1-mini");
    expect(INWORLD_REALTIME_FALLBACK_LLM_MODEL).toBe("openai/gpt-4o-mini");
    expect(INWORLD_TTS_MODEL).toBe("inworld-tts-2");
    expect(INWORLD_TTS_LANGUAGE).toBe("ja");
    expect(INWORLD_STT_MODEL).toBe("inworld/inworld-stt-1");
  });

  it("builds a low-latency realtime session config", () => {
    const config = buildInworldRealtimeSessionConfig({
      instructions: "You are an interviewer.",
      voice: "Satoshi",
      speed: 1,
      vadEagerness: "high",
    });

    expect(config.model).toBe("openai/gpt-4.1-mini");
    expect(config.output_modalities).toEqual(["audio", "text"]);
    expect(config.outputModalities).toEqual(["audio", "text"]);
    expect(config.audio.output).toEqual({
      model: "inworld-tts-2",
      voice: "Satoshi",
      language: "ja",
      speed: 1,
    });
    expect(config.providerData.audio.output).toEqual({
      model: "inworld-tts-2",
      voice: "Satoshi",
      language: "ja",
      speed: 1,
    });
    expect(config.providerData.audio.input.transcription).toEqual({
      model: "inworld/inworld-stt-1",
    });
    expect(config.audio.input.transcription).toEqual({
      model: "inworld/inworld-stt-1",
    });
    expect(config.audio.input.turn_detection).toMatchObject({
      type: "semantic_vad",
      eagerness: "high",
      create_response: true,
      interrupt_response: true,
    });
    expect(config.providerData.audio.input.turn_detection).toMatchObject({
      type: "semantic_vad",
      eagerness: "high",
      create_response: true,
      interrupt_response: true,
    });
  });

  it("builds an explicit initial message to start the Type 3 interview", () => {
    const message = getInworldRealtimeInitialMessage("general");

    expect(message).toContain("インタビューを開始してください");
    expect(message).toContain("本日はお話を伺えることを楽しみにしていました");
    expect(message).toContain("今日はいい感じだな");
  });
});
