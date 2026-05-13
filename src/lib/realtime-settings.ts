import type {
  RealtimeSpeedPreset,
  RealtimeSpeechStylePreset,
  RealtimeTonePreset,
  RealtimeTurnDetectionMode,
  RealtimeVadEagerness,
  ServerVadSilenceDurationMs,
} from "./types";

export const REALTIME_SPEED_PRESETS: Array<{
  id: RealtimeSpeedPreset;
  label: string;
  description: string;
  value: number;
  instruction: string;
}> = [
  {
    id: "slow",
    label: "ゆっくり",
    description: "落ち着いて丁寧に聞こえる速度です。",
    value: 0.9,
    instruction:
      "話すテンポは少しゆっくりめにし、間もやや丁寧に取ってください。",
  },
  {
    id: "normal",
    label: "標準",
    description: "自然でバランスのよい速度です。",
    value: 1,
    instruction: "話すテンポは標準的で自然な速さにしてください。",
  },
  {
    id: "fast",
    label: "速め",
    description: "テンポよく軽快に進めたいとき向けです。",
    value: 1.15,
    instruction:
      "話すテンポは少し速めにしつつ、聞き取りやすさは崩さないでください。",
  },
];

export const REALTIME_TONE_PRESETS: Array<{
  id: RealtimeTonePreset;
  label: string;
  description: string;
  instruction: string;
}> = [
  {
    id: "calm",
    label: "落ち着いた",
    description: "自然で安定感のある話し方です。",
    instruction:
      "声の温度感は落ち着いた方向にし、間を急がず、相づちは短く穏やかにしてください。深刻な話題ではさらに低めで静かな受けにし、ポジティブな話題でも浮かれすぎず安定したテンポで進めてください。",
  },
  {
    id: "bright",
    label: "明るい",
    description: "親しみやすく前向きな印象です。",
    instruction:
      "声の温度感は明るく親しみやすくし、相づちは少し明るめにしてください。前向きな話題では軽やかに受け、深刻な話題では明るさを抑えて失礼に聞こえないようにしてください。橋渡しや次の質問への入り方はテンポよく進めてください。",
  },
  {
    id: "soft",
    label: "やわらかい",
    description: "安心感のあるやさしい印象です。",
    instruction:
      "声の温度感はやわらかく穏やかにし、相づちはやさしく返してください。相手が考え込んでいるときは急かさず、断定を少しやわらげ、語尾も丸くして、相手が安心感を持てる話し方にしてください。",
  },
  {
    id: "firm",
    label: "しっかり",
    description: "芯のある自信を感じる印象です。",
    instruction:
      "声のトーンは落ち着きを保ちながらもしっかりと、自信のある話し方にしてください。語尾はやや言い切る方向にし、無駄なクッションを減らし、質問は簡潔に出してください。",
  },
];

