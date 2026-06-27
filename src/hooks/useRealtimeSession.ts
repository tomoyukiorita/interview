"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { DEFAULT_REALTIME_VOICE, normalizeRealtimeVoice } from "@/lib/realtime-voice";
import {
  buildRealtimeInputAudioConfig,
  buildRealtimeTurnDetectionConfig,
  requestMicrophoneStream,
} from "@/lib/realtime-audio-config";
import {
  DEFAULT_REALTIME_SPEED_PRESET,
  DEFAULT_REALTIME_SPEECH_STYLE_PRESET,
  DEFAULT_REALTIME_TONE_PRESET,
  DEFAULT_REALTIME_TURN_DETECTION_MODE,
  DEFAULT_REALTIME_VAD_EAGERNESS,
  DEFAULT_SERVER_VAD_SILENCE_DURATION_MS,
  getRealtimeSpeedValue,
  normalizeRealtimeSpeedPreset,
  normalizeRealtimeSpeechStylePreset,
  normalizeRealtimeTonePreset,
  normalizeRealtimeTurnDetectionMode,
  normalizeRealtimeVadEagerness,
  normalizeServerVadSilenceDurationMs,
} from "@/lib/realtime-settings";
import {
  DEFAULT_REALTIME_REASONING_EFFORT,
  OPENAI_REALTIME_MODEL,
} from "@/lib/realtime-model";
import { appendUniqueTranscriptEntries } from "@/lib/transcript-dedupe";
import type {
  EmotionState,
  InterviewVoice,
  InterviewMode,
  InworldRealtimeVadEagerness,
  RealtimeSpeedPreset,
  RealtimeSpeechStylePreset,
  RealtimeSessionStyleContext,
  RealtimeTonePreset,
  RealtimeTurnDetectionMode,
  RealtimeVadEagerness,
  NaturalVoiceBrainModel,
  NaturalVoiceTtsProvider,
  ServerVadSilenceDurationMs,
  TranscriptEntry,
} from "@/lib/types";

export interface AiSuggestion {
  id: string;
  toolName: string;
  text: string;
  reason: string;
  priority: "high" | "medium" | "low";
  category?: string;
  timestamp: number;
}

/** Pre-interview company research progress (Type 5 only). */
export type ResearchPrepStatus = "idle" | "loading" | "ready" | "failed";

export interface RealtimeSessionState {
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  isSpeaking: boolean;
  currentAgent: string;
  mode: InterviewMode | null;
  transcript: TranscriptEntry[];
  aiSuggestions: AiSuggestion[];
  error: string | null;
  resumeFailed: boolean;
  goAwayTimeLeft: string | null;
  hasResumableSession: boolean;
  /** Set only by sessions that pre-run research before the interview. */
  researchStatus?: ResearchPrepStatus;
  /** Type 6 only: latest fused Human State Engine estimate (debug panel). */
  humanState?: import("@/lib/types").HumanState | null;
  /** Type 6 only: the orchestrator's most recent action (debug panel). */
  orchestratorAction?: {
    kind: import("@/lib/types").OrchestratorActionKind;
    reason: string;
    at: number;
  } | null;
  /** Type 6 only: whether the LiveKit turn detector signal is live. */
  livekitTurnDetectorActive?: boolean;
  /** Type 6 only: meaning-depth axis (depth ladder + brain-reported signals). */
  meaning?: {
    depth: import("@/lib/meaning-engine").InterviewDepth;
    intent: import("@/lib/meaning-engine").FollowUpIntent;
    signals: import("@/lib/interview-brain").MeaningSignals;
  } | null;
}

export interface ConnectOptions {
  intervieweeStream?: MediaStream;
  voice?: InterviewVoice;
  speed?: RealtimeSpeedPreset;
  speechStyle?: RealtimeSpeechStylePreset;
  tone?: RealtimeTonePreset;
  silenceDurationMs?: ServerVadSilenceDurationMs;
  inworldVadEagerness?: InworldRealtimeVadEagerness;
  turnDetectionMode?: RealtimeTurnDetectionMode;
  vadEagerness?: RealtimeVadEagerness;
  url?: string;
  ttsProvider?: NaturalVoiceTtsProvider;
  /** Reasoning brain model for Type 5 (model comparison demos). */
  brainModel?: NaturalVoiceBrainModel;
  /**
   * Natural-voice session variant. "type5" is the default Type 5 behavior;
   * "type6" enables the Human State Engine + Response Orchestrator turn-taking
   * and the LiveKit turn detector signal. Only read by the natural-voice hook.
   */
  variant?: "type5" | "type6";
}

