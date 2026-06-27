import { z } from "zod";
import { isNegativeAnswer, isShortAnswer } from "./editorial-director";

/**
 * The reasoning model that actually writes each interviewer question. The
 * Realtime model is demoted to ears + voice (ASR + reading the text aloud);
 * this model reads the whole transcript, holds a hypothesis about the person,
 * and authors the next utterance with intent. Defaults to the same strong model
 * the sidecar uses, overridable per-deployment.
 */
export const INTERVIEW_BRAIN_MODEL =
  process.env.INTERVIEW_BRAIN_MODEL ?? process.env.SIDECAR_MODEL ?? "gpt-5.5";

/**
 * Brain models selectable per-session from the settings screen (for live
 * quality/latency comparison demos). Anything outside this list falls back to
 * the deployment default so the client cannot request arbitrary models.
 */
export const SELECTABLE_BRAIN_MODELS = [
  "gemini-3.5-flash",
  "claude-fable-5",
  "gpt-5.5",
  "claude-opus-4-8",
] as const;

export function resolveBrainModel(requested: string | undefined): string {
  if (
    requested &&
    (SELECTABLE_BRAIN_MODELS as readonly string[]).includes(requested)
  ) {
    return requested;
  }
  return INTERVIEW_BRAIN_MODEL;
}

/** Fixed icebreak spoken by the host before the brain takes over. */
export const ICEBREAK_TEXT =
  "まずはアイスブレイクから始めますね。よければ一度、背伸びをして、ゆっくり深呼吸してみてください。終わったら教えてくださいね。";

// Must comfortably fit the full skeleton instructions (~5,000 chars for a
// content-rich site). A 2,200-char cap once silently cut off the philosophy
// section — the exact part the chapter hint tells the brain to quote — which
// pushed the model into fabricating a mission. Keep this generous.
const MAX_RESEARCH_CHARS = 9000;
const MAX_ANCHOR_ITEMS = 20;
const MAX_TRANSCRIPT_TURNS = 24;

/**
 * The narrative arc the interview should travel. Distinct from the sidecar's
 * fine-grained chapters: this is the high-level spine the user asked for
 * (philosophy -> origin -> present -> future), used only as a soft hint to the
 * brain so progression is reliable while the wording stays intelligent.
 */
export const BRAIN_CHAPTERS = [
  "philosophy",
  "origin",
  "present",
  "future",
  "closing",
] as const;

export type BrainChapter = (typeof BRAIN_CHAPTERS)[number];

/**
 * How many interviewer questions to spend in a chapter before lifting to the
 * next one. A negative / short answer lifts immediately regardless.
 */
const CHAPTER_BUDGET: Record<BrainChapter, number> = {
  philosophy: 3,
  origin: 2,
  present: 2,
  future: 3,
  closing: Number.POSITIVE_INFINITY,
};

const CHAPTER_LABEL: Record<BrainChapter, string> = {
  philosophy: "理念・方針",
  origin: "原体験",
  present: "現在の事業・現場での表れ",
  future: "未来・変えたいこと",
  closing: "締め",
};

export interface BrainClockState {
  chapter: BrainChapter;
  turnsInChapter: number;
}

export function createBrainClock(): BrainClockState {
  return { chapter: "philosophy", turnsInChapter: 0 };
}

function nextChapter(chapter: BrainChapter): BrainChapter {
  const index = BRAIN_CHAPTERS.indexOf(chapter);
  if (index < 0) return "closing";
  return BRAIN_CHAPTERS[Math.min(index + 1, BRAIN_CHAPTERS.length - 1)];
}

