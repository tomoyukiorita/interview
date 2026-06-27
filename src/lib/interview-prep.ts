import { z } from "zod";
import type { ResearchAnchor } from "./editorial-director";
import {
  buildProperNounAllowlist,
  scrubUngroundedProperNouns,
} from "./tts-text-sanitizer";

export const PREP_MODEL = process.env.INTERVIEW_PREP_MODEL ?? "gpt-4.1-mini";

export const interviewSkeletonSchema = z.object({
  companyName: z.string().default(""),
  companySummary: z.string().default(""),
  ceoName: z.string().default(""),
  values: z.array(z.string()).default([]),
  wellbeingThemes: z.array(z.string()).default([]),
  businesses: z
    .array(
      z.object({
        name: z.string().default(""),
        description: z.string().default(""),
      })
    )
    .default([]),
  past: z
    .object({
      foundingStory: z.string().default(""),
      formativeThemes: z.array(z.string()).default([]),
    })
    .default({ foundingStory: "", formativeThemes: [] }),
  present: z
    .object({
      currentFocus: z.array(z.string()).default([]),
      challenges: z.array(z.string()).default([]),
    })
    .default({ currentFocus: [], challenges: [] }),
  future: z
    .object({
      vision: z.array(z.string()).default([]),
      bets: z.array(z.string()).default([]),
    })
    .default({ vision: [], bets: [] }),
  connections: z.array(z.string()).default([]),
  articleHooks: z
    .object({
      recentInitiatives: z.array(z.string()).default([]),
      productOrServiceAngles: z.array(z.string()).default([]),
      leaderQuotes: z.array(z.string()).default([]),
      cultureSignals: z.array(z.string()).default([]),
      readerQuestions: z.array(z.string()).default([]),
    })
    .default({
      recentInitiatives: [],
      productOrServiceAngles: [],
      leaderQuotes: [],
      cultureSignals: [],
      readerQuestions: [],
    }),
  philosophyHooks: z
    .object({
      mission: z.array(z.string()).default([]),
      vision: z.array(z.string()).default([]),
      customerPromise: z.array(z.string()).default([]),
      distinctiveWords: z.array(z.string()).default([]),
      philosophyQuestions: z.array(z.string()).default([]),
      openingQuestionCandidates: z.array(z.string()).default([]),
    })
    .default({
      mission: [],
      vision: [],
      customerPromise: [],
      distinctiveWords: [],
      philosophyQuestions: [],
      openingQuestionCandidates: [],
    }),
});

export type InterviewSkeleton = z.infer<typeof interviewSkeletonSchema>;

const MAX_PAGE_TEXT_LENGTH = 12000;

export function extractReadableText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, " ");
  const decoded = withoutTags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const collapsed = decoded.replace(/\s+/g, " ").trim();
  return collapsed.slice(0, MAX_PAGE_TEXT_LENGTH);
}

