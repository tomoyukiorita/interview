import { describe, expect, it } from "vitest";

import {
  advanceBrainClock,
  BrainStreamSplitter,
  buildBrainMessages,
  countFillers,
  createBrainClock,
  endsMidThought,
  endsWithHesitation,
  ICEBREAK_TEXT,
  isFillerOnly,
  SingleTurnGuard,
} from "./interview-brain";

describe("interview brain chapter clock", () => {
  it("starts in the philosophy chapter", () => {
    expect(createBrainClock()).toEqual({
      chapter: "philosophy",
      turnsInChapter: 0,
    });
  });

  it("opens in philosophy and eventually lifts after the budget on rich answers", () => {
    let state = createBrainClock();
    const richAnswer =
      "私たちは効率より、使う人の体験を一番大事にしています。理由はいくつもあります。";

    // The first advance follows the icebreak reply: always opens philosophy.
    let step = advanceBrainClock(state, richAnswer);
    state = step.state;
    expect(step.chapter).toBe("philosophy");
    expect(step.state.turnsInChapter).toBe(1);

    // Keep answering richly until the clock climbs out of philosophy.
    let guard = 0;
    while (step.chapter === "philosophy" && guard < 10) {
      step = advanceBrainClock(state, richAnswer);
      state = step.state;
      guard += 1;
    }
    expect(step.chapter).toBe("origin");
    expect(step.hint).toContain("章を移す");
  });

  it("never lifts on the opening turn, even for a short/negative reply", () => {
    // The icebreak reply ("終わりました") must not skip the philosophy chapter.
    const step = advanceBrainClock(createBrainClock(), "終わりました");
    expect(step.chapter).toBe("philosophy");
    expect(step.state.turnsInChapter).toBe(1);
  });

  it("lifts on a short or negative answer after the opening turn", () => {
    let state = createBrainClock();
    // Opening turn (stays philosophy).
    state = advanceBrainClock(state, "よろしくお願いします").state;
    // A genuine weak answer now lifts to the next chapter.
    const step = advanceBrainClock(state, "特にないです");
    expect(step.chapter).toBe("origin");
  });

  it("settles into the closing chapter and stays there", () => {
    let state = createBrainClock();
    for (let i = 0; i < 20; i += 1) {
      const step = advanceBrainClock(state, "特にないです");
      state = step.state;
    }
    expect(state.chapter).toBe("closing");
  });
});

