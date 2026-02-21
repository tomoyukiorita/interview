"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/cn";
import type { AudioFeatures, TranscriptEntry } from "@/lib/types";
import type { AiSuggestion } from "@/hooks/useRealtimeSession";
import { Lightbulb, Bot, ChevronDown, ChevronUp, Clock, Eye } from "lucide-react";

interface LocalSuggestion {
  id: string;
  text: string;
  reason: string;
  priority: "high" | "medium" | "low";
  timestamp: number;
  dismissed: boolean;
  source: "local";
}

interface DisplaySuggestion {
  id: string;
  text: string;
  reason: string;
  priority: "high" | "medium" | "low";
  timestamp: number;
  dismissed: boolean;
  source: "local" | "ai";
  toolName?: string;
  category?: string;
}

interface SuggestionPanelProps {
  transcript: TranscriptEntry[];
  audioFeatures: AudioFeatures | null;
  audioHistory: AudioFeatures[];
  aiSuggestions: AiSuggestion[];
  isConnected: boolean;
  className?: string;
}

function generateLocalSuggestions(
  transcript: TranscriptEntry[],
  audioFeatures: AudioFeatures | null,
  audioHistory: AudioFeatures[]
): LocalSuggestion[] {
  const suggestions: LocalSuggestion[] = [];
  const now = Date.now();

  if (transcript.length === 0) return suggestions;

  const lastEntry = transcript[transcript.length - 1];

  if (lastEntry.role === "interviewee") {
    if (lastEntry.text.length < 30) {
      suggestions.push({
        id: `sug-brief-${now}`,
        text: "回答が短いようです。「もう少し詳しく教えていただけますか？」と聞いてみましょう。",
        reason: "回答が短文であるため",
        priority: "medium",
        timestamp: now,
        dismissed: false,
        source: "local",
      });
    }

    if (audioFeatures && audioFeatures.rms < 0.03) {
      suggestions.push({
        id: `sug-quiet-${now}`,
        text: "声が小さくなっています。トピックを変えるか、リラックスできる話題を挟むことを検討してください。",
        reason: "音声エネルギーが低下",
        priority: "medium",
        timestamp: now,
        dismissed: false,
        source: "local",
      });
    }

    if (audioFeatures?.pitch && audioFeatures.pitch > 220 && audioFeatures.rms > 0.1) {
      suggestions.push({
        id: `sug-excited-${now}`,
        text: "回答者が熱心に話しています。このトピックをさらに深掘りするチャンスです。",
        reason: "高ピッチ + 高エネルギー検出",
        priority: "high",
        timestamp: now,
        dismissed: false,
        source: "local",
      });
    }

    if (
      audioFeatures?.pitch &&
      audioFeatures.pitch > 200 &&
      audioFeatures.spectralCentroid > 2500
    ) {
      suggestions.push({
        id: `sug-nervous-${now}`,
        text: "やや緊張が見られます。共感を示す一言を挟んでから次の質問に移りましょう。",
        reason: "声の緊張指標が高い",
        priority: "high",
        timestamp: now,
        dismissed: false,
        source: "local",
      });
    }
  }

  const interviewerCount = transcript.filter(
    (t) => t.role === "interviewer"
  ).length;
  const intervieweeCount = transcript.filter(
    (t) => t.role === "interviewee"
  ).length;

  if (interviewerCount > 0 && intervieweeCount > 0) {
    const ratio = interviewerCount / intervieweeCount;
    if (ratio > 2) {
      suggestions.push({
        id: `sug-ratio-${now}`,
        text: "インタビュアーの発話が多めです。より開放的な質問で回答者に話す機会を増やしましょう。",
        reason: "インタビュアー/回答者の発話比率が高い",
        priority: "low",
        timestamp: now,
        dismissed: false,
        source: "local",
      });
    }
  }

  const recentPitches = audioHistory
    .slice(-30)
    .map((f) => f.pitch)
    .filter((p): p is number => p !== null && p > 0);
  if (recentPitches.length > 10) {
    const mean =
      recentPitches.reduce((a, b) => a + b, 0) / recentPitches.length;
    const variance =
      recentPitches.reduce((sum, p) => sum + (p - mean) ** 2, 0) /
      recentPitches.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev < 15) {
      suggestions.push({
        id: `sug-monotone-${now}`,
        text: "回答者の声が単調になっています。質問のアプローチを変えて興味を引き出しましょう。",
        reason: "ピッチの変動が小さい",
        priority: "low",
        timestamp: now,
        dismissed: false,
        source: "local",
      });
    }
  }

  return suggestions;
}

