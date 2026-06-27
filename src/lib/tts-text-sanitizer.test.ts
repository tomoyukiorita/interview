import { describe, expect, it } from "vitest";
import {
  buildProperNounAllowlist,
  QuoteGroundingGuard,
  classifyAssistantSentence,
  filterAssistantTextForDisplay,
  getUnspokenAssistantText,
  scrubNamePlaceholders,
  scrubUngroundedProperNouns,
  shouldSkipQueuedTtsText,
  sanitizeTtsText,
} from "./tts-text-sanitizer";

describe("scrubUngroundedProperNouns", () => {
  const allowlist = buildProperNounAllowlist([
    "NLP, Inc. | Beyond Intelligence AIソリューション開発",
    "回答者: ChatGPTがリリースされた時に衝撃を受けました",
  ]);

  it("replaces a quoted hallucinated product name with a generic reference", () => {
    const result = scrubUngroundedProperNouns(
      "現在提供されている「AIsmiley」というプラットフォームにおいて、想いが表れた瞬間は？",
      allowlist
    );
    expect(result.text).toBe(
      "現在提供されているそのプラットフォームにおいて、想いが表れた瞬間は？"
    );
    expect(result.removed).toEqual(["AIsmiley"]);
  });

  it("replaces a bare hallucinated name", () => {
    const result = scrubUngroundedProperNouns(
      "Salesforceの導入はいつでしたか？",
      allowlist
    );
    expect(result.text).toBe("御社のプロダクトの導入はいつでしたか？");
    expect(result.removed).toEqual(["Salesforce"]);
  });

  it("keeps names grounded in research or conversation", () => {
    const result = scrubUngroundedProperNouns(
      "「Beyond Intelligence」という言葉と、ChatGPTの衝撃はつながっていますか？",
      allowlist
    );
    expect(result.text).toBe(
      "「Beyond Intelligence」という言葉と、ChatGPTの衝撃はつながっていますか？"
    );
    expect(result.removed).toEqual([]);
  });

  it("keeps generic tech vocabulary and short tokens", () => {
    const result = scrubUngroundedProperNouns(
      "WebサイトのKPIやSEOはAIで改善できますか？",
      allowlist
    );
    expect(result.removed).toEqual([]);
    expect(result.text).toBe("WebサイトのKPIやSEOはAIで改善できますか？");
  });
});