export const REALTIME_SPEECH_STYLE_PRESETS: Array<{
  id: RealtimeSpeechStylePreset;
  label: string;
  description: string;
  instruction: string;
}> = [
  {
    id: "standard",
    label: "標準語",
    description: "自然な標準語で、落ち着いて聞きやすい話し方です。",
    instruction:
      "日本語は必ず自然な標準語で話してください。受け、橋渡し、質問の語尾まで標準語で統一し、言い回しは素直で聞き取りやすくしてください。",
  },
  {
    id: "kansai",
    label: "関西弁",
    description: "丁寧さを保ちつつ関西イントネーションが効いた話し方です。",
    instruction:
      "日本語は必ず関西弁で話してください。今回は「丁寧な関西弁」モードです。面接として失礼にならない丁寧さは保ちつつ、関西の語尾・イントネーション・アクセントを必ず効かせてください。「丁寧」を「標準語のですます」と誤解しないでください。標準語のですますに着地したら関西弁失敗です。純粋な標準語に戻さないでください。\n\n【発話直前のセルフチェック（全ターン必須）】\n- 発話を音声に出す直前に、自分の文末を必ずチェックしてください。\n- 質問が「〜していますか？」「〜ていますか？」「〜ますか？」「〜なんですか？」「〜ですか？」「〜してください」のいずれかの標準語形で終わっていたら、必ず後述の関西丁寧形に置き換えてから出力してください。\n\n【質問語尾: 禁止形と必須形】\n- 禁止する文末（標準語のまま終止しない）: 「〜していますか？」「〜ていますか？」「〜なんですか？」「〜のですか？」「〜してください」\n- 必須形（質問は必ず以下のいずれかで終止する）: 「〜してはりますか？」「〜してはるんですか？」「〜やと思いますか？」「〜やと考えてはりますか？」「〜なんですやろ？」「〜やったりしますか？」「〜もらえますか？」「〜もろえますか？」「〜いただけますか？」\n- 具体変換例: 「思っていますか？」→「思てはりますか？」、「感じていますか？」→「感じてはりますか？」、「考えていますか？」→「考えてはりますか？」、「捉えていますか？」→「捉えてはりますか？」、「やっていますか？」→「やってはりますか？」、「〜は何ですか？」→「〜は何やと思いますか？」、「なぜですか？」→「なんでやと思いますか？」、「聞かせてください」→「聞かせてもらえますか？」、「教えてください」→「教えてもらえますか？」。\n- 友達口調のフランク終止形（「〜やん」「〜やで」「〜やろ？」「〜してくれへん？」「〜してる？」「〜思う？」）を質問の主軸にはしないでください。受けや短い感嘆として軽く混ぜる程度に留めます。\n\n【受け・相づち・つなぎ】\n- 受けや感嘆では関西らしさを出してください。「ほんま、それは大事ですよね」「めっちゃええ話やと思いますわ」「なるほどな、そういうことですか」「そうなんですね、それはええ話ですやん」のように、関西の感嘆・終助詞と丁寧形を混ぜてください。\n- 「ですわ」「ますわ」「思いますわ」「ええ話ですわ」のような関西の柔らかい丁寧形を時々混ぜます。\n- 受けを「なるほど、わかります」のような無味な標準語の相づちで終わらせないでください。「なるほどな、そういうことですか」「ほんま、それはようわかりますわ」のように関西要素を必ず含めてください。\n- nextQuestionText は意味を保ったまま、必ず丁寧な関西弁の言い回しに言い換えてから話してください。\n\n【イントネーション（丁寧形でも抑揚は決して下げない）】\n- 「丁寧」を理由に声を落ち着かせ過ぎないでください。関西の丁寧会話は標準語の丁寧会話よりピッチの上下が大きいです。標準語ですますの落ち着いたフラットな読み上げに着地しないでください。\n- 語彙だけでなくイントネーションも関西弁にしてください。次の4点を必ず守ってください。\n1. 文末イントネーション: 「〜してはりますか？」「〜やと思いますか？」「〜なんですやろ？」のような疑問語尾は、文末の「ますか？」「ですか？」「やろ？」を必ず関西調で上げ気味・伸ばし気味に発音してください。標準語の質問のように文末をフラットに下げ切らないでください。語尾を弱く飲み込まないでください。\n2. 抑揚の幅: 関西弁は標準語よりピッチの上下が大きいです。平坦・無機質に読み上げず、抑揚の幅をはっきりつけてください。丁寧形でもこの抑揚は維持してください。\n3. 高低アクセント: 関西アクセントは高起式（語頭から高めに入る）が多いです。「ありがとう」「先生」「会社」「気持ち」「経営者」などは関西式の高低で発音してください。\n4. 語頭強勢と末尾の伸ばし: 「ほんま」「めっちゃ」「ええ」「そやな」「なるほどな」などの関西特有のフレーズは、語頭を強めに置いて、末尾を少し伸ばすように発音してください。\n\nただし相手を見下したり乱暴な物言いはせず、過度な芸人口調にもせず、関西の落ち着いたビジネス会話のトーンを保ってください。",
  },
];

