export interface JapaneseTtsChunkerOptions {
  minClauseLength?: number;
  maxChunkLength?: number;
  idleFlushMs?: number;
  preferSafeSplit?: boolean;
}

const DEFAULT_MIN_CLAUSE_LENGTH = 14;
const DEFAULT_MAX_CHUNK_LENGTH = 36;
const DEFAULT_IDLE_FLUSH_MS = 160;
const MIN_PUNCTUATION_SPLIT_LENGTH = 8;
const CLAUSE_BOUNDARY = /、\s*$/;
const STRONG_BOUNDARY_CHARS = /[。！？!?]/;
const PARTICLE_BOUNDARY =
  /(から|ので|なら|では|には|とは|へは|より|まで|ほど|けど|が|は|を|に|で|と|へ|も|や)$/u;

export class JapaneseTtsChunker {
  private buffer = "";
  private lastFlushAt: number;
  private readonly minClauseLength: number;
  private readonly maxChunkLength: number;
  private readonly idleFlushMs: number;
  private readonly preferSafeSplit: boolean;

  constructor(options: JapaneseTtsChunkerOptions = {}, now = Date.now()) {
    this.minClauseLength = options.minClauseLength ?? DEFAULT_MIN_CLAUSE_LENGTH;
    this.maxChunkLength = options.maxChunkLength ?? DEFAULT_MAX_CHUNK_LENGTH;
    this.idleFlushMs = options.idleFlushMs ?? DEFAULT_IDLE_FLUSH_MS;
    this.preferSafeSplit = options.preferSafeSplit ?? false;
    this.lastFlushAt = now;
  }

  push(delta: string, now = Date.now()): string[] {
    if (!delta) return [];
    this.buffer += delta;
    return this.flushReadyChunks(now);
  }

  flush(now = Date.now()): string[] {
    const text = this.takeBuffer();
    this.lastFlushAt = now;
    return text ? [text] : [];
  }

  reset(now = Date.now()) {
    this.buffer = "";
    this.lastFlushAt = now;
  }

  private flushReadyChunks(now: number): string[] {
    const chunks: string[] = [];

    while (this.buffer.length > 0) {
      const boundaryIndex = this.findStrongBoundaryIndex();
      if (boundaryIndex >= 0) {
        const sentenceLength = boundaryIndex + 1;
        if (sentenceLength > this.maxChunkLength) {
          const splitAt =
            this.findSoftSplitIndex() ??
            (this.preferSafeSplit ? null : this.maxChunkLength);
          if (splitAt !== null) {
            chunks.push(this.takePrefix(splitAt));
            this.lastFlushAt = now;
            continue;
          }
        }
        chunks.push(this.takePrefix(boundaryIndex + 1));
        this.lastFlushAt = now;
        continue;
      }

      if (
        this.buffer.length >= this.minClauseLength &&
        CLAUSE_BOUNDARY.test(this.buffer)
      ) {
        chunks.push(this.takeBuffer());
        this.lastFlushAt = now;
        continue;
      }

      if (this.buffer.length >= this.maxChunkLength) {
        const splitAt =
          this.findSoftSplitIndex() ??
          (this.preferSafeSplit ? null : this.maxChunkLength);
        if (splitAt === null) break;
        chunks.push(this.takePrefix(splitAt));
        this.lastFlushAt = now;
        continue;
      }

      if (
        now - this.lastFlushAt >= this.idleFlushMs &&
        this.buffer.length >= this.minClauseLength
      ) {
        if (this.preferSafeSplit) {
          const splitAt = this.findSoftSplitIndex(this.buffer.length);
          if (splitAt === null) break;
          chunks.push(
            splitAt === this.buffer.length
              ? this.takeBuffer()
              : this.takePrefix(splitAt)
          );
        } else {
          chunks.push(this.takeBuffer());
        }
        this.lastFlushAt = now;
      }

      break;
    }

    return chunks.filter(Boolean);
  }

  private findStrongBoundaryIndex(): number {
    const match = this.buffer.match(STRONG_BOUNDARY_CHARS);
    return match?.index ?? -1;
  }

  private findSoftSplitIndex(maxSearchLength = this.maxChunkLength): number | null {
    const searchEnd = Math.min(this.buffer.length, maxSearchLength);
    const window = this.buffer.slice(0, searchEnd);

    const commaIndex = Math.max(window.lastIndexOf("、"), window.lastIndexOf(","));
    if (commaIndex >= MIN_PUNCTUATION_SPLIT_LENGTH) return commaIndex + 1;

    const whitespaceIndex = Math.max(
      window.lastIndexOf(" "),
      window.lastIndexOf("　")
    );
    if (whitespaceIndex >= this.minClauseLength) return whitespaceIndex + 1;

    for (let i = window.length; i >= this.minClauseLength; i--) {
      if (PARTICLE_BOUNDARY.test(window.slice(0, i))) return i;
    }

    return null;
  }

  private takePrefix(length: number): string {
    const text = this.buffer.slice(0, length).trim();
    this.buffer = this.buffer.slice(length).trimStart();
    return text;
  }

  private takeBuffer(): string {
    const text = this.buffer.trim();
    this.buffer = "";
    return text;
  }
}