describe("QuoteGroundingGuard", () => {
  const research =
    "ミッション・存在意義: 「機能の向こうに、笑顔を描く。」 NLP, Inc. Beyond Intelligence AIソリューション開発";

  const run = (guard: QuoteGroundingGuard, deltas: string[]) => {
    let out = "";
    for (const delta of deltas) out += guard.push(delta);
    out += guard.finalize();
    return out;
  };

  it("replaces a fabricated site-attributed mission with a real research quote", () => {
    const scrubbed: string[] = [];
    const guard = new QuoteGroundingGuard({
      allowlistTexts: [research],
      replacementQuote: "機能の向こうに、笑顔を描く。",
      onScrub: (quote) => scrubbed.push(quote),
    });
    const out = run(guard, [
      "ホームページを拝見したのですが、掲げられている「すべての人が自分の可能性を信じられる",
      "社会をつくる」というミッションがとても印象に残りました。",
    ]);
    expect(out).toBe(
      "ホームページを拝見したのですが、掲げられている「機能の向こうに、笑顔を描く。」というミッションがとても印象に残りました。"
    );
    expect(scrubbed).toEqual([
      "すべての人が自分の可能性を信じられる社会をつくる",
    ]);
  });

  it("also rewrites later fragments of the scrubbed fabrication", () => {
    const guard = new QuoteGroundingGuard({
      allowlistTexts: [research],
      replacementQuote: "機能の向こうに、笑顔を描く。",
    });
    const out = run(guard, [
      "サイトに掲げられている「すべての人が自分の可能性を信じられる社会をつくる」というミッションが印象的でした。",
      "この「自分の可能性を信じられる」という言葉は、どんな原体験と結びついていますか。",
    ]);
    expect(out).toContain(
      "この「機能の向こうに、笑顔を描く。」という言葉は、どんな原体験と結びついていますか。"
    );
    expect(out).not.toContain("可能性を信じられる");
  });

  it("keeps quotes that exist verbatim in the research", () => {
    const guard = new QuoteGroundingGuard({
      allowlistTexts: [research],
      replacementQuote: "機能の向こうに、笑顔を描く。",
    });
    const out = run(guard, [
      "サイトで拝見した「機能の向こうに、笑顔を描く。」というミッションについて伺います。",
    ]);
    expect(out).toBe(
      "サイトで拝見した「機能の向こうに、笑顔を描く。」というミッションについて伺います。"
    );
  });

  it("keeps ungrounded quotes without site attribution (paraphrase of the interviewee)", () => {
    const guard = new QuoteGroundingGuard({
      allowlistTexts: [research],
      replacementQuote: "機能の向こうに、笑顔を描く。",
    });
    const out = run(guard, [
      "先ほどの「妥協しないで作り切る」という姿勢は、どこから生まれたのでしょうか。",
    ]);
    expect(out).toBe(
      "先ほどの「妥協しないで作り切る」という姿勢は、どこから生まれたのでしょうか。"
    );
  });

  it("keeps quotes grounded in the conversation", () => {
    const guard = new QuoteGroundingGuard({
      allowlistTexts: [research, "回答者: 未来を創造することが核心です"],
      replacementQuote: "機能の向こうに、笑顔を描く。",
    });
    const out = run(guard, [
      "掲げられている「未来を創造する」という言葉について伺います。",
    ]);
    expect(out).toBe(
      "掲げられている「未来を創造する」という言葉について伺います。"
    );
  });

  it("falls back to a generic phrase when no replacement quote exists", () => {
    const guard = new QuoteGroundingGuard({
      allowlistTexts: ["（手がかりなし）"],
    });
    const out = run(guard, [
      "サイトに掲げられている「すべての個性が、美しく輝く社会を創る」というミッションが印象的でした。",
    ]);
    expect(out).toBe(
      "サイトに掲げられている御社の理念というミッションが印象的でした。"
    );
  });

  it("scrubs a fabricated quote framed reportively (〜と伺いました) without site keywords", () => {
    // Regression: the brain quoted another company's pottery mission with
    // 「…」を大切にされていると伺いましたが — no サイト/ミッション word within
    // the lookahead window, so the old attribution regex missed it.
    const scrubbed: string[] = [];
    const guard = new QuoteGroundingGuard({
      allowlistTexts: [research],
      replacementQuote: "機能の向こうに、笑顔を描く。",
      onScrub: (quote) => scrubbed.push(quote),
    });
    const out = run(guard, [
      "リラックスしていただけて良かったです。 「つくり手とつなぎ手、そして使い手という、",
      "うつわに関わるすべての人々を幸せにすること」を大切にされていると伺いましたが、",
      "この「幸せにする」とは、具体的にどのような状態を指しているのでしょうか。",
    ]);
    expect(out).not.toContain("うつわ");
    expect(out).toContain(
      "「機能の向こうに、笑顔を描く。」を大切にされていると伺いましたが"
    );
    // The echoed fragment 「幸せにする」 is also caught as part of the
    // scrubbed fabrication.
    expect(scrubbed).toEqual([
      "つくり手とつなぎ手、そして使い手という、うつわに関わるすべての人々を幸せにすること",
      "幸せにする",
    ]);
  });

  it("keeps an ungrounded topic quote with prospective framing (お伺いしたい)", () => {
    const guard = new QuoteGroundingGuard({
      allowlistTexts: [research],
      replacementQuote: "機能の向こうに、笑顔を描く。",
    });
    const out = run(guard, [
      "「今後の事業の広げ方」についてお伺いしたいのですが、いかがでしょうか。",
    ]);
    expect(out).toBe(
      "「今後の事業の広げ方」についてお伺いしたいのですが、いかがでしょうか。"
    );
  });

  it("flushes an unclosed quote on finalize without scrubbing", () => {
    const guard = new QuoteGroundingGuard({
      allowlistTexts: [research],
    });
    const out = run(guard, ["最後に「ありがとうございました"]);
    expect(out).toBe("最後に「ありがとうございました");
  });
});

