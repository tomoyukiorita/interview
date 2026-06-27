import type { InterviewProvider } from "./types";

export const INTERVIEW_PROVIDERS: InterviewProvider[] = [
  "openai",
  "gemini",
  "inworld",
  "wellbeing",
  "natural",
  "natural2",
];
export const DEFAULT_INTERVIEW_PROVIDER: InterviewProvider = "openai";

const INTERVIEW_PROVIDER_LABELS: Record<InterviewProvider, string> = {
  openai: "Type 1",
  gemini: "Type 2",
  inworld: "Type 3",
  wellbeing: "Type 4",
  natural: "Type 5",
  natural2: "Type 6",
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
