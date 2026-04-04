"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import type { InterviewMode, TranscriptEntry } from "@/lib/types";

export interface AiSuggestion {
  id: string;
  toolName: string;
  text: string;
  reason: string;
  priority: "high" | "medium" | "low";
  category?: string;
  timestamp: number;
}

export interface RealtimeSessionState {
  isConnected: boolean;
  isConnecting: boolean;
  isSpeaking: boolean;
  currentAgent: string;
  mode: InterviewMode | null;
  transcript: TranscriptEntry[];
  aiSuggestions: AiSuggestion[];
  error: string | null;
}

interface ConnectOptions {
  intervieweeStream?: MediaStream;
}

interface RealtimeSessionActions {
  connect: (mode: InterviewMode, scenarioId: string, options?: ConnectOptions) => Promise<void>;
  disconnect: () => void;
  getMediaStream: () => MediaStream | null;
  mute: (muted: boolean) => void;
  isMuted: () => boolean;
}

type RealtimeSessionType = import("@openai/agents/realtime").RealtimeSession;
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
    isSpeaking: false,
    currentAgent: "",
    mode: null,
    transcript: [],
    aiSuggestions: [],
    error: null,
  });

  const sessionRef = useRef<RealtimeSessionType | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const mixerDisposeRef = useRef<(() => void) | null>(null);
  const processedItemIds = useRef<Set<string>>(new Set());
  const processedSegmentIds = useRef<Set<string>>(new Set());
  const modeRef = useRef<InterviewMode>("auto");
  const speakerMapRef = useRef<Map<string, "interviewer" | "interviewee">>(new Map());

  useEffect(() => {
    return () => {
      sessionRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
          navigator.mediaDevices.getUserMedia({ audio: true }),
        ]);
        agentsModule.resetInterviewState(scenarioId);
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

        const session = new RealtimeSession(agent, {
          model: "gpt-realtime",
          transport,
          config: {
            audio: {
              input: {
                transcription: {
                  model: transcriptionModel,
                },
                turnDetection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefixPaddingMs: 300,
                  silenceDurationMs: 700,
                },
              },
              output: {
                voice: "cedar",
              },
            },
          },
        });
        sessionRef.current = session;

        session.on("agent_start", (_ctx, ag) => {
          setState((prev) => ({
            ...prev,
            currentAgent: ag.name,
          }));
        });

        session.on("agent_handoff", (_ctx, _from, toAgent) => {
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
                    transcript: [...prev.transcript, entry],
                  }));
                }
              });
            }
          } catch (e) {
            console.warn("Transport wildcard listener not supported:", e);
          }

          session.on("history_added", (item) => {
            if (processedItemIds.current.has(item.itemId)) return;
            processedItemIds.current.add(item.itemId);

            const entry = extractTranscriptFromItem(item, mode);
            if (entry) {
              setState((prev) => ({
                ...prev,
                transcript: [...prev.transcript, entry],
              }));
            }
          });

          session.on("history_updated", (history) => {
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
                transcript: [...prev.transcript, ...newTranscripts],
              }));
            }
          });
        } else {
          // Auto mode: standard transcript handling
          session.on("history_added", (item) => {
            if (processedItemIds.current.has(item.itemId)) return;

            const entry = extractTranscriptFromItem(item, mode);
            if (entry) {
              processedItemIds.current.add(item.itemId);
              setState((prev) => ({
                ...prev,
                transcript: [...prev.transcript, entry],
              }));
            }
          });

          session.on("history_updated", (history) => {
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
                transcript: [...prev.transcript, ...newTranscripts],
              }));
            }
          });
        }

        session.on("agent_tool_end", (_ctx, _ag, tool, result) => {
          const suggestion = parseToolResult(tool.name, result);
          if (suggestion) {
            setState((prev) => ({
              ...prev,
              aiSuggestions: [...prev.aiSuggestions, suggestion].slice(-30),
            }));
          }
        });

        session.on("audio_start", () => {
          setState((prev) => ({ ...prev, isSpeaking: false }));
        });

        session.on("audio_interrupted", () => {
          setState((prev) => ({ ...prev, isSpeaking: true }));
        });

        session.on("error", (err: unknown) => {
          const errObj = err as Record<string, unknown>;
          const message =
            (errObj?.error as Record<string, unknown>)?.message ??
            errObj?.message ??
            (typeof errObj?.error === "string" ? errObj.error : null);

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

        // 最大2回試行（リトライ時は自動的に新トークンを取得）
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await session.connect({ apiKey: apiKeyFn });
            lastError = null;
            break;
          } catch (err) {
            lastError =
              err instanceof Error ? err : new Error("接続に失敗しました");
            console.warn(
              `RealtimeSession connect attempt ${attempt + 1} failed:`,
              err
            );
            if (attempt === 0) {
              await new Promise((r) => setTimeout(r, 500));
            }
          }
        }
        if (lastError) throw lastError;

        setState((prev) => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          currentAgent: agent.name,
        }));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "接続に失敗しました";
        setState((prev) => ({
          ...prev,
          isConnecting: false,
          error: message,
        }));
      }
    },
    [mapSpeakerToRole]
  );

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (mixerDisposeRef.current) {
      mixerDisposeRef.current();
      mixerDisposeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    audioElementRef.current = null;
    processedItemIds.current.clear();
    processedSegmentIds.current.clear();
    speakerMapRef.current.clear();
    setState({
      isConnected: false,
      isConnecting: false,
      isSpeaking: false,
      currentAgent: "",
      mode: null,
      transcript: [],
      aiSuggestions: [],
      error: null,
    });
  }, []);

  const getMediaStream = useCallback(() => mediaStreamRef.current, []);

  const mute = useCallback((muted: boolean) => {
    sessionRef.current?.mute(muted);
  }, []);

  const isMuted = useCallback(() => {
    return sessionRef.current?.muted ?? false;
  }, []);

  return [
    state,
    { connect, disconnect, getMediaStream, mute, isMuted },
  ];
}
