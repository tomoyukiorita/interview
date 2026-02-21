"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import type { AudioFeatures } from "@/lib/types";

interface AnalysisPanelProps {
  currentFeatures: AudioFeatures | null;
  history: AudioFeatures[];
  className?: string;
}

function getVoiceCharacteristics(features: AudioFeatures | null) {
  if (!features) return { tone: "---", energy: "---", stability: "---" };

  const { pitch, rms, spectralCentroid } = features;

  let tone = "普通";
  if (pitch) {
    if (pitch > 250) tone = "高い";
    else if (pitch > 180) tone = "やや高い";
    else if (pitch < 120) tone = "低い";
    else if (pitch < 150) tone = "やや低い";
  }

  let energy = "普通";
  if (rms > 0.15) energy = "大きい";
  else if (rms > 0.08) energy = "やや大きい";
  else if (rms < 0.02) energy = "小さい";
  else if (rms < 0.04) energy = "やや小さい";

  let stability = "安定";
  if (spectralCentroid > 3000) stability = "緊張気味";
  else if (spectralCentroid > 2000) stability = "やや緊張";
  else if (spectralCentroid < 500) stability = "リラックス";

  return { tone, energy, stability };
}

function MetricCard({
  label,
  value,
  subValue,
  color,
}: {
  label: string;
  value: string;
  subValue?: string;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-background border border-border p-3">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={cn("text-lg font-semibold font-mono", color)}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-muted-foreground mt-0.5">
          {subValue}
        </div>
      )}
    </div>
  );
}

export function AnalysisPanel({
  currentFeatures,
  history,
  className,
}: AnalysisPanelProps) {
  const voiceChar = useMemo(
    () => getVoiceCharacteristics(currentFeatures),
    [currentFeatures]
  );

  const avgPitch = useMemo(() => {
    const pitches = history
      .map((f) => f.pitch)
      .filter((p): p is number => p !== null && p > 0);
    if (pitches.length === 0) return null;
    return pitches.reduce((a, b) => a + b, 0) / pitches.length;
  }, [history]);

  const pitchVariance = useMemo(() => {
    const pitches = history
      .map((f) => f.pitch)
      .filter((p): p is number => p !== null && p > 0);
    if (pitches.length < 2) return null;
    const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
    const variance =
      pitches.reduce((sum, p) => sum + (p - mean) ** 2, 0) / pitches.length;
    return Math.sqrt(variance);
  }, [history]);

  const emotionEstimate = useMemo(() => {
    if (!currentFeatures) return "分析中...";
    const { rms, spectralCentroid, pitch } = currentFeatures;

    if (rms < 0.01) return "沈黙";
    if (pitch && pitch > 220 && rms > 0.1) return "興奮・熱意";
    if (pitch && pitch > 200 && spectralCentroid > 2500) return "緊張";
    if (pitch && pitch < 140 && rms < 0.05) return "落ち着き";
    if (rms > 0.08 && spectralCentroid < 2000) return "自信あり";
    if (rms < 0.03) return "控えめ";
    return "通常";
  }, [currentFeatures]);

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-border bg-card",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">
          音声分析
        </h3>
        <span
          className={cn(
            "text-xs px-2 py-0.5 rounded-full",
            currentFeatures
              ? "bg-success/10 text-success"
              : "bg-muted text-muted-foreground"
          )}
        >
          {currentFeatures ? "分析中" : "待機中"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            感情推定
          </h4>
          <div className="text-2xl font-bold text-accent">
            {emotionEstimate}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            声の特徴
          </h4>
          <div className="grid grid-cols-3 gap-2">
            <MetricCard
              label="声の高さ"
              value={voiceChar.tone}
              subValue={
                currentFeatures?.pitch
                  ? `${currentFeatures.pitch.toFixed(0)} Hz`
                  : undefined
              }
              color="text-foreground"
            />
            <MetricCard
              label="声量"
              value={voiceChar.energy}
              subValue={
                currentFeatures
                  ? `RMS: ${currentFeatures.rms.toFixed(3)}`
                  : undefined
              }
              color="text-foreground"
            />
            <MetricCard
              label="安定度"
              value={voiceChar.stability}
              color="text-foreground"
            />
          </div>
        </div>

        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            統計
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard
              label="平均ピッチ"
              value={avgPitch ? `${avgPitch.toFixed(0)} Hz` : "---"}
              color="text-foreground"
            />
            <MetricCard
              label="ピッチ変動"
              value={
                pitchVariance ? `${pitchVariance.toFixed(1)} Hz` : "---"
              }
              subValue={
                pitchVariance
                  ? pitchVariance > 40
                    ? "抑揚あり"
                    : "単調"
                  : undefined
              }
              color="text-foreground"
            />
          </div>
        </div>

        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            リアルタイムデータ
          </h4>
          <div className="space-y-1.5 text-xs font-mono text-muted-foreground">
            <div className="flex justify-between">
              <span>Spectral Centroid</span>
              <span className="text-foreground">
                {currentFeatures?.spectralCentroid.toFixed(0) ?? "---"} Hz
              </span>
            </div>
            <div className="flex justify-between">
              <span>Spectral Flatness</span>
              <span className="text-foreground">
                {currentFeatures?.spectralFlatness.toFixed(4) ?? "---"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>ZCR</span>
              <span className="text-foreground">
                {currentFeatures?.zcr.toFixed(0) ?? "---"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Loudness</span>
              <span className="text-foreground">
                {currentFeatures?.loudness.toFixed(3) ?? "---"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>サンプル数</span>
              <span className="text-foreground">{history.length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