describe("interview brain message builder", () => {
  it("maps interviewer turns to assistant and interviewee turns to user", () => {
    const messages = buildBrainMessages({
      transcript: [
        { role: "interviewer", text: ICEBREAK_TEXT },
        { role: "interviewee", text: "終わりました" },
      ],
      skeletonInstructions: "",
      researchAnchors: [],
      hint: "今は【理念・方針】の章。",
      hypothesis: "",
    });

    const conversation = messages.filter((m) => m.role !== "system");
    expect(conversation).toEqual([
      { role: "assistant", content: ICEBREAK_TEXT },
      { role: "user", content: "終わりました" },
    ]);

    // first message is the system prompt; last is the per-turn directive.
    expect(messages[0].role).toBe("system");
    expect(messages.at(-1)?.role).toBe("system");
    expect(messages.at(-1)?.content).toContain("今は【理念・方針】の章。");
  });

  it("includes research + anchors as system context when provided", () => {
    const messages = buildBrainMessages({
      transcript: [{ role: "interviewee", text: "はい" }],
      skeletonInstructions: "ミッションは技術と人間の共生。",
      researchAnchors: [
        { kind: "mission", text: "Beyond Intelligence" },
        { kind: "distinctiveWord", text: "知性のその先へ" },
      ],
      hint: "",
      hypothesis: "",
    });

    const systemContent = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");
    expect(systemContent).toContain("技術と人間の共生");
    expect(systemContent).toContain("Beyond Intelligence");
    expect(systemContent).toContain("知性のその先へ");
  });

  it("requires the two-part output format in the system prompt", () => {
    const messages = buildBrainMessages({
      transcript: [],
      skeletonInstructions: "",
      researchAnchors: [],
      hint: "",
      hypothesis: "",
    });
    expect(messages[0].content).toContain("仮説:");
    expect(messages[0].content).toContain("---");
  });

  it("carries the previous hypothesis into the per-turn directive", () => {
    const messages = buildBrainMessages({
      transcript: [{ role: "interviewee", text: "はい" }],
      skeletonInstructions: "",
      researchAnchors: [],
      hint: "",
      hypothesis: "技術を概念の書き換えとして信じている人",
    });
    expect(messages.at(-1)?.content).toContain(
      "技術を概念の書き換えとして信じている人"
    );
  });

  it("skips empty transcript turns", () => {
    const messages = buildBrainMessages({
      transcript: [
        { role: "interviewee", text: "  " },
        { role: "interviewer", text: "なぜそれを大事にするんですか？" },
      ],
      skeletonInstructions: "",
      researchAnchors: [],
      hint: "",
      hypothesis: "",
    });
    const conversation = messages.filter((m) => m.role !== "system");
    expect(conversation).toEqual([
      { role: "assistant", content: "なぜそれを大事にするんですか？" },
    ]);
  });

  it("adds Type 6-only natural Japanese question wording guidance", () => {
    const plain = buildBrainMessages({
      transcript: [],
      skeletonInstructions: "",
      researchAnchors: [],
      hint: "",
      hypothesis: "",
    });
    const type6 = buildBrainMessages({
      transcript: [],
      skeletonInstructions: "",
      researchAnchors: [],
      hint: "",
      hypothesis: "",
      meaningSignals: true,
    });

    const plainSystem = plain.map((m) => m.content).join("\n");
    const type6System = type6.map((m) => m.content).join("\n");
    expect(plainSystem).not.toContain("質問文の自然な日本語");
    expect(type6System).toContain("質問文の自然な日本語");
    expect(type6System).toContain("大切にしている手応え");
    expect(type6System).toContain("一番手応えを感じたポイント");
  });
});

describe("endsMidThought", () => {
  it("flags answers that dangle on a connective, even with ASR punctuation", () => {
    const midThought = [
      "やっぱこう、満足してくれたなと感じられるのは、お客さんから良かったよとか。",
      "助かったとか、そういうふうな言葉をかけられたときで、そういう瞬間が",
      "その頃まだインターネットが初期の頃で",
      "考えたんですけれども",
      "ええと",
    ];
    for (const text of midThought) {
      expect(endsMidThought(text), text).toBe(true);
    }
  });

  it("treats cleanly finished sentences as complete", () => {
    const complete = [
      "終わりました。",
      "妥協しないでプロダクトを作っていくっていうところになります。",
      "そういう思いになるようになりました。",
      "特にないです",
      "それは顧客によるんで一概には言えないですね。",
    ];
    for (const text of complete) {
      expect(endsMidThought(text), text).toBe(false);
    }
  });

  it("treats empty text as mid-thought", () => {
    expect(endsMidThought("")).toBe(true);
    expect(endsMidThought("  ")).toBe(true);
  });

  it("treats thinking noises as mid-thought, not as an answer", () => {
    for (const text of ["うーん", "うーん。", "えっと…", "そうですね", "うーん、そうですね"]) {
      expect(endsMidThought(text), text).toBe(true);
      expect(isFillerOnly(text), text).toBe(true);
    }
  });

  it("does not flag real answers as filler", () => {
    for (const text of [
      "妥協しないですかね。",
      "はい。",
      "そうですね、AI事業を始めようと思ったときです。",
    ]) {
      expect(isFillerOnly(text), text).toBe(false);
    }
  });
});

describe("endsWithHesitation", () => {
  it("flags utterances ending on a soft acknowledgment / hesitation", () => {
    const hesitations = [
      "やっぱりお客さんを想像する。あの、そうですね。",
      "課題を見ていきます。えっと",
      "それはですね、うーん。",
      "なるほど、まあ",
      "そうですね",
    ];
    for (const text of hesitations) {
      expect(endsWithHesitation(text), text).toBe(true);
    }
  });

  it("does not flag cleanly finished answers", () => {
    const complete = [
      "本当に使ってもらえる状態のことです。",
      "お客さんの課題を見ていきます。",
      "妥協しないで作り切るところになります。",
      "はい。",
    ];
    for (const text of complete) {
      expect(endsWithHesitation(text), text).toBe(false);
    }
  });

  it("treats empty text as not a hesitation", () => {
    expect(endsWithHesitation("")).toBe(false);
    expect(endsWithHesitation("  ")).toBe(false);
  });
});

