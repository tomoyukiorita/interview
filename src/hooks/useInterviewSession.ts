"use client";

import { useGeminiLiveSession } from "./useGeminiLiveSession";
import { useRealtimeSession } from "./useRealtimeSession";
import type { InterviewProvider } from "@/lib/types";

export function useInterviewSession(provider: InterviewProvider) {
  const openAiSession = useRealtimeSession();
  const geminiSession = useGeminiLiveSession();

  return provider === "gemini" ? geminiSession : openAiSession;
}