describe("scrubNamePlaceholders", () => {
  it("replaces masked-name references with ご自身", () => {
    expect(
      scrubNamePlaceholders(
        "〇〇さんが考える「可能性の最大化」において、なぜ重要なのでしょうか？"
      )
    ).toBe("ご自身が考える「可能性の最大化」において、なぜ重要なのでしょうか？");
    expect(scrubNamePlaceholders("○○様のお考えを伺いたいです。")).toBe(
      "ご自身のお考えを伺いたいです。"
    );
  });

  it("collapses 〇〇さんご自身 without doubling", () => {
    expect(
      scrubNamePlaceholders("この言葉は、〇〇さんご自身の言葉で表現すると？")
    ).toBe("この言葉は、ご自身の言葉で表現すると？");
  });

  it("drops vocative placeholders entirely", () => {
    expect(
      scrubNamePlaceholders("〇〇さん、そこをもう少し聞かせてください。")
    ).toBe("そこをもう少し聞かせてください。");
    expect(
      scrubNamePlaceholders("ありがとうございます。〇〇さん、その判断の理由は？")
    ).toBe("ありがとうございます。その判断の理由は？");
  });

  it("leaves text without placeholders untouched", () => {
    expect(scrubNamePlaceholders("御社の取り組みについて伺います。")).toBe(
      "御社の取り組みについて伺います。"
    );
  });

  it("is applied inside sanitizeTtsText", () => {
    expect(
      sanitizeTtsText("〇〇さんにとって、その挑戦はどんな意味がありましたか？")
    ).toBe("ご自身にとって、その挑戦はどんな意味がありましたか？");
  });
});