export interface RealtimeSessionActions {
  connect: (mode: InterviewMode, scenarioId: string, options?: ConnectOptions) => Promise<void>;
  disconnect: () => void;
  resume: () => Promise<void>;
  getMediaStream: () => MediaStream | null;
  mute: (muted: boolean) => void;
  isMuted: () => boolean;
  /**
   * Pre-run company research so the interview can start instantly once it
   * completes (Type 5 only). connect() reuses the prepared result.
   */
  prepareResearch?: (url?: string) => Promise<void>;
  /**
   * Feed externally-computed human signals (currently the fused emotion from
   * the UI audio-analysis layer) into the Human State Engine (Type 6 only).
   * No-op for providers that do not run the HSE.
   */
  pushHumanSignals?: (signals: { emotion?: EmotionState | null }) => void;
}

type RealtimeSessionType =
  import("@openai/agents/realtime").RealtimeSession<RealtimeSessionStyleContext>;
type RealtimeItemType = import("@openai/agents/realtime").RealtimeItem;
type RealtimeMessageItemType =
  import("@openai/agents/realtime").RealtimeMessageItem;

function isMessageItem(item: RealtimeItemType): item is RealtimeMessageItemType {
  return item.type === "message";
}

function extractTranscriptFromItem(
  item: RealtimeItemType,
  mode: InterviewMode
): TranscriptEntry | null {
  if (!isMessageItem(item)) return null;
  if (item.role === "system") return null;

  if ("status" in item && item.status !== "completed") return null;

  let text = "";
  for (const content of item.content) {
    if ("text" in content && content.text) {
      text += content.text;
    }
    if ("transcript" in content && content.transcript) {
      text += content.transcript;
    }
  }

  if (!text.trim()) return null;

  if (mode === "auto") {
    const role: "interviewer" | "interviewee" =
      item.role === "assistant" ? "interviewer" : "interviewee";
    return {
      id: `t-${item.itemId}`,
      role,
      text: text.trim(),
      timestamp: Date.now(),
    };
  }

  if (mode === "online_support") {
    // In online_support the mixed audio goes in as "user" input.
    // The AI never generates speech, so all items are from the conversation.
    return {
      id: `t-${item.itemId}`,
      role: "interviewee",
      text: text.trim(),
      timestamp: Date.now(),
    };
  }

  // Support mode (in-person): all user input is from room audio.
  return {
    id: `t-${item.itemId}`,
    role: "interviewee",
    text: text.trim(),
    timestamp: Date.now(),
    speaker: "unknown",
  };
}

function parseToolResult(toolName: string, resultJson: string): AiSuggestion | null {
  try {
    const data = JSON.parse(resultJson);
    const now = Date.now();

    if (toolName === "suggest_follow_up") {
      return {
        id: `ai-sug-${now}`,
        toolName,
        text: data.suggestion || "",
        reason: data.reason || "",
        priority: data.priority || "medium",
        timestamp: data.timestamp || now,
      };
    }

    if (toolName === "record_observation") {
      return {
        id: `ai-obs-${now}`,
        toolName,
        text: data.observation || "",
        reason: `観察: ${data.category || ""}`,
        priority: data.importance || "medium",
        category: data.category,
        timestamp: data.timestamp || now,
      };
    }

    return null;
  } catch {
    return null;
  }
}

interface DiarizeSegment {
  id: string;
  item_id: string;
  speaker: string;
  text: string;
  start: number;
  end: number;
}

