"use client";

import { useGeminiLiveSession } from "./useGeminiLiveSession";
import { useInworldRealtimeSession } from "./useInworldRealtimeSession";
import { useNaturalVoiceRealtimeSession } from "./useNaturalVoiceRealtimeSession";
import { useRealtimeSession } from "./useRealtimeSession";
import { useWellbeingRealtimeSession } from "./useWellbeingRealtimeSession";
import type { InterviewProvider } from "@/lib/types";

export function useInterviewSession(provider: InterviewProvider) {
  const openAiSession = useRealtimeSession();
  const geminiSession = useGeminiLiveSession();
  const inworldSession = useInworldRealtimeSession();
  const wellbeingSession = useWellbeingRealtimeSession();
  const naturalSession = useNaturalVoiceRealtimeSession();

  if (provider === "gemini") return geminiSession;
  if (provider === "inworld") return inworldSession;
  if (provider === "wellbeing") return wellbeingSession;
  // Type 5 and Type 6 share the natural-voice hook; the variant (Human State
  // Engine + orchestrator + LiveKit turn detector) is selected at connect time
  // via ConnectOptions.variant.
  if (provider === "natural" || provider === "natural2") return naturalSession;
  return openAiSession;
}
