export const GEMINI_THINKING_LEVELS = [
  "minimal",
  "low",
  "medium",
  "high",
] as const;

export type GeminiThinkingLevel = (typeof GEMINI_THINKING_LEVELS)[number];

export const DEFAULT_GEMINI_THINKING_LEVEL: GeminiThinkingLevel = "minimal";

export function normalizeGeminiThinkingLevel(
  value: string | null | undefined
): GeminiThinkingLevel {
  if (
    GEMINI_THINKING_LEVELS.includes(value as GeminiThinkingLevel)
  ) {
    return value as GeminiThinkingLevel;
  }

  return DEFAULT_GEMINI_THINKING_LEVEL;
}
