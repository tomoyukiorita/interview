"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { encodePcm16Wav } from "@/lib/audio-wav";
import { buildMicrophoneConstraints } from "@/lib/realtime-audio-config";
import {
  DEFAULT_REALTIME_SPEED_PRESET,
  DEFAULT_REALTIME_SPEECH_STYLE_PRESET,
  DEFAULT_REALTIME_TONE_PRESET,
  DEFAULT_SERVER_VAD_SILENCE_DURATION_MS,
  normalizeRealtimeSpeedPreset,
  normalizeRealtimeSpeechStylePreset,
  normalizeRealtimeTonePreset,
  normalizeServerVadSilenceDurationMs,
} from "@/lib/realtime-settings";
import {
  buildGeminiInterviewSystemInstruction,
  createGeminiInterviewState,
  getGeminiInitialPrompt,
  getGeminiResumePrompt,
  getGeminiSalvagedUserTurnPrompt,
  runGeminiNextQuestion,
  type GeminiInterviewState,
  type GeminiInterviewToolArgs,
} from "@/lib/gemini-interview";
import {
  DEFAULT_GEMINI_LIVE_VOICE,
  normalizeGeminiLiveVoice,
} from "@/lib/gemini-voice";
import {
  DEFAULT_GEMINI_THINKING_LEVEL,
  type GeminiThinkingLevel,
} from "@/lib/gemini-thinking";
import {
  getGeminiUnexpectedCloseAction,
  getGeminiResumePromptAction,
  parseGeminiGoAwaySeconds,
} from "@/lib/gemini-live-connection";
import type {
  FunctionCall,
  LiveServerMessage,
  Session as GeminiSession,
} from "@google/genai";
import { ThinkingLevel } from "@google/genai";
import type { InterviewMode, TranscriptEntry } from "@/lib/types";
import type {
  ConnectOptions,
  RealtimeSessionActions,
  RealtimeSessionState,
} from "./useRealtimeSession";

const GEMINI_MODEL = "gemini-3.1-flash-live-preview";
const GEMINI_OUTPUT_SAMPLE_RATE = 24000;
const INPUT_BUFFER_SIZE = 4096;
const INPUT_PREROLL_CHUNKS = 4;
const INPUT_VAD_RMS_THRESHOLD = 0.012;
const GEMINI_SDK_THINKING_LEVEL_BY_LEVEL: Record<
  GeminiThinkingLevel,
  ThinkingLevel
> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

interface GeminiSessionConfig {
  mode: InterviewMode;
  scenarioId: string;
  options?: ConnectOptions;
}

interface GeminiInputTurnSnapshot {
  turnId: string;
  startedAt: number;
  chunks: Uint8Array[];
  sampleRate: number;
}

