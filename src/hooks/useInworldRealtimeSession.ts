"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { requestMicrophoneStream } from "@/lib/realtime-audio-config";
import {
  DEFAULT_REALTIME_SPEED_PRESET,
  DEFAULT_REALTIME_SPEECH_STYLE_PRESET,
  DEFAULT_REALTIME_TONE_PRESET,
  getRealtimeSpeedValue,
  getRealtimeSpeechStyleInstruction,
  getRealtimeToneInstruction,
  normalizeRealtimeSpeedPreset,
  normalizeRealtimeSpeechStylePreset,
  normalizeRealtimeTonePreset,
} from "@/lib/realtime-settings";
import {
  buildInworldRealtimeSessionConfig,
  getInworldRealtimeInitialMessage,
  INWORLD_REALTIME_FALLBACK_LLM_MODEL,
  INWORLD_REALTIME_LLM_MODEL,
  INWORLD_STT_MODEL,
  INWORLD_TTS_LANGUAGE,
  INWORLD_TTS_MODEL,
} from "@/lib/inworld-realtime-config";
import {
  DEFAULT_INWORLD_REALTIME_VOICE,
  normalizeInworldRealtimeVoice,
} from "@/lib/inworld-realtime-voice";
import {
  DEFAULT_INWORLD_REALTIME_VAD_EAGERNESS,
  normalizeInworldRealtimeVadEagerness,
} from "@/lib/inworld-realtime-vad";
import type {
  InterviewMode,
  RealtimeSessionStyleContext,
  TranscriptEntry,
} from "@/lib/types";
import type {
  AiSuggestion,
  ConnectOptions,
  RealtimeSessionActions,
  RealtimeSessionState,
} from "./useRealtimeSession";

type RealtimeSessionType =
  import("@openai/agents/realtime").RealtimeSession<RealtimeSessionStyleContext>;
type RealtimeItemType = import("@openai/agents/realtime").RealtimeItem;
type RealtimeMessageItemType =
  import("@openai/agents/realtime").RealtimeMessageItem;

interface InworldRealtimeSessionResponse {
  url?: string;
  authToken?: string;
  iceServers?: RTCIceServer[];
}

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

  return {
    id: `t-${item.itemId}`,
    role: item.role === "assistant" ? "interviewer" : "interviewee",
    text: text.trim(),
    timestamp: Date.now(),
  };
}