const categoryLabels: Record<string, string> = {
  communication_style: "コミュニケーション",
  expertise: "専門性",
  enthusiasm: "意欲",
  concern: "懸念",
  notable_response: "注目すべき回答",
};

export function SuggestionPanel({
  transcript,
  audioFeatures,
  audioHistory,
  aiSuggestions,
  isConnected,
  className,
}: SuggestionPanelProps) {
  const [localSuggestions, setLocalSuggestions] = useState<LocalSuggestion[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "ai" | "analysis">("all");

  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      const newSuggestions = generateLocalSuggestions(
        transcript,
        audioFeatures,
        audioHistory
      );

      if (newSuggestions.length > 0) {
        setLocalSuggestions((prev) => {
          const existingIds = new Set(prev.map((s) => s.id.replace(/-\d+$/, "")));
          const filtered = newSuggestions.filter((s) => {
            const baseId = s.id.replace(/-\d+$/, "");
            return !existingIds.has(baseId);
          });
          return [...prev, ...filtered].slice(-20);
        });
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [transcript, audioFeatures, audioHistory, isConnected]);

  const dismissSuggestion = useCallback((id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  }, []);

  const aiDisplaySuggestions: DisplaySuggestion[] = aiSuggestions.map((s) => ({
    id: s.id,
    text: s.text,
    reason: s.reason,
    priority: s.priority,
    timestamp: s.timestamp,
    dismissed: dismissedIds.has(s.id),
    source: "ai" as const,
    toolName: s.toolName,
    category: s.category,
  }));

  const localDisplaySuggestions: DisplaySuggestion[] = localSuggestions.map((s) => ({
    ...s,
    dismissed: s.dismissed || dismissedIds.has(s.id),
  }));

  const allSuggestions = [...aiDisplaySuggestions, ...localDisplaySuggestions]
    .sort((a, b) => b.timestamp - a.timestamp);

  const filteredSuggestions = allSuggestions.filter((s) => {
    if (s.dismissed) return false;
    if (activeTab === "ai") return s.source === "ai";
    if (activeTab === "analysis") return s.source === "local";
    return true;
  });

  const activeAiCount = aiDisplaySuggestions.filter((s) => !s.dismissed).length;
  const highPriorityCount = filteredSuggestions.filter(
    (s) => s.priority === "high"
  ).length;

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border bg-card",
        className
      )}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between border-b border-border px-4 py-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-warning" />
          <h3 className="text-sm font-semibold text-foreground">
            質問提案
          </h3>
          {activeAiCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent/10 text-accent flex items-center gap-1">
              <Bot className="w-3 h-3" />
              {activeAiCount}
            </span>
          )}
          {highPriorityCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-warning/10 text-warning">
              {highPriorityCount} 重要
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Tabs */}
          <div className="flex border-b border-border px-4 gap-1">
            {(["all", "ai", "analysis"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "text-xs px-3 py-2 border-b-2 transition-colors",
                  activeTab === tab
                    ? "border-accent text-accent"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "all" ? "すべて" : tab === "ai" ? "AI提案" : "音声分析"}
              </button>
            ))}
          </div>

          {/* Suggestions list */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {filteredSuggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {isConnected
                  ? "会話を分析中... 提案が生成されると表示されます"
                  : "接続後に質問提案が表示されます"}
              </p>
            ) : (
              filteredSuggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    suggestion.source === "ai"
                      ? "border-accent/30 bg-accent/5"
                      : suggestion.priority === "high"
                      ? "border-warning/30 bg-warning/5"
                      : suggestion.priority === "medium"
                      ? "border-border bg-muted/30"
                      : "border-border bg-background"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      {suggestion.source === "ai" ? (
                        <Bot className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                      ) : (
                        <Eye className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                      <p className="text-sm text-foreground leading-relaxed">
                        {suggestion.text}
                      </p>
                    </div>
                    <button
                      onClick={() => dismissSuggestion(suggestion.id)}
                      className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mt-2 ml-6">
                    {suggestion.source === "ai" && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                        AI
                      </span>
                    )}
                    <span
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        suggestion.priority === "high"
                          ? "bg-warning/10 text-warning"
                          : suggestion.priority === "medium"
                          ? "bg-accent/10 text-accent"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {suggestion.priority === "high"
                        ? "高"
                        : suggestion.priority === "medium"
                        ? "中"
                        : "低"}
                    </span>
                    {suggestion.category && (
                      <span className="text-xs text-muted-foreground">
                        {categoryLabels[suggestion.category] || suggestion.category}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(suggestion.timestamp).toLocaleTimeString(
                        "ja-JP"
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {suggestion.reason}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