export function useGeminiLiveSession(): [
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

  const sessionRef = useRef<GeminiSession | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const inputMuteGainRef = useRef<GainNode | null>(null);
  const inputSampleRateRef = useRef(16000);
  const inputSilenceMsRef = useRef(0);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const outputSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextPlaybackTimeRef = useRef(0);
  const mutedRef = useRef(false);
  const preInputChunksRef = useRef<Uint8Array[]>([]);
  const activeInputTurnIdRef = useRef<string | null>(null);
  const activeInputTurnStartedAtRef = useRef<number | null>(null);
  const activeInputTurnChunksRef = useRef<Uint8Array[]>([]);
  const pendingOutputTranscriptIdRef = useRef<string | null>(null);
  const pendingOutputTranscriptTextRef = useRef("");
  const lastInterviewerTurnTextRef = useRef<string | null>(null);
  const transcribingTurnIdsRef = useRef<Set<string>>(new Set());
  const sessionConfigRef = useRef<GeminiSessionConfig | null>(null);
  const resumeHandleRef = useRef<string | null>(null);
  const activeSessionTokenRef = useRef(0);
  const resumeInFlightRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const resumeSessionRef = useRef<(() => Promise<void>) | null>(null);
  const hasSentResumePromptRef = useRef(false);
  const pendingResumePromptRef = useRef(false);
  const pendingSalvagedInputTextRef = useRef<string | null>(null);
  const interviewStateRef = useRef<GeminiInterviewState>(
    createGeminiInterviewState()
  );

  const clearOutputAudio = useCallback(() => {
    for (const source of outputSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // noop
      }
    }
    outputSourcesRef.current.clear();
    if (outputAudioContextRef.current) {
      nextPlaybackTimeRef.current = outputAudioContextRef.current.currentTime;
    }
  }, []);

  const cleanupSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }

    clearOutputAudio();

    if (inputProcessorRef.current) {
      inputProcessorRef.current.disconnect();
      inputProcessorRef.current.onaudioprocess = null;
      inputProcessorRef.current = null;
    }
    inputSourceRef.current?.disconnect();
    inputMuteGainRef.current?.disconnect();
    inputSourceRef.current = null;
    inputMuteGainRef.current = null;

    if (inputAudioContextRef.current) {
      void inputAudioContextRef.current.close();
      inputAudioContextRef.current = null;
    }

    if (outputGainRef.current) {
      outputGainRef.current.disconnect();
      outputGainRef.current = null;
    }

    if (outputAudioContextRef.current) {
      void outputAudioContextRef.current.close();
      outputAudioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    inputSampleRateRef.current = 16000;
    preInputChunksRef.current = [];
    activeInputTurnIdRef.current = null;
    activeInputTurnStartedAtRef.current = null;
    activeInputTurnChunksRef.current = [];
    pendingOutputTranscriptIdRef.current = null;
    pendingOutputTranscriptTextRef.current = "";
    lastInterviewerTurnTextRef.current = null;
    transcribingTurnIdsRef.current.clear();
    nextPlaybackTimeRef.current = 0;
    sessionConfigRef.current = null;
    resumeHandleRef.current = null;
    activeSessionTokenRef.current = 0;
    resumeInFlightRef.current = false;
    manualDisconnectRef.current = false;
    hasSentResumePromptRef.current = false;
    pendingResumePromptRef.current = false;
    pendingSalvagedInputTextRef.current = null;
  }, [clearOutputAudio]);

  useEffect(() => {
    return () => {
      cleanupSession();
    };
  }, [cleanupSession]);

  const upsertTranscript = useCallback((entry: TranscriptEntry) => {
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
  }, []);

  const removeTranscript = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      transcript: prev.transcript.filter((entry) => entry.id !== id),
    }));
  }, []);

  const setCurrentAgent = useCallback((agentName: string) => {
    setState((prev) => ({ ...prev, currentAgent: agentName }));
  }, []);

  const closeCurrentSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    clearOutputAudio();
    pendingOutputTranscriptIdRef.current = null;
    pendingOutputTranscriptTextRef.current = "";
  }, [clearOutputAudio]);

  const transcribeInputChunks = useCallback(
    async (turnId: string, chunks: Uint8Array[], sampleRate: number) => {
      if (transcribingTurnIdsRef.current.has(turnId)) {
        return null;
      }
      transcribingTurnIdsRef.current.add(turnId);

      try {
        const wavBytes = encodePcm16Wav(chunks, sampleRate);
        const file = new File(
          [wavBytes as unknown as BlobPart],
          `${turnId}.wav`,
          {
            type: "audio/wav",
          }
        );
        const formData = new FormData();
        formData.set("file", file);

        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("OpenAI transcription failed");
        }

        const data = (await response.json()) as { text?: string };
        return data.text?.trim() || null;
      } finally {
        transcribingTurnIdsRef.current.delete(turnId);
      }
    },
    []
  );

  const flushDeferredResumePrompt = useCallback(() => {
    const action = getGeminiResumePromptAction({
      isResumeSession: pendingResumePromptRef.current,
      hasSentResumePrompt: hasSentResumePromptRef.current,
      isUserTurnActive: Boolean(activeInputTurnIdRef.current),
    });

    if (action !== "send" || !sessionRef.current) {
      return;
    }

    const salvagedText = pendingSalvagedInputTextRef.current;
    if (salvagedText) {
      sessionRef.current.sendRealtimeInput({
        text: getGeminiSalvagedUserTurnPrompt(salvagedText),
      });
      pendingSalvagedInputTextRef.current = null;
      hasSentResumePromptRef.current = true;
      pendingResumePromptRef.current = false;
      return;
    }

    sessionRef.current.sendRealtimeInput({
      text: getGeminiResumePrompt(lastInterviewerTurnTextRef.current),
    });
    hasSentResumePromptRef.current = true;
    pendingResumePromptRef.current = false;
  }, []);

  const startInputTurn = useCallback(() => {
    if (activeInputTurnIdRef.current) return;

    activeInputTurnIdRef.current = `g-in-${Date.now()}`;
    activeInputTurnStartedAtRef.current = Date.now();
    activeInputTurnChunksRef.current = [...preInputChunksRef.current];
    preInputChunksRef.current = [];
  }, []);

  const finalizeInputTurn = useCallback(async () => {
    const turnId = activeInputTurnIdRef.current;
    const startedAt = activeInputTurnStartedAtRef.current ?? Date.now();
    const chunks = activeInputTurnChunksRef.current;
    const sampleRate = inputSampleRateRef.current;

    activeInputTurnIdRef.current = null;
    activeInputTurnStartedAtRef.current = null;
    activeInputTurnChunksRef.current = [];
    inputSilenceMsRef.current = 0;
    preInputChunksRef.current = [];

    if (!turnId || chunks.length === 0) {
      return;
    }

    try {
      const text = await transcribeInputChunks(turnId, chunks, sampleRate);

      if (!text) {
        removeTranscript(turnId);
        return;
      }

      upsertTranscript({
        id: turnId,
        role: "interviewee",
        text,
        timestamp: startedAt,
      });
    } catch (error) {
      console.error("Failed to transcribe Gemini input turn:", error);
      removeTranscript(turnId);
    } finally {
      flushDeferredResumePrompt();
    }
  }, [
    flushDeferredResumePrompt,
    removeTranscript,
    transcribeInputChunks,
    upsertTranscript,
  ]);

  const snapshotActiveInputTurn =
    useCallback((): GeminiInputTurnSnapshot | null => {
      const turnId = activeInputTurnIdRef.current;
      const startedAt = activeInputTurnStartedAtRef.current ?? Date.now();
      const chunks = [...activeInputTurnChunksRef.current];
      const sampleRate = inputSampleRateRef.current;

      activeInputTurnIdRef.current = null;
      activeInputTurnStartedAtRef.current = null;
      activeInputTurnChunksRef.current = [];
      inputSilenceMsRef.current = 0;
      preInputChunksRef.current = [];

      if (!turnId || chunks.length === 0) {
        return null;
      }

      return {
        turnId,
        startedAt,
        chunks,
        sampleRate,
      };
    }, []);

  const transcribeInputTurnSnapshot = useCallback(
    async (snapshot: GeminiInputTurnSnapshot) => {
      try {
        const text = await transcribeInputChunks(
          snapshot.turnId,
          snapshot.chunks,
          snapshot.sampleRate
        );

        if (!text) {
          removeTranscript(snapshot.turnId);
          return null;
        }

        upsertTranscript({
          id: snapshot.turnId,
          role: "interviewee",
          text,
          timestamp: snapshot.startedAt,
        });

        return text;
      } catch (error) {
        console.error("Failed to salvage Gemini input turn:", error);
        removeTranscript(snapshot.turnId);
        return null;
      }
    },
    [removeTranscript, transcribeInputChunks, upsertTranscript]
  );

  const handleToolCalls = useCallback(
    (session: GeminiSession, functionCalls: FunctionCall[]) => {
      const responses = functionCalls.map((functionCall) => {
        const id = String(functionCall.id ?? "");
        const name = String(functionCall.name ?? "");
        const args = parseGeminiToolArgs(functionCall.args);

        if (name !== "get_next_question") {
          return {
            id,
            name,
            response: {
              error: `Unsupported tool: ${name}`,
            } as Record<string, unknown>,
          };
        }

        const { decision, nextState } = runGeminiNextQuestion(
          interviewStateRef.current,
          args
        );
        interviewStateRef.current = nextState;
        setCurrentAgent(nextState.currentAgentName);

        return {
          id,
          name,
          response: {
            nextQuestionId: decision.nextQuestionId,
            reason: decision.reason,
            nextQuestionText: decision.nextQuestionText,
            suggestedTopic: decision.suggestedTopic,
            shouldHandoff: decision.shouldHandoff,
            handoffTarget: decision.handoffTarget,
          } as Record<string, unknown>,
        };
      });

      session.sendToolResponse({
        functionResponses: responses,
      });
    },
    [setCurrentAgent]
  );

  const openSession = useCallback(
    async ({
      scenarioId,
      options,
      resumeHandle,
      preserveConversation,
    }: GeminiSessionConfig & {
      resumeHandle?: string | null;
      preserveConversation: boolean;
    }) => {
      const sessionToken = activeSessionTokenRef.current + 1;
      activeSessionTokenRef.current = sessionToken;

      const [{ GoogleGenAI, Modality }, micStream] = await Promise.all([
        import("@google/genai"),
        mediaStreamRef.current
          ? Promise.resolve(mediaStreamRef.current)
          : navigator.mediaDevices.getUserMedia(buildMicrophoneConstraints()),
      ]);

      mediaStreamRef.current = micStream;

      const tokenRes = await fetch("/api/gemini-session", { method: "POST" });
      if (!tokenRes.ok) {
        throw new Error("Type 2 セッションの作成に失敗しました");
      }

      const tokenData = (await tokenRes.json()) as { apiKey?: string };
      if (!tokenData.apiKey) {
        throw new Error("Type 2 接続トークンの取得に失敗しました");
      }

      const speedPreset = normalizeRealtimeSpeedPreset(
        options?.speed ?? DEFAULT_REALTIME_SPEED_PRESET
      );
      const speechStylePreset = normalizeRealtimeSpeechStylePreset(
        options?.speechStyle ?? DEFAULT_REALTIME_SPEECH_STYLE_PRESET
      );
      const tonePreset = normalizeRealtimeTonePreset(
        options?.tone ?? DEFAULT_REALTIME_TONE_PRESET
      );
      const silenceDurationMs = normalizeServerVadSilenceDurationMs(
        String(options?.silenceDurationMs ?? DEFAULT_SERVER_VAD_SILENCE_DURATION_MS)
      );
      const voice = normalizeGeminiLiveVoice(
        String(options?.voice ?? DEFAULT_GEMINI_LIVE_VOICE)
      );

      const ai = new GoogleGenAI({
        apiKey: tokenData.apiKey,
        apiVersion: "v1alpha",
      });

      let outputAudioContext = outputAudioContextRef.current;
      let outputGain = outputGainRef.current;

      if (!outputAudioContext || !outputGain) {
        outputAudioContext = new AudioContext({
          sampleRate: GEMINI_OUTPUT_SAMPLE_RATE,
        });
        outputGain = outputAudioContext.createGain();
        outputGain.gain.value = mutedRef.current ? 0 : 1;
        outputGain.connect(outputAudioContext.destination);
        outputAudioContextRef.current = outputAudioContext;
        outputGainRef.current = outputGain;
      }

      nextPlaybackTimeRef.current = outputAudioContext.currentTime;

      const functionDeclarations = [
        {
          name: "get_next_question",
          description:
            "回答内容を評価して、次に聞く質問と必要なハンドオフ先を決める",
          parametersJsonSchema: {
            type: "object",
            additionalProperties: false,
            properties: {
              currentAnswerSummary: { type: "string" },
              currentAgentName: {
                type: "string",
                enum: [
                  "InterviewAgent",
                  "LeadershipWellbeingAgent",
                  "OrganizationCultureAgent",
                ],
              },
              sentiment: {
                type: "string",
                enum: ["positive", "neutral", "negative"],
              },
              topicCovered: { type: "boolean" },
              answerQuality: {
                type: "string",
                enum: ["detailed", "adequate", "brief", "off_topic"],
              },
            },
            required: [
              "currentAnswerSummary",
              "currentAgentName",
              "sentiment",
              "topicCovered",
              "answerQuality",
            ],
          },
        },
      ];

      const session = await ai.live.connect({
        model: GEMINI_MODEL,
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (
              manualDisconnectRef.current ||
              sessionToken !== activeSessionTokenRef.current
            ) {
              return;
            }

            const serverContent = message.serverContent;
            const toolCall = message.toolCall;
            const voiceActivityType = message.voiceActivity?.voiceActivityType;
            const resumptionUpdate = message.sessionResumptionUpdate;
            const goAwayTimeLeft = message.goAway?.timeLeft ?? null;

            if (resumptionUpdate) {
              if (resumptionUpdate.resumable && resumptionUpdate.newHandle) {
                resumeHandleRef.current = resumptionUpdate.newHandle;
              }

              setState((prev) => ({
                ...prev,
                hasResumableSession: Boolean(resumeHandleRef.current),
                resumeFailed:
                  prev.resumeFailed && !resumeHandleRef.current
                    ? prev.resumeFailed
                    : false,
              }));
            }

            if (goAwayTimeLeft) {
              setState((prev) => ({
                ...prev,
                goAwayTimeLeft,
              }));

              const secondsLeft = parseGeminiGoAwaySeconds(goAwayTimeLeft);
              if (
                resumeHandleRef.current &&
                !resumeInFlightRef.current &&
                (secondsLeft === null || secondsLeft <= 30)
              ) {
                void resumeSessionRef.current?.();
              }
            }

            if (toolCall?.functionCalls?.length && sessionRef.current) {
              handleToolCalls(sessionRef.current, toolCall.functionCalls);
            }

            if (serverContent?.interrupted) {
              clearOutputAudio();
              pendingOutputTranscriptIdRef.current = null;
              pendingOutputTranscriptTextRef.current = "";
              setState((prev) => ({ ...prev, isSpeaking: false }));
            }

            const turnEnded = Boolean(
              serverContent?.turnComplete ||
                serverContent?.generationComplete ||
                serverContent?.interrupted
            );

            if (voiceActivityType === "ACTIVITY_START") {
              startInputTurn();
              inputSilenceMsRef.current = 0;
            }
            if (voiceActivityType === "ACTIVITY_END" && activeInputTurnIdRef.current) {
              void finalizeInputTurn();
            } else if (turnEnded && activeInputTurnIdRef.current) {
              void finalizeInputTurn();
            }

            const outputTranscription = serverContent?.outputTranscription;
            const outputText = outputTranscription?.text?.trim();
            if (outputText) {
              if (!pendingOutputTranscriptIdRef.current) {
                pendingOutputTranscriptIdRef.current = `g-out-${Date.now()}`;
              }
              pendingOutputTranscriptTextRef.current = mergeTranscriptText(
                pendingOutputTranscriptTextRef.current,
                outputText
              );
              lastInterviewerTurnTextRef.current =
                pendingOutputTranscriptTextRef.current;
              upsertTranscript({
                id: pendingOutputTranscriptIdRef.current,
                role: "interviewer",
                text: pendingOutputTranscriptTextRef.current,
                timestamp: Date.now(),
              });
            }
            if (pendingOutputTranscriptIdRef.current && turnEnded) {
              pendingOutputTranscriptIdRef.current = null;
              pendingOutputTranscriptTextRef.current = "";
            }

            const modelTurn = serverContent?.modelTurn;
            if (modelTurn?.parts) {
              for (const part of modelTurn.parts) {
                const inlineData = part.inlineData;
                if (!inlineData?.data) continue;
                if (
                  inlineData.mimeType &&
                  !inlineData.mimeType.startsWith("audio/pcm")
                ) {
                  continue;
                }
                enqueueOutputAudio(inlineData.data);
              }
            }

            if (serverContent?.turnComplete) {
              setState((prev) => ({ ...prev, isSpeaking: false }));
            }
          },
          onerror: (event: ErrorEvent) => {
            if (
              manualDisconnectRef.current ||
              sessionToken !== activeSessionTokenRef.current
            ) {
              return;
            }
            setState((prev) => ({
              ...prev,
              error: event.message || "Type 2 接続でエラーが発生しました",
            }));
          },
          onclose: () => {
            if (sessionToken !== activeSessionTokenRef.current) {
              return;
            }

            const action = getGeminiUnexpectedCloseAction({
              isManualDisconnect: manualDisconnectRef.current,
              isResumeInFlight: resumeInFlightRef.current,
              hasResumableSession: Boolean(resumeHandleRef.current),
            });

            if (action === "ignore") {
              return;
            }

            if (action === "resume") {
              void resumeSessionRef.current?.();
              return;
            }

            setState((prev) => ({
              ...prev,
              isConnected: false,
              isConnecting: false,
              isReconnecting: false,
              isSpeaking: false,
              error:
                prev.error ??
                "Type 2 の接続が切れました。再開ハンドルがないため自動再接続できませんでした。",
              resumeFailed: true,
              goAwayTimeLeft: null,
            }));
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: {
            parts: [
              {
                text: buildGeminiInterviewSystemInstruction({
                  speed: speedPreset,
                  speechStyle: speechStylePreset,
                  tone: tonePreset,
                }),
              },
            ],
          },
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voice,
              },
            },
          },
          thinkingConfig: {
            thinkingLevel:
              GEMINI_SDK_THINKING_LEVEL_BY_LEVEL[
                DEFAULT_GEMINI_THINKING_LEVEL
              ],
          },
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: {
              prefixPaddingMs: 300,
              silenceDurationMs,
            },
          },
          sessionResumption: {
            handle: resumeHandle ?? undefined,
          },
          contextWindowCompression: {
            slidingWindow: {},
          },
          tools: [
            {
              functionDeclarations,
            },
          ],
        },
      });

      sessionRef.current = session;
      await outputAudioContext.resume();
      if (!inputAudioContextRef.current) {
        setupInputAudio(micStream, silenceDurationMs);
      }
      setCurrentAgent(interviewStateRef.current.currentAgentName);

      const salvagedText = pendingSalvagedInputTextRef.current;
      if (
        preserveConversation &&
        salvagedText &&
        !activeInputTurnIdRef.current
      ) {
        session.sendRealtimeInput({
          text: getGeminiSalvagedUserTurnPrompt(salvagedText),
        });
        pendingSalvagedInputTextRef.current = null;
        hasSentResumePromptRef.current = true;
        pendingResumePromptRef.current = false;
      } else if (preserveConversation && salvagedText) {
        pendingResumePromptRef.current = true;
      }

      const resumePromptAction = getGeminiResumePromptAction({
        isResumeSession: preserveConversation,
        hasSentResumePrompt: hasSentResumePromptRef.current,
        isUserTurnActive: Boolean(activeInputTurnIdRef.current),
      });

      if (resumePromptAction === "send") {
        session.sendRealtimeInput({
          text: getGeminiResumePrompt(lastInterviewerTurnTextRef.current),
        });
        hasSentResumePromptRef.current = true;
        pendingResumePromptRef.current = false;
      } else if (resumePromptAction === "defer") {
        pendingResumePromptRef.current = true;
      } else if (!preserveConversation) {
        session.sendRealtimeInput({
          text: getGeminiInitialPrompt(scenarioId),
        });
      }

      setState((prev) => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        isReconnecting: false,
        isSpeaking: false,
        currentAgent: interviewStateRef.current.currentAgentName,
        error: null,
        resumeFailed: false,
        goAwayTimeLeft: null,
        hasResumableSession: Boolean(resumeHandleRef.current),
      }));
    },
    [
      clearOutputAudio,
      finalizeInputTurn,
      handleToolCalls,
      setCurrentAgent,
      startInputTurn,
      upsertTranscript,
    ]
  );

  const connect = useCallback(
    async (mode: InterviewMode, scenarioId: string, options?: ConnectOptions) => {
      if (mode !== "auto") {
        setState((prev) => ({
          ...prev,
          isConnecting: false,
          error: "Type 2 は現在、自動インタビューのみ対応しています。",
        }));
        return;
      }

      manualDisconnectRef.current = false;
      resumeInFlightRef.current = false;
      sessionConfigRef.current = { mode, scenarioId, options };
      resumeHandleRef.current = null;

      setState((prev) => ({
        ...prev,
        isConnecting: true,
        isConnected: false,
        isReconnecting: false,
        error: null,
        mode,
        transcript: [],
        aiSuggestions: [],
        resumeFailed: false,
        goAwayTimeLeft: null,
        hasResumableSession: false,
      }));

      preInputChunksRef.current = [];
      inputSilenceMsRef.current = 0;
      activeInputTurnIdRef.current = null;
      activeInputTurnStartedAtRef.current = null;
      activeInputTurnChunksRef.current = [];
      pendingOutputTranscriptIdRef.current = null;
      pendingOutputTranscriptTextRef.current = "";
      interviewStateRef.current = createGeminiInterviewState(scenarioId);
      hasSentResumePromptRef.current = false;
      pendingResumePromptRef.current = false;
      pendingSalvagedInputTextRef.current = null;

      try {
        await openSession({
          mode,
          scenarioId,
          options,
          preserveConversation: false,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Type 2 接続に失敗しました";
        cleanupSession();
        setState((prev) => ({
          ...prev,
          isConnecting: false,
          error: message,
        }));
      }
    },
    [cleanupSession, openSession]
  );

  const resume = useCallback(async () => {
    const sessionConfig = sessionConfigRef.current;
    const resumeHandle = resumeHandleRef.current;
    if (!sessionConfig || !resumeHandle || resumeInFlightRef.current) {
      return;
    }

    manualDisconnectRef.current = false;
    resumeInFlightRef.current = true;
    hasSentResumePromptRef.current = false;
    pendingResumePromptRef.current = false;
    pendingSalvagedInputTextRef.current = null;
    const inputTurnSnapshot = snapshotActiveInputTurn();
    activeSessionTokenRef.current += 1;
    closeCurrentSession();

    setState((prev) => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
      isReconnecting: true,
      isSpeaking: false,
      error: null,
      resumeFailed: false,
      hasResumableSession: true,
    }));

    try {
      if (inputTurnSnapshot) {
        const salvagedInputText = await transcribeInputTurnSnapshot(
          inputTurnSnapshot
        );
        if (salvagedInputText) {
          pendingSalvagedInputTextRef.current = salvagedInputText;
        }
      }

      await openSession({
        ...sessionConfig,
        resumeHandle,
        preserveConversation: true,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Type 2 の再開に失敗しました";
      setState((prev) => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        isReconnecting: false,
        isSpeaking: false,
        error: message,
        resumeFailed: true,
        goAwayTimeLeft: null,
        hasResumableSession: Boolean(resumeHandleRef.current),
      }));
    } finally {
      resumeInFlightRef.current = false;
    }
  }, [
    closeCurrentSession,
    openSession,
    snapshotActiveInputTurn,
    transcribeInputTurnSnapshot,
  ]);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    cleanupSession();
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
    pendingResumePromptRef.current = false;
    pendingSalvagedInputTextRef.current = null;
  }, [cleanupSession]);

  resumeSessionRef.current = resume;

  const getMediaStream = useCallback(() => mediaStreamRef.current, []);

  const mute = useCallback((muted: boolean) => {
    mutedRef.current = muted;
    if (outputGainRef.current) {
      outputGainRef.current.gain.value = muted ? 0 : 1;
    }
  }, []);

  const isMuted = useCallback(() => mutedRef.current, []);

  function setupInputAudio(stream: MediaStream, silenceDurationMs: number) {
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("このブラウザでは AudioContext がサポートされていません");
    }
    const inputAudioContext = new AudioContextCtor();
    inputSampleRateRef.current = inputAudioContext.sampleRate;
    const source = inputAudioContext.createMediaStreamSource(stream);
    const processor = inputAudioContext.createScriptProcessor(
      INPUT_BUFFER_SIZE,
      1,
      1
    );
    const muteGain = inputAudioContext.createGain();
    muteGain.gain.value = 0;

    processor.onaudioprocess = (event) => {
      const channelData = event.inputBuffer.getChannelData(0);
      if (!channelData.length) return;
      const pcmBytes = float32ToPcm16Bytes(channelData);
      const chunkDurationMs =
        (channelData.length / inputAudioContext.sampleRate) * 1000;
      const isSpeechChunk = computeRms(channelData) >= INPUT_VAD_RMS_THRESHOLD;

      if (isSpeechChunk) {
        if (!activeInputTurnIdRef.current) {
          startInputTurn();
          upsertTranscript({
            id: activeInputTurnIdRef.current!,
            role: "interviewee",
            text: "認識中...",
            timestamp: activeInputTurnStartedAtRef.current ?? Date.now(),
          });
        }
        inputSilenceMsRef.current = 0;
      } else if (activeInputTurnIdRef.current) {
        inputSilenceMsRef.current += chunkDurationMs;
      }

      if (activeInputTurnIdRef.current) {
        activeInputTurnChunksRef.current.push(pcmBytes);
      } else {
        preInputChunksRef.current.push(pcmBytes);
        if (preInputChunksRef.current.length > INPUT_PREROLL_CHUNKS) {
          preInputChunksRef.current.shift();
        }
      }

      if (
        activeInputTurnIdRef.current &&
        inputSilenceMsRef.current >= silenceDurationMs
      ) {
        inputSilenceMsRef.current = 0;
        void finalizeInputTurn();
      }

      sessionRef.current?.sendRealtimeInput({
        audio: {
          data: bytesToBase64(pcmBytes),
          mimeType: `audio/pcm;rate=${inputAudioContext.sampleRate}`,
        },
      });
    };

    source.connect(processor);
    processor.connect(muteGain);
    muteGain.connect(inputAudioContext.destination);

    inputAudioContextRef.current = inputAudioContext;
    inputSourceRef.current = source;
    inputProcessorRef.current = processor;
    inputMuteGainRef.current = muteGain;
  }

  function enqueueOutputAudio(base64Pcm: string) {
    const audioContext = outputAudioContextRef.current;
    const outputGain = outputGainRef.current;
    if (!audioContext || !outputGain) return;

    const samples = base64PcmToFloat32(base64Pcm);
    if (samples.length === 0) return;

    const buffer = audioContext.createBuffer(
      1,
      samples.length,
      GEMINI_OUTPUT_SAMPLE_RATE
    );
    buffer.getChannelData(0).set(samples);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(outputGain);

    const startAt = Math.max(nextPlaybackTimeRef.current, audioContext.currentTime);
    source.start(startAt);
    nextPlaybackTimeRef.current = startAt + buffer.duration;
    outputSourcesRef.current.add(source);
    source.onended = () => {
      outputSourcesRef.current.delete(source);
    };

    setState((prev) => ({ ...prev, isSpeaking: true }));
  }

  return [
    state,
    { connect, disconnect, resume, getMediaStream, mute, isMuted },
  ];
}

