import type { TranscriptEntry } from "./types";

const DUPLICATE_WINDOW_MS = 10_000;

function normalizeTranscriptText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isDuplicateTranscriptEntry(
  existing: TranscriptEntry,
  incoming: TranscriptEntry
): boolean {
  return (
    existing.role === incoming.role &&
    normalizeTranscriptText(existing.text) ===
      normalizeTranscriptText(incoming.text) &&
    Math.abs(existing.timestamp - incoming.timestamp) <= DUPLICATE_WINDOW_MS
  );
}

export function appendUniqueTranscriptEntries(
  current: TranscriptEntry[],
  entries: TranscriptEntry[]
): TranscriptEntry[] {
  const next = [...current];

  for (const entry of entries) {
    if (
      next.some((existing) => isDuplicateTranscriptEntry(existing, entry))
    ) {
      continue;
    }
    next.push(entry);
  }

  return next;
}
