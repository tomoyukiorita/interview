/**
 * One-off comparison: same interview transcript → different brain candidates.
 * Prints TTFT, stream granularity, and the generated question side by side so
 * latency and quality can be judged before changing the default brain model.
 *
 * Usage:
 *   npx tsx scripts/compare-thinking.ts                # gemini minimal vs medium
 *   npx tsx scripts/compare-thinking.ts <fable-slug>   # gemini minimal vs Fable 5
 *
 * The Fable/Claude run requires ANTHROPIC_API_KEY in .env.local.
 */
import { readFileSync } from "node:fs";
import { buildBrainMessages } from "../src/lib/interview-brain";

const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";
const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";

function loadEnvKey(...names: string[]): string | null {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    for (const name of names) {
      const match = line.match(new RegExp(`^${name}=(.+)$`));
      if (match) return match[1].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return null;
}

// Real session transcript (13:51 session).
const transcript = [
  {
    role: "interviewer" as const,
    text: "まずはアイスブレイクから始めますね。よければ一度、背伸びをして、ゆっくり深呼吸してみてください。終わったら教えてくださいね。",
  },
  { role: "interviewee" as const, text: "終わりました。" },
  {
    role: "interviewer" as const,
    text: "深呼吸、ありがとうございます。今回はまず、あなたが掲げている理念やミッション、あるいはご自身の事業を表現する際によく使われている「固有の言葉」や「こだわりのキーワード」を1つ教えていただけますか？",
  },
  { role: "interviewee" as const, text: "情熱です。" },
  {
    role: "interviewer" as const,
    text: "「情熱」という、とても力強く、熱量の伝わってくる言葉ですね。あなたがこれまでの人生や活動の中で、「情熱こそが何よりも大切だ」と強く胸に刻まれるようになった、具体的な出来事やご経験はありますか？",
  },
  {
    role: "interviewee" as const,
    text: "元々雑誌の編集をやっていたんですけども、やっぱり結構休みのない仕事といいますか、時間に追われるような仕事ではあったんですけども、そういう時ってやっぱり情熱を持って取り組まないとなかなか仕事を続けられないっていうのがありまして、続けていると、情熱を持って続けていると結果も出やすいっていうことをその時経験したので、自分の中の一つキーワードになっているのかなと思います。",
  },
];

const messages = buildBrainMessages({
  transcript,
  skeletonInstructions:
    "AIプロダクト開発企業。ミッションは「Beyond Intelligence（知性のその先へ）」。顧客の課題をAIで超える価値に変えることを掲げる。",
  researchAnchors: [
    { kind: "mission", text: "Beyond Intelligence" },
    { kind: "distinctiveWord", text: "知性のその先へ" },
  ],
  hint: "今は【原体験】の章。その理念がどこから来たのかを聞く。ただし原体験がひとつ語られたら、それ以上『その想いはどこから』と遡らない。語られた体験と今の事業をつなぐ方向へ進める。",
  hypothesis: "情熱の継続が成果を生むと信じている人",
});

interface Candidate {
  label: string;
  model: string;
  baseURL: string;
  apiKey: string;
  extraBody?: Record<string, unknown>;
}

async function run(candidate: Candidate) {
  const startedAt = Date.now();
  const res = await fetch(`${candidate.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${candidate.apiKey}`,
    },
    body: JSON.stringify({
      model: candidate.model,
      messages,
      stream: true,
      ...(candidate.extraBody ?? {}),
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`request failed: ${res.status} ${await res.text()}`);
  }

  let ttftMs: number | null = null;
  let deltaCount = 0;
  let text = "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
      const delta = JSON.parse(line.slice(6))?.choices?.[0]?.delta?.content;
      if (!delta) continue;
      deltaCount += 1;
      if (ttftMs === null) ttftMs = Date.now() - startedAt;
      text += delta;
    }
  }
  const totalMs = Date.now() - startedAt;
  const formatOk = /---/.test(text) && /仮説/.test(text);
  console.log(`\n===== ${candidate.label} (${candidate.model}) =====`);
  console.log(
    `TTFT: ${ttftMs}ms / total: ${totalMs}ms / deltas: ${deltaCount} / format(発話→---→仮説): ${
      formatOk ? "OK" : "NG"
    }`
  );
  console.log(text);
}

async function main() {
  const fableModel = process.argv[2];
  const geminiKey = loadEnvKey("GEMINI_API_KEY", "GOOGLE_API_KEY");
  if (!geminiKey) throw new Error("GEMINI_API_KEY not found in .env.local");

  const candidates: Candidate[] = [
    {
      label: "gemini minimal",
      model: "gemini-3.5-flash",
      baseURL: GEMINI_BASE_URL,
      apiKey: geminiKey,
      extraBody: {
        extra_body: {
          google: { thinking_config: { thinking_level: "minimal" } },
        },
      },
    },
  ];

  if (fableModel) {
    const anthropicKey = loadEnvKey("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      throw new Error(
        "ANTHROPIC_API_KEY not found in .env.local — add it before comparing Fable/Claude models"
      );
    }
    candidates.push(
      {
        label: "fable (default effort)",
        model: fableModel,
        baseURL: ANTHROPIC_BASE_URL,
        apiKey: anthropicKey,
        extraBody: { max_tokens: 1024 },
      },
      {
        label: "fable (effort low)",
        model: fableModel,
        baseURL: ANTHROPIC_BASE_URL,
        apiKey: anthropicKey,
        // output_config.effort caps the adaptive thinking budget, trading
        // reasoning depth for TTFT. Accepted by the OpenAI-compat endpoint.
        extraBody: { max_tokens: 1024, output_config: { effort: "low" } },
      }
    );
  } else {
    candidates.push({
      label: "gemini medium",
      model: "gemini-3.5-flash",
      baseURL: GEMINI_BASE_URL,
      apiKey: geminiKey,
      extraBody: {
        extra_body: {
          google: { thinking_config: { thinking_level: "medium" } },
        },
      },
    });
  }

  for (const candidate of candidates) {
    await run(candidate);
  }
}

void main();
