"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInterviewSession } from "@/hooks/useInterviewSession";
import { useAudioAnalysis } from "@/hooks/useAudioAnalysis";
import { useTabCapture } from "@/hooks/useTabCapture";
import { AudioVisualizer } from "./AudioVisualizer";
import { HumanStatePanel } from "./HumanStatePanel";
import { TranscriptPanel } from "./TranscriptPanel";
import { AnalysisPanel } from "./AnalysisPanel";
import { SuggestionPanel } from "./SuggestionPanel";
import { EmotionIndicator } from "./EmotionIndicator";
import { cn } from "@/lib/cn";
import { getGeminiLiveConnectionUi } from "@/lib/gemini-live-connection";
import { getInterviewProviderLabel } from "@/lib/interview-provider";
import type {
  InterviewProvider,
  InterviewMode,
  InterviewVoice,
  NaturalVoiceBrainModel,
  NaturalVoiceTtsProvider,
  InworldRealtimeVadEagerness,
  RealtimeSpeedPreset,
  RealtimeSpeechStylePreset,
  RealtimeTonePreset,
  RealtimeTurnDetectionMode,
  RealtimeVadEagerness,
  TranscriptEntry,
  SpeechAudioMetrics,
  EmotionState,
  ServerVadSilenceDurationMs,
} from "@/lib/types";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  AlertCircle,
  Loader2,
  Monitor,
  RefreshCw,
} from "lucide-react";

interface InterviewRoomProps {
  provider: InterviewProvider;
  mode: InterviewMode;
  scenarioId: string;
  url?: string;
  voice: InterviewVoice;
  speed: RealtimeSpeedPreset;
  speechStyle: RealtimeSpeechStylePreset;
  tone: RealtimeTonePreset;
  silenceDurationMs: ServerVadSilenceDurationMs;
  inworldVadEagerness: InworldRealtimeVadEagerness;
  turnDetectionMode: RealtimeTurnDetectionMode;
  vadEagerness: RealtimeVadEagerness;
  ttsProvider: NaturalVoiceTtsProvider;
  brainModel?: NaturalVoiceBrainModel;
  onEnd: () => void;
}