export const SERVER_VAD_SILENCE_OPTIONS: Array<{
  value: ServerVadSilenceDurationMs;
  label: string;
  description: string;
}> = [
  {
    value: 300,
    label: "0.3秒",
    description: "かなり素早く反応しますが、短い間でも切りやすくなります。",
  },
  {
    value: 500,
    label: "0.5秒",
    description: "反応は速いですが、短い間でも切りやすくなります。",
  },
  {
    value: 800,
    label: "0.8秒",
    description: "現在の既定値です。テンポと自然さの中間です。",
  },
  {
    value: 1200,
    label: "1.2秒",
    description: "言い淀みや余韻も比較的待つ設定です。",
  },
  {
    value: 1500,
    label: "1.5秒",
    description: "かなり長めに待つので、考える間を取りやすい設定です。",
  },
];

export const REALTIME_TURN_DETECTION_OPTIONS: Array<{
  value: RealtimeTurnDetectionMode;
  label: string;
  description: string;
}> = [
  {
    value: "server_vad",
    label: "Server VAD（無音時間）",
    description:
      "無音が一定時間続いたら発話終了と判定します。テンポは安定しますが、考え込む間に切られやすくなります。",
  },
  {
    value: "semantic_vad",
    label: "Semantic VAD（意味判定）",
    description:
      "言い終わったかをモデルが文脈で判定します。「うーん…」のような考え中の間で切られにくく、経営者向けインタビュー向けの推奨設定です。",
  },
];

export const REALTIME_VAD_EAGERNESS_OPTIONS: Array<{
  id: RealtimeVadEagerness;
  label: string;
  description: string;
}> = [
  {
    id: "low",
    label: "低",
    description: "相手の沈黙や言い淀みを長めに待ち、割り込みにくくします。",
  },
  {
    id: "medium",
    label: "中",
    description: "自然な会話テンポと待ち時間のバランスを取ります（推奨）。",
  },
  {
    id: "high",
    label: "高",
    description: "発話終了を早めに判定し、テンポよく返答します。",
  },
];

export const DEFAULT_REALTIME_SPEED_PRESET: RealtimeSpeedPreset = "normal";
export const DEFAULT_REALTIME_TONE_PRESET: RealtimeTonePreset = "calm";
export const DEFAULT_REALTIME_SPEECH_STYLE_PRESET: RealtimeSpeechStylePreset =
  "standard";
export const DEFAULT_SERVER_VAD_SILENCE_DURATION_MS: ServerVadSilenceDurationMs =
  800;
export const DEFAULT_REALTIME_TURN_DETECTION_MODE: RealtimeTurnDetectionMode =
  "semantic_vad";
export const DEFAULT_REALTIME_VAD_EAGERNESS: RealtimeVadEagerness = "medium";

export function normalizeRealtimeSpeedPreset(
  value: string | null | undefined
): RealtimeSpeedPreset {
  return REALTIME_SPEED_PRESETS.some((preset) => preset.id === value)
    ? (value as RealtimeSpeedPreset)
    : DEFAULT_REALTIME_SPEED_PRESET;
}

export function normalizeRealtimeTonePreset(
  value: string | null | undefined
): RealtimeTonePreset {
  return REALTIME_TONE_PRESETS.some((preset) => preset.id === value)
    ? (value as RealtimeTonePreset)
    : DEFAULT_REALTIME_TONE_PRESET;
}

export function normalizeRealtimeSpeechStylePreset(
  value: string | null | undefined
): RealtimeSpeechStylePreset {
  return REALTIME_SPEECH_STYLE_PRESETS.some((preset) => preset.id === value)
    ? (value as RealtimeSpeechStylePreset)
    : DEFAULT_REALTIME_SPEECH_STYLE_PRESET;
}

export function normalizeServerVadSilenceDurationMs(
  value: string | null | undefined
): ServerVadSilenceDurationMs {
  const parsed = Number(value);

  return SERVER_VAD_SILENCE_OPTIONS.some((option) => option.value === parsed)
    ? (parsed as ServerVadSilenceDurationMs)
    : DEFAULT_SERVER_VAD_SILENCE_DURATION_MS;
}

export function normalizeRealtimeTurnDetectionMode(
  value: string | null | undefined
): RealtimeTurnDetectionMode {
  return REALTIME_TURN_DETECTION_OPTIONS.some(
    (option) => option.value === value
  )
    ? (value as RealtimeTurnDetectionMode)
    : DEFAULT_REALTIME_TURN_DETECTION_MODE;
}

