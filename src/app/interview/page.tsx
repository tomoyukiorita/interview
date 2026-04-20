"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { InterviewRoom } from "@/components/InterviewRoom";
import { DEFAULT_REALTIME_VOICE, normalizeRealtimeVoice } from "@/lib/realtime-voice";
import {
  DEFAULT_GEMINI_LIVE_VOICE,
  normalizeGeminiLiveVoice,
} from "@/lib/gemini-voice";
import {
  DEFAULT_INTERVIEW_PROVIDER,
  normalizeInterviewProvider,
} from "@/lib/interview-provider";
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
import type { InterviewMode } from "@/lib/types";
import { Loader2 } from "lucide-react";

function InterviewPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const provider = normalizeInterviewProvider(
    searchParams.get("provider") || DEFAULT_INTERVIEW_PROVIDER
  );
  const requestedMode = (searchParams.get("mode") || "auto") as InterviewMode;
  const mode = provider === "gemini" ? "auto" : requestedMode;
  const scenarioId = searchParams.get("scenario") || "general";
  const voice =
    provider === "gemini"
      ? normalizeGeminiLiveVoice(
          searchParams.get("voice") || DEFAULT_GEMINI_LIVE_VOICE
        )
      : normalizeRealtimeVoice(
          searchParams.get("voice") || DEFAULT_REALTIME_VOICE
        );
  const speed = normalizeRealtimeSpeedPreset(
    searchParams.get("speed") || DEFAULT_REALTIME_SPEED_PRESET
  );
  const speechStyle = normalizeRealtimeSpeechStylePreset(
    searchParams.get("speechStyle") || DEFAULT_REALTIME_SPEECH_STYLE_PRESET
  );
  const tone = normalizeRealtimeTonePreset(
    searchParams.get("tone") || DEFAULT_REALTIME_TONE_PRESET
  );
  const silenceDurationMs = normalizeServerVadSilenceDurationMs(
    searchParams.get("silenceDurationMs") ||
      String(DEFAULT_SERVER_VAD_SILENCE_DURATION_MS)
  );

  const handleEnd = () => {
    router.push("/");
  };

  return (
    <InterviewRoom
      provider={provider}
      mode={mode}
      scenarioId={scenarioId}
      voice={voice}
      speed={speed}
      speechStyle={speechStyle}
      tone={tone}
      silenceDurationMs={silenceDurationMs}
      onEnd={handleEnd}
    />
  );
}

export default function InterviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-background">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      }
    >
      <InterviewPageInner />
    </Suspense>
  );
}