describe("countFillers", () => {
  it("counts filler tokens across an utterance", () => {
    expect(countFillers("えーと、そのー、なんだろう、難しいですね")).toBe(3);
    expect(countFillers("あのー、うーん、ええと")).toBe(3);
  });

  it("returns 0 for clean utterances and empty input", () => {
    expect(countFillers("お客さんの課題を見ていきます。")).toBe(0);
    expect(countFillers("")).toBe(0);
  });
});

describe("brain stream splitter", () => {
  it("streams speech immediately and holds back the trailing memo", () => {
    const splitter = new BrainStreamSplitter();
    expect(splitter.push("性能より嘘をつかないことを")).toBe(
      "性能より嘘をつかないことを"
    );
    expect(splitter.push("選んだんですね。なぜですか？\n--")).toBe(
      "選んだんですね。なぜですか？"
    );
    expect(splitter.push("-\n仮説: 誠実さを信じる人")).toBe("");
    expect(splitter.finalize()).toBe("");
    expect(splitter.memo).toBe("誠実さを信じる人");
  });

  it("captures a trailing memo line even when the separator is missing", () => {
    const splitter = new BrainStreamSplitter();
    expect(splitter.push("なぜそこを大事にするんですか？\n仮説: 体験の人")).toBe(
      "なぜそこを大事にするんですか？"
    );
    expect(splitter.finalize()).toBe("");
    expect(splitter.memo).toBe("体験の人");
  });

  it("holds a partially streamed memo marker until it resolves", () => {
    const splitter = new BrainStreamSplitter();
    expect(splitter.push("どんな場面でしたか？\n仮")).toBe(
      "どんな場面でしたか？"
    );
    expect(splitter.push("説: 現場主義の人")).toBe("");
    expect(splitter.finalize()).toBe("");
    expect(splitter.memo).toBe("現場主義の人");
  });

  it("tolerates the legacy memo-first order", () => {
    const splitter = new BrainStreamSplitter();
    expect(splitter.push("仮説: 技術を概念の書き換え")).toBe("");
    expect(splitter.push("として信じている人\n---\n")).toBe("");
    expect(splitter.push("性能より嘘をつかないことを")).toBe(
      "性能より嘘をつかないことを"
    );
    expect(splitter.push("選んだんですね。なぜですか？")).toBe(
      "選んだんですね。なぜですか？"
    );
    expect(splitter.finalize()).toBe("");
    expect(splitter.memo).toBe("技術を概念の書き換えとして信じている人");
  });

  it("survives the separator arriving split across chunks", () => {
    const splitter = new BrainStreamSplitter();
    expect(splitter.push("仮説: 体験を信じる人\n-")).toBe("");
    expect(splitter.push("--")).toBe("");
    expect(splitter.push("\nそこを選んだ理由は何ですか？")).toBe(
      "そこを選んだ理由は何ですか？"
    );
    expect(splitter.memo).toBe("体験を信じる人");
  });

  it("falls back to speaking everything except a leading memo line when the separator is missing", () => {
    const splitter = new BrainStreamSplitter();
    expect(splitter.push("仮説: 使い心地の人\nなぜそこを大事にするんですか？")).toBe(
      ""
    );
    expect(splitter.finalize()).toBe("なぜそこを大事にするんですか？");
    expect(splitter.memo).toBe("使い心地の人");
  });

  it("speaks the whole text when the model output has no memo at all", () => {
    const splitter = new BrainStreamSplitter();
    expect(splitter.push("その考えはどこで生まれたんですか？")).toBe(
      "その考えはどこで生まれたんですか？"
    );
    expect(splitter.finalize()).toBe("");
    expect(splitter.memo).toBe("");
  });
});