export function useRealtimeSession(): [
  RealtimeSessionState,
  RealtimeSessionActions
] {
  const [state, setState] = useState<RealtimeSessionState>({
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
    isSpeaking: false,
    currentAgent: "",
    mode: null,
    transcript: [],
    aiSuggestions: [],
    error: null,
    resumeFailed: false,
    goAwayTimeLeft: null,
    hasResumableSession: false,
  });

  const sessionRef = useRef<RealtimeSessionType | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const mixerDisposeRef = useRef<(() => void) | null>(null);
  const processedItemIds = useRef<Set<string>>(new Set());
  const processedSegmentIds = useRef<Set<string>>(new Set());
  const modeRef = useRef<InterviewMode>("auto");
  const connectInFlightRef = useRef(false);
  const activeSessionIdRef = useRef(0);
  const speakerMapRef = useRef<Map<string, "interviewer" | "interviewee">>(new Map());

  const cleanupCurrentConnection = useCallback(() => {
    activeSessionIdRef.current += 1;
    sessionRef.current?.close();
    sessionRef.current = null;
    mixerDisposeRef.current?.();
    mixerDisposeRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.srcObject = null;
      audioElementRef.current.removeAttribute("src");
      audioElementRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupCurrentConnection();
    };
  }, [cleanupCurrentConnection]);

  const mapSpeakerToRole = useCallback(
    (speakerLabel: string): "interviewer" | "interviewee" => {
      if (speakerMapRef.current.has(speakerLabel)) {
        return speakerMapRef.current.get(speakerLabel)!;
      }
      // First speaker detected is assumed to be the interviewer
      const role: "interviewer" | "interviewee" =
        speakerMapRef.current.size === 0 ? "interviewer" : "interviewee";
      speakerMapRef.current.set(speakerLabel, role);
      return role;
    },
    []
  );

  const connect = useCallback(
    async (mode: InterviewMode, scenarioId: string, options?: ConnectOptions) => {
      if (connectInFlightRef.current || sessionRef.current) {
        cleanupCurrentConnection();
      }
      connectInFlightRef.current = true;
      const sessionId = activeSessionIdRef.current + 1;
      activeSessionIdRef.current = sessionId;
      setState((prev) => ({ ...prev, isConnecting: true, error: null, mode }));
      processedItemIds.current.clear();
      processedSegmentIds.current.clear();
      speakerMapRef.current.clear();
      modeRef.current = mode;

      try {
        // 独立したasync処理を並列実行（トークン取得はsession.connect直前まで遅延）
        const [
          { RealtimeSession, OpenAIRealtimeWebRTC },
          agentsModule,
          micStream,
        ] = await Promise.all([
          import("@openai/agents/realtime"),
          import("@/lib/agents"),
          requestMicrophoneStream(),
        ]);
        const voice = normalizeRealtimeVoice(
          options?.voice ?? DEFAULT_REALTIME_VOICE
        );
        const speedPreset = normalizeRealtimeSpeedPreset(
          options?.speed ?? DEFAULT_REALTIME_SPEED_PRESET
        );
        const speechStylePreset = normalizeRealtimeSpeechStylePreset(
          options?.speechStyle ?? DEFAULT_REALTIME_SPEECH_STYLE_PRESET
        );
        const tonePreset = normalizeRealtimeTonePreset(
          options?.tone ?? DEFAULT_REALTIME_TONE_PRESET
        );
        agentsModule.resetInterviewState(scenarioId);
        agentsModule.setInterviewStyleContext({
          speechStyle: speechStylePreset,
          tone: tonePreset,
        });
        const agent = agentsModule.getAgentForMode(mode);
        mediaStreamRef.current = micStream;

        let transportStream = micStream;

        if (mode === "online_support" && options?.intervieweeStream) {
          const { createMixedStream } = await import("@/lib/audio-mixer");
          const mixer = createMixedStream(micStream, options.intervieweeStream);
          mixerDisposeRef.current = mixer.dispose;
          transportStream = mixer.mixedStream;
        }

        const audioElement = document.createElement("audio");
        audioElement.autoplay = true;
        audioElementRef.current = audioElement;

        if (mode === "support" || mode === "online_support") {
          audioElement.muted = true;
        }

        const transport = new OpenAIRealtimeWebRTC({
          mediaStream: transportStream,
          audioElement,
        });

        const transcriptionModel =
          mode === "support" || mode === "online_support"
            ? "gpt-4o-transcribe-diarize"
            : "gpt-4o-transcribe";
        const silenceDurationMs = normalizeServerVadSilenceDurationMs(
          String(
            options?.silenceDurationMs ?? DEFAULT_SERVER_VAD_SILENCE_DURATION_MS
          )
        );
        const turnDetectionMode = normalizeRealtimeTurnDetectionMode(
          options?.turnDetectionMode ?? DEFAULT_REALTIME_TURN_DETECTION_MODE
        );
        const vadEagerness = normalizeRealtimeVadEagerness(
          options?.vadEagerness ?? DEFAULT_REALTIME_VAD_EAGERNESS
        );
        const turnDetection = buildRealtimeTurnDetectionConfig({
          mode: turnDetectionMode,
          silenceDurationMs,
          eagerness: vadEagerness,
        });
        const speed = getRealtimeSpeedValue(speedPreset);

        const session = new RealtimeSession(agent, {
          model: OPENAI_REALTIME_MODEL,
          transport,
          context: {
            speechStyle: speechStylePreset,
            tone: tonePreset,
          },
          config: {
            reasoning: {
              effort: DEFAULT_REALTIME_REASONING_EFFORT,
            },
            audio: {
              input: buildRealtimeInputAudioConfig({
                transcriptionModel,
                turnDetection,
              }),
              output: {
                voice,
                speed,
              },
            },
          } as never,
        });
        sessionRef.current = session;

        session.on("agent_start", (_ctx, ag) => {
          if (activeSessionIdRef.current !== sessionId) return;
          setState((prev) => ({
            ...prev,
            currentAgent: ag.name,
          }));
        });

        session.on("agent_handoff", (_ctx, _from, toAgent) => {
          if (activeSessionIdRef.current !== sessionId) return;
          setState((prev) => ({
            ...prev,
            currentAgent: toAgent.name,
          }));
        });

        if (mode === "support" || mode === "online_support") {
          // In support / online_support mode, try to capture diarized segments from the
          // transport's datachannel. If the API provides speaker labels
          // we use them; otherwise fall back to standard history.
          try {
            const origOn = transport.on?.bind(transport);
            if (origOn) {
              origOn("*", (event: Record<string, unknown>) => {
                if (activeSessionIdRef.current !== sessionId) return;
                if (
                  event.type ===
                  "conversation.item.input_audio_transcription.segment"
                ) {
                  const seg = event as unknown as DiarizeSegment;
                  if (processedSegmentIds.current.has(seg.id)) return;
                  processedSegmentIds.current.add(seg.id);
                  processedItemIds.current.add(seg.item_id);

                  if (!seg.text?.trim()) return;

                  const role = mapSpeakerToRole(seg.speaker);
                  const entry: TranscriptEntry = {
                    id: `seg-${seg.id}`,
                    role,
                    text: seg.text.trim(),
                    timestamp: Date.now(),
                    speaker: seg.speaker,
                  };

                  setState((prev) => ({
                    ...prev,
                    transcript: appendUniqueTranscriptEntries(prev.transcript, [
                      entry,
                    ]),
                  }));
                }
              });
            }
          } catch (e) {
            console.warn("Transport wildcard listener not supported:", e);
          }

          session.on("history_added", (item) => {
            if (activeSessionIdRef.current !== sessionId) return;
            if (processedItemIds.current.has(item.itemId)) return;
            processedItemIds.current.add(item.itemId);

            const entry = extractTranscriptFromItem(item, mode);
            if (entry) {
              setState((prev) => ({
                ...prev,
                transcript: appendUniqueTranscriptEntries(prev.transcript, [
                  entry,
                ]),
              }));
            }
          });

          session.on("history_updated", (history) => {
            if (activeSessionIdRef.current !== sessionId) return;
            const newTranscripts: TranscriptEntry[] = [];
            for (const item of history) {
              if (processedItemIds.current.has(item.itemId)) continue;
              const entry = extractTranscriptFromItem(item, mode);
              if (entry) {
                processedItemIds.current.add(item.itemId);
                newTranscripts.push(entry);
              }
            }
            if (newTranscripts.length > 0) {
              setState((prev) => ({
                ...prev,
                transcript: appendUniqueTranscriptEntries(
                  prev.transcript,
                  newTranscripts
                ),
              }));
            }
          });
        } else {
          // Auto mode: standard transcript handling
          session.on("history_added", (item) => {
            if (activeSessionIdRef.current !== sessionId) return;
            if (processedItemIds.current.has(item.itemId)) return;

            const entry = extractTranscriptFromItem(item, mode);
            if (entry) {
              processedItemIds.current.add(item.itemId);
              setState((prev) => ({
                ...prev,
                transcript: appendUniqueTranscriptEntries(prev.transcript, [
                  entry,
                ]),
              }));
            }
          });

          session.on("history_updated", (history) => {
            if (activeSessionIdRef.current !== sessionId) return;
            const newTranscripts: TranscriptEntry[] = [];
            for (const item of history) {
              if (processedItemIds.current.has(item.itemId)) continue;
              const entry = extractTranscriptFromItem(item, mode);
              if (entry) {
                processedItemIds.current.add(item.itemId);
                newTranscripts.push(entry);
              }
            }
            if (newTranscripts.length > 0) {
              setState((prev) => ({
                ...prev,
                transcript: appendUniqueTranscriptEntries(
                  prev.transcript,
                  newTranscripts
                ),
              }));
            }
          });
        }

        session.on("agent_tool_end", (_ctx, _ag, tool, result) => {
          if (activeSessionIdRef.current !== sessionId) return;
          const suggestion = parseToolResult(tool.name, result);
          if (suggestion) {
            setState((prev) => ({
              ...prev,
              aiSuggestions: [...prev.aiSuggestions, suggestion].slice(-30),
            }));
          }
        });

        session.on("audio_start", () => {
          if (activeSessionIdRef.current !== sessionId) return;
          setState((prev) => ({ ...prev, isSpeaking: false }));
        });

        session.on("audio_interrupted", () => {
          if (activeSessionIdRef.current !== sessionId) return;
          setState((prev) => ({ ...prev, isSpeaking: true }));
        });

        session.on("error", (err: unknown) => {
          if (activeSessionIdRef.current !== sessionId) return;
          const errObj = err as Record<string, unknown>;
          const errorPayload = errObj?.error as
            | Record<string, unknown>
            | undefined;
          const innerError = errorPayload?.error as
            | Record<string, unknown>
            | undefined;

          const code =
            (innerError?.code as string | undefined) ??
            (errorPayload?.code as string | undefined);
          const message =
            (innerError?.message as string | undefined) ??
            (errorPayload?.message as string | undefined) ??
            (errObj?.message as string | undefined) ??
            (typeof errorPayload === "string" ? errorPayload : null);

          // No useful info → drop silently. Empty `{ type: 'error', error: {} }`
          // sometimes arrives when the transport flushes after disconnect.
          const hasUsefulInfo =
            Boolean(code) ||
            Boolean(message) ||
            (errorPayload && Object.keys(errorPayload).length > 1);
          if (!hasUsefulInfo) return;

          // The Agents SDK occasionally double-fires `response.create` around
          // tool calls. The API rejects the duplicate with this code while the
          // original response keeps streaming, so it is safe to ignore.
          if (code === "conversation_already_has_active_response") {
            console.warn(
              "RealtimeSession: duplicate response.create rejected by API (safe to ignore)",
              { code, message }
            );
            return;
          }

          console.error(
            "RealtimeSession error:",
            JSON.stringify(err, null, 2),
            err
          );

          if (message) {
            setState((prev) => ({
              ...prev,
              error: String(message),
            }));
          }
        });

        // トークン取得をsession.connect直前まで遅延させ、TTL消費を最小化
        const apiKeyFn = async () => {
          const tokenRes = await fetch("/api/session", { method: "POST" });
          if (!tokenRes.ok) {
            throw new Error("セッションの作成に失敗しました");
          }
          const data = await tokenRes.json();
          if (!data.apiKey) {
            throw new Error("エフェメラルトークンの取得に失敗しました");
          }
          return data.apiKey as string;
        };

        await session.connect({ apiKey: apiKeyFn });

        if (activeSessionIdRef.current !== sessionId) {
          session.close();
          return;
        }

        setState((prev) => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          currentAgent: agent.name,
        }));
      } catch (err) {
        cleanupCurrentConnection();
        const message =
          err instanceof Error ? err.message : "接続に失敗しました";
        setState((prev) => ({
          ...prev,
          isConnecting: false,
          error: message,
        }));
      } finally {
        connectInFlightRef.current = false;
      }
    },
    [cleanupCurrentConnection, mapSpeakerToRole]
  );

  const disconnect = useCallback(() => {
    cleanupCurrentConnection();
    connectInFlightRef.current = false;
    processedItemIds.current.clear();
    processedSegmentIds.current.clear();
    speakerMapRef.current.clear();
    setState({
      isConnected: false,
      isConnecting: false,
      isReconnecting: false,
      isSpeaking: false,
      currentAgent: "",
      mode: null,
      transcript: [],
      aiSuggestions: [],
      error: null,
      resumeFailed: false,
      goAwayTimeLeft: null,
      hasResumableSession: false,
    });
  }, [cleanupCurrentConnection]);

  const getMediaStream = useCallback(() => mediaStreamRef.current, []);

  const mute = useCallback((muted: boolean) => {
    sessionRef.current?.mute(muted);
  }, []);

  const isMuted = useCallback(() => {
    return sessionRef.current?.muted ?? false;
  }, []);

  const resume = useCallback(async () => {
    return Promise.resolve();
  }, []);

  return [
    state,
    { connect, disconnect, resume, getMediaStream, mute, isMuted },
  ];
}