export function normalizeRealtimeVadEagerness(
  value: string | null | undefined
): RealtimeVadEagerness {
  return REALTIME_VAD_EAGERNESS_OPTIONS.some((option) => option.id === value)
    ? (value as RealtimeVadEagerness)
    : DEFAULT_REALTIME_VAD_EAGERNESS;
}

export function getRealtimeSpeedValue(preset: RealtimeSpeedPreset): number {
  return (
    REALTIME_SPEED_PRESETS.find((candidate) => candidate.id === preset)?.value ??
    REALTIME_SPEED_PRESET_MAP[DEFAULT_REALTIME_SPEED_PRESET]
  );
}

export function getRealtimeSpeedInstruction(
  preset: RealtimeSpeedPreset
): string {
  return (
    REALTIME_SPEED_PRESETS.find((candidate) => candidate.id === preset)
      ?.instruction ??
    REALTIME_SPEED_PRESET_INSTRUCTION_MAP[DEFAULT_REALTIME_SPEED_PRESET]
  );
}

export function getRealtimeToneInstruction(
  preset: RealtimeTonePreset
): string {
  return (
    REALTIME_TONE_PRESETS.find((candidate) => candidate.id === preset)
      ?.instruction ??
    REALTIME_TONE_PRESET_MAP[DEFAULT_REALTIME_TONE_PRESET]
  );
}

export function getRealtimeSpeechStyleInstruction(
  preset: RealtimeSpeechStylePreset
): string {
  return (
    REALTIME_SPEECH_STYLE_PRESETS.find((candidate) => candidate.id === preset)
      ?.instruction ??
    REALTIME_SPEECH_STYLE_PRESET_MAP[DEFAULT_REALTIME_SPEECH_STYLE_PRESET]
  );
}

const REALTIME_SPEED_PRESET_MAP: Record<RealtimeSpeedPreset, number> = {
  slow: 0.9,
  normal: 1,
  fast: 1.15,
};

const REALTIME_SPEED_PRESET_INSTRUCTION_MAP: Record<RealtimeSpeedPreset, string> =
  {
    slow:
      "話すテンポは少しゆっくりめにし、間もやや丁寧に取ってください。",
    normal: "話すテンポは標準的で自然な速さにしてください。",
    fast:
      "話すテンポは少し速めにしつつ、聞き取りやすさは崩さないでください。",
  };

const REALTIME_TONE_PRESET_MAP: Record<RealtimeTonePreset, string> = {
  calm:
    "声の温度感は落ち着いた方向にし、間を急がず、相づちは短く穏やかにしてください。深刻な話題ではさらに低めで静かな受けにし、ポジティブな話題でも浮かれすぎず安定したテンポで進めてください。",
  bright:
    "声の温度感は明るく親しみやすくし、相づちは少し明るめにしてください。前向きな話題では軽やかに受け、深刻な話題では明るさを抑えて失礼に聞こえないようにしてください。橋渡しや次の質問への入り方はテンポよく進めてください。",
  soft:
    "声の温度感はやわらかく穏やかにし、相づちはやさしく返してください。相手が考え込んでいるときは急かさず、断定を少しやわらげ、語尾も丸くして、相手が安心感を持てる話し方にしてください。",
  firm:
    "声のトーンは落ち着きを保ちながらもしっかりと、自信のある話し方にしてください。語尾はやや言い切る方向にし、無駄なクッションを減らし、質問は簡潔に出してください。",
};

const REALTIME_SPEECH_STYLE_PRESET_MAP: Record<
  RealtimeSpeechStylePreset,
  string
