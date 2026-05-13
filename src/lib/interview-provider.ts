import type { InterviewProvider } from "./types";

export const INTERVIEW_PROVIDERS: InterviewProvider[] = [
  "openai",
  "gemini",
  "inworld",
];
export const DEFAULT_INTERVIEW_PROVIDER: InterviewProvider = "openai";

const INTERVIEW_PROVIDER_LABELS: Record<InterviewProvider, string> = {
  openai: "Type 1",
  gemini: "Type 2",
  inworld: "Type 3",
};

export function normalizeInterviewProvider(
  value: string | null | undefined
): InterviewProvider {
  return INTERVIEW_PROVIDERS.includes(value as InterviewProvider)
    ? (value as InterviewProvider)
    : DEFAULT_INTERVIEW_PROVIDER;
}

export function getInterviewProviderLabel(provider: InterviewProvider): string {
  return INTERVIEW_PROVIDER_LABELS[provider];
}
