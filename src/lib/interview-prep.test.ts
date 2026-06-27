import { describe, expect, it } from "vitest";
import {
  buildFallbackSkeleton,
  buildPrepMessages,
  buildResearchAnchorsFromSkeleton,
  buildSkeletonInstructions,
  filterSkeletonToSource,
  isSkeletonGrounded,
} from "./interview-prep";

describe("interview prep helpers", () => {
  it("asks research to extract philosophy-led opening material", () => {
    const messages = buildPrepMessages(
      "https://example.com",
      "私たちは、誰もが迷わず使える体験を大切にしています。"
    );

    const systemPrompt = messages[0].content;

    expect(systemPrompt).toContain("ミッション");
    expect(systemPrompt).toContain("顧客にどうなってほしいか");
    expect(systemPrompt).toContain("会社らしい思想");
    expect(systemPrompt).toContain("冒頭質問候補");
  });

  it("renders philosophy hooks into skeleton instructions", () => {
    const instructions = buildSkeletonInstructions({
      ...buildFallbackSkeleton("https://example.com"),
      philosophyHooks: {
        mission: ["誰もが迷わず使える体験をつくる"],
        vision: ["人が自然に使えるサービスを広げる"],
        customerPromise: ["操作の不安を減らす"],
        distinctiveWords: ["迷わない体験"],
        philosophyQuestions: [
          "迷わない体験を大切にするようになった背景は何ですか？",
        ],
        openingQuestionCandidates: [
          "サイトで拝見した『迷わない体験』という言葉が印象的でした。",
        ],
      },
    });

    expect(instructions).toContain("理念・哲学の取っかかり");
    expect(instructions).toContain("誰もが迷わず使える体験");
    expect(instructions).toContain("冒頭質問候補");
    expect(instructions).toContain("迷わない体験");
  });

  it("prepends a no-fabrication warning when research fell back", () => {
    const instructions = buildSkeletonInstructions(
      buildFallbackSkeleton("https://example.com"),
      { usedFallback: true }
    );

    expect(instructions).toContain("サイト本文を取得できなかった");
    expect(instructions).toContain("引用は絶対にしない");
  });

  it("forbids inventing quotes and missions in the prep prompt", () => {
    const systemPrompt = buildPrepMessages("https://example.com", "本文")[0]
      .content;
    expect(systemPrompt).toContain("逐語引用");
  });

  it("drops fabricated quotes while keeping verbatim ones", () => {
    const pageText =
      "AIの可能性を、デザインの力で解き放つ。テクノロジーと感性が交差する、次世代のクリエイティブファーム。";
    const skeleton = {
      ...buildFallbackSkeleton("https://example.com"),
      ceoName: "安井太郎",
      articleHooks: {
        ...buildFallbackSkeleton("https://example.com").articleHooks,
        leaderQuotes: ["AIの可能性を、デザインの力で解き放つ"],
      },
      philosophyHooks: {
        mission: [
          "意志ある個人を増やし、社会の変革を加速させる",
          "AIの可能性を、デザインの力で解き放つ。",
        ],
        vision: [],
        customerPromise: ["顧客の不安を減らす"],
        distinctiveWords: ["次世代のクリエイティブファーム"],
        philosophyQuestions: [],
        openingQuestionCandidates: [
          "サイトで「すべての個性が、美しく輝く社会を創る」という言葉を拝見しました。",
          "サイトの「AIの可能性を、デザインの力で解き放つ」という言葉が印象的でした。",
          "御社が大切にしている考え方を教えてください。",
        ],
      },
    };

    const filtered = filterSkeletonToSource(skeleton, pageText);

    // Fabricated mission and CEO name are gone; verbatim material survives.
    expect(filtered.philosophyHooks.mission).toEqual([
      "AIの可能性を、デザインの力で解き放つ。",
    ]);
    expect(filtered.ceoName).toBe("");
    expect(filtered.articleHooks.leaderQuotes).toEqual([
      "AIの可能性を、デザインの力で解き放つ",
    ]);
    expect(filtered.philosophyHooks.distinctiveWords).toEqual([
      "次世代のクリエイティブファーム",
    ]);
    // Opening questions keep paraphrases but lose ones quoting invented copy.
    expect(filtered.philosophyHooks.openingQuestionCandidates).toEqual([
      "サイトの「AIの可能性を、デザインの力で解き放つ」という言葉が印象的でした。",
      "御社が大切にしている考え方を教えてください。",
    ]);
    // Non-quote inference fields are untouched.
    expect(filtered.philosophyHooks.customerPromise).toEqual([
      "顧客の不安を減らす",
    ]);
  });

  it("matches quotes despite whitespace and punctuation drift", () => {
    const pageText = "未来を\n実装する テクノロジーと感性が交差する";
    const skeleton = {
      ...buildFallbackSkeleton("https://example.com"),
      philosophyHooks: {
        ...buildFallbackSkeleton("https://example.com").philosophyHooks,
        mission: ["未来を実装する"],
        distinctiveWords: ["テクノロジーと感性が、交差する。"],
      },
    };

    const filtered = filterSkeletonToSource(skeleton, pageText);

    expect(filtered.philosophyHooks.mission).toEqual(["未来を実装する"]);
    expect(filtered.philosophyHooks.distinctiveWords).toEqual([
      "テクノロジーと感性が、交差する。",
    ]);
  });

  it("drops businesses and anchor items naming ungrounded products", () => {
    const pageText =
      "NLP, Inc.はAIソリューション開発とWebシステム開発を行う会社です。AIチャットによるリード獲得を支援します。";
    const base = buildFallbackSkeleton("https://example.com");
    const filtered = filterSkeletonToSource(
      {
        ...base,
        companySummary:
          "AIソリューション開発を行う会社です。AIsmileyというメディアも運営しています。",
        businesses: [
          { name: "AIチャットによるリード獲得", description: "" },
          { name: "AIsmiley", description: "AIポータルメディア" },
        ],
        articleHooks: {
          ...base.articleHooks,
          recentInitiatives: [
            "AIチャットによるリード獲得支援",
            "AIsmileyでのAI製品比較サービス",
          ],
        },
      },
      pageText
    );

    expect(filtered.businesses.map((b) => b.name)).toEqual([
      "AIチャットによるリード獲得",
    ]);
    expect(filtered.articleHooks.recentInitiatives).toEqual([
      "AIチャットによるリード獲得支援",
    ]);
    expect(filtered.companySummary).toBe(
      "AIソリューション開発を行う会社です。"
    );
  });

  it("drops inference items whose embedded quotes are fabricated", () => {
    const pageText =
      "NLP, Inc.はAIソリューション開発を行う会社です。世界中の「伝えたい」を「伝わる」に変える会社です。";
    const base = buildFallbackSkeleton("https://example.com");
    const filtered = filterSkeletonToSource(
      {
        ...base,
        philosophyHooks: {
          ...base.philosophyHooks,
          customerPromise: [
            "世界中の「伝えたい」を「伝わる」に変えること",
            "「うつわに関わるすべての人々を幸せにする」という約束",
          ],
        },
      },
      pageText
    );

    // The item embedding a quote that is not verbatim on the page is gone;
    // the one whose quotes are real survives.
    expect(filtered.philosophyHooks.customerPromise).toEqual([
      "世界中の「伝えたい」を「伝わる」に変えること",
    ]);
  });

  it("detects skeletons describing a different company", () => {
    const pageText =
      "NLP, Inc. | Beyond Intelligence AIの可能性を、デザインの力で解き放つ。";
    const grounded = {
      ...buildFallbackSkeleton("https://example.com"),
      companyName: "NLP, Inc.",
    };
    const contaminated = {
      ...buildFallbackSkeleton("https://example.com"),
      companyName: "株式会社NLPラーニング",
    };
    const unnamed = {
      ...buildFallbackSkeleton("https://example.com"),
      companyName: "",
    };

    expect(isSkeletonGrounded(grounded, pageText)).toBe(true);
    expect(isSkeletonGrounded(contaminated, pageText)).toBe(false);
    expect(isSkeletonGrounded(unnamed, pageText)).toBe(true);
  });

  it("flattens the skeleton into typed, deduped research anchors", () => {
    const anchors = buildResearchAnchorsFromSkeleton({
      ...buildFallbackSkeleton("https://example.com"),
      businesses: [{ name: "画像検索アプリ", description: "現場の写真を探す" }],
      values: ["人を大切にする"],
      past: {
        foundingStory: "雑誌編集で台割を作っていた前職",
        formativeThemes: [],
      },
      future: { vision: ["人が自然に力を発揮できる未来"], bets: [] },
      connections: [],
      philosophyHooks: {
        mission: ["知性のその先へ"],
        vision: [],
        customerPromise: ["操作の不安を減らす"],
        distinctiveWords: ["知性のその先へ"],
        philosophyQuestions: [],
        openingQuestionCandidates: [],
      },
    });

    expect(anchors).toContainEqual({
      kind: "business",
      text: "画像検索アプリ（現場の写真を探す）",
    });
    expect(anchors).toContainEqual({
      kind: "foundingStory",
      text: "雑誌編集で台割を作っていた前職",
    });
    expect(anchors).toContainEqual({
      kind: "customerPromise",
      text: "操作の不安を減らす",
    });
    // "知性のその先へ" appears in both mission and distinctiveWords -> deduped.
    expect(
      anchors.filter((anchor) => anchor.text === "知性のその先へ")
    ).toHaveLength(1);
  });
});