export function buildPrepMessages(url: string, pageText: string) {
  return [
    {
      role: "system" as const,
      content: `あなたは、経営者記事インタビューの事前リサーチャーです。
渡された企業サイトの本文から、その会社の経営者に、読者が知りたい理念・哲学・価値観を聞くための"記事の取っかかり"を作成します。
このリサーチは、インタビュー中ずっと頭に入れておき、相手の発言を事業・プロダクト・現場・顧客/社員の反応・経営判断に紐づけるために使います。
well-beingは主題の一部として扱いますが、内面整理やコーチングのための資料にしないでください。
技術者インタビューではありません。細かい機能やログではなく、ミッション、ビジョン、顧客にどうなってほしいか、会社らしい思想を抽出してください。

必ず日本語で、次のキーを持つ JSON オブジェクトだけを返してください。説明文やマークダウンは付けないこと。

{
  "companyName": "会社名（不明なら推測でよい。空文字も可）",
  "companySummary": "事業内容の2〜3文の要約",
  "ceoName": "社長/経営者の名前（サイトに無ければ空文字。推測で作らない）",
  "values": ["会社が大切にしていそうな価値観", "..."],
  "wellbeingThemes": ["働き方や組織づくりとwell-beingが交わりそうなテーマ", "..."],
  "businesses": [
    { "name": "事業・サービス・プロダクトの固有名", "description": "一言説明" }
  ],
  "past": {
    "foundingStory": "創業の経緯や転機（分かる範囲で。無ければ空文字）",
    "formativeThemes": ["仕事観や事業観の背景になっていそうなテーマ", "..."]
  },
  "present": {
    "currentFocus": ["今力を注いでいそうな取り組み", "..."],
    "challenges": ["今直面していそうな課題", "..."]
  },
  "future": {
    "vision": ["掲げているビジョン・理念・目指す方向", "..."],
    "bets": ["未来への投資・賭け", "..."]
  },
  "connections": ["過去→現在→未来や事業をまたぐ"線"の仮説（例: 創業期の〇〇 → 今の△△事業 → 未来の□□）", "..."],
  "articleHooks": {
    "recentInitiatives": ["最近の取り組み・発表・注力領域", "..."],
    "productOrServiceAngles": ["記事で聞けそうな事業・プロダクトの切り口", "..."],
    "leaderQuotes": ["経営者や会社が発信している言葉（本文にある場合のみ）", "..."],
    "cultureSignals": ["採用・文化・働き方に関する手がかり", "..."],
    "readerQuestions": ["読者が知りたくなりそうな問い", "..."]
  },
  "philosophyHooks": {
    "mission": ["ミッション・存在意義として読み取れる言葉", "..."],
    "vision": ["目指す社会や未来像", "..."],
    "customerPromise": ["顧客にどうなってほしいか、どんな状態を約束しているか", "..."],
    "distinctiveWords": ["会社らしい思想が表れている特徴的な言葉", "..."],
    "philosophyQuestions": ["理念や哲学を掘り起こす質問候補", "..."],
    "openingQuestionCandidates": ["冒頭質問候補。冒頭で使える会社固有の質問候補", "..."]
  }
}

ルール:
- 判断材料は、下に渡すページ本文だけ。社名やドメインに見覚えがあっても、あなたの学習知識にある同名・類似名の会社の情報（ミッション・代表者名・事業内容など）を一切混ぜないこと。本文に書かれていないことは「知らない」として扱う。
- 固有名（会社名・事業名・プロダクト名・人名）は、サイト本文から読み取れる範囲だけにすること。読み取れないものを推測で捏造しない（その場合は空文字や空配列でよい）。
- philosophyHooks の mission / vision / distinctiveWords と articleHooks の leaderQuotes は、本文にある言葉の逐語引用だけにすること。本文に無いキャッチコピーやミッション文を創作したら、それはインタビューで相手に「サイトに〜とありました」と捏造を突きつける事故になる。
- ceoName は本文に明記されている場合のみ。肩書きだけで名前が無ければ空文字。
- values / wellbeingThemes / businesses / 各配列は2〜5個程度。
- past/present/future は、本文から読み取れる手がかりを元に、自然な範囲で推測してよい。手がかりが無ければ空でよい。
- connections は、過去・現在・未来や事業を横断する"気づきの線"の仮説。2〜4個。
- articleHooks は、記事インタビューの取っかかりになる具体素材。各配列は2〜5個程度。
- philosophyHooks は、方針・理念・哲学を掘り起こすための素材。本文にある言葉を優先し、各配列は2〜5個程度。
- openingQuestionCandidates は「サイトで拝見した〇〇という言葉が印象的でした。これは事業を進めるうえで大切な考え方ですか？」のように、汎用質問ではなくリサーチ起点にすること。
- 個人を傷つける内容や評価的な内容は避け、読者に伝わる具体素材にすること。`,
    },
    {
      role: "user" as const,
      content: `対象URL: ${url}

--- 抽出したページ本文 ---
${pageText || "（本文を取得できませんでした。固有名・ミッション・引用はすべて空にして、一般的な構造だけ返してください。創作は厳禁）"}`,
    },
  ];
}