function float32ToPcm16Bytes(input: Float32Array): Uint8Array {
  const pcmBuffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(pcmBuffer);

  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Uint8Array(pcmBuffer);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const bytes = base64ToBytes(base64);
  const samples = new Float32Array(bytes.length / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 0x8000;
  }

  return samples;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function parseGeminiToolArgs(
  args: Record<string, unknown> | undefined
): GeminiInterviewToolArgs {
  return {
    currentAnswerSummary: String(args?.currentAnswerSummary ?? ""),
    currentAgentName: [
      "InterviewAgent",
      "LeadershipWellbeingAgent",
      "OrganizationCultureAgent",
    ].includes(String(args?.currentAgentName))
      ? (String(args?.currentAgentName) as GeminiInterviewToolArgs["currentAgentName"])
      : "InterviewAgent",
    sentiment: ["positive", "neutral", "negative"].includes(
      String(args?.sentiment)
    )
      ? (String(args?.sentiment) as GeminiInterviewToolArgs["sentiment"])
      : "neutral",
    topicCovered: Boolean(args?.topicCovered),
    answerQuality: ["detailed", "adequate", "brief", "off_topic"].includes(
      String(args?.answerQuality)
    )
      ? (String(args?.answerQuality) as GeminiInterviewToolArgs["answerQuality"])
      : "adequate",
  };
}

function mergeTranscriptText(previous: string, incoming: string): string {
  const prev = previous.trim();
  const next = incoming.trim();

  if (!prev) return next;
  if (!next) return prev;
  if (next === prev) return prev;
  if (next.startsWith(prev)) return next;
  if (prev.startsWith(next)) return prev;
  if (prev.endsWith(next)) return prev;

  const maxOverlap = Math.min(prev.length, next.length);
  for (let overlap = maxOverlap; overlap > 0; overlap--) {
    if (prev.slice(-overlap) === next.slice(0, overlap)) {
      return `${prev}${next.slice(overlap)}`;
    }
  }

  return `${prev}${next}`;
}

function computeRms(input: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < input.length; i++) {
    sum += input[i] * input[i];
  }
  return Math.sqrt(sum / input.length);
}