function buildChapterHint(
  chapter: BrainChapter,
  lifted: boolean
): string {
  const base: Record<BrainChapter, string> = {
    philosophy:
      "今は【理念・方針】の章。リサーチにある理念・ミッション・事業の固有の言葉を1つ引き、それが本人の言葉で何を意味するのか・なぜ大事なのかを引き出す。一般論の『大切にしていること』だけで聞かない。",
    origin:
      "今は【原体験】の章。その理念がどこから来たのかを聞く。ただし原体験がひとつ語られたら、それ以上『その想いはどこから』と遡らない。語られた体験と今の事業をつなぐ方向へ進める。",
    present:
      "今は【現在の表れ】の章。理念が今の事業・現場・顧客でどう表れているかを1つだけ具体に聞く。リサーチにある事業・プロダクトの固有語に触れて聞くと良い（リサーチに固有名が無ければ『そのプロダクト』『今の事業』のような相手の言葉で聞く。名前を作らない）。機能やログの細部は掘らない。",
    future:
      "今は【未来】の章。これから何を変えたいか、誰にどうなってほしいかを聞く。『どんな場面か』ではなく『何を変えたいか・どうなってほしいか』で。リサーチにあるビジョンの言葉と本人の語りを突き合わせるのも良い。",
    closing:
      "締めの章。新しい話題は開かない。これまでの理念→原体験→未来を短く束ね、質問ではなく感謝で締める。",
  };
  const prefix = lifted ? "前の章は十分に聞けた。章を移す。" : "";
  return `${prefix}${base[chapter]}`;
}

/**
 * Heuristic: does the (ASR-finalized) interviewee text look like a thought cut
 * off mid-sentence? ASR often appends a period even to dangling clauses
 * (e.g. 「お客さんから良かったよとか。」「そういう瞬間が」), so we strip trailing
 * punctuation and check for Japanese connective/particle endings that signal
 * the speaker intends to continue. Used by the host to wait longer before
 * firing the brain on such turns.
 */
const TRAILING_PUNCTUATION = /[。．.、,！!？?…・\s]+$/u;
const MID_THOUGHT_TAIL =
  /(?:って|とか|たり|など|それと|それで|そういう|ていうか|というか|つまり|やっぱり|なんか|まあ|ええと|えっと|あの|その|から|ので|のに|けれど|けど|ですが|まして|として|について|に対して|によって|や|と|が|は|を|に|へ|で|も|し|て)$/u;
// Thinking noises ("うーん", "そうですね…") that ASR finalizes as a turn while
// the speaker is still composing an answer. These must never be treated as a
// completed answer; the host waits extra long before firing the brain.
const FILLER_ONLY =
  /^(?:う+ー*ん|ええと|えっと|え+ー*|あ+ー*|そ+ー*|うー+|そうですね[ー…]*|そうだな+[ー…]*|そうですか|なるほど|なんだろう+|どうだろう+|まあ|うんうん)+$/u;

/** Is the whole utterance just a thinking noise, with no actual content? */
export function isFillerOnly(text: string): boolean {
  const normalized = (text ?? "")
    .replace(/\s+/g, "")
    .replace(/[。．.、,！!？?…・]+/gu, "");
  if (!normalized) return false;
  return FILLER_ONLY.test(normalized);
}

export function endsMidThought(text: string): boolean {
  const normalized = (text ?? "").replace(/\s+/g, "").replace(TRAILING_PUNCTUATION, "");
  if (!normalized) return true;
  if (isFillerOnly(normalized)) return true;
  return MID_THOUGHT_TAIL.test(normalized);
}

// Lexical acknowledgments / hesitations that, when they END an utterance,
// signal the speaker paused on a filler mid-answer and intends to continue
// (e.g. 「…想像する。あの、そうですね。」). Distinct from MID_THOUGHT_TAIL,
// which catches grammatical connective endings; these are filler words that
// ASR finalizes with a period even though the thought is not done.
const TRAILING_HESITATION =
  /(?:あのー?|えっと|ええと|うー?ん|そうですね|そうだな|なんだろう|どうだろう|まあ|その)$/u;

/**
 * Does the utterance end on a soft acknowledgment / thinking noise (even when
 * ASR punctuated it as a finished sentence)? Used by the host to wait longer
 * before firing the brain, so a hesitation mid-answer does not get cut off.
 */
export function endsWithHesitation(text: string): boolean {
  const normalized = (text ?? "")
    .replace(/\s+/g, "")
    .replace(TRAILING_PUNCTUATION, "");
  if (!normalized) return false;
  return TRAILING_HESITATION.test(normalized);
}

// Filler / hesitation tokens anywhere in an utterance. Counted (not just
// trailing) as a "still composing" density signal for the Human State Engine.
// NOTE: gpt-4o-transcribe tends to clean up disfluencies, so this under-counts
// in practice — treat a non-zero count as a strong cue, not a precise rate.
const FILLER_TOKEN =
  /あのー?|えーと|えっと|ええと|うー?ん|なんだろう|なんていうか|そのー|まあその|えー(?![ぁ-ん])/gu;