export function buildFallbackSkeleton(url: string): InterviewSkeleton {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    // keep raw url
  }
  return {
    companyName: host,
    companySummary:
      "事前情報を十分に取得できなかったため、一般的な経営者向けwell-beingインタビューとして進めます。",
    ceoName: "",
    values: ["人を大切にする", "誠実さ", "挑戦"],
    wellbeingThemes: [
      "経営者自身の心身の健やかさ",
      "社員のwell-beingと事業成長の両立",
      "意思決定の背景にある価値観",
    ],
    businesses: [],
    past: {
      foundingStory: "",
      formativeThemes: ["この道を選んだ原体験", "影響を受けた人や出来事"],
    },
    present: {
      currentFocus: ["今いちばん力を入れていること", "日々大切にしている習慣"],
      challenges: ["事業と自分・社員の健やかさの両立"],
    },
    future: {
      vision: ["これから実現したい姿", "周囲や社会への広がり"],
      bets: ["未来に向けて投資したいこと"],
    },
    connections: [
      "原体験 → 今の価値観 → これから実現したい未来、という線を一緒に辿る",
    ],
    articleHooks: {
      recentInitiatives: ["最近の仕事で手応えがあった取り組み"],
      productOrServiceAngles: ["事業やプロダクトの現場で起きた具体場面"],
      leaderQuotes: [],
      cultureSignals: ["チームや顧客との関わり方"],
      readerQuestions: [
        "最近の取り組みで、手応えを感じた場面は何か",
        "顧客や周囲の反応を見て、何を変えようと思ったか",
      ],
    },
    philosophyHooks: {
      mission: ["人や社会にとってよい状態をつくる"],
      vision: ["顧客やチームが自然に力を発揮できる未来"],
      customerPromise: ["使う人の不安や負担を減らす"],
      distinctiveWords: ["人を大切にする", "誠実さ", "挑戦"],
      philosophyQuestions: [
        "その体験を大切にしている背景には、どんな考え方がありますか",
        "顧客にどんな状態になってほしいと考えていますか",
      ],
      openingQuestionCandidates: [
        "御社が大切にしている価値観について、まず背景を伺ってもいいですか",
      ],
    },
  };
}

