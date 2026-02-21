"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { InterviewMode, SpeechAudioMetrics, TranscriptEntry } from "@/lib/types";
import { EMOTION_LABELS_JA, EMOTION_COLORS } from "@/lib/emotion-analyzer";
import { User, Mic, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TranscriptPanelProps {
  transcript: TranscriptEntry[];
  mode?: InterviewMode;
  className?: string;
}

function getSpeakerLabel(
  entry: TranscriptEntry,
  mode: InterviewMode | undefined
): string {
  if (mode === "support" || mode === "online_support") {
    if (entry.speaker && entry.speaker !== "unknown") {
      return entry.role === "interviewer"
        ? `インタビュアー (${entry.speaker})`
        : `回答者 (${entry.speaker})`;
    }
    return entry.role === "interviewer" ? "インタビュアー" : "回答者";
  }
  return entry.role === "interviewer" ? "AI" : "回答者";
}

function getExcitementLabel(score: number): {
  label: string;
  color: string;
  icon: typeof TrendingUp;
} {
  if (score >= 70) return { label: "高テンション", color: "text-orange-400 bg-orange-400/10", icon: TrendingUp };
  if (score >= 55) return { label: "やや高め", color: "text-amber-400 bg-amber-400/10", icon: TrendingUp };
  if (score >= 45) return { label: "普通", color: "text-muted-foreground bg-muted", icon: Minus };
  if (score >= 30) return { label: "やや低め", color: "text-blue-400 bg-blue-400/10", icon: TrendingDown };
  return { label: "低テンション", color: "text-blue-500 bg-blue-500/10", icon: TrendingDown };
}

function MetricsBadge({ metrics }: { metrics: SpeechAudioMetrics }) {
  const { label, color, icon: Icon } = getExcitementLabel(metrics.excitementScore);
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <span
        className={cn("inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded", color)}
      >
        <Icon className="w-3 h-3" />
        {label} ({metrics.excitementScore})
      </span>
      {metrics.avgPitch !== null && (
        <span className="text-xs text-muted-foreground">
          pitch: {Math.round(metrics.avgPitch)}Hz
        </span>
      )}
      {metrics.avgEnergy > 0 && (
        <span className="text-xs text-muted-foreground">
          energy: {metrics.avgEnergy.toFixed(3)}
        </span>
      )}
    </div>
  );
}

export function TranscriptPanel({
  transcript,
  mode,
  className,
}: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript]);

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border bg-card",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">
          書き起こし
        </h3>
        <div className="flex items-center gap-3">
          {mode === "support" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">
              話者分離
            </span>
          )}
          {mode === "online_support" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent">
              オンライン
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {transcript.length} 件
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {transcript.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            インタビューが始まると書き起こしが表示されます
          </p>
        ) : (
          transcript.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "flex gap-3 text-sm",
                entry.role === "interviewer" ? "justify-start" : "justify-end"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2",
                  entry.role === "interviewer"
                    ? "bg-accent/10 text-foreground"
                    : "bg-muted text-foreground"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {entry.role === "interviewer" ? (
                    <Mic className="w-3 h-3 text-accent shrink-0" />
                  ) : (
                    <User className="w-3 h-3 text-muted-foreground shrink-0" />
                  )}
                  <span
                    className={cn(
                      "text-xs font-medium",
                      entry.role === "interviewer"
                        ? "text-accent"
                        : "text-muted-foreground"
                    )}
                  >
                    {getSpeakerLabel(entry, mode)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleTimeString("ja-JP")}
                  </span>
                  {entry.sentiment && (
                    <span
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        entry.sentiment === "positive"
                          ? "bg-success/10 text-success"
                          : entry.sentiment === "negative"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {entry.sentiment === "positive"
                        ? "ポジティブ"
                        : entry.sentiment === "negative"
                        ? "ネガティブ"
                        : "ニュートラル"}
                    </span>
                  )}
                </div>
                <p className="leading-relaxed">{entry.text}</p>
                {entry.speechMetrics && (
                  <MetricsBadge metrics={entry.speechMetrics} />
                )}
                {entry.emotionState && (
                  <span
                    className={cn(
                      "inline-flex items-center text-xs px-1.5 py-0.5 rounded mt-1 border",
                      EMOTION_COLORS[entry.emotionState.label]
                    )}
                  >
                    {EMOTION_LABELS_JA[entry.emotionState.label]}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