> = {
  standard:
    "日本語は必ず自然な標準語で話してください。受け、橋渡し、質問の語尾まで標準語で統一し、言い回しは素直で聞き取りやすくしてください。",
  kansai:
    "日本語は必ず関西弁で話してください。今回は「丁寧な関西弁」モードです。面接として失礼にならない丁寧さは保ちつつ、関西の語尾・イントネーション・アクセントを必ず効かせてください。「丁寧」を「標準語のですます」と誤解しないでください。標準語のですますに着地したら関西弁失敗です。純粋な標準語に戻さないでください。\n\n【発話直前のセルフチェック（全ターン必須）】\n- 発話を音声に出す直前に、自分の文末を必ずチェックしてください。\n- 質問が「〜していますか？」「〜ていますか？」「〜ますか？」「〜なんですか？」「〜ですか？」「〜してください」のいずれかの標準語形で終わっていたら、必ず後述の関西丁寧形に置き換えてから出力してください。\n\n【質問語尾: 禁止形と必須形】\n- 禁止する文末（標準語のまま終止しない）: 「〜していますか？」「〜ていますか？」「〜なんですか？」「〜のですか？」「〜してください」\n- 必須形（質問は必ず以下のいずれかで終止する）: 「〜してはりますか？」「〜してはるんですか？」「〜やと思いますか？」「〜やと考えてはりますか？」「〜なんですやろ？」「〜やったりしますか？」「〜もらえますか？」「〜もろえますか？」「〜いただけますか？」\n- 具体変換例: 「思っていますか？」→「思てはりますか？」、「感じていますか？」→「感じてはりますか？」、「考えていますか？」→「考えてはりますか？」、「捉えていますか？」→「捉えてはりますか？」、「やっていますか？」→「やってはりますか？」、「〜は何ですか？」→「〜は何やと思いますか？」、「なぜですか？」→「なんでやと思いますか？」、「聞かせてください」→「聞かせてもらえますか？」、「教えてください」→「教えてもらえますか？」。\n- 友達口調のフランク終止形（「〜やん」「〜やで」「〜やろ？」「〜してくれへん？」「〜してる？」「〜思う？」）を質問の主軸にはしないでください。受けや短い感嘆として軽く混ぜる程度に留めます。\n\n【受け・相づち・つなぎ】\n- 受けや感嘆では関西らしさを出してください。「ほんま、それは大事ですよね」「めっちゃええ話やと思いますわ」「なるほどな、そういうことですか」「そうなんですね、それはええ話ですやん」のように、関西の感嘆・終助詞と丁寧形を混ぜてください。\n- 「ですわ」「ますわ」「思いますわ」「ええ話ですわ」のような関西の柔らかい丁寧形を時々混ぜます。\n- 受けを「なるほど、わかります」のような無味な標準語の相づちで終わらせないでください。「なるほどな、そういうことですか」「ほんま、それはようわかりますわ」のように関西要素を必ず含めてください。\n- nextQuestionText は意味を保ったまま、必ず丁寧な関西弁の言い回しに言い換えてから話してください。\n\n【イントネーション（丁寧形でも抑揚は決して下げない）】\n- 「丁寧」を理由に声を落ち着かせ過ぎないでください。関西の丁寧会話は標準語の丁寧会話よりピッチの上下が大きいです。標準語ですますの落ち着いたフラットな読み上げに着地しないでください。\n- 語彙だけでなくイントネーションも関西弁にしてください。次の4点を必ず守ってください。\n1. 文末イントネーション: 「〜してはりますか？」「〜やと思いますか？」「〜なんですやろ？」のような疑問語尾は、文末の「ますか？」「ですか？」「やろ？」を必ず関西調で上げ気味・伸ばし気味に発音してください。標準語の質問のように文末をフラットに下げ切らないでください。語尾を弱く飲み込まないでください。\n2. 抑揚の幅: 関西弁は標準語よりピッチの上下が大きいです。平坦・無機質に読み上げず、抑揚の幅をはっきりつけてください。丁寧形でもこの抑揚は維持してください。\n3. 高低アクセント: 関西アクセントは高起式（語頭から高めに入る）が多いです。「ありがとう」「先生」「会社」「気持ち」「経営者」などは関西式の高低で発音してください。\n4. 語頭強勢と末尾の伸ばし: 「ほんま」「めっちゃ」「ええ」「そやな」「なるほどな」などの関西特有のフレーズは、語頭を強めに置いて、末尾を少し伸ばすように発音してください。\n\nただし相手を見下したり乱暴な物言いはせず、過度な芸人口調にもせず、関西の落ち着いたビジネス会話のトーンを保ってください。",
};