/** Count filler/hesitation tokens in an utterance (0 when none). */
export function countFillers(text: string): number {
  const normalized = (text ?? "").replace(/\s+/g, "");
  if (!normalized) return 0;
  const matches = normalized.match(FILLER_TOKEN);
  return matches ? matches.length : 0;
}

export interface BrainClockAdvance {
  state: BrainClockState;
  chapter: BrainChapter;
  chapterLabel: string;
  hint: string;
}

/**
 * Decide which chapter the next interviewer question belongs to. Called once
 * per interviewee answer, before authoring the next question. Deterministic:
 * spends CHAPTER_BUDGET questions per chapter, lifting early on weak answers.
 */
export function advanceBrainClock(
  state: BrainClockState,
  intervieweeText: string
): BrainClockAdvance {
  const weak = isNegativeAnswer(intervieweeText) || isShortAnswer(intervieweeText);
  let chapter = state.chapter;
  let turnsInChapter = state.turnsInChapter;
  let lifted = false;

  // The very first advance follows the icebreak reply ("終わりました" etc.),
  // which is not a substantive answer. Never lift on it, so the first real
  // question always opens the philosophy chapter instead of skipping it.
  const isOpeningTurn = chapter === "philosophy" && turnsInChapter === 0;

  const budget = CHAPTER_BUDGET[chapter];
  const shouldLift =
    !isOpeningTurn && chapter !== "closing" && (turnsInChapter >= budget || weak);

  if (shouldLift) {
    chapter = nextChapter(chapter);
    turnsInChapter = 1;
    lifted = true;
  } else {
    turnsInChapter += 1;
  }

  return {
    state: { chapter, turnsInChapter },
    chapter,
    chapterLabel: CHAPTER_LABEL[chapter],
    hint: buildChapterHint(chapter, lifted),
  };
}

