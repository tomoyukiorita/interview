/**
 * Templated, instantly-speakable phrases for Type 6 (no LLM round-trip).
 *
 * Backchannels ("aizuchi") are short acknowledgements played during a natural
 * pause to signal active listening. Empathy lines are slightly longer reflective
 * acknowledgements used when the interviewee sounds nervous/hesitant. Keeping
 * these as fixed templates lets the Response Orchestrator react in well under a
 * second while the reasoning brain is reserved for genuine follow-up questions.
 */

export const BACKCHANNEL_PHRASES: readonly string[] = [
  "はい。",
  "ええ。",
  "なるほど。",
  "うんうん。",
];

export const EMPATHY_PHRASES: readonly string[] = [
  "なるほど、そう感じていらっしゃるんですね。",
  "ええ、よく分かります。",
  "そうだったんですね。",
  "うんうん、なるほどです。",
];

/**
 * Rotates through a phrase pool, never returning the same index twice in a
 * row. Returns the chosen phrase and the index so the caller can persist it.
 */
export function pickPhrase(
  pool: readonly string[],
  lastIndex: number
): { phrase: string; index: number } {
  if (pool.length === 0) return { phrase: "", index: -1 };
  if (pool.length === 1) return { phrase: pool[0], index: 0 };
  let index = Math.floor(Math.random() * pool.length);
  if (index === lastIndex) {
    index = (index + 1) % pool.length;
  }
  return { phrase: pool[index], index };
}
