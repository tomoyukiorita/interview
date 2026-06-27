"use client";

import { cn } from "@/lib/cn";
import type { MeaningSignals } from "@/lib/interview-brain";
import type { FollowUpIntent, InterviewDepth } from "@/lib/meaning-engine";
import type { HumanState, OrchestratorActionKind } from "@/lib/types";

interface HumanStatePanelProps {
  humanState?: HumanState | null;
  action?: {
    kind: OrchestratorActionKind;
    reason: string;
    at: number;
  } | null;
  livekitActive?: boolean;
  meaning?: {
    depth: InterviewDepth;
    intent: FollowUpIntent;
    signals: MeaningSignals;
  } | null;
  className?: string;
}

const DEPTH_LABELS: Record<InterviewDepth, string> = {
  FACT: "事実",
  EMOTION: "感情",
  VALUE: "価値観",
  DECISION: "意思決定",
  PHILOSOPHY: "人生観",
  LESSON: "学び",
};

const DEPTH_ORDER: InterviewDepth[] = [
  "FACT",
  "EMOTION",
  "VALUE",
  "DECISION",
  "PHILOSOPHY",
  "LESSON",
];

const INTENT_LABELS: Record<FollowUpIntent, string> = {
  clarify_fact: "事実を確かめる",
  explore_emotion: "感情を聞く",
  extract_value: "価値観を掘る",
  probe_decision: "決断の基準を聞く",
  reflect_philosophy: "人生観へ接続",
  derive_lesson: "学びへ普遍化",
  move_topic: "次の話題へ",
};

const ACTION_STYLES: Record<OrchestratorActionKind, string> = {
  WAIT: "bg-muted text-muted-foreground",
  BACKCHANNEL: "bg-accent/10 text-accent",
  EMPATHY: "bg-warning/10 text-warning",
  FOLLOW_UP: "bg-success/10 text-success",
};

const ACTION_LABELS: Record<OrchestratorActionKind, string> = {
  WAIT: "待機",
  BACKCHANNEL: "相槌",
  EMPATHY: "共感",
  FOLLOW_UP: "深掘り",
};

function Meter({
  label,
  value,
  tone = "accent",
}: {
  label: string;
  value: number;
  tone?: "accent" | "success" | "warning";
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono tabular-nums">{pct}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-150",
            tone === "success"
              ? "bg-success"
              : tone === "warning"
              ? "bg-warning"
              : "bg-accent"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Type 6 only. Live view of the Human State Engine + Response Orchestrator:
 * fused end-of-turn / wait / thinking / engagement scores, the current action,
 * and whether the LiveKit turn detector signal is feeding in.
 */
export function HumanStatePanel({
  humanState,
  action,
  livekitActive,
  meaning,
  className,
}: HumanStatePanelProps) {
  const hs = humanState ?? null;
  const lk = hs?.signals.livekit;
  const f = hs?.features;
  const depthIndex = meaning ? DEPTH_ORDER.indexOf(meaning.depth) : -1;
  const sig = meaning?.signals;
  const sigText = sig
    ? [
        sig.emotion ? `感情:${sig.emotion}` : null,
        sig.value ? `価値:${sig.value}` : null,
        sig.decision ? `決断:${sig.decision}` : null,
      ]
        .filter(Boolean)
        .join(" / ")
    : "";

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-4 py-3",
        className
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Human State Engine
        </h3>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              livekitActive
                ? "bg-success/10 text-success"
                : "bg-muted text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                livekitActive ? "bg-success" : "bg-muted-foreground/50"
              )}
            />
            LiveKit {livekitActive ? "ON" : "OFF"}
          </span>
          {action && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                ACTION_STYLES[action.kind]
              )}
            >
              {ACTION_LABELS[action.kind]}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Meter
          label="発話終了"
          value={hs?.endOfTurn ?? 0}
          tone="success"
        />
        <Meter label="待つべき度" value={hs?.waitScore ?? 0} />
        <Meter label="思考中" value={hs?.thinking ?? 0} tone="warning" />
        <Meter label="エンゲージ" value={hs?.engagement ?? 0} />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-x-3 gap-y-1 border-t border-border pt-2 text-[10px] text-muted-foreground">
        <Feature
          label="話速 c/s"
          value={f?.speechRate != null ? f.speechRate.toFixed(1) : "—"}
        />
        <Feature label="フィラー" value={f ? String(f.fillerCount) : "—"} />
        <Feature
          label="ピッチ幅"
          value={f?.pitchRange != null ? `${Math.round(f.pitchRange)}Hz` : "—"}
        />
        <Feature
          label="音量傾向"
          value={f?.volumeTrend != null ? f.volumeTrend.toFixed(2) : "—"}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          LiveKit EOT:{" "}
          <span className="font-mono">
            {lk?.active && lk.value != null ? lk.value.toFixed(2) : "—"}
          </span>
        </span>
        <span>
          理由: <span className="font-mono">{action?.reason ?? "—"}</span>
        </span>
      </div>

      {meaning && (
        <div className="mt-3 border-t border-border pt-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="uppercase tracking-wide">掘り下げ</span>
            <span className="text-foreground">
              次の狙い:{" "}
              <span className="font-medium">
                {INTENT_LABELS[meaning.intent]}
              </span>
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-1">
            {DEPTH_ORDER.map((d, i) => (
              <div key={d} className="flex flex-1 flex-col items-center gap-0.5">
                <div
                  className={cn(
                    "h-1.5 w-full rounded-full",
                    i <= depthIndex ? "bg-accent" : "bg-muted"
                  )}
                />
                <span
                  className={cn(
                    "text-[8px]",
                    i === depthIndex
                      ? "font-semibold text-accent"
                      : "text-muted-foreground"
                  )}
                >
                  {DEPTH_LABELS[d]}
                </span>
              </div>
            ))}
          </div>
          {sigText && (
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              観測: <span className="text-foreground">{sigText}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Feature({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wide">{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </div>
  );
}