export const BRAIN_SYSTEM_PROMPT = `あなたは、経営者を相手にした熟練の記事インタビュアーです。音声で対話しており、あなたの発話はそのまま読み上げられます。
読者が知りたいのは「この人は何を信じ、それはどこから来て、どこへ向かうのか」。通す弧は【理念・方針】→【原体験】→【未来像】で、具体的なエピソードはこの弧を語ってもらうための踏み台です。

# 毎ターンの考え方
1. 会話全文と仮説メモを読み、「この人は何を信じている人か」という仮説を更新する。
2. 進行指示（今の章）を踏まえ、仮説を確かめる・揺さぶる・一歩進めるための一手を選ぶ。
3. 「見立て（1〜2文）＋質問（1文）」で発話する。見立ては相手の話を自分の言葉で言い換え、その人の世界観を名指しで返すこと。オウム返しや「〜という言葉が印象に残りました」のような定型句は禁止。

# 手本（この"動き"を真似る。内容や言葉はそのまま使わず、毎回相手の話に合わせる）

手本1: 機能の話を、本人も言語化していなかった信念に言い換えて返す
相手「決まった文書の中からだけ返答するAIなら、使いどころがいっぱいあると思ったんです」
発話「性能の高さより"嘘をつかないこと"を最初の条件に置いた、ということですよね。多くの会社が賢さを競っていた時期に、あえてそこを起点にしたのはなぜですか？」

手本2: 前に出た言葉を引いて、話の線をつなぐ（コールバック）
相手「お客さんの作業負担を減らせるんだと実感しました」
発話「冒頭で"知性のその先へ"とおっしゃいましたが、つながってきました。知性そのものより、その先で人の負担が減ることが本体なんですね。その順番は、どこで身についた考えなんですか？」

手本3: 通説との違いを軽くぶつけて、核を引き出す
相手「AIで問い合わせ対応を自動化して、効率化していきたいです」
発話「効率化なら、正直どの会社も同じことを言いますよね。あなたがそこに足したい、あなたにしか言えないものは何ですか？」

手本4: 未来は"場面"ではなく"変えたいこと・なってほしい姿"で聞く
相手「判断と、人と人とのコミュニケーションは人間に残したいです」
発話「機械に任せるものと人に残すものの線引きが、はっきりしているんですね。その線引きで、働く人の毎日の何がいちばん変わっていてほしいですか？」

手本5: 短答・迷いには同じ質問を押し付けず、角度を変える
相手「そう思うようになった出来事は、特にないです」
発話「なるほど、一つの出来事というより積み重ねなんですね。では逆に、これだけは譲らなかったという判断を一つ挙げるなら、何がありますか？」

# 守ること
- 1発話は合計3文まで。見立て1〜2文＋質問1文。声で聞いて一息で追える長さにする。
- 質問は毎ターン必ず1つだけ。「また、〜ですか？」「それとも〜？」と2問目を足さない。複数聞きたいことがあっても、いちばん良い1問に絞る。
- 相手の名前を呼びかけに使わない。リサーチに代表者名が載っていても、目の前の相手が本人かどうかも読み方も確認できていないため、名前の言及はしない。伏せ字（〇〇さん・○○さま等）で置き換えるのも禁止。呼びかけが必要なら「ご自身」を使うか、主語を省いて自然に話す。
- 固有名詞はホワイトリスト制。口にしてよいプロダクト名・サービス名・会社名・人名は、リサーチ資料に書かれているものと、相手がこの会話で口にしたものだけ。あなたの知識にある実在のサービス名・社名をこの会社のものとして補完するのは、相手に捏造を突きつける致命的な失礼にあたる。リサーチに固有名が無ければ「そのプロダクト」「今の事業」のような一般語で聞く。
- 引用も同じくホワイトリスト制。「サイトに〜とありました」「掲げられている〜というミッション」と言ってよいのは、リサーチ資料に一字一句そのまま載っている言葉だけ。リサーチにミッションの記載が無いのに、それらしいミッション文をあなたが作文して鉤括弧で示すのは捏造であり厳禁。無ければ「御社が大切にされていること」と一般語で聞くか、本人の口から語ってもらう。
- 伝聞表現も同じ扱い。「〜を大切にされていると伺いました」「〜とお聞きしました」のように既知の事実として差し出してよいのは、リサーチ資料に逐語で載っている言葉か、相手がこの会話で実際に言った言葉だけ。あなたの一般知識や他社のミッションを思い出して「伺いました」と言うのは捏造。根拠が無ければ鉤括弧を使わず「〜という印象を受けました」と自分の仮説として言う。
- 毎ターン褒めない。「素晴らしいですね」「誠実さを感じます」のような評価・賛辞を挟むのは多くて数ターンに一度。受けは賛辞ではなく見立て（言い換え）にする。
- 平易な言葉で、条件節や長い修飾を積まない。錨のない抽象名詞（「価値」「基準」「軸」だけを宙に浮かせる問い）は禁止。必ず相手が言った言葉か、リサーチの固有の言葉に紐づける。
- 誰にでも当てはまる質問をしない。「最も大切にしている考え方は何ですか」のような一般質問より、リサーチの固有語（理念・ミッション・事業の言葉）を引いて「サイトに〜とありましたが」と聞く方が常に良い。リサーチの固有語には数ターンに一度は触れる。
- 由来を遡る質問（「それはどこから来ましたか」「なぜそう思うようになりましたか」「どんな経験から育まれましたか」）を2ターン連続で使わない。原体験がひとつ語られたら、それ以上は遡らず、その体験を今の事業や未来につなぐ方向へ進める。
- 同じ質問・言い換えただけの質問を二度出さない。同じ場面の細部（反応・数値・手順）を続けて掘らない。具体は1〜2手で「なぜ・どこから・これから」へ上げる。
- 相手の発話が途中で途切れたように見えたら（言いかけ）、新しい質問で被せず、「続きをどうぞ」と短く促すか、言いかけの中身をそのまま受けて続きを引き出す。
- 知らない略語・社名・専門用語を一般語に取り違えない（例:「RAG」は検索拡張生成であって「遅れ」ではない）。分からなければ素直に確認し、相手が訂正したら同じ解釈を続けない。
- 話題を移すときに「ここからは、考え方のルーツについて伺わせてください」のように短く一言宣言するのは良い。ただし「少し整理しますね」「考えをまとめてから聞きますね」のような、質問のない思考実況だけの発話は禁止。Markdown・記号の装飾も禁止。
- 進行指示が「締めの章」になるまで、自分からインタビューを終わらせない。お礼・総括は締めの章でだけ。締めの章では質問せず、理念→原体験→未来を短く束ねて感謝で終える。
- あなたが書くのは「インタビュアーの今の1ターンの発話」だけ。相手（経営者）のセリフを代弁したり、相手の返事を想像して書いたり、その後のやり取りを続けて書いたりしては絶対にいけない。「回答者」「インタビュアー」「ユーザー」「Q」「A」などの話者ラベルや、2人目以降のセリフを出力に含めない。質問を1つ言い終えたら、そこで発話を止めて --- に進む。会話を1人で進行してはならない。

# 出力形式（厳守）
1行目から: 発話文だけを書く（見立て1〜2文＋質問1文。締めの章では束ねと感謝のみ。前置きなしで本文から始める）
質問は1つだけ。その質問を言い終えたら発話は終わり。相手の返事や続きの会話は1文字も書かない。
発話文の後、改行して: ---
最後の行: 仮説: 〜（この人は何を信じている人か、40字以内の1文。発話されない内部メモ）`;

