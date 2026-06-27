"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  getRealtimeSpeechStyleInstruction,
  getRealtimeSpeedValue,
  getRealtimeToneInstruction,
  normalizeRealtimeSpeedPreset,
  normalizeRealtimeSpeechStylePreset,
  normalizeRealtimeTonePreset,
  normalizeRealtimeTurnDetectionMode,
  normalizeRealtimeVadEagerness,
  normalizeServerVadSilenceDurationMs,
} from "@/lib/realtime-settings";
import { DEFAULT_REALTIME_REASONING_EFFORT, OPENAI_REALTIME_MODEL } from "@/lib/realtime-model";
import { appendUniqueTranscriptEntries } from "@/lib/transcript-dedupe";
import { buildWellbeingAgent } from "@/lib/wellbeing-agent";
import type {
  InterviewMode,
  RealtimeSessionStyleContext,
  TranscriptEntry,
} from "@/lib/types";
import type {
  ConnectOptions,
  RealtimeSessionActions,
  RealtimeSessionState,
} from "./useRealtimeSession";

type RealtimeSessionType =
  import("@openai/agents/realtime").RealtimeSession<RealtimeSessionStyleContext>;
type RealtimeItemType = import("@openai/agents/realtime").RealtimeItem;
type RealtimeMessageItemType =
  import("@openai/agents/realtime").RealtimeMessageItem;

function isMessageItem(item: RealtimeItemType): item is RealtimeMessageItemType {
  return item.type === "message";
}

