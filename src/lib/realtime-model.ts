export const OPENAI_REALTIME_MODEL = "gpt-realtime-2";

export const REALTIME_REASONING_EFFORTS = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type RealtimeReasoningEffort =
  (typeof REALTIME_REASONING_EFFORTS)[number];

export const DEFAULT_REALTIME_REASONING_EFFORT: RealtimeReasoningEffort = "low";

export function normalizeRealtimeReasoningEffort(
  value: string | null | undefined
): RealtimeReasoningEffort {
  return REALTIME_REASONING_EFFORTS.includes(value as RealtimeReasoningEffort)
    ? (value as RealtimeReasoningEffort)
    : DEFAULT_REALTIME_REASONING_EFFORT;
}

export function buildOpenAIRealtimeSessionConfig(
  reasoningEffort: RealtimeReasoningEffort = DEFAULT_REALTIME_REASONING_EFFORT
) {
  return {
    type: "realtime" as const,
    model: OPENAI_REALTIME_MODEL,
    reasoning: {
      effort: reasoningEffort,
    },
  };
}