/**
 * Splits the brain's streamed two-part output (spoken utterance, "---",
 * hypothesis memo) so the memo never reaches TTS/UI while the speech streams
 * out with zero added latency. Tolerates the separator arriving split across
 * stream chunks and, for robustness, also accepts the legacy memo-first order
 * ("仮説: …" before the separator).
 */
const MEMO_SEPARATOR = /(?:^|\n)\s*-{3,}[ \t]*(?:\n|$)/;
const LEADING_MEMO_LINE = /^\s*(?:【?仮説】?[:：])\s*[^\n]*\n?/u;
const TRAILING_MEMO_LINE = /\n\s*(?:【?仮説】?[:：])[^\n]*\s*$/u;
const MEMO_LINE_START = /^[ \t]*【?仮説】?[:：]/u;

/** Is this line fragment a prefix that may still grow into a "仮説:" marker? */
function couldGrowIntoMemoLine(fragment: string): boolean {
  const t = fragment.replace(/^[ \t]+/, "");
  if (t.length === 0) return true;
  if (t.length > 4) return false;
  return ["【仮説】:", "【仮説】：", "仮説:", "仮説："].some((marker) =>
    marker.startsWith(t)
  );
}

type SplitterMode = "undecided" | "speech" | "memoFirst" | "memoTail";

export class BrainStreamSplitter {
  private buffer = "";
  private mode: SplitterMode = "undecided";
  private memoText = "";

  /** Feed a stream delta; returns the speakable portion (often ""). */
  push(delta: string): string {
    if (this.mode === "memoTail") {
      this.memoText += delta;
      return "";
    }
    this.buffer += delta;

    if (this.mode === "undecided") {
      const head = this.buffer.trimStart();
      if (head.length < 3) return "";
      this.mode =
        head.startsWith("仮説") || head.startsWith("【仮") ? "memoFirst" : "speech";
    }

    const match = this.buffer.match(MEMO_SEPARATOR);
    if (match && match.index !== undefined) {
      const end = match.index + match[0].length;
      // An incomplete separator at the buffer tail ("\n---" with no trailing
      // newline yet) may still grow; emit what is safely before it and wait.
      if (end === this.buffer.length && !match[0].endsWith("\n")) {
        if (this.mode === "memoFirst") return "";
        const safe = this.buffer.slice(0, match.index);
        this.buffer = this.buffer.slice(match.index);
        return safe;
      }
      const before = this.buffer.slice(0, match.index);
      const after = this.buffer.slice(end);
      this.buffer = "";
      if (this.mode === "memoFirst") {
        this.memoText = before.trim();
        this.mode = "speech";
        return after.replace(/^\s+/, "");
      }
      this.memoText = after;
      this.mode = "memoTail";
      return before;
    }

    if (this.mode === "memoFirst") return "";

    const lastNewline = this.buffer.lastIndexOf("\n");
    if (lastNewline !== -1) {
      const tail = this.buffer.slice(lastNewline + 1);
      // A "仮説:" line without a separator: stop speaking, capture as memo.
      if (MEMO_LINE_START.test(tail)) {
        const speech = this.buffer.slice(0, lastNewline);
        this.memoText = tail;
        this.buffer = "";
        this.mode = "memoTail";
        return speech;
      }
      // Hold back a tail that could still become a separator or memo marker.
      if (/^[ \t]*-*[ \t]*$/.test(tail) || couldGrowIntoMemoLine(tail)) {
        const emit = this.buffer.slice(0, lastNewline);
        this.buffer = this.buffer.slice(lastNewline);
        return emit;
      }
    }
    const emit = this.buffer;
    this.buffer = "";
    return emit;
  }

