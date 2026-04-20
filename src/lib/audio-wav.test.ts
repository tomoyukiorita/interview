import { describe, expect, it } from "vitest";

import { encodePcm16Wav } from "./audio-wav";

describe("encodePcm16Wav", () => {
  it("wraps PCM16 chunks in a WAV header", () => {
    const chunkA = new Uint8Array([1, 0, 255, 127]);
    const chunkB = new Uint8Array([0, 128, 2, 0]);

    const wav = encodePcm16Wav([chunkA, chunkB], 16000);

    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.slice(8, 12))).toBe("WAVE");

    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(chunkA.length + chunkB.length);
  });

  it("returns only the WAV header when there is no audio data", () => {
    const wav = encodePcm16Wav([], 48000);

    expect(wav.byteLength).toBe(44);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.slice(36, 40))).toBe("data");
  });
});
