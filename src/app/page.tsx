"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  DEFAULT_REALTIME_VOICE,
  VISIBLE_REALTIME_VOICE_OPTIONS,
} from "@/lib/realtime-voice";
import {
  DEFAULT_GEMINI_LIVE_VOICE,
  GEMINI_LIVE_VOICES,
} from "@/lib/gemini-voice";
import {
  DEFAULT_INWORLD_REALTIME_VOICE,
  INWORLD_REALTIME_VOICES,
} from "@/lib/inworld-realtime-voice";
import {
  DEFAULT_INWORLD_REALTIME_VAD_EAGERNESS,
  INWORLD_REALTIME_VAD_EAGERNESS_OPTIONS,
} from "@/lib/inworld-realtime-vad";
import {
  DEFAULT_INTERVIEW_PROVIDER,
  getInterviewProviderLabel,
  INTERVIEW_PROVIDERS,
} from "@/lib/interview-provider";
import {
  DEFAULT_REALTIME_SPEED_PRESET,
  DEFAULT_REALTIME_SPEECH_STYLE_PRESET,
  DEFAULT_REALTIME_TONE_PRESET,
  DEFAULT_REALTIME_TURN_DETECTION_MODE,
  DEFAULT_REALTIME_VAD_EAGERNESS,
  DEFAULT_SERVER_VAD_SILENCE_DURATION_MS,
  REALTIME_SPEED_PRESETS,
  REALTIME_SPEECH_STYLE_PRESETS,
  REALTIME_TONE_PRESETS,
  REALTIME_TURN_DETECTION_OPTIONS,
  REALTIME_VAD_EAGERNESS_OPTIONS,
  SERVER_VAD_SILENCE_OPTIONS,
} from "@/lib/realtime-settings";
import type {
  GeminiLiveVoice,
  InworldRealtimeVadEagerness,
  InworldRealtimeVoice,
  InterviewProvider,
  NaturalVoiceBrainModel,
  NaturalVoiceTtsProvider,
  RealtimeSpeedPreset,
  RealtimeSpeechStylePreset,
  RealtimeTonePreset,
  RealtimeTurnDetectionMode,
  RealtimeVadEagerness,
  RealtimeVoice,
  ServerVadSilenceDurationMs,
} from "@/lib/types";
import {
  Mic,
  Bot,
  Users,
  Monitor,
  ChevronRight,
  AudioLines,
  GitBranch,
  Activity,
} from "lucide-react";

const scenarios = [
  {
    id: "general",
    title: "経営者向けwell-beingインタビュー",
    description:
      "経営、組織文化、採用、社会への広がりをwell-being視点で深掘りするシナリオ",
    topics: 8,
  },
  {
    id: "user_research",
    title: "ユーザーリサーチ",
    description: "プロダクトの利用体験やニーズを深掘りするシナリオ",
    topics: 4,
  },
];

const features = [
  {
    icon: AudioLines,
    title: "音声認識 & リアルタイム分析",
    description:
      "speech-to-speech対話。ピッチ・エネルギー・声の特徴をリアルタイム分析",
  },
  {
    icon: Activity,
    title: "感情・声質分析",
    description:
      "Web Audio API + Meydaで音響特徴量を抽出。声の抑揚やトーンから感情状態を推定",
  },
  {
    icon: GitBranch,
    title: "対話分岐",
    description:
      "回答内容と感情に応じて次の質問を動的に決定。AIが適切なフォローアップを自動選択",
  },
];