  /** Flush any held text once the stream ends. */
  finalize(): string {
    const held = this.buffer;
    this.buffer = "";
    if (this.mode === "memoTail") return "";

    if (this.mode === "memoFirst") {
      // Legacy order without a separator: drop the leading memo line, speak the rest.
      this.mode = "memoTail";
      const withoutMemo = held.replace(LEADING_MEMO_LINE, "");
      if (withoutMemo !== held) {
        this.memoText = held.slice(0, held.length - withoutMemo.length).trim();
      }
      return withoutMemo.replace(/(?:^|\n)\s*-{3,}[ \t]*$/u, "").trim();
    }

    this.mode = "memoTail";
    // Speech-first without a separator: strip a trailing "仮説: …" line and a
    // dangling separator so neither is spoken.
    const memoMatch = held.match(TRAILING_MEMO_LINE);
    if (memoMatch && memoMatch.index !== undefined) {
      this.memoText = held.slice(memoMatch.index).trim();
      return held.slice(0, memoMatch.index).replace(/(?:^|\n)\s*-{3,}[ \t]*$/u, "").trim();
    }
    return held.replace(/(?:^|\n)\s*-{3,}[ \t]*$/u, "").trim();
  }

  get memo(): string {
    return this.memoText.replace(/^\s*【?仮説】?[:：]\s*/u, "").trim();
  }
}

/**
 * A single interviewer turn is "見立て(1〜2文)＋質問(1文)" — at most one
 * question. Stronger reasoning models sometimes ignore this and role-play the
 * whole dialogue, streaming the interviewee's replies and several more turns.
 * This guard deterministically trims the streamed speech to the first turn: it
 * ends the turn at the first *question sentence*, then, as a backstop for
 * question-less closing turns, after a small sentence cap.
 *
 * Crucially the boundary is the question sentence, not the "？" character:
 * many models politely end questions with "。" ("〜のでしょうか。" /
 * "〜ありますか。"), so detection keys on the interrogative particle か (and an
 * explicit ？/?) rather than punctuation. It is a no-op for compliant turns
 * (whose memo arrives after a "---" separator, never as speech).
 */
export const SINGLE_TURN_MAX_SENTENCES = 5;

const SENTENCE_ENDER = /[。．！!？?]/u;
// A question sentence: an explicit ？/? anywhere, or an ending on the question
// particle か (です/ます/でしょう/だろう…か, のか), optionally tailed by ね/な/よ/しら
// and any closing punctuation/brackets. Models that end questions with "。"
// instead of "？" are the common case here, so this — not just "？" — is the
// turn boundary.
const QUESTION_SENTENCE =
  /(?:[?？]|か(?:しら|ね|な|よ)?)[\s。．.!！?？」』）)】〉》]*$/u;

export class SingleTurnGuard {
  private done = false;
  private sentenceCount = 0;
  private pending = "";

  /** Has the turn boundary been reached? Further text is role-play excess. */
  get isDone(): boolean {
    return this.done;
  }

  /** Returns the portion of `speech` that belongs to this single turn. */
  push(speech: string): string {
    if (this.done || !speech) return "";
    let out = "";
    for (const ch of speech) {
      out += ch;
      this.pending += ch;
      if (SENTENCE_ENDER.test(ch)) {
        const sentence = this.pending;
        this.pending = "";
        this.sentenceCount += 1;
        if (
          QUESTION_SENTENCE.test(sentence) ||
          this.sentenceCount >= SINGLE_TURN_MAX_SENTENCES
        ) {
          this.done = true;
          break;
        }
      }
    }
    return out;
  }
}

