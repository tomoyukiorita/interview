"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { AudioFeatures, EmotionState } from "@/lib/types";
import {
  analyzeEmotion,
  EMOTION_LABELS_JA,
  EMOTION_COLORS,
} from "@/lib/emotion-analyzer";
import { Activity } from "lucide-react";

interface EmotionIndicatorProps {
  currentFeatures: AudioFeatures | null;
  history: AudioFeatures[];
  getSaveHistory: () => AudioFeatures[];
  className?: string;
  onEmotionChange?: (emotion: EmotionState) => void;
}

const ANALYSIS_WINDOW = 6;
const THROTTLE_MS = 800;

export function EmotionIndicator({
  currentFeatures,
  history,
  getSaveHistory,
  className,
  onEmotionChange,
}: EmotionIndicatorProps) {
  const [emotion, setEmotion] = useState<EmotionState | null>(null);
  const [flash, setFlash] = useState(false);
  const onChangeRef = useRef(onEmotionChange);
  onChangeRef.current = onEmotionChange;
  const getSaveHistoryRef = useRef(getSaveHistory);
  getSaveHistoryRef.current = getSaveHistory;
  const prevLabelRef = useRef<string | null>(null);
  const lastAnalysisRef = useRef(0);

  useEffect(() => {
    if (!currentFeatures || history.length < 3) return;

    const now = Date.now();
    if (now - lastAnalysisRef.current < THROTTLE_MS) return;
    lastAnalysisRef.current = now;

    const recentSamples = history.slice(-ANALYSIS_WINDOW);
    const fullHistory = getSaveHistoryRef.current();
    const result = analyzeEmotion(recentSamples, fullHistory);

    setEmotion(result);
    onChangeRef.current?.(result);

    if (prevLabelRef.current && result.label !== prevLabelRef.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1500);
      prevLabelRef.current = result.label;
      return () => clearTimeout(t);
    }
    prevLabelRef.current = result.label;
  }, [currentFeatures, history]);

  if (!emotion) {
    return (
      <div className={cn("rounded-lg border border-border bg-card p-3", className)}>
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Activity className="w-4 h-4" />
          <span>感情分析待機中...</span>
        </div>
      </div>
    );
  }

  const labelJa = EMOTION_LABELS_JA[emotion.label];
  const colors = EMOTION_COLORS[emotion.label];

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 transition-all duration-300",
        flash ? "ring-2 ring-accent/50" : "",
        className
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" />
          <span className="text-xs font-semibold text-foreground">
            回答者の感情
          </span>
        </div>
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full border",
            colors
          )}
        >
          {labelJa}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <MeterBar label="興奮" value={emotion.excitement} color="bg-orange-400" />
        <MeterBar label="緊張" value={emotion.nervousness} color="bg-blue-400" />
        <MeterBar label="自信" value={emotion.confidence} color="bg-emerald-400" />
        <MeterBar label="関心" value={emotion.engagement} color="bg-purple-400" />
      </div>
    </div>
  );
}

function MeterBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground">{value}</span>
    </div>
  );
}