export function InterviewRoom({
  provider,
  mode,
  scenarioId,
  url,
  voice,
  speed,
  speechStyle,
  tone,
  silenceDurationMs,
  inworldVadEagerness,
  turnDetectionMode,
  vadEagerness,
  ttsProvider,
  brainModel,
  onEnd,
}: InterviewRoomProps) {
  const [session, sessionActions] = useInterviewSession(provider);
  const [analysis, analysisActions] = useAudioAnalysis();
  const [tabCapture, tabCaptureActions] = useTabCapture();
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [metricsMap, setMetricsMap] = useState<
    Record<string, SpeechAudioMetrics>
  >({});
  const [emotionTimeline, setEmotionTimeline] = useState<EmotionState[]>([]);
  // Type 6 demo: whether the LiveKit turn-detector worker is enabled.
  const [liveKitEnabled, setLiveKitEnabled] = useState(true);
  const processedMetricsRef = useRef<Set<string>>(new Set());
  const isOnlineSupport = mode === "online_support";
  const showEmotion = mode !== undefined;
  const hasInterviewStarted = startTime !== null || session.transcript.length > 0;

  // Type 5: run company research up front so the interview can start
  // instantly; the start button stays locked until research completes.
  const prepareResearch = sessionActions.prepareResearch;
  const usesResearchPhase =
    (provider === "natural" || provider === "natural2") &&
    Boolean(prepareResearch);
  const researchStatus = usesResearchPhase
    ? session.researchStatus ?? "idle"
    : undefined;
  useEffect(() => {
    if (!usesResearchPhase || hasInterviewStarted) return;
    void prepareResearch?.(url);
  }, [usesResearchPhase, hasInterviewStarted, prepareResearch, url]);
  const isResearching =
    usesResearchPhase &&
    (researchStatus === "loading" || researchStatus === "idle");
  const geminiConnectionUi =
    provider === "gemini"
      ? getGeminiLiveConnectionUi({
          isConnected: session.isConnected,
          isConnecting: session.isConnecting,
          isReconnecting: session.isReconnecting,
          resumeFailed: session.resumeFailed,
          goAwayTimeLeft: session.goAwayTimeLeft,
          hasResumableSession: session.hasResumableSession,
        })
      : null;

  useEffect(() => {
    if (!startTime) return;
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  useEffect(() => {
    const transcript = session.transcript;
    if (transcript.length === 0) return;

    let hasNew = false;
    const updates: Record<string, SpeechAudioMetrics> = {};

    for (let i = 0; i < transcript.length; i++) {
      const entry = transcript[i];
      if (entry.role !== "interviewee") continue;
      if (processedMetricsRef.current.has(entry.id)) continue;

      const prevTimestamp =
        i > 0 ? transcript[i - 1].timestamp : (startTime ?? entry.timestamp - 5000);
      const metrics = analysisActions.computeMetrics(prevTimestamp, entry.timestamp);
      if (metrics && metrics.sampleCount > 0) {
        updates[entry.id] = metrics;
        processedMetricsRef.current.add(entry.id);
        hasNew = true;
      }
    }

    if (hasNew) {
      setMetricsMap((prev) => ({ ...prev, ...updates }));
    }
  }, [session.transcript, analysisActions, startTime]);

  const pushHumanSignals = sessionActions.pushHumanSignals;
  const setLiveKitTurnDetectorEnabled =
    sessionActions.setLiveKitTurnDetectorEnabled;
  const handleToggleLiveKit = useCallback(
    (enabled: boolean) => {
      setLiveKitEnabled(enabled);
      setLiveKitTurnDetectorEnabled?.(enabled);
    },
    [setLiveKitTurnDetectorEnabled]
  );
  const handleEmotionChange = useCallback(
    (emotion: EmotionState) => {
      setEmotionTimeline((prev) => [...prev, emotion]);
      // Type 6: feed the fused emotion into the Human State Engine so the
      // orchestrator can drive engagement-aware empathy / backchannels.
      if (provider === "natural2") {
        pushHumanSignals?.({ emotion });
      }
    },
    [provider, pushHumanSignals]
  );

  const enrichedTranscript: TranscriptEntry[] = session.transcript.map(
    (entry) => {
      let enriched: TranscriptEntry = entry;
      const metrics = metricsMap[entry.id];
      if (metrics) enriched = { ...enriched, speechMetrics: metrics };

      if (showEmotion && entry.role === "interviewee" && emotionTimeline.length > 0) {
        let closest = emotionTimeline[0];
        let minDiff = Math.abs(entry.timestamp - closest.timestamp);
        for (const e of emotionTimeline) {
          const diff = Math.abs(entry.timestamp - e.timestamp);
          if (diff < minDiff) {
            minDiff = diff;
            closest = e;
          }
        }
        if (minDiff < 5000) {
          enriched = { ...enriched, emotionState: closest };
        }
      }

      return enriched;
    }
  );

  const handleConnect = useCallback(async () => {
    if (isOnlineSupport) {
      const intervieweeStream = await tabCaptureActions.startCapture();
      if (!intervieweeStream) return;

      await sessionActions.connect(mode, scenarioId, {
        intervieweeStream,
        url,
        voice,
        speed,
        speechStyle,
        tone,
        silenceDurationMs,
        inworldVadEagerness,
        turnDetectionMode,
        vadEagerness,
        ttsProvider,
        brainModel,
        variant: provider === "natural2" ? "type6" : "type5",
      });
      setStartTime(Date.now());

      setTimeout(() => {
        analysisActions.startAnalysis(intervieweeStream);
      }, 500);
    } else {
      await sessionActions.connect(mode, scenarioId, {
        url,
        voice,
        speed,
        speechStyle,
        tone,
        silenceDurationMs,
        inworldVadEagerness,
        turnDetectionMode,
        vadEagerness,
        ttsProvider,
        brainModel,
        variant: provider === "natural2" ? "type6" : "type5",
      });
      setStartTime(Date.now());

      setTimeout(() => {
        const stream = sessionActions.getMediaStream();
        if (stream) {
          analysisActions.startAnalysis(stream);
        }
      }, 1000);
    }
  }, [
    mode,
    scenarioId,
    url,
    voice,
    speed,
    speechStyle,
    tone,
    silenceDurationMs,
    inworldVadEagerness,
    turnDetectionMode,
    vadEagerness,
    ttsProvider,
    brainModel,
    provider,
    sessionActions,
    analysisActions,
    tabCaptureActions,
    isOnlineSupport,
  ]);

  const handleDisconnect = useCallback(async () => {
    analysisActions.stopAnalysis();
    tabCaptureActions.stopCapture();

    // TODO: DB導入後に結果保存を有効化する
    // const fullAudioHistory = analysisActions.getSaveHistory();
    // if (enrichedTranscript.length > 0) {
    //   await fetch("/api/results", { ... });
    // }

    sessionActions.disconnect();
    onEnd();
  }, [
    sessionActions,
    analysisActions,
    tabCaptureActions,
    onEnd,
  ]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    sessionActions.mute(next);
    setIsMuted(next);
  }, [isMuted, sessionActions]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-foreground">
            {mode === "auto"
              ? "自動インタビュー"
              : mode === "online_support"
              ? "オンラインサポート"
              : "サポートモード"}
          </h1>
          <span className="text-xs text-muted-foreground">
            Type: {getInterviewProviderLabel(provider)}
          </span>
          <span
            className={cn(
              "text-xs px-2 py-0.5 rounded-full",
              provider === "gemini" && geminiConnectionUi
                ? geminiConnectionUi.statusTone === "success"
                  ? "bg-success/10 text-success"
                  : geminiConnectionUi.statusTone === "error"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-warning/10 text-warning"
                : session.isConnected
                ? "bg-success/10 text-success"
                : session.isConnecting
                ? "bg-warning/10 text-warning"
                : "bg-muted text-muted-foreground"
            )}
          >
            {provider === "gemini" && geminiConnectionUi
              ? geminiConnectionUi.statusLabel
              : session.isConnected
              ? "接続中"
              : session.isConnecting
              ? "接続中..."
              : "未接続"}
          </span>
          {session.isConnected && (
            <>
              <span className="text-sm text-muted-foreground font-mono">
                {formatTime(elapsedTime)}
              </span>
              <span className="text-xs text-muted-foreground">
                Agent: {session.currentAgent}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {session.isConnected && (
            <>
              <button
                onClick={toggleMute}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors",
                  isMuted
                    ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                    : "bg-muted text-foreground hover:bg-muted/80"
                )}
              >
                {isMuted ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
                {isMuted ? "ミュート中" : "マイク"}
              </button>
              <button
                onClick={handleDisconnect}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              >
                <PhoneOff className="w-4 h-4" />
                終了
              </button>
            </>
          )}
        </div>
      </header>

      {/* Error banner */}
      {session.error && (
        <div className="flex items-center gap-2 px-6 py-2 bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {session.error}
        </div>
      )}

      {provider === "gemini" && geminiConnectionUi?.notice && (
        <div
          className={cn(
            "flex items-center gap-3 px-6 py-2 text-sm border-b border-border",
            geminiConnectionUi.statusTone === "error"
              ? "bg-destructive/10 text-destructive"
              : "bg-warning/10 text-warning"
          )}
        >
          {session.isReconnecting ? (
            <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <div className="flex-1">
            <p>{geminiConnectionUi.notice}</p>
            {geminiConnectionUi.detail && (
              <p className="text-xs opacity-80">{geminiConnectionUi.detail}</p>
            )}
          </div>
          {geminiConnectionUi.canResume && (
            <button
              onClick={() => void sessionActions.resume()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-current/20 px-3 py-1.5 text-xs font-medium hover:bg-background/40 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              再開
            </button>
          )}
        </div>
      )}

      {/* Main content */}
      {!session.isConnected && !session.isConnecting && !hasInterviewStarted ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6 max-w-lg">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-foreground">
                {mode === "auto"
                  ? "自動インタビューを開始"
                  : mode === "online_support"
                  ? "オンラインサポートを開始"
                  : "サポートモードを開始"}
              </h2>
              <p className="text-muted-foreground">
                {mode === "auto"
                  ? "AIが自動で質問し、回答に応じて対話を分岐させます。マイクへのアクセスを許可してください。"
                  : mode === "online_support"
                  ? "ビデオ通話タブの音声をキャプチャして回答者の感情をリアルタイム分析します。開始後にビデオ通話のタブを選択してください。"
                  : "人間のインタビュアーの音声を分析し、リアルタイムで次の質問を提案します。"}
              </p>
            </div>

            {isOnlineSupport && (
              <div className="rounded-lg border border-border bg-card p-4 text-left space-y-2">
                <h3 className="text-sm font-semibold text-foreground">準備手順</h3>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Zoom / Meet / Teams 等のビデオ通話を別タブで開始</li>
                  <li>下の「開始」ボタンをクリック</li>
                  <li>ブラウザのダイアログでビデオ通話タブを選択し「タブの音声を共有」にチェック</li>
                </ol>
              </div>
            )}

            {usesResearchPhase && url && (
              <div className="rounded-lg border border-border bg-card p-4 text-left space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {isResearching ? (
                    <Loader2 className="w-4 h-4 shrink-0 animate-spin text-accent" />
                  ) : researchStatus === "ready" ? (
                    <span className="w-2 h-2 shrink-0 rounded-full bg-success" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 text-warning" />
                  )}
                  {isResearching
                    ? "企業サイトをリサーチしています…"
                    : researchStatus === "ready"
                      ? "リサーチが完了しました"
                      : "リサーチを取得できませんでした"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isResearching
                    ? "ミッション・事業・理念の手がかりを収集中です。完了するとインタビューを開始できます（1分ほどかかることがあります）。"
                    : researchStatus === "ready"
                      ? "サイトの言葉を踏まえた質問でインタビューを進めます。"
                      : "リサーチなしの一般的なインタビューとして開始できます。"}
                </p>
              </div>
            )}

            {(tabCapture.error || session.error) && (
              <div className="flex items-center gap-2 text-destructive text-sm justify-center">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {tabCapture.error || session.error}
              </div>
            )}

            <button
              onClick={handleConnect}
              disabled={isResearching}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-foreground font-medium hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isResearching ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isOnlineSupport ? (
                <Monitor className="w-5 h-5" />
              ) : (
                <Phone className="w-5 h-5" />
              )}
              {isResearching
                ? "リサーチ完了までお待ちください"
                : isOnlineSupport
                  ? "タブ音声をキャプチャして開始"
                  : "インタビューを開始"}
            </button>
          </div>
        </div>
      ) : session.isConnecting && !hasInterviewStarted ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-accent mx-auto" />
            <p className="text-muted-foreground">接続しています...</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Audio Visualizer */}
          <div className="px-6 pt-4">
            <AudioVisualizer
              energyHistory={analysis.energyHistory}
              pitchHistory={analysis.pitchHistory}
              currentEnergy={analysis.currentFeatures?.energy ?? 0}
              currentPitch={analysis.currentFeatures?.pitch ?? null}
              isSpeaking={session.isSpeaking}
              className="h-[120px]"
            />
          </div>

          {/* Type 6: Human State Engine debug panel */}
          {provider === "natural2" && (
            <div className="px-6 pt-3">
              <HumanStatePanel
                humanState={session.humanState}
                action={session.orchestratorAction}
                livekitActive={session.livekitTurnDetectorActive}
                liveKitEnabled={liveKitEnabled}
                onToggleLiveKit={handleToggleLiveKit}
                meaning={session.meaning}
              />
            </div>
          )}

          {/* Panels */}
          <div className="flex-1 flex gap-4 px-6 py-4 min-h-0">
            <div className="flex-1 flex flex-col gap-4 min-h-0">
              <EmotionIndicator
                currentFeatures={analysis.currentFeatures}
                history={analysis.history}
                getSaveHistory={analysisActions.getSaveHistory}
                onEmotionChange={handleEmotionChange}
                className="shrink-0"
              />
              <TranscriptPanel
                transcript={enrichedTranscript}
                mode={mode}
                className="flex-1 min-h-0"
              />
              {(mode === "support" || mode === "online_support") && (
                <SuggestionPanel
                  transcript={session.transcript}
                  audioFeatures={analysis.currentFeatures}
                  audioHistory={analysis.history}
                  aiSuggestions={session.aiSuggestions}
                  isConnected={session.isConnected}
                  className="h-64 shrink-0"
                />
              )}
            </div>
            <AnalysisPanel
              currentFeatures={analysis.currentFeatures}
              history={analysis.history}
              className="w-80 min-h-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}