function parseToolResult(
  toolName: string,
  resultJson: string
): AiSuggestion | null {
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

async function fetchInworldSessionConfig() {
  const tokenRes = await fetch("/api/inworld-realtime-session", {
    method: "POST",
  });
  if (!tokenRes.ok) {
    throw new Error("Type 3 セッションの作成に失敗しました");
  }

  const data = (await tokenRes.json()) as InworldRealtimeSessionResponse;
  if (!data.url || !data.authToken) {
    throw new Error("Type 3 接続情報の取得に失敗しました");
  }

  return {
    url: data.url,
    authToken: data.authToken,
    iceServers: data.iceServers ?? [],
  };
}

export function useInworldRealtimeSession(): [
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
  const processedItemIds = useRef<Set<string>>(new Set());
  const pendingOutputTranscriptIdRef = useRef<string | null>(null);
  const pendingOutputTranscriptTextRef = useRef("");
  const fallbackAttemptedRef = useRef(false);
  const pendingFallbackResponseRef = useRef<{
    voice: string;
    speed: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      sessionRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const connect = useCallback(
    async (mode: InterviewMode, scenarioId: string, options?: ConnectOptions) => {
      if (mode !== "auto") {
        setState((prev) => ({
          ...prev,
          error: "Type 3 は現在、自動インタビューのみ対応しています。",
        }));
        return;
      }

      setState((prev) => ({ ...prev, isConnecting: true, error: null, mode }));
      processedItemIds.current.clear();
      pendingOutputTranscriptIdRef.current = null;
      pendingOutputTranscriptTextRef.current = "";
      fallbackAttemptedRef.current = false;
      pendingFallbackResponseRef.current = null;

      try {
        const [
          { RealtimeSession, OpenAIRealtimeWebRTC },
          agentsModule,
          micStream,
          inworldConfig,
        ] = await Promise.all([
          import("@openai/agents/realtime"),
          import("@/lib/agents"),
          requestMicrophoneStream(),
          fetchInworldSessionConfig(),
        ]);

        agentsModule.resetInterviewState(scenarioId);
        const agent = agentsModule.getAgentForMode(mode);
        mediaStreamRef.current = micStream;

        const audioElement = document.createElement("audio");
        audioElement.autoplay = true;
        audioElement.setAttribute("playsinline", "true");
        audioElement.style.display = "none";
        document.body.appendChild(audioElement);
        audioElementRef.current = audioElement;

        const transportOptions = {
          mediaStream: micStream,
          audioElement,
          useInsecureApiKey: true,
          changePeerConnection: async (pc: RTCPeerConnection) => {
            if (inworldConfig.iceServers.length > 0) {
              pc.setConfiguration({ iceServers: inworldConfig.iceServers });
            }
            pc.ontrack = (event) => {
              audioElement.srcObject =
                event.streams[0] ?? new MediaStream([event.track]);
              audioElement.play().catch((error: unknown) => {
                console.warn("[Type3 Inworld] audio playback failed", error);
              });
            };
            return pc;
          },
        };

        const transport = new OpenAIRealtimeWebRTC(transportOptions);
        const voice = normalizeInworldRealtimeVoice(
          options?.voice ?? DEFAULT_INWORLD_REALTIME_VOICE
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
        const vadEagerness = normalizeInworldRealtimeVadEagerness(
          options?.inworldVadEagerness ?? DEFAULT_INWORLD_REALTIME_VAD_EAGERNESS
        );
        const speed = getRealtimeSpeedValue(speedPreset);
        const speechStyleInstruction =
          getRealtimeSpeechStyleInstruction(speechStylePreset);
        const toneInstruction = getRealtimeToneInstruction(tonePreset);
        const inworldStyleInstructions = [
          "日本語で話してください。",
          "経営者向けWell-beingインタビューとして、短く自然に質問してください。",
          "TTS の読み上げで誤読されそうな漢字、熟語、慣用句は、意味を変えずに自然な範囲でひらがなに開いてください。例: 和気あいあい は わきあいあい と書く。",
          "ただし、すべてをひらがなにせず、読み間違いが起きやすそうな語だけを読みやすくしてください。",
          "内部用語やhandoffなどの実装詳細は発話しないでください。",
          speechStyleInstruction,
          toneInstruction,
        ].join("\n");
        const realtimeConfig = buildInworldRealtimeSessionConfig({
          instructions: inworldStyleInstructions,
          voice,
          speed,
          vadEagerness,
        });

        const session = new RealtimeSession(agent, {
          model: INWORLD_REALTIME_LLM_MODEL,
          transport,
          context: {
            speechStyle: speechStylePreset,
            tone: tonePreset,
          },
          config: realtimeConfig as never,
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

        const upsertTranscript = (entry: TranscriptEntry) => {
          setState((prev) => {
            const index = prev.transcript.findIndex((item) => item.id === entry.id);
            if (index < 0) {
              return {
                ...prev,
                transcript: [...prev.transcript, entry],
              };
            }

            const transcript = [...prev.transcript];
            transcript[index] = {
              ...transcript[index],
              ...entry,
              timestamp: transcript[index].timestamp,
            };

            return {
              ...prev,
              transcript,
            };
          });
        };

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
            "Inworld RealtimeSession error:",
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

        session.on("transport_event", (event: unknown) => {
          const realtimeEvent = event as { type?: string; error?: unknown };
          if (!realtimeEvent.type) return;

          if (realtimeEvent.type === "response.output_audio_transcript.delta") {
            const deltaEvent = realtimeEvent as { delta?: string; item_id?: string };
            const delta = deltaEvent.delta ?? "";
            if (!delta) return;

            if (!pendingOutputTranscriptIdRef.current) {
              pendingOutputTranscriptIdRef.current =
                deltaEvent.item_id ?? `iw-out-${Date.now()}`;
              pendingOutputTranscriptTextRef.current = "";
            }

            pendingOutputTranscriptTextRef.current += delta;
            upsertTranscript({
              id: pendingOutputTranscriptIdRef.current,
              role: "interviewer",
              text: pendingOutputTranscriptTextRef.current.trim(),
              timestamp: Date.now(),
            });
            return;
          }

          if (realtimeEvent.type === "response.output_audio_transcript.done") {
            const doneEvent = realtimeEvent as {
              transcript?: string;
              item_id?: string;
            };
            const text =
              doneEvent.transcript?.trim() ??
              pendingOutputTranscriptTextRef.current.trim();

            if (text) {
              upsertTranscript({
                id:
                  pendingOutputTranscriptIdRef.current ??
                  doneEvent.item_id ??
                  `iw-out-${Date.now()}`,
                role: "interviewer",
                text,
                timestamp: Date.now(),
              });
            }

            pendingOutputTranscriptIdRef.current = null;
            pendingOutputTranscriptTextRef.current = "";
            return;
          }

          if (realtimeEvent.type === "response.done") {
            const response = (realtimeEvent as { response?: unknown }).response as
              | {
                  status?: string;
                  status_details?: unknown;
                  output_modalities?: string[];
                  output?: Array<{
                    type?: string;
                    role?: string;
                    content?: Array<{ type?: string; text?: string; transcript?: string }>;
                  }>;
                  audio?: unknown;
                }
              | undefined;
            const statusDetails = response?.status_details as
              | { type?: string; reason?: string }
              | undefined;

            if (response?.status === "failed") {
              console.warn("[Type3 Inworld] response failed", {
                statusDetails,
                outputModalities: response.output_modalities,
                audio: response.audio,
              });
            }

            if (
              response?.status === "failed" &&
              statusDetails?.reason === "server_error" &&
              !fallbackAttemptedRef.current &&
              INWORLD_REALTIME_LLM_MODEL !== INWORLD_REALTIME_FALLBACK_LLM_MODEL
            ) {
              fallbackAttemptedRef.current = true;
              console.warn(
                "[Type3 Inworld] switching to fallback model after failed response",
                {
                  from: INWORLD_REALTIME_LLM_MODEL,
                  to: INWORLD_REALTIME_FALLBACK_LLM_MODEL,
                  statusDetails,
                }
              );
              pendingFallbackResponseRef.current = { voice, speed };
              transport.sendEvent({
                type: "session.update",
                session: {
                  type: "realtime",
                  model: INWORLD_REALTIME_FALLBACK_LLM_MODEL,
                  instructions: inworldStyleInstructions,
                  output_modalities: ["audio", "text"],
                  audio: {
                    input: {
                      transcription: { model: INWORLD_STT_MODEL },
                      turn_detection: {
                        type: "semantic_vad",
                        eagerness: vadEagerness,
                        create_response: true,
                        interrupt_response: true,
                      },
                    },
                    output: {
                      model: INWORLD_TTS_MODEL,
                      voice,
                      language: INWORLD_TTS_LANGUAGE,
                      speed,
                    },
                  },
                  tool_choice: "none",
                  tools: [],
                },
              });
            }
            return;
          }

          if (realtimeEvent.type === "session.updated") {
            const session = (realtimeEvent as { session?: unknown }).session as
              | {
                  model?: string;
                  output_modalities?: string[];
                  audio?: unknown;
                  tools?: unknown[];
                }
              | undefined;

            if (
              session?.model === INWORLD_REALTIME_FALLBACK_LLM_MODEL &&
              pendingFallbackResponseRef.current
            ) {
              const fallback = pendingFallbackResponseRef.current;
              pendingFallbackResponseRef.current = null;
              console.warn(
                "[Type3 Inworld] retrying response after fallback model ack",
                {
                  model: session.model,
                  voice: fallback.voice,
                  speed: fallback.speed,
                }
              );
              transport.sendEvent({
                type: "response.create",
                response: {
                  output_modalities: ["audio", "text"],
                  voice: fallback.voice,
                  language: INWORLD_TTS_LANGUAGE,
                  instructions: `${inworldStyleInstructions}
次の発話では、歓迎を短く伝えてから最初の質問に入ってください。
話し方の指定を最優先し、標準語 / 関西弁の指定に合わせて自然な言い回しへ整えてください。`,
                },
              });
            }
            return;
          }

          if (realtimeEvent.type === "error") {
            console.log("[Type3 Inworld event]", realtimeEvent.type, event);
          }
        });

        await session.connect({
          url: inworldConfig.url,
          apiKey: inworldConfig.authToken,
        });

        const initialMessage = getInworldRealtimeInitialMessage(scenarioId);
        transport.sendEvent({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: initialMessage }],
          },
        });
        transport.sendEvent({
          type: "response.create",
          response: {
            output_modalities: ["audio", "text"],
            voice,
            language: INWORLD_TTS_LANGUAGE,
            instructions: `${inworldStyleInstructions}
次の発話では、歓迎を短く伝えてから最初の質問に入ってください。
話し方の指定を最優先し、標準語 / 関西弁の指定に合わせて自然な言い回しへ整えてください。`,
          },
        });

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
    []
  );

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    audioElementRef.current?.remove();
    audioElementRef.current = null;
    processedItemIds.current.clear();
    pendingOutputTranscriptIdRef.current = null;
    pendingOutputTranscriptTextRef.current = "";
    fallbackAttemptedRef.current = false;
    pendingFallbackResponseRef.current = null;
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
  }, []);

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
