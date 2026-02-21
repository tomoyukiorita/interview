"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
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
    title: "一般インタビュー",
    description: "経験・スキル・行動面を幅広くカバーする標準シナリオ",
    topics: 5,
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
  const [selectedScenario, setSelectedScenario] = useState("general");
  const [selectedMode, setSelectedMode] = useState<
    "auto" | "support" | "online_support"
  >("auto");

  const handleStart = () => {
    const params = new URLSearchParams({
      mode: selectedMode,
      scenario: selectedScenario,
    });
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
                onClick={() => setSelectedMode("support")}
                className={cn(
                  "w-full flex items-start gap-4 rounded-lg border p-4 text-left transition-colors",
                  selectedMode === "support"
                    ? "border-accent bg-accent/5"
                    : "border-border bg-card hover:border-muted-foreground/30"
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
                onClick={() => setSelectedMode("online_support")}
                className={cn(
                  "w-full flex items-start gap-4 rounded-lg border p-4 text-left transition-colors",
                  selectedMode === "online_support"
                    ? "border-accent bg-accent/5"
                    : "border-border bg-card hover:border-muted-foreground/30"
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
