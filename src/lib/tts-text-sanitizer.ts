const CODE_FENCE = /```+/g;
const WRAPPING_QUOTES = /^[\s"'“”‘’「」『』`]+|[\s"'“”‘’「」『』`]+$/g;
const WELLBEING_TEXT = /\bwell[\s-]?(?:being|bing|beng)\b/gi;
const WELL_WORKING_TEXT = /\bwell[\s-]?working\b/gi;
const WELULU_TEXT = /\bwelulu\b/gi;
const SENTENCE_ENDING = /[。！？!?]$/u;
const SENTENCE_BOUNDARY = /[。！？!?]/u;

const META_UTTERANCES = [
  /^日本語で話します[。．.!！]?\s*/u,
  /^日本語でお話しします[。．.!！]?\s*/u,
  /^日本語でお話します[。．.!！]?\s*/u,
  /^大丈夫です[。．.!！]?\s*/u,
  /^承知しました[。．.!！]?\s*/u,
  /^了解しました[。．.!！]?\s*/u,
  /^では、?\s*/u,
  /^ありがとうございます[。．.!！]\s*(?=今の|少し|その)/u,
  /^少しだけ(?:整理|方向づけ|具体に|具体へ|場面を具体に|考えを整え|原点|意味|次の一歩)[^。！？!?]*(?:聞いてみます|聞いていきます|伺います|うかがいます|お聞きします|見ていきます|質問をします)?ね?[。！？!?]?\s*/u,
  /^今の話を受けて、?[^。！？!?]*(?:整理|具体)[^。！？!?]*[。！？!?]?\s*/u,
  /^今の[^。！？!?]*(?:流れ|話|起点|原点|意味|切り替え|整理|方向づけ|寄せ|次の一歩)[^。！？!?]*(?:聞いてみます|聞いていきます|伺います|うかがいます|お聞きします|見ていきます|質問をします)ね?[。！？!?]?\s*/u,
  /^その[^。！？!?]*(?:感触|好奇心|進め方|流れ|話|感覚)[^。！？!?]*(?:もう一歩|内側|原点|具体|次の一歩|たどる)[^。！？!?]*(?:聞いてみます|聞いていきます|聞きます|伺います|うかがいます|お聞きします|見ていきます|質問をします)ね?[。！？!?]?\s*/u,
  /^[^。！？!?]*(?:起点|原点|意味|切り替え|整理|方向づけ|寄せ|次の一歩|内側)[^。！？!?]*(?:聞いてみます|聞いていきます|聞きます|伺います|うかがいます|お聞きします|見ていきます|質問をします)ね?[。！？!?]\s*/u,
  /^そのイメージを大事にしながら、?[^。！？!?]*[。！？!?]?\s*/u,
];

const INTERNAL_PREAMBLE = [
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?(?:今の|その)[^。！？!?]*(?:話|流れ|感覚|感触|好奇心|進め方|切り替え|手がかり|足がかり|起点|原点|意味|内側|次の一歩|具体)[^。！？!?]*(?:聞いてみます|聞いていきます|聞きます|聞かせてください|伺います|うかがいます|お聞きします|見ていきます|質問をします)ね?[。！？!?]?$/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?少しだけ[^。！？!?]*(?:整理|方向づけ|具体|場面|考え|原点|意味|内側|次の一歩|進め方)[^。！？!?]*(?:聞いてみます|聞いていきます|聞きます|聞かせてください|伺います|うかがいます|お聞きします|見ていきます|質問をします)?ね?[。！？!?]?$/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?今の話に戻して、?[^。！？!?]*(?:聞いてみます|聞いていきます|聞きます|聞かせてください|伺います|うかがいます|お聞きします)ね?[。！？!?]?$/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?(?:その|今の)[^。！？!?]*(?:場面|話|一言|判断|瞬間)[^。！？!?]*(?:少しだけ)?(?:たどらせてください|たどらせてくださいね|聞かせてください|伺わせてください)[。！？!?]?$/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?少し(?:だけ)?[^。！？!?]*(?:整理|方向づけ|考え|聞き方|まとめ)[^。！？!?]*(?:考えます|整えます|まとめます|決めます|考えてみます|整理します)ね?[。！？!?]?$/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?(?:次の|今の)?(?:聞き方|質問|問い|聞くこと)[^。！？!?]*(?:考えます|整えます|まとめます|決めます|考えてみます)ね?[。！？!?]?$/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?(?:その|今の|この)?(?:お?気持ち|想い|思い|考え|話|内容|ポイント|テーマ|感覚|感触)を(?:一旦|いったん|少し|ひとまず|まず)?整理して[^。！？!?]*(?:質問します|聞きます|お聞きします|伺います|うかがいます|まとめます|考えます|お伝えします)ね?[。！？!?]?$/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?(?:これから|ここから)?未来に向けて[^。！？!?]*(?:質問します|聞きます|お聞きします|伺います|うかがいます)ね?[。！？!?]?$/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?少し(?:だけ)?整理して[^。！？!?]*(?:うかがいます|伺います|聞きます|お聞きします|質問します|お伝えします)ね?[。！？!?]?$/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?(?:今の|その|この)?(?:場面|話|流れ|ところ)から[^。！？!?]*(?:次の一歩|一歩|次)[^。！？!?]*(?:うかがいます|伺います|聞きます|お聞きします|質問します)ね?[。！？!?]?$/u,
  // 進行の実況ナレーション全般（質問を含まず「ね。」で終わる宣言文）を一括で落とす。
  // 例:「少し整理して、考えの根っこに触れられるようにしますね。」「少し考えながら、理念の方向に話を上げていきますね。」
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?少し(?:だけ)?(?:整理して|整理し|考えながら|考えつつ|考えて|間を取って|間をおいて)[^？?]*ね[。．.!！]?$/u,
];

const INTERNAL_PREAMBLE_PREFIX = [
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?(?:今の|その)[^。！？!?]*(?:話|流れ|感覚|感触|好奇心|進め方|切り替え|手がかり|足がかり|起点|原点|意味|内側|次の一歩|具体)[^。！？!?]*(?:聞いてみ|聞いてい|聞き|聞かせ|伺|うかが|お聞き|見てい|質問)/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?少しだけ[^。！？!?]*(?:整理|方向づけ|具体|場面|考え|原点|意味|内側|次の一歩|進め方)/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?今の話に戻して/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?少し(?:だけ)?[^。！？!?]*(?:整理|方向づけ|考え|聞き方|まとめ)/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?(?:次の|今の)?(?:聞き方|質問|問い|聞くこと)[^。！？!?]*(?:考え|整え|まとめ|決め)/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?(?:その|今の|この)?(?:お?気持ち|想い|思い|考え|話|内容|ポイント|テーマ|感覚|感触)を(?:一旦|いったん|少し|ひとまず|まず)?整理して/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?(?:これから|ここから)?未来に向けて[^。！？!?]*(?:質問|聞き|お聞き|伺|うかが)/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?少し(?:だけ)?整理して/u,
  /^(?:ありがとうございます[。．.!！]\s*)?(?:では、?\s*)?少し(?:だけ)?(?:整理して|整理し|考えながら|考えつつ|考えて|間を取って|間をおいて)/u,
];

const GENERIC_ACKNOWLEDGEMENT = /^ありがとうございます[。．.!！]?$/u;

// The brain is told not to address the interviewee by name, and some models
// comply by emitting a masked placeholder ("〇〇さん") instead. Prompt rules
// alone don't stop this, so scrub deterministically before display/TTS.
const PLACEHOLDER_NAME = /[〇○◯●][〇○◯●]?\s*(?:さん|さま|様|社長|代表|氏)/gu;
// Vocative use ("〇〇さん、それは…") reads best with the placeholder dropped.
const PLACEHOLDER_NAME_VOCATIVE =
  /(^|[、。！？!?\s])[〇○◯●][〇○◯●]?\s*(?:さん|さま|様|社長|代表|氏)、\s*/gu;

export function scrubNamePlaceholders(text: string): string {
  if (!text) return text;
  return text
    .replace(PLACEHOLDER_NAME_VOCATIVE, "$1")
    .replace(/[〇○◯●][〇○◯●]?\s*(?:さん|さま|様|社長|代表|氏)ご自身/gu, "ご自身")
    .replace(PLACEHOLDER_NAME, "ご自身");
}

// ---------------------------------------------------------------------------
// Ungrounded proper-noun guard.
//
// The brain model sometimes pulls a real-world product/company name from its
// training data and presents it as the interviewee's (e.g. quoting an
// unrelated service as "御社の〜"). Prompt rules reduce but don't eliminate
// this, so Latin-script tokens in brain speech are checked against an
// allowlist built from the research material and the conversation itself.
// Katakana names are excluded: too many generic words, prompt+prep layers
// cover those.
// ---------------------------------------------------------------------------

const LATIN_TOKEN = /[A-Za-z][A-Za-z0-9.\-]*[A-Za-z0-9]/g;
const MIN_LATIN_TOKEN_LENGTH = 3;

// Generic tech/business vocabulary that is safe regardless of research
// content (not proper nouns of specific companies/products).
const SAFE_LATIN_TOKENS = new Set([
  "web",
  "sns",
  "saas",
  "api",
  "kpi",
  "kgi",
  "crm",
  "cvr",
  "seo",
  "llm",
  "poc",
  "ocr",
  "rpa",
  "excel",
  "word",
  "mail",
  "chatgpt",
  "gpt",
  "well",
  "being",
  "wellbeing",
  "well-being",
]);

export function buildProperNounAllowlist(texts: string[]): Set<string> {
  const allowlist = new Set(SAFE_LATIN_TOKENS);
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(LATIN_TOKEN)) {
      allowlist.add(match[0].toLowerCase());
    }
  }
  return allowlist;
}