describe("sanitizeTtsText", () => {
  it("removes markdown fences and wrapping quotes", () => {
    expect(sanitizeTtsText("```「最近の仕事について教えてください。」```")).toBe(
      "最近の仕事について教えてください。"
    );
  });

  it("removes leading meta utterances", () => {
    expect(
      sanitizeTtsText(
        "```日本語で話します。大丈夫です。今の質問は、最近の仕事で自分らしい判断だと感じた場面はありますか？```"
      )
    ).toBe("今の質問は、最近の仕事で自分らしい判断だと感じた場面はありますか？");
  });

  it("normalizes well-being variants for Japanese TTS pronunciation", () => {
    expect(sanitizeTtsText("経営者自身のwell-beingを伺います。")).toBe(
      "経営者自身のウェルビーイングを伺います。"
    );
    expect(sanitizeTtsText("wellbeingやwell-bengの話です。")).toBe(
      "ウェルビーイングやウェルビーイングの話です。"
    );
  });

  it("normalizes Well-Working for Japanese TTS pronunciation", () => {
    expect(sanitizeTtsText("Well-Working認証について伺います。")).toBe(
      "ウェルワーキング認証について伺います。"
    );
    expect(sanitizeTtsText("Well Working認証の設計は？")).toBe(
      "ウェルワーキング認証の設計は？"
    );
  });

  it("normalizes Welulu for Japanese TTS pronunciation", () => {
    expect(sanitizeTtsText("Weluluの取り組みについて伺います。")).toBe(
      "ウェルルの取り組みについて伺います。"
    );
    expect(sanitizeTtsText("weluluやWell-Working認証の話です。")).toBe(
      "ウェルルやウェルワーキング認証の話です。"
    );
  });

  it("removes spoken process narration before questions", () => {
    expect(
      sanitizeTtsText(
        "少しだけ整理してから、次の質問をお聞きしますね。仕事終わりの晩酌が、ほっとする時間なんですね。"
      )
    ).toBe("仕事終わりの晩酌が、ほっとする時間なんですね。");
    expect(
      sanitizeTtsText("少しだけ方向づけてから、次の一言をお伝えしますね。")
    ).toBe("");
  });

  it("removes internal steering narration about origins before questions", () => {
    expect(
      sanitizeTtsText(
        "今の切り替え方を起点にして、その意味や原点に少し寄せて聞いてみますね。スポーツニュースで切り替えるんですね。"
      )
    ).toBe("スポーツニュースで切り替えるんですね。");
    expect(
      sanitizeTtsText(
        "その意味や原点に少し寄せて聞いてみますね。最近、それを感じた出来事はありましたか？"
      )
    ).toBe("最近、それを感じた出来事はありましたか？");
    expect(
      sanitizeTtsText(
        "ありがとうございます。今の流れを受けて、次の一歩だけ一緒に見ていきますね。集中して働けた、という手応えが大きいんですね。"
      )
    ).toBe("集中して働けた、という手応えが大きいんですね。");
    expect(
      sanitizeTtsText(
        "今の話を受けて、少しだけ原点のほうをうかがいますね。いつ頃からですか？"
      )
    ).toBe("いつ頃からですか？");
    expect(
      sanitizeTtsText(
        "少しだけ原点のほうをうかがいますね。そういう仕事をおもしろいと感じるようになったのは、いつ頃からですか？"
      )
    ).toBe(
      "そういう仕事をおもしろいと感じるようになったのは、いつ頃からですか？"
    );
    expect(
      sanitizeTtsText(
        "その感触をもう一歩、あなたの内側に寄せて聞いてみますね。社会に出した時の評価を意識するんですね。"
      )
    ).toBe("社会に出した時の評価を意識するんですね。");
    expect(
      sanitizeTtsText(
        "その好奇心に触れながら、少しだけ原点をたどる質問をしますね。好奇心が強いんですね。"
      )
    ).toBe("好奇心が強いんですね。");
    expect(
      sanitizeTtsText(
        "その進め方をそのまま受けて、次の一歩を具体的に聞きますね。頭の中だけで組み立てるんですね。"
      )
    ).toBe("頭の中だけで組み立てるんですね。");
  });

  it("drops meta-planning utterances about how to ask next", () => {
    expect(
      classifyAssistantSentence("少し整理して次の聞き方を考えますね。")
    ).toBe("internalPreamble");
    expect(
      filterAssistantTextForDisplay("少し整理して次の聞き方を考えますね。", {
        final: true,
      })
    ).toEqual({
      visibleText: "",
      pendingText: "",
      hasInternalPreamble: true,
    });
  });

  it("drops the 'organize and ask about the future' internal monologue", () => {
    expect(
      classifyAssistantSentence("その気持ちを一旦整理して未来に向けて質問しますね。")
    ).toBe("internalPreamble");
    // The bridge sentence is stripped, the real question survives.
    expect(
      sanitizeTtsText(
        "ありがとうございます。その気持ちを一旦整理して未来に向けて質問しますね。その考えはどこから来たのですか？"
      )
    ).toBe("その考えはどこから来たのですか？");
  });

  it("drops the 'organize and take the next step' bridge monologue", () => {
    expect(
      classifyAssistantSentence(
        "少し整理して、今の場面から次の一歩をうかがいますね。"
      )
    ).toBe("internalPreamble");
    expect(
      filterAssistantTextForDisplay(
        "少し整理して、今の場面から次の一歩をうかがいますね。",
        { final: true }
      )
    ).toEqual({
      visibleText: "",
      pendingText: "",
      hasInternalPreamble: true,
    });
  });

  it("drops process-narration monologues regardless of the trailing verb", () => {
    const leaked = [
      "少し整理して、考えの根っこに触れられるようにしますね。",
      "少し考えながら、理念の方向に話を上げていきますね。",
      "少し整理して、機能の話から会社としての考えに持ち上げますね。",
    ];
    for (const sentence of leaked) {
      expect(classifyAssistantSentence(sentence)).toBe("internalPreamble");
      expect(
        filterAssistantTextForDisplay(sentence, { final: true })
      ).toEqual({
        visibleText: "",
        pendingText: "",
        hasInternalPreamble: true,
      });
      expect(sanitizeTtsText(sentence)).toBe("");
    }
  });

  it("keeps a real question even after a process-narration clause", () => {
    expect(
      sanitizeTtsText(
        "少し整理して、機能の話から会社としての考えに持ち上げますね。なぜそれを大事にするんですか？"
      )
    ).toBe("なぜそれを大事にするんですか？");
  });

  it("classifies incomplete internal preambles as pending", () => {
    expect(
      classifyAssistantSentence(
        "今の話を足がかりに、少しだけ原点に寄せて聞いてみ"
      )
    ).toBe("pending");
    expect(
      filterAssistantTextForDisplay(
        "今の話を足がかりに、少しだけ原点に寄せて聞いてみ",
        { final: false }
      )
    ).toEqual({
      visibleText: "",
      pendingText: "今の話を足がかりに、少しだけ原点に寄せて聞いてみ",
      hasInternalPreamble: false,
    });
  });

  it("drops preamble-only assistant items", () => {
    expect(
      filterAssistantTextForDisplay(
        "ありがとうございます。では今の話に戻して、少しだけ今の進め方を聞かせてください。",
        { final: true }
      )
    ).toEqual({
      visibleText: "",
      pendingText: "",
      hasInternalPreamble: true,
    });
    expect(
      filterAssistantTextForDisplay("ありがとうございます。", { final: true })
    ).toEqual({
      visibleText: "",
      pendingText: "",
      hasInternalPreamble: true,
    });
    expect(
      filterAssistantTextForDisplay(
        "その一言が出た場面を、判断の瞬間が分かるように少しだけたどらせてください。",
        { final: true }
      )
    ).toEqual({
      visibleText: "",
      pendingText: "",
      hasInternalPreamble: true,
    });
  });

  it("keeps visible reflection and question after preamble filtering", () => {
    expect(
      filterAssistantTextForDisplay(
        "やることがはっきりしていると進めやすいんですね。その感覚は、いつ頃から大事だと思うようになりましたか？",
        { final: false }
      ).visibleText
    ).toBe(
      "やることがはっきりしていると進めやすいんですね。 その感覚は、いつ頃から大事だと思うようになりましたか？"
    );
  });

  it("returns only unspoken assistant text for streaming TTS", () => {
    expect(getUnspokenAssistantText("", "こんにちは。")).toBe("こんにちは。");
    expect(
      getUnspokenAssistantText(
        "こんにちは。",
        "こんにちは。今日は会社の考え方について伺います。"
      )
    ).toBe("今日は会社の考え方について伺います。");
    expect(
      getUnspokenAssistantText(
        "こんにちは。今日は会社の考え方について伺います。",
        "こんにちは。今日は会社の考え方について伺います。"
      )
    ).toBe("");
    expect(
      getUnspokenAssistantText(
        "こんにちは。今日は会社の考え方について伺います。",
        "今日は会社の考え方について伺います。"
      )
    ).toBe("");
  });

  it("skips duplicate or overlapping queued TTS chunks", () => {
    expect(shouldSkipQueuedTtsText([], "こんにちは。")).toBe(false);
    expect(shouldSkipQueuedTtsText(["こんにちは。"], "こんにちは。")).toBe(true);
    expect(
      shouldSkipQueuedTtsText(
        ["こんにちは。今日は理念について伺います。"],
        "今日は理念について伺います。"
      )
    ).toBe(true);
    expect(
      shouldSkipQueuedTtsText(
        ["今日は理念について伺います。"],
        "こんにちは。今日は理念について伺います。"
      )
    ).toBe(true);
    expect(shouldSkipQueuedTtsText(["こんにちは。"], "別の質問です。")).toBe(false);
  });

  it("can detect repeated final text across response boundaries when history is preserved", () => {
    const queuedAcrossResponses = [
      "使いやすさを決める場面で、お客さんのどんな様子を見て、これは変えたほうがいいと判断しましたか？",
    ];

    expect(
      shouldSkipQueuedTtsText(
        queuedAcrossResponses,
        "使いやすさを決める場面で、お客さんのどんな様子を見て、これは変えたほうがいいと判断しましたか？"
      )
    ).toBe(true);
  });
});
