"use client";

import { useGeminiLiveSession } from "./useGeminiLiveSession";
import { useInworldRealtimeSession } from "./useInworldRealtimeSession";
import { useRealtimeSession } from "./useRealtimeSession";
import type { InterviewProvider } from "@/lib/types";

export function useInterviewSession(provider: InterviewProvider) {
  const openAiSession = useRealtimeSession();
  const geminiSession = useGeminiLiveSession();
  const inworldSession = useInworldRealtimeSession();

  if (provider === "gemini") return geminiSession;
  if (provider === "inworld") return inworldSession;
  return openAiSession;
}
