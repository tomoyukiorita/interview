import { describe, expect, it } from "vitest";
import { JapaneseTtsChunker } from "./japanese-tts-chunker";

describe("JapaneseTtsChunker", () => {
  it("flushes at strong sentence boundaries", () => {
    const chunker = new JapaneseTtsChunker({}, 0);

    expect(chunker.push("こんにちは。", 20)).toEqual(["こんにちは。"]);
  });

  it("flushes a sufficiently long clause at a Japanese comma", () => {
    const chunker = new JapaneseTtsChunker({ minClauseLength: 8 }, 0);

    expect(chunker.push("今のお話を聞いていると、", 30)).toEqual([
      "今のお話を聞いていると、",
    ]);
  });

  it("flushes after idle time when the minimum length is reached", () => {
    const chunker = new JapaneseTtsChunker({ minClauseLength: 8, idleFlushMs: 150 }, 0);

    expect(chunker.push("原体験につながる", 160)).toEqual(["原体験につながる"]);
  });

  it("splits long text at a soft boundary", () => {
    const chunker = new JapaneseTtsChunker({
      minClauseLength: 8,
      maxChunkLength: 18,
    });

    expect(
      chunker.push("御社の新しい事業のお話は、創業期の思いにもつながりますね", 20)
    ).toEqual(["御社の新しい事業のお話は、"]);
  });

  it("flushes remaining text explicitly", () => {
    const chunker = new JapaneseTtsChunker({}, 0);

    expect(chunker.push("少しだけ残る", 10)).toEqual([]);
    expect(chunker.flush(20)).toEqual(["少しだけ残る"]);
  });

  it("does not split Japanese words at arbitrary max length in safe mode", () => {
    const chunker = new JapaneseTtsChunker({
      minClauseLength: 6,
      maxChunkLength: 8,
      preferSafeSplit: true,
    });

    expect(chunker.push("少しだけ時間を", 20)).toEqual([]);
    expect(chunker.flush(30)).toEqual(["少しだけ時間を"]);
  });

  it("prefers punctuation and particle boundaries for long Japanese text", () => {
    const chunker = new JapaneseTtsChunker({
      minClauseLength: 18,
      maxChunkLength: 32,
      preferSafeSplit: true,
    });

    expect(
      chunker.push(
        "その手応えの根っこをたどれるように、少しだけ時間をさかのぼって整理していきますね",
        20
      )
    ).toEqual(["その手応えの根っこをたどれるように、"]);
    expect(chunker.flush(30)).toEqual([
      "少しだけ時間をさかのぼって整理していきますね",
    ]);
  });

  it("does not idle-flush unsafe partial Japanese words in safe mode", () => {
    const chunker = new JapaneseTtsChunker(
      {
        minClauseLength: 2,
        idleFlushMs: 100,
        preferSafeSplit: true,
      },
      0
    );

    expect(chunker.push("時", 120)).toEqual([]);
    expect(chunker.push("間を", 140)).toEqual(["時間を"]);
    expect(chunker.push("少し", 260)).toEqual([]);
  });

  it("splits an overlong sentence before the final punctuation in safe mode", () => {
    const chunker = new JapaneseTtsChunker({
      minClauseLength: 24,
      maxChunkLength: 84,
      idleFlushMs: 320,
      preferSafeSplit: true,
    });

    const chunks = chunker.push(
      "誰にも言えない悩みを抱えて立ちすくんでいる人が、自分の周りにそういう関係を育てていくために、ご自身の経験から「これをやってみるといい」と渡せるヒントがあるとしたら、何でしょうか。",
      20
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toContain(
      "ご自身の経験から「これをやってみるといい」と渡せるヒント"
    );
    expect(chunks.every((chunk) => chunk.length <= 84)).toBe(true);
  });
});