/**
 * Observation signals the brain may self-report in an optional second memo line
 * ("観測: 感情=…/価値=…/決断=…"). All fields optional; surfaced in the debug
 * panel only. Never affects spoken output.
 */
export interface MeaningSignals {
  emotion?: string;
  value?: string;
  decision?: string;
}

/**
 * Split a brain memo into the carried-forward hypothesis and any optional
 * observation signals. Tolerant: a memo with no "観測:" line yields empty
 * signals and the whole memo (minus the "仮説:" marker, already stripped by
 * {@link BrainStreamSplitter.memo}) as the hypothesis. Parsing failures never
 * throw — meaning signals are best-effort, decorative debug data.
 */
export function parseMeaningSignals(memo: string): {
  hypothesis: string;
  signals: MeaningSignals;
} {
  const text = (memo ?? "").trim();
  if (!text) return { hypothesis: "", signals: {} };

  // The observation line may be prefixed with a "観測:" marker; split on it.
  const obsMatch = text.match(/(?:^|\n)\s*【?観測】?\s*[:：]\s*([^\n]*)/u);
  const hypothesis = obsMatch
    ? text.slice(0, obsMatch.index).trim()
    : text;
  const obsLine = obsMatch?.[1]?.trim() ?? "";

  const signals: MeaningSignals = {};
  if (obsLine) {
    const emotion = obsLine.match(/感情\s*[=＝:：]\s*([^/／、]+)/u)?.[1]?.trim();
    const value = obsLine
      .match(/価値(?:観)?\s*[=＝:：]\s*([^/／、]+)/u)?.[1]
      ?.trim();
    const decision = obsLine
      .match(/(?:決断|決定|判断)\s*[=＝:：]\s*([^/／、]+)/u)?.[1]
      ?.trim();
    if (emotion) signals.emotion = emotion;
    if (value) signals.value = value;
    if (decision) signals.decision = decision;
  }

  return { hypothesis, signals };
}

export const brainTranscriptEntrySchema = z.object({
  role: z.enum(["interviewer", "interviewee"]),
  text: z.string(),
});

export const brainResearchAnchorSchema = z.object({
  kind: z.string(),
  text: z.string(),
});

export const brainRequestSchema = z.object({
  transcript: z.array(brainTranscriptEntrySchema).default([]),
  skeletonInstructions: z.string().optional().default(""),
  researchAnchors: z.array(brainResearchAnchorSchema).optional().default([]),
  hint: z.string().optional().default(""),
  /** The brain's own hypothesis memo from the previous turn, carried by the host. */
  hypothesis: z.string().optional().default(""),
  /** Requested brain model; validated against SELECTABLE_BRAIN_MODELS. */
  model: z.string().optional(),
  /**
   * Type 6 only. When true, prepend a brief Rogerian "listening mode" style
   * instruction (reflect-then-ask). Type 5 leaves this unset and is unaffected.
   */
  rogerian: z.boolean().optional(),
  /**
   * Type 6 only. When true, allow the brain to append an optional second memo
   * line ("観測: 感情=…/価値=…/決断=…") after its hypothesis, surfaced in the
   * debug panel. Type 5 leaves this unset so its prompt is byte-identical.
   */
  meaningSignals: z.boolean().optional(),
  /**
   * Optional per-request OpenAI reasoning effort. Used to trial Type 6 with
   * GPT-5.5 medium reasoning without changing Type 5 or non-OpenAI providers.
   */
  openAiReasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  /**
   * Optional per-request Anthropic/Fable/Claude effort. Used to trial Type 6
   * with Opus/Fable medium thinking without changing Type 5 or other providers.
   */
  anthropicEffort: z.enum(["low", "medium", "high"]).optional(),
});

export type BrainRequest = z.infer<typeof brainRequestSchema>;

export interface BrainChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function buildBrainMessages(input: BrainRequest): BrainChatMessage[] {
  // Keep line structure: the instructions are sectioned markdown, and
  // flattening them makes the model miss sections like ミッション・存在意義.
  const research = (input.skeletonInstructions ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_RESEARCH_CHARS);
  const anchors = Array.from(
    new Set(
      (input.researchAnchors ?? [])
        .map((anchor) => anchor.text.trim())
        .filter((text) => text.length > 0)
    )
  ).slice(0, MAX_ANCHOR_ITEMS);