/** Strip whitespace/punctuation so quotes survive minor formatting drift. */
function normalizeForSourceMatch(text: string): string {
  return text
    .replace(/[\s「」『』“”"'’‘、。・,.!?！？:：;；（）()\[\]【】〜～\-ー]/g, "")
    .toLowerCase();
}

/**
 * Deterministic anti-fabrication filter. The prep LLM is told that quote
 * fields (mission, distinctive words, leader quotes, CEO name) must be
 * verbatim from the page text, but weak models still invent plausible
 * missions when the site has none. Drop anything that does not actually
 * appear in the source so fabrications never reach the interview brain.
 */
export function filterSkeletonToSource(
  skeleton: InterviewSkeleton,
  pageText: string
): InterviewSkeleton {
  const source = normalizeForSourceMatch(pageText);
  const isVerbatim = (text: string) => {
    const normalized = normalizeForSourceMatch(text);
    return normalized.length > 0 && source.includes(normalized);
  };
  const keepVerbatim = (items: string[]) => items.filter(isVerbatim);
  // Text may paraphrase, but any 「...」 quote inside it must be real: an
  // invented quote anywhere in the skeleton can end up spoken as a verbatim
  // citation of the company's words.
  const embeddedQuotesAreVerbatim = (item: string) => {
    const quotes = item.match(/「([^」]+)」/g) ?? [];
    return quotes.every((quote) => isVerbatim(quote.slice(1, -1)));
  };
  const keepQuoteSafe = (items: string[]) =>
    items.filter(embeddedQuotesAreVerbatim);
  // Inference fields may paraphrase the site, but any Latin-script proper
  // noun they mention (product/company names like "AIsmiley") must actually
  // appear in the page text. These fields feed the research anchors the
  // brain is told to quote, so an invented name here gets spoken as fact.
  const allowlist = buildProperNounAllowlist([pageText]);
  const isGroundedInference = (text: string) =>
    scrubUngroundedProperNouns(text, allowlist).removed.length === 0 &&
    embeddedQuotesAreVerbatim(text);
  const keepTokenGrounded = (items: string[]) =>
    items.filter(isGroundedInference);

  return {
    ...skeleton,
    companySummary: skeleton.companySummary
      .split(/(?<=[。！？!?])/u)
      .filter(isGroundedInference)
      .join("")
      .trim(),
    ceoName: isVerbatim(skeleton.ceoName) ? skeleton.ceoName : "",
    values: keepTokenGrounded(skeleton.values),
    businesses: skeleton.businesses.filter((business) =>
      isVerbatim(business.name)
    ),
    past: {
      ...skeleton.past,
      foundingStory: isGroundedInference(skeleton.past.foundingStory)
        ? skeleton.past.foundingStory
        : "",
      formativeThemes: keepTokenGrounded(skeleton.past.formativeThemes),
    },
    future: {
      ...skeleton.future,
      vision: keepTokenGrounded(skeleton.future.vision),
      bets: keepTokenGrounded(skeleton.future.bets),
    },
    connections: keepTokenGrounded(skeleton.connections),
    articleHooks: {
      ...skeleton.articleHooks,
      recentInitiatives: keepTokenGrounded(
        skeleton.articleHooks.recentInitiatives
      ),
      productOrServiceAngles: keepTokenGrounded(
        skeleton.articleHooks.productOrServiceAngles
      ),
      cultureSignals: keepTokenGrounded(skeleton.articleHooks.cultureSignals),
      leaderQuotes: keepVerbatim(skeleton.articleHooks.leaderQuotes),
    },
    philosophyHooks: {
      ...skeleton.philosophyHooks,
      mission: keepVerbatim(skeleton.philosophyHooks.mission),
      vision: keepVerbatim(skeleton.philosophyHooks.vision),
      customerPromise: keepTokenGrounded(
        skeleton.philosophyHooks.customerPromise
      ),
      distinctiveWords: keepVerbatim(skeleton.philosophyHooks.distinctiveWords),
      philosophyQuestions: keepQuoteSafe(
        skeleton.philosophyHooks.philosophyQuestions
      ),
      openingQuestionCandidates: keepQuoteSafe(
        skeleton.philosophyHooks.openingQuestionCandidates
      ),
    },
  };
}

/**
 * Contamination check: if the LLM returned a company name that does not
 * appear anywhere in the page text, it pulled a different company from its
 * training data (e.g. "NLP" → coaching firms). In that case the whole
 * skeleton is suspect — summaries, values and businesses will describe the
 * wrong company — so the caller should discard it entirely.
 */
export function isSkeletonGrounded(
  skeleton: InterviewSkeleton,
  pageText: string
): boolean {
  const name = skeleton.companyName.trim();
  if (!name) return true;
  const source = normalizeForSourceMatch(pageText);
  return source.includes(normalizeForSourceMatch(name));
}

const MAX_RESEARCH_ANCHORS = 40;

/**
 * Flatten the structured research skeleton into a prioritized list of concrete
 * anchors the editorial director can hand the model at transitions. Each anchor
 * is a specific fact (named product, distinctive word, founding story, customer
 * promise, etc.) so transition questions land on something concrete instead of
 * an abstract template.
 */
export function buildResearchAnchorsFromSkeleton(
  skeleton: InterviewSkeleton
): ResearchAnchor[] {
  const anchors: ResearchAnchor[] = [];
  const push = (kind: ResearchAnchor["kind"], text: string) => {
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    if (anchors.some((anchor) => anchor.text === trimmed)) return;
    anchors.push({ kind, text: trimmed });
  };

  for (const business of skeleton.businesses) {
    push(
      "business",
      business.description
        ? `${business.name}（${business.description}）`
        : business.name
    );
  }
  skeleton.philosophyHooks.distinctiveWords.forEach((text) =>
    push("distinctiveWord", text)
  );
  skeleton.philosophyHooks.mission.forEach((text) => push("mission", text));
  skeleton.philosophyHooks.vision.forEach((text) => push("vision", text));
  skeleton.philosophyHooks.customerPromise.forEach((text) =>
    push("customerPromise", text)
  );
  skeleton.articleHooks.leaderQuotes.forEach((text) =>
    push("leaderQuote", text)
  );
  skeleton.articleHooks.recentInitiatives.forEach((text) =>
    push("recentInitiative", text)
  );
  skeleton.articleHooks.productOrServiceAngles.forEach((text) =>
    push("productAngle", text)
  );
  skeleton.articleHooks.cultureSignals.forEach((text) =>
    push("cultureSignal", text)
  );
  if (skeleton.past.foundingStory) {
    push("foundingStory", skeleton.past.foundingStory);
  }
  skeleton.past.formativeThemes.forEach((text) => push("formativeTheme", text));
  skeleton.future.vision.forEach((text) => push("vision", text));
  skeleton.future.bets.forEach((text) => push("bet", text));
  skeleton.connections.forEach((text) => push("connection", text));
  skeleton.values.forEach((text) => push("value", text));

  return anchors.slice(0, MAX_RESEARCH_ANCHORS);
}

export function buildSkeletonInstructions(
  skeleton: InterviewSkeleton,
  options?: { usedFallback?: boolean }
): string {
  const list = (items: string[]) =>
    items.length > 0
      ? items.map((item) => `  - ${item}`).join("\n")
      : "  - （手がかりなし）";

  const fallbackWarning = options?.usedFallback
    ? `【重要】サイト本文を取得できなかったため、以下は会社固有の情報を含まない一般的な地図です。
- 「サイトに〜とありました」「御社の〇〇という言葉」のように、サイトを見たかのような引用は絶対にしない。
- 相手の名前・ミッション・事業名を勝手に作らない。会社のことは本人の口から語ってもらい、出てきた言葉を地図に重ねていく。

`
    : "";

  const businessLines =
    skeleton.businesses.length > 0
      ? skeleton.businesses
          .map((b) =>
            b.description
              ? `  - ${b.name}: ${b.description}`
              : `  - ${b.name}`
          )
          .join("\n")
      : "  - （固有名は取得できなかった。無理に事業名を作らない）";

  return `${fallbackWarning}これは、相手の会社を事前に調べて作った"あなたの頭の中の地図"です。
インタビュー中ずっと頭に入れておき、相手の発言をこの地図上の事業・価値観・時間軸に結びつけてください（例:「それは御社の〇〇という取り組みにも繋がっていますか？」）。
ただし質問を丸読みするための台本ではありません。相手の言葉と感情に合わせて、素材として自然に使ってください。
「サイトに〜とありました」「ミッションとして掲げられている〜」のような断定引用をしてよいのは、下の「ミッション・存在意義」「会社らしい思想が表れている言葉」「経営者や会社の発信」に載っている言葉だけです。それ以外（価値観・テーマなどの推測項目）は「〜を大切にされている印象を受けました」のような仮説として差し出してください。該当欄が（手がかりなし）なら、サイトの言葉を引用したかのような発言は一切しないでください。

### 会社の核
- 会社名: ${skeleton.companyName || "（不明）"}
- 事業概要: ${skeleton.companySummary || "（不明）"}
- 経営者: ${skeleton.ceoName || "（名前は不明。無理に名前を呼ばない）"}
- 大切にしていそうな価値観:
${list(skeleton.values)}
- 深掘りに良さそうなwell-beingテーマ:
${list(skeleton.wellbeingThemes)}

### 理念・哲学の取っかかり（最初に使う）
- ミッション・存在意義:
${list(skeleton.philosophyHooks.mission)}
- ビジョン・目指す未来:
${list(skeleton.philosophyHooks.vision)}
- 顧客にどうなってほしいか:
${list(skeleton.philosophyHooks.customerPromise)}
- 会社らしい思想が表れている言葉:
${list(skeleton.philosophyHooks.distinctiveWords)}
- 理念や哲学を掘り起こす問い:
${list(skeleton.philosophyHooks.philosophyQuestions)}
- 冒頭質問候補:
${list(skeleton.philosophyHooks.openingQuestionCandidates)}

### 具体アンカー（固有名で紐づけるための事業・サービス）
${businessLines}

### 過去（創業・原体験）
- 創業の経緯・転機: ${skeleton.past.foundingStory || "（手がかりなし）"}
- 原体験になりそうなテーマ:
${list(skeleton.past.formativeThemes)}

### 現在（今の事業・課題）
- 今力を注いでいそうなこと:
${list(skeleton.present.currentFocus)}
- 直面していそうな課題:
${list(skeleton.present.challenges)}

### 未来（ビジョン・賭け）
- 掲げている方向・理念:
${list(skeleton.future.vision)}
- 未来への投資・賭け:
${list(skeleton.future.bets)}

### 紐づけの線（過去→現在→未来の仮説）
${list(skeleton.connections)}

### 記事の取っかかり（読者が知りたい具体）
- 最近の取り組み:
${list(skeleton.articleHooks.recentInitiatives)}
- 事業・プロダクトの切り口:
${list(skeleton.articleHooks.productOrServiceAngles)}
- 経営者や会社の発信:
${list(skeleton.articleHooks.leaderQuotes)}
- カルチャー・働き方の手がかり:
${list(skeleton.articleHooks.cultureSignals)}
- 読者が知りたくなりそうな問い:
${list(skeleton.articleHooks.readerQuestions)}

この地図は記事インタビューの素材です。冒頭は、できるだけ上の「理念・哲学の取っかかり」や「冒頭質問候補」から始めてください。相手の具体的な場面が出たら、機能やログの細部ではなく、その人や会社が何を大切にしているかへ自然に戻してください。`;
}