export interface ProperNounScrubResult {
  text: string;
  removed: string[];
}

// ---------------------------------------------------------------------------
// Quote grounding guard.
//
// The brain model sometimes composes a plausible Japanese mission statement
// and attributes it to the interviewee's site (「サイトで拝見した「…」という
// ミッション」). The Latin-token guard cannot catch these, so quoted spans in
// brain speech are verified against the research material and the
// conversation. Only quotes used in a site-attribution context are touched;
// paraphrased interviewee words (the bread and butter of 見立て) pass
// untouched.
// ---------------------------------------------------------------------------

/** Same normalization as the prep-side source matching. */
function normalizeForQuoteMatch(text: string): string {
  return text
    .replace(/[\s「」『』“”"'’‘、。・,.!?！？:：;；（）()\[\]【】〜～\-ー]/g, "")
    .toLowerCase();
}

/**
 * Words that frame a quote as coming from the company's site/mission, or as
 * something the speaker already heard/read (reportive framing like
 * 「…」を大切にされていると伺いました). Prospective forms (お伺いしたい =
 * "I'd like to ask") are deliberately NOT matched.
 */
const ATTRIBUTION_CONTEXT =
  /サイト|ホームページ|ＨＰ|ウェブ|web|拝見|掲げ|ミッション|ビジョン|理念|社是|スローガン|モットー|存在意義|パーパス|伺いまし|伺ってい|伺ったところ|聞きまし|聞いてい|とのこと|だそう|大切にされ|発信され|書かれて|記載|載って/iu;

const QUOTE_OPEN = /[「『]/;
const SENTENCE_END = /[。！？!?]/;
/** How far past a closed quote to wait for attribution words like ミッション. */
const QUOTE_LOOKAHEAD_CHARS = 14;
const MIN_GUARDED_QUOTE_LENGTH = 5;

export interface QuoteGroundingGuardOptions {
  /** Reference text the quotes must exist in (research + conversation). */
  allowlistTexts: string[];
  /** A real, grounded quote to substitute for a fabricated one. */
  replacementQuote?: string;
  onScrub?: (quote: string) => void;
}

/**
 * Streaming guard: buffers quoted spans (plus a short lookahead) and replaces
 * site-attributed quotes that exist in neither the research nor the
 * conversation with a real research quote, so a fabricated mission is never
 * spoken as if it were on the interviewee's site.
 */
export class QuoteGroundingGuard {
  private buffer = "";
  private sentenceContext = "";
  private readonly allowlist: string;
  private readonly replacementQuote: string | null;
  private readonly onScrub?: (quote: string) => void;
  private readonly scrubbedQuotes: string[] = [];

  constructor(options: QuoteGroundingGuardOptions) {
    this.allowlist = normalizeForQuoteMatch(options.allowlistTexts.join(" "));
    this.replacementQuote = options.replacementQuote?.trim() || null;
    this.onScrub = options.onScrub;
  }

  push(delta: string): string {
    if (!delta) return "";
    this.buffer += delta;
    return this.drain(false);
  }

  finalize(): string {
    return this.drain(true);
  }

  private drain(flush: boolean): string {
    let out = "";
    while (this.buffer.length > 0) {
      const openIndex = this.buffer.search(QUOTE_OPEN);
      if (openIndex === -1) {
        out += this.emit(this.buffer);
        this.buffer = "";
        break;
      }
      if (openIndex > 0) {
        out += this.emit(this.buffer.slice(0, openIndex));
        this.buffer = this.buffer.slice(openIndex);
      }
      // Buffer from 「 until the quote closes plus a lookahead window (the
      // attribution word often follows: 「…」というミッション).
      const closeIndex = this.buffer.search(/[」』]/);
      if (closeIndex === -1) {
        if (flush) {
          out += this.emit(this.buffer);
          this.buffer = "";
        }
        break;
      }
      const afterClose = this.buffer.length - (closeIndex + 1);
      const sentenceEnded = SENTENCE_END.test(
        this.buffer.slice(closeIndex + 1)
      );
      if (!flush && afterClose < QUOTE_LOOKAHEAD_CHARS && !sentenceEnded) {
        break;
      }
      const quote = this.buffer.slice(1, closeIndex);
      const lookahead = this.buffer.slice(
        closeIndex + 1,
        closeIndex + 1 + QUOTE_LOOKAHEAD_CHARS
      );
      out += this.emit(this.resolveQuote(quote, lookahead));
      this.buffer = this.buffer.slice(closeIndex + 1);
    }
    return out;
  }

  private resolveQuote(quote: string, lookahead: string): string {
    const wrapped = `「${quote}」`;
    const normalized = normalizeForQuoteMatch(quote);
    if (normalized.length === 0) return wrapped;
    if (this.allowlist.includes(normalized)) return wrapped;
    if (quote.length < MIN_GUARDED_QUOTE_LENGTH) {
      // Short ungrounded quotes are only scrubbed when they echo an already
      // scrubbed fabrication (e.g. a fragment of the fake mission).
      if (!this.echoesScrubbedQuote(normalized)) return wrapped;
    } else {
      const attributed =
        ATTRIBUTION_CONTEXT.test(this.sentenceContext) ||
        ATTRIBUTION_CONTEXT.test(lookahead) ||
        this.echoesScrubbedQuote(normalized);
      if (!attributed) return wrapped;
    }
    this.scrubbedQuotes.push(normalized);
    this.onScrub?.(quote);
    return this.replacementQuote ? `「${this.replacementQuote}」` : "御社の理念";
  }

  private echoesScrubbedQuote(normalized: string): boolean {
    return this.scrubbedQuotes.some(
      (scrubbed) =>
        scrubbed.includes(normalized) || normalized.includes(scrubbed)
    );
  }

  private emit(text: string): string {
    // Track the current sentence so attribution words before the quote
    // (サイトで拝見した「…」) are visible at decision time.
    for (const char of text) {
      if (SENTENCE_END.test(char)) {
        this.sentenceContext = "";
      } else {
        this.sentenceContext += char;
      }
    }
    return text;
  }
}

/**
 * Replace Latin-script proper nouns that appear in neither the research nor
 * the conversation with a generic reference, so a hallucinated product name
 * is never spoken at the interviewee as if it were theirs.
 */
export function scrubUngroundedProperNouns(
  text: string,
  allowlist: Set<string>
): ProperNounScrubResult {
  if (!text) return { text, removed: [] };
  const removed: string[] = [];
  const isUngrounded = (token: string) =>
    token.length >= MIN_LATIN_TOKEN_LENGTH &&
    !allowlist.has(token.toLowerCase());

  // Quoted form: 「AIsmiley」というプラットフォーム → そのプラットフォーム,
  // standalone 「AIsmiley」 → そちら.
  let scrubbed = text.replace(
    /[「『]([A-Za-z][A-Za-z0-9.\-]*[A-Za-z0-9])[」』](という|との|といった)?/g,
    (whole, token: string, connective?: string) => {
      if (!isUngrounded(token)) return whole;
      removed.push(token);
      return connective ? "その" : "そちら";
    }
  );

  // Bare token: AIsmileyの開発 → 御社のプロダクトの開発.
  scrubbed = scrubbed.replace(LATIN_TOKEN, (token) => {
    if (!isUngrounded(token)) return token;
    removed.push(token);
    return "御社のプロダクト";
  });

  return { text: scrubbed, removed };
}

export type AssistantSentenceClassification =
  | "visible"
  | "internalPreamble"
  | "pending";

export interface AssistantTextFilterResult {
  visibleText: string;
  pendingText: string;
  hasInternalPreamble: boolean;
}

function normalizeRawText(text: string): string {
  return scrubNamePlaceholders(
    text
      .replace(CODE_FENCE, "")
      .replace(/\r?\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(WRAPPING_QUOTES, "")
  );
}

function normalizePronunciation(text: string): string {
  return text
    .replace(WELULU_TEXT, "ウェルル")
    .replace(WELL_WORKING_TEXT, "ウェルワーキング")
    .replace(WELLBEING_TEXT, "ウェルビーイング")
    .trim();
}

function splitAssistantSentences(
  text: string,
  includeTrailingFragment: boolean
): { sentences: string[]; pendingText: string } {
  const sentences: string[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (!SENTENCE_BOUNDARY.test(text[index])) continue;
    const sentence = text.slice(start, index + 1).trim();
    if (sentence) sentences.push(sentence);
    start = index + 1;
  }

  const pendingText = text.slice(start).trim();
  if (includeTrailingFragment && pendingText) {
    return { sentences: [...sentences, pendingText], pendingText: "" };
  }

  return { sentences, pendingText };
}

export function classifyAssistantSentence(
  text: string
): AssistantSentenceClassification {
  const normalized = normalizeRawText(text);
  if (!normalized) return "pending";

  if (INTERNAL_PREAMBLE.some((pattern) => pattern.test(normalized))) {
    return "internalPreamble";
  }

  if (!SENTENCE_ENDING.test(normalized)) {
    return INTERNAL_PREAMBLE_PREFIX.some((pattern) => pattern.test(normalized))
      ? "pending"
      : "pending";
  }

  return "visible";
}

export function filterAssistantTextForDisplay(
  text: string,
  { final = false }: { final?: boolean } = {}
): AssistantTextFilterResult {
  const normalized = normalizeRawText(text);
  const { sentences, pendingText } = splitAssistantSentences(normalized, final);
  const visibleSentences: string[] = [];
  let hasInternalPreamble = false;

  const classifications = sentences.map((sentence) =>
    classifyAssistantSentence(sentence)
  );

  for (let index = 0; index < sentences.length; index += 1) {
    const sentence = sentences[index];
    const classification = classifications[index];
    if (classification === "internalPreamble") {
      hasInternalPreamble = true;
      continue;
    }
    if (classification === "visible") {
      const nextClassification = classifications[index + 1];
      if (
        GENERIC_ACKNOWLEDGEMENT.test(sentence) &&
        nextClassification === "internalPreamble"
      ) {
        continue;
      }
      visibleSentences.push(normalizePronunciation(sentence));
    }
  }

  const onlyGenericAck =
    visibleSentences.length === 1 &&
    GENERIC_ACKNOWLEDGEMENT.test(visibleSentences[0]) &&
    (hasInternalPreamble || Boolean(pendingText));
  const standaloneGenericAck =
    visibleSentences.length === 1 &&
    GENERIC_ACKNOWLEDGEMENT.test(visibleSentences[0]) &&
    !pendingText;

  return {
    visibleText:
      onlyGenericAck || standaloneGenericAck
        ? ""
        : visibleSentences.join(" ").trim(),
    pendingText,
    hasInternalPreamble: hasInternalPreamble || standaloneGenericAck,
  };
}

export function getUnspokenAssistantText(
  previousText: string,
  nextText: string
): string {
  if (!nextText) return "";
  if (!previousText) return nextText;
  return nextText.startsWith(previousText) ? nextText.slice(previousText.length) : "";
}

export function shouldSkipQueuedTtsText(
  queuedTexts: string[],
  nextText: string
): boolean {
  const normalizedNext = nextText.replace(/\s+/g, " ").trim();
  if (!normalizedNext) return true;
  return queuedTexts.some((queuedText) => {
    const normalizedQueued = queuedText.replace(/\s+/g, " ").trim();
    if (!normalizedQueued) return false;
    return (
      normalizedQueued === normalizedNext ||
      normalizedQueued.includes(normalizedNext) ||
      normalizedNext.includes(normalizedQueued)
    );
  });
}

export function sanitizeTtsText(text: string): string {
  let sanitized = filterAssistantTextForDisplay(text, { final: true }).visibleText;

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of META_UTTERANCES) {
      const next = sanitized.replace(pattern, "").trimStart();
      if (next !== sanitized) {
        sanitized = next;
        changed = true;
      }
    }
  }

  return normalizePronunciation(sanitized);
}