function extractTranscriptFromItem(
  item: RealtimeItemType
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

async function fetchSkeletonInstructions(url?: string): Promise<string> {
  if (!url || !url.trim()) return "";
  try {
    const res = await fetch("/api/interview-prep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { instructions?: string };
    return typeof data.instructions === "string" ? data.instructions : "";
  } catch (error) {
    console.warn("[Type4 Wellbeing] interview-prep fetch failed", error);
    return "";
  }
}

export function useWellbeingRealtimeSession(): [
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

  const cleanup = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
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
      cleanup();
    };
  }, [cleanup]);

  const connect = useCallback(
    async (mode: InterviewMode, _scenarioId: string, options?: ConnectOptions) => {
      if (sessionRef.current) {
        cleanup();
      }
      setState((prev) => ({
        ...prev,
        isConnecting: true,
        error: null,
        mode: "auto",
      }));
      processedItemIds.current.clear();

      try {
        const [
          { RealtimeSession, OpenAIRealtimeWebRTC },
          micStream,
          skeletonInstructions,
        ] = await Promise.all([
          import("@openai/agents/realtime"),
          requestMicrophoneStream(),
          fetchSkeletonInstructions(options?.url),
        ]);

        mediaStreamRef.current = micStream;

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
        const speed = getRealtimeSpeedValue(speedPreset);
        const styleInstructions = [
          getRealtimeSpeechStyleInstruction(speechStylePreset),
          getRealtimeToneInstruction(tonePreset),
        ].join("\n");

        const agent = buildWellbeingAgent({
          skeletonInstructions,
          styleInstructions,
          tone: tonePreset,
        });

        const audioElement = document.createElement("audio");
        audioElement.autoplay = true;
        audioElement.setAttribute("playsinline", "true");
        audioElementRef.current = audioElement;

        const transport = new OpenAIRealtimeWebRTC({
          mediaStream: micStream,
          audioElement,
        });

        const turnDetectionMode = normalizeRealtimeTurnDetectionMode(
          options?.turnDetectionMode ?? DEFAULT_REALTIME_TURN_DETECTION_MODE
        );
        const vadEagerness = normalizeRealtimeVadEagerness(
          options?.vadEagerness ?? DEFAULT_REALTIME_VAD_EAGERNESS
        );
        const silenceDurationMs = normalizeServerVadSilenceDurationMs(
          String(
            options?.silenceDurationMs ?? DEFAULT_SERVER_VAD_SILENCE_DURATION_MS
          )
        );
        const turnDetection = buildRealtimeTurnDetectionConfig({
          mode: turnDetectionMode,
          silenceDurationMs,
          eagerness: vadEagerness,
        });

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
                transcriptionModel: "gpt-4o-transcribe",
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

        // AI に最初の一手を促すための内部メッセージ。UI（書き起こし）には出さない。
        const kickoffText = skeletonInstructions
          ? "（インタビューを始めてください。まず温かく挨拶し、軽いアイスブレイクの質問を2問ほどして緊張をほぐしてください。アイスブレイクは深掘りせず短く受けます。済んだら、ひとこと置いて本インタビューに入り、原体験・現在・未来を深掘りしてください。アイスブレイクの発言を本編の起点に無理に使わなくてよく、頭の中の地図は会話中ずっと使って、相手の言葉に合わせてその場で紐づけてください。冒頭で会社情報を一気に並べないこと。）"
          : "（インタビューを始めてください。まず温かく挨拶し、軽いアイスブレイクの質問を2問ほどして緊張をほぐしてください。アイスブレイクは深掘りせず短く受けます。済んだら、ひとこと置いて本インタビューに入り、原体験・現在・未来を深掘りしてください。アイスブレイクの発言を本編の起点に無理に使わなくてかまいません。）";
        const isKickoffEntry = (entry: TranscriptEntry) =>
          entry.role === "interviewee" && entry.text === kickoffText;

        session.on("agent_start", (_ctx, ag) => {
          setState((prev) => ({ ...prev, currentAgent: ag.name }));
        });

        session.on("history_added", (item) => {
          if (processedItemIds.current.has(item.itemId)) return;
          const entry = extractTranscriptFromItem(item);
          if (entry) {
            processedItemIds.current.add(item.itemId);
            if (isKickoffEntry(entry)) return;
            setState((prev) => ({
              ...prev,
              transcript: appendUniqueTranscriptEntries(prev.transcript, [entry]),
            }));
          }
        });

        session.on("history_updated", (history) => {
          const newTranscripts: TranscriptEntry[] = [];
          for (const item of history) {
            if (processedItemIds.current.has(item.itemId)) continue;
            const entry = extractTranscriptFromItem(item);
            if (entry) {
              processedItemIds.current.add(item.itemId);
              if (isKickoffEntry(entry)) continue;
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

        session.on("audio_start", () => {
          setState((prev) => ({ ...prev, isSpeaking: false }));
        });

        session.on("audio_interrupted", () => {
          setState((prev) => ({ ...prev, isSpeaking: true }));
        });

        session.on("error", (err: unknown) => {
          const errObj = err as Record<string, unknown>;
          const errorPayload = errObj?.error as Record<string, unknown> | undefined;
          const innerError = errorPayload?.error as
            | Record<string, unknown>
            | undefined;
          const code =
            (innerError?.code as string | undefined) ??
            (errorPayload?.code as string | undefined);
          const message =
            (innerError?.message as string | undefined) ??
            (errorPayload?.message as string | undefined) ??
            (errObj?.message as string | undefined);

          if (code === "conversation_already_has_active_response") return;

          const hasUsefulInfo =
            Boolean(code) ||
            Boolean(message) ||
            (errorPayload && Object.keys(errorPayload).length > 1);
          if (!hasUsefulInfo) return;

          console.error(
            "[Type4 Wellbeing] RealtimeSession error:",
            JSON.stringify(err, null, 2)
          );
          if (message) {
            setState((prev) => ({ ...prev, error: String(message) }));
          }
        });

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

        // AI 側から挨拶・アイスブレイクを切り出させる
        transport.sendEvent({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: kickoffText,
              },
            ],
          },
        });
        transport.sendEvent({ type: "response.create" });

        setState((prev) => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          currentAgent: agent.name,
        }));
      } catch (err) {
        cleanup();
        const message = err instanceof Error ? err.message : "接続に失敗しました";
        setState((prev) => ({
          ...prev,
          isConnecting: false,
          error: message,
        }));
      }
    },
    [cleanup]
  );

  const disconnect = useCallback(() => {
    cleanup();
    processedItemIds.current.clear();
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
  }, [cleanup]);

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