describe("single turn guard", () => {
  it("passes a normal 見立て＋質問 turn through unchanged", () => {
    const guard = new SingleTurnGuard();
    const turn =
      "性能より嘘をつかないことを選んだ、ということですね。あえてそこを起点にしたのはなぜですか？";
    expect(guard.push(turn)).toBe(turn);
    expect(guard.isDone).toBe(true);
  });

  it("ends the turn at the first sentence-ending question mark", () => {
    const guard = new SingleTurnGuard();
    expect(guard.push("なるほど、現場主義なんですね。それはどこから来たんですか？")).toBe(
      "なるほど、現場主義なんですね。それはどこから来たんですか？"
    );
    // Anything after the single question is role-play excess and is dropped.
    expect(guard.push("\n回答者: 前職の経験からです。")).toBe("");
    expect(guard.isDone).toBe(true);
  });

  it("ends the turn at a polite question that ends with 。 instead of ？", () => {
    const guard = new SingleTurnGuard();
    const turn =
      "編集の型をそのまま設計の入り口に持ち込んでいるんですね。これは読者の欲しいものを先に見極める、あの感覚に近いのでしょうか。";
    expect(guard.push(turn)).toBe(turn);
    expect(guard.isDone).toBe(true);
  });

  it("drops a role-played answer that follows a 。-ending question", () => {
    const guard = new SingleTurnGuard();
    const roleplay =
      "読まれてはじめて記事になる、という実感と重なっているのでしょうか。はい、重なっていますね。編集時代も施策を打っていました。出して終わりではなく、手を打ち続ける粘りですね。";
    expect(guard.push(roleplay)).toBe(
      "読まれてはじめて記事になる、という実感と重なっているのでしょうか。"
    );
    expect(guard.isDone).toBe(true);
  });

  it("treats a ますか。 ending as the question boundary", () => {
    const guard = new SingleTurnGuard();
    const turn = "重心はそこにあるんですね。きっかけになった出来事はありますか。";
    expect(guard.push(turn)).toBe(turn);
    expect(guard.push("はい、前職の編集です。")).toBe("");
    expect(guard.isDone).toBe(true);
  });

  it("does not treat a ですね。 statement as a question", () => {
    const guard = new SingleTurnGuard();
    expect(guard.push("読者を起点に逆算しているわけですね。")).toBe(
      "読者を起点に逆算しているわけですね。"
    );
    expect(guard.isDone).toBe(false);
  });

  it("trims role-play that continues the dialogue past the first turn", () => {
    const guard = new SingleTurnGuard();
    const roleplay =
      "その線引きで、毎日の何が変わってほしいですか？\n回答者「判断は人に残したいです」\nインタビュアー「なるほど、ではなぜ…」";
    expect(guard.push(roleplay)).toBe("その線引きで、毎日の何が変わってほしいですか？");
    expect(guard.isDone).toBe(true);
  });

  it("trims excess that arrives in a later delta after the boundary", () => {
    const guard = new SingleTurnGuard();
    expect(guard.push("つながってきましたね。")).toBe("つながってきましたね。");
    expect(guard.isDone).toBe(false);
    expect(guard.push("どこで身についた考えですか？")).toBe(
      "どこで身についた考えですか？"
    );
    expect(guard.isDone).toBe(true);
    expect(guard.push("回答者: 雑誌の編集です。")).toBe("");
  });

  it("caps a question-less closing turn after the sentence backstop", () => {
    const guard = new SingleTurnGuard();
    const longClose =
      "一文目です。二文目です。三文目です。四文目です。五文目です。これは超過分で読まれない。";
    const out = guard.push(longClose);
    expect(guard.isDone).toBe(true);
    expect(out).toBe("一文目です。二文目です。三文目です。四文目です。五文目です。");
    expect(out).not.toContain("超過分");
  });

  it("keeps a short closing turn (no question) intact", () => {
    const guard = new SingleTurnGuard();
    const close = "理念と原体験、そして未来が一本につながりましたね。本日はありがとうございました。";
    expect(guard.push(close)).toBe(close);
    expect(guard.isDone).toBe(false);
  });
});