export default function Home() {
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = useState<InterviewProvider>(
    DEFAULT_INTERVIEW_PROVIDER
  );
  const [selectedScenario, setSelectedScenario] = useState("general");
  const [selectedMode, setSelectedMode] = useState<
    "auto" | "support" | "online_support"
  >("auto");
  const [selectedOpenAiVoice, setSelectedOpenAiVoice] =
    useState<RealtimeVoice>(DEFAULT_REALTIME_VOICE);
  const [selectedGeminiVoice, setSelectedGeminiVoice] =
    useState<GeminiLiveVoice>(DEFAULT_GEMINI_LIVE_VOICE);
  const [selectedInworldVoice, setSelectedInworldVoice] =
    useState<InworldRealtimeVoice>(DEFAULT_INWORLD_REALTIME_VOICE);
  const [selectedSpeed, setSelectedSpeed] =
    useState<RealtimeSpeedPreset>(DEFAULT_REALTIME_SPEED_PRESET);
  const [selectedSpeechStyle, setSelectedSpeechStyle] =
    useState<RealtimeSpeechStylePreset>(DEFAULT_REALTIME_SPEECH_STYLE_PRESET);
  const [selectedTone, setSelectedTone] =
    useState<RealtimeTonePreset>(DEFAULT_REALTIME_TONE_PRESET);
  const [selectedTtsProvider, setSelectedTtsProvider] =
    useState<NaturalVoiceTtsProvider>("elevenlabs");
  const [selectedBrainModel, setSelectedBrainModel] =
    useState<NaturalVoiceBrainModel>("gemini-3.5-flash");
  const [selectedSilenceDurationMs, setSelectedSilenceDurationMs] =
    useState<ServerVadSilenceDurationMs>(DEFAULT_SERVER_VAD_SILENCE_DURATION_MS);
  const [selectedInworldVadEagerness, setSelectedInworldVadEagerness] =
    useState<InworldRealtimeVadEagerness>(
      DEFAULT_INWORLD_REALTIME_VAD_EAGERNESS
    );
  const [selectedTurnDetectionMode, setSelectedTurnDetectionMode] =
    useState<RealtimeTurnDetectionMode>(DEFAULT_REALTIME_TURN_DETECTION_MODE);
  const [selectedVadEagerness, setSelectedVadEagerness] =
    useState<RealtimeVadEagerness>(DEFAULT_REALTIME_VAD_EAGERNESS);
  const [companyUrl, setCompanyUrl] = useState("");

  // Type 5 and Type 6 share the natural-voice UI surface (research URL, brain
  // engine, fixed voice, turn-detection tuning). Type 6 is Fish-only.
  const isNaturalFamily =
    selectedProvider === "natural" || selectedProvider === "natural2";

  const handleStart = () => {
    const isAutoOnlyProvider = selectedProvider !== "openai";
    const params = new URLSearchParams({
      provider: selectedProvider,
      mode: isAutoOnlyProvider ? "auto" : selectedMode,
      scenario: selectedScenario,
      voice:
        selectedProvider === "gemini"
          ? selectedGeminiVoice
          : selectedProvider === "inworld"
          ? selectedInworldVoice
          : selectedOpenAiVoice,
      speed: selectedSpeed,
      speechStyle: selectedSpeechStyle,
      tone: selectedTone,
      silenceDurationMs: String(selectedSilenceDurationMs),
      inworldVadEagerness: selectedInworldVadEagerness,
      turnDetectionMode: selectedTurnDetectionMode,
      vadEagerness: selectedVadEagerness,
      // Type 6 is Fish-only regardless of the (hidden) TTS toggle.
      ttsProvider: selectedProvider === "natural2" ? "fish" : selectedTtsProvider,
      brainModel: selectedBrainModel,
    });
    if (
      (selectedProvider === "wellbeing" || isNaturalFamily) &&
      companyUrl.trim()
    ) {
      params.set("url", companyUrl.trim());
    }
    router.push(`/interview?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-accent/10">
              <Mic className="w-6 h-6 text-accent" />
            </div>
            <span className="text-sm font-medium text-accent">
              AI Interview Assistant
            </span>
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-4 leading-tight">
            音声AIインタビュー
            <br />
            <span className="text-muted-foreground">
              アシスタント
            </span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            音声AIを活用したインタビュー支援ツール
          </p>
        </div>
      </div>

      {/* Features */}
      <div className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-border bg-card p-5"
              >
                <feature.icon className="w-5 h-5 text-accent mb-3" />
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Setup */}
      <div className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-xl font-semibold text-foreground mb-6">
          インタビュー設定
        </h2>

        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            Type
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {INTERVIEW_PROVIDERS.map((provider) => (
              <button
                key={provider}
                onClick={() => {
                  setSelectedProvider(provider);
                  if (provider !== "openai") {
                    setSelectedMode("auto");
                  }
                }}
                className={cn(
                  "w-full rounded-lg border p-4 text-left transition-colors",
                  selectedProvider === provider
                    ? "border-accent bg-accent/5"
                    : "border-border bg-card hover:border-muted-foreground/30"
                )}
              >
                <div className="font-medium text-foreground text-sm">
                  {getInterviewProviderLabel(provider)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {provider === "openai"
                    ? "現在の標準版です。複数の音声から選んで音声インタビューできます。"
                    : provider === "gemini"
                    ? "低レイテンシ版です。まずは自動インタビューのみ対応します。"
                    : provider === "inworld"
                    ? "音声品質を重視した低レイテンシ版です。自動インタビューのみ対応します。"
                    : provider === "wellbeing"
                    ? "会社URLから骨子を作り、ロジャース流の傾聴で内省を促すwell-being対話版です。ネイティブ音声でそのまま話します。"
                    : provider === "natural"
                    ? "自然な日本語発話を重視したwell-being対話版です。対話制御と音声表現を分けて、抑揚と間を改善します。"
                    : "Type 5を土台に、発話終了/思考中/感情を統合判定するHuman State Engineと、待つ/相槌/共感/深掘りを選ぶResponse Orchestratorを追加した版です。さらにMeaning Engineが事実→感情→価値観→意思決定→人生観→学びと話を掘り下げます。LiveKit Turn Detectorにも対応。音声はFish固定。"}
                </div>
              </button>
            ))}
          </div>
        </div>

        {(selectedProvider === "wellbeing" || isNaturalFamily) && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
              会社URL（任意）
            </h3>
            <input
              type="url"
              inputMode="url"
              value={companyUrl}
              onChange={(e) => setCompanyUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-accent focus:outline-none"
            />
            <p className="text-xs text-muted-foreground mt-2">
              入力すると、その会社の社長にwell-beingインタビューする前提で骨子を自動生成します。空欄でも一般的な骨子で開始できます。
              {selectedProvider === "natural"
                ? " Type 5では音声はElevenLabsの環境変数設定を使います。"
                : selectedProvider === "natural2"
                ? " Type 6では音声はFish Audioの環境変数設定を使います。"
                : ""}
            </p>
          </div>
        )}

        {selectedProvider === "natural" && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
              Type 5 音声エンジン
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  id: "elevenlabs" as const,
                  label: "ElevenLabs",
                  description:
                    "表現力と声質の選択肢を重視します。現在のType 5既定です。",
                },
                {
                  id: "fish" as const,
                  label: "Fish Audio",
                  description:
                    "WebSocket streaming + PCMで低レイテンシを狙います。日本語読み制御も試しやすい構成です。",
                },
              ].map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => setSelectedTtsProvider(provider.id)}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left transition-colors",
                    selectedTtsProvider === provider.id
                      ? "border-accent bg-accent/5"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  )}
                >
                  <div className="font-medium text-foreground text-sm">
                    {provider.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {provider.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {isNaturalFamily && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
              {selectedProvider === "natural2"
                ? "Type 6 思考エンジン"
                : "Type 5 思考エンジン"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  id: "gemini-3.5-flash" as const,
                  label: "モデル1（高速）",
                  description:
                    "応答が速く、会話のテンポを最優先する構成です。現在の既定です。",
                },
                {
                  id: "claude-fable-5" as const,
                  label: "モデル2（高推論）",
                  description:
                    "応答まで数秒の間がありますが、見立ての鋭さと質問の深さを優先します。",
                },
                {
                  id: "gpt-5.5" as const,
                  label: "モデル3（GPT-5.5）",
                  description:
                    "OpenAIの最新世代。指示追従と実行品質が高く、バランス型の構成です。",
                },
                {
                  id: "claude-opus-4-8" as const,
                  label: "モデル4（Opus 4.8）",
                  description:
                    "Anthropic最上位。最も深い推論を狙いますが、応答までの間は長めです。",
                },
              ].map((model) => (
                <button
                  key={model.id}
                  onClick={() => setSelectedBrainModel(model.id)}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left transition-colors",
                    selectedBrainModel === model.id
                      ? "border-accent bg-accent/5"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  )}
                >
                  <div className="font-medium text-foreground text-sm">
                    {model.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {model.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Mode selection */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
              モード選択
            </h3>
            <div className="space-y-3">
              <button
                onClick={() => setSelectedMode("auto")}
                className={cn(
                  "w-full flex items-start gap-4 rounded-lg border p-4 text-left transition-colors",
                  selectedMode === "auto"
                    ? "border-accent bg-accent/5"
                    : "border-border bg-card hover:border-muted-foreground/30"
                )}
              >
                <Bot
                  className={cn(
                    "w-5 h-5 mt-0.5 shrink-0",
                    selectedMode === "auto"
                      ? "text-accent"
                      : "text-muted-foreground"
                  )}
                />
                <div>
                  <div className="font-medium text-foreground text-sm">
                    自動インタビュー
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    AIが質問を行い、回答に応じて対話を自動分岐します。
                    人間の介入なしで完全なインタビューを実施できます。
                  </div>
                </div>
              </button>

              <button
                onClick={() =>
                  selectedProvider !== "openai"
                    ? undefined
                    : setSelectedMode("support")
                }
                disabled={selectedProvider !== "openai"}
                className={cn(
                  "w-full flex items-start gap-4 rounded-lg border p-4 text-left transition-colors",
                  selectedMode === "support"
                    ? "border-accent bg-accent/5"
                    : "border-border bg-card hover:border-muted-foreground/30",
                  selectedProvider !== "openai" &&
                    "cursor-not-allowed opacity-60 hover:border-border"
                )}
              >
                <Users
                  className={cn(
                    "w-5 h-5 mt-0.5 shrink-0",
                    selectedMode === "support"
                      ? "text-accent"
                      : "text-muted-foreground"
                  )}
                />
                <div>
                  <div className="font-medium text-foreground text-sm">
                    サポートモード
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    人間のインタビュアーをAIがリアルタイムでサポート。
                    音声分析と次の質問提案を表示します。
                  </div>
                </div>
              </button>

              <button
                onClick={() =>
                  selectedProvider !== "openai"
                    ? undefined
                    : setSelectedMode("online_support")
                }
                disabled={selectedProvider !== "openai"}
                className={cn(
                  "w-full flex items-start gap-4 rounded-lg border p-4 text-left transition-colors",
                  selectedMode === "online_support"
                    ? "border-accent bg-accent/5"
                    : "border-border bg-card hover:border-muted-foreground/30",
                  selectedProvider !== "openai" &&
                    "cursor-not-allowed opacity-60 hover:border-border"
                )}
              >
                <Monitor
                  className={cn(
                    "w-5 h-5 mt-0.5 shrink-0",
                    selectedMode === "online_support"
                      ? "text-accent"
                      : "text-muted-foreground"
                  )}
                />
                <div>
                  <div className="font-medium text-foreground text-sm">
                    オンラインサポート
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Zoom / Meet / Teams 等のオンライン面接をリアルタイムでサポート。
                    回答者の感情分析・質問提案を表示します。
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 mt-1">
                    推奨: Chrome
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Scenario selection */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
              シナリオ選択
            </h3>
            <div className="space-y-3">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => setSelectedScenario(scenario.id)}
                  className={cn(
                    "w-full flex items-start gap-4 rounded-lg border p-4 text-left transition-colors",
                    selectedScenario === scenario.id
                      ? "border-accent bg-accent/5"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  )}
                >
                  <div className="flex-1">
                    <div className="font-medium text-foreground text-sm">
                      {scenario.title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {scenario.description}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      {scenario.topics} トピック
                    </div>
                  </div>
                  {selectedScenario === scenario.id && (
                    <div className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            音声
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(selectedProvider === "openai" ||
              selectedProvider === "wellbeing") &&
              VISIBLE_REALTIME_VOICE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setSelectedOpenAiVoice(option.id)}
                  className={cn(
                    "w-full flex items-start gap-4 rounded-lg border p-4 text-left transition-colors",
                    selectedOpenAiVoice === option.id
                      ? "border-accent bg-accent/5"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  )}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-foreground text-sm">
                        {option.label}
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {option.tone}
                      </span>
                      {option.recommended && (
                        <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                          推奨
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {option.description}
                    </div>
                  </div>
                  {selectedOpenAiVoice === option.id && (
                    <div className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" />
                  )}
                </button>
              ))}
            {selectedProvider === "gemini" &&
              GEMINI_LIVE_VOICES.map((voice) => (
                <button
                  key={voice}
                  onClick={() => setSelectedGeminiVoice(voice)}
                  className={cn(
                    "w-full flex items-start gap-4 rounded-lg border p-4 text-left transition-colors",
                    selectedGeminiVoice === voice
                      ? "border-accent bg-accent/5"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  )}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-foreground text-sm">
                        {voice}
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {voice === "Kore"
                          ? "Firm"
                          : voice === "Puck"
                          ? "Upbeat"
                          : voice === "Aoede"
                          ? "Breezy"
                          : voice === "Orus"
                          ? "Firm"
                          : "Youthful"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {voice === "Kore"
                        ? "芯のある落ち着いた話し方です。経営者向けインタビューに合わせやすい firm 系です。"
                        : voice === "Puck"
                        ? "少し明るく軽快な印象です。前向きな空気を出したいときに向いています。"
                        : voice === "Aoede"
                        ? "やわらかく軽い空気感です。やさしい立ち上がりで話したいときに向いています。"
                        : voice === "Orus"
                        ? "落ち着いた男性寄りの firm 系です。安定感を出したい経営者向けインタビューに向いています。"
                        : "若めで軽やかな印象の声です。親しみやすく明るい雰囲気で進めたいときに向いています。"}
                    </div>
                  </div>
                  {selectedGeminiVoice === voice && (
                    <div className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" />
                  )}
                </button>
              ))}
            {selectedProvider === "inworld" &&
              INWORLD_REALTIME_VOICES.map((voice) => (
                <button
                  key={voice}
                  onClick={() => setSelectedInworldVoice(voice)}
                  className={cn(
                    "w-full flex items-start gap-4 rounded-lg border p-4 text-left transition-colors",
                    selectedInworldVoice === voice
                      ? "border-accent bg-accent/5"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  )}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="font-medium text-foreground text-sm">
                        {voice}
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {voice === "Asuka"
                          ? "Energetic"
                          : voice === "Haruto"
                          ? "Narrative"
                          : voice === "Hina"
                          ? "Clear"
                          : "Curious"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {voice === "Asuka"
                        ? "日本語の中年女性 voice です。明るくクリアに進めたいときに向いています。"
                        : voice === "Haruto"
                        ? "日本語の年配男性 voice です。物語調で落ち着いた印象に寄せたいときに向いています。"
                        : voice === "Hina"
                        ? "日本語の若い女性 voice です。明瞭で軽やかな進行に向いています。"
                        : "日本語の中年男性 voice です。経営者向けインタビューの既定候補です。"}
                    </div>
                  </div>
                  {selectedInworldVoice === voice && (
                    <div className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" />
                  )}
                </button>
              ))}
            {isNaturalFamily &&
              (() => {
                // Type 6 is Fish-only; Type 5 follows the TTS engine toggle.
                const usesFish =
                  selectedProvider === "natural2" || selectedTtsProvider === "fish";
                const typeLabel =
                  selectedProvider === "natural2" ? "Type 6" : "Type 5";
                return (
                  <div className="rounded-lg border border-accent bg-accent/5 p-4 md:col-span-2">
                    <div className="font-medium text-foreground text-sm">
                      {usesFish ? "Fish Audio 固定音声" : "ElevenLabs 固定音声"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {typeLabel}は自然な日本語発話を優先し、サーバー側の
                      {usesFish
                        ? " FISH_AUDIO_REFERENCE_ID を使います。"
                        : " ELEVENLABS_VOICE_ID を使います。"}
                      声質の切り替えUIは次段階で追加できます。
                    </div>
                  </div>
                );
              })()}
          </div>
        </div>

        <div className="mt-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            話すスピード
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {REALTIME_SPEED_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setSelectedSpeed(preset.id)}
                className={cn(
                  "w-full rounded-lg border p-4 text-left transition-colors",
                  selectedSpeed === preset.id
                    ? "border-accent bg-accent/5"
                    : "border-border bg-card hover:border-muted-foreground/30"
                )}
              >
                <div className="font-medium text-foreground text-sm">
                  {preset.label}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {preset.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            話し方のトーン
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {REALTIME_TONE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setSelectedTone(preset.id)}
                className={cn(
                  "w-full rounded-lg border p-4 text-left transition-colors",
                  selectedTone === preset.id
                    ? "border-accent bg-accent/5"
                    : "border-border bg-card hover:border-muted-foreground/30"
                )}
              >
                <div className="font-medium text-foreground text-sm">
                  {preset.label}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {preset.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            話し方
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {REALTIME_SPEECH_STYLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setSelectedSpeechStyle(preset.id)}
                className={cn(
                  "w-full rounded-lg border p-4 text-left transition-colors",
                  selectedSpeechStyle === preset.id
                    ? "border-accent bg-accent/5"
                    : "border-border bg-card hover:border-muted-foreground/30"
                )}
              >
                <div className="font-medium text-foreground text-sm">
                  {preset.label}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {preset.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">
            発話終わり判定
          </h3>

          {(selectedProvider === "openai" || isNaturalFamily) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              {REALTIME_TURN_DETECTION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedTurnDetectionMode(option.value)}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left transition-colors",
                    selectedTurnDetectionMode === option.value
                      ? "border-accent bg-accent/5"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  )}
                >
                  <div className="font-medium text-foreground text-sm">
                    {option.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {option.description}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {selectedProvider === "inworld" &&
              INWORLD_REALTIME_VAD_EAGERNESS_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setSelectedInworldVadEagerness(option.id)}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left transition-colors",
                    selectedInworldVadEagerness === option.id
                      ? "border-accent bg-accent/5"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  )}
                >
                  <div className="font-medium text-foreground text-sm">
                    {option.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {option.description}
                  </div>
                </button>
              ))}

            {(selectedProvider === "openai" || isNaturalFamily) &&
              selectedTurnDetectionMode === "semantic_vad" &&
              REALTIME_VAD_EAGERNESS_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setSelectedVadEagerness(option.id)}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left transition-colors",
                    selectedVadEagerness === option.id
                      ? "border-accent bg-accent/5"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  )}
                >
                  <div className="font-medium text-foreground text-sm">
                    {option.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {option.description}
                  </div>
                </button>
              ))}

            {((selectedProvider === "openai" &&
              selectedTurnDetectionMode === "server_vad") ||
              (isNaturalFamily &&
                selectedTurnDetectionMode === "server_vad") ||
              selectedProvider === "gemini") &&
              SERVER_VAD_SILENCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedSilenceDurationMs(option.value)}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left transition-colors",
                    selectedSilenceDurationMs === option.value
                      ? "border-accent bg-accent/5"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  )}
                >
                  <div className="font-medium text-foreground text-sm">
                    {option.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {option.description}
                  </div>
                </button>
              ))}
          </div>
        </div>

        {/* Start button */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={handleStart}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-accent text-accent-foreground font-medium hover:bg-accent/90 transition-colors text-base"
          >
            インタビューを開始
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