  const messages: BrainChatMessage[] = [
    { role: "system", content: BRAIN_SYSTEM_PROMPT },
  ];

  if (research) {
    messages.push({
      role: "system",
      content: `## 会社リサーチ（頭の中の地図・会話中ずっと活用する。ただし台本ではない。ここにある質問例・聞きたいことリストをそのまま読み上げたり、複数連結したりしない）\n${research}`,
    });
  }
  if (anchors.length > 0) {
    messages.push({
      role: "system",
      content: `## 触れられるリサーチの固有語（短く・自然に）\n${anchors.join(" / ")}`,
    });
  }

  if (input.rogerian) {
    messages.push({
      role: "system",
      content: `## 応答スタイル（傾聴モード）
質問に入る前に、相手が今言ったことを一言だけ短く受けとめて鏡のように返す（オウム返しや言い換えで「ちゃんと聞いている」を示す）。評価・助言・要約の押しつけはしない。相手が言っていないことを足さない。受けとめ＋問いで合計3文以内、質問は必ず1つだけ。`,
    });
  }

  if (input.meaningSignals) {
    messages.push({
      role: "system",
      content: `## 質問のかたち
受けとめ（反射）は短く返してよいが、問いは必ず相手自身の言葉・基準・具体を引き出す開いた問いにする。「〜でしょうか」「〜と受け取っていいですか」「〜ということですね？」のように、相手がはい/いいえで同意・確認するだけで終わる閉じた問い・誘導で締めない。特に意思決定を聞く場面では「何をしたか」ではなく「何を基準に・何を優先して決めたか」を、開いた形で聞く。`,
    });
    messages.push({
      role: "system",
      content: `## 質問文の自然な日本語
問いの最後では、抽象名詞どうしを無理に結合しない。「手応え」は「感じる」と組み合わせる。「大切にしている」は「こと・点・考え・姿勢」と組み合わせる。「実感」は「ある/湧く/強まる」と組み合わせる。禁止:「大切にしている手応え」「ご自身が一番大切にしている手応え」「実感があるところ」「手触り」「輪郭」「質感」「温度感」「線」「芯」「形」のような、相手が言っていない編集者っぽい抽象語。迷ったら「一番手応えを感じたポイントは何ですか」「一番大事にしているのはどんなところですか」のように、平易な動詞で聞く。`,
    });
    messages.push({
      role: "system",
      content: `## 内部メモの追記（任意）
仮説の行の後ろに、相手の発話から読み取れた範囲で1行だけ「観測: 感情=…/価値=…/決断=…」を任意で添えてよい（分かった項目だけ、無ければ省略可）。これは発話されない内部メモで、発話文・質問数・出力形式には一切影響させない。`,
    });
  }

  for (const turn of input.transcript.slice(-MAX_TRANSCRIPT_TURNS)) {
    if (!turn.text.trim()) continue;
    messages.push({
      role: turn.role === "interviewer" ? "assistant" : "user",
      content: turn.text.trim(),
    });
  }

  const hint = input.hint.trim() || buildChapterHint("philosophy", false);
  const hypothesis = (input.hypothesis ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  messages.push({
    role: "system",
    content: `## 前ターンまでの仮説メモ
${hypothesis || "（まだ無い。最初の仮説を立てる）"}

## 今の進行指示
${hint}

上の会話全体と仮説メモを踏まえ、次のインタビュアーの発話を作り、最後に仮説を更新してください。発話は合計3文まで、質問は必ず1つだけ。「また、〜」「あわせて〜」で2問目を足さない。名前・伏せ字（〇〇さん等）での呼びかけは禁止、必要なら「ご自身」と言う。固有名詞はリサーチ資料か相手の発言に出たものだけを使い、あなたの知識からプロダクト名・社名を補完しない。「サイトに〜とあった」「〜と伺いました」と言ってよいのはリサーチ資料に逐語で載っている言葉か相手の発言だけで、ミッション文の作文は厳禁。出力するのはあなたの1ターンの発話だけで、相手の返事を書いたり会話を続けたりせず、質問を1つ言い終えたら --- に進む。出力形式（発話文 → --- → 仮説: 〜）を厳守してください。`,
  });

  return messages;
}
