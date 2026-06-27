interface QueuedAudioChunk {
  url: string;
}

const PCM_INITIAL_PREBUFFER_SECONDS = 0.07;
const PCM_CONTINUOUS_PREBUFFER_SECONDS = 0.04;

export interface StreamingAudioPlayerOptions {
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
}

export class StreamingAudioPlayer {
  private readonly audio: HTMLAudioElement;
  private readonly queue: QueuedAudioChunk[] = [];
  private readonly onPlaybackStart?: () => void;
  private readonly onPlaybackEnd?: () => void;
  private audioContext: AudioContext | null = null;
  private pcmSources: AudioBufferSourceNode[] = [];
  private pcmRemainder: Uint8Array | null = null;
  private pcmNextTime = 0;
  private currentUrl: string | null = null;
  private startedAt: number | null = null;
  private stopped = false;

  constructor(options: StreamingAudioPlayerOptions = {}) {
    this.audio = document.createElement("audio");
    this.audio.autoplay = true;
    this.audio.setAttribute("playsinline", "true");
    this.onPlaybackStart = options.onPlaybackStart;
    this.onPlaybackEnd = options.onPlaybackEnd;
    this.audio.addEventListener("ended", () => {
      this.cleanupCurrentUrl();
      void this.playNext();
    });
    this.audio.addEventListener("error", () => {
      this.cleanupCurrentUrl();
      void this.playNext();
    });
  }

  enqueue(arrayBuffer: ArrayBuffer, mimeType = "audio/mpeg") {
    const blob = new Blob([arrayBuffer], { type: mimeType });
    this.queue.push({ url: URL.createObjectURL(blob) });
    if (this.audio.paused && !this.currentUrl) {
      void this.playNext();
    }
  }

  enqueuePcm16(arrayBuffer: ArrayBuffer, sampleRate = 44100) {
    if (arrayBuffer.byteLength < 2) return;
    const context = this.getAudioContext(sampleRate);
    let bytes = new Uint8Array(arrayBuffer);

    if (this.pcmRemainder) {
      const merged = new Uint8Array(this.pcmRemainder.length + bytes.length);
      merged.set(this.pcmRemainder);
      merged.set(bytes, this.pcmRemainder.length);
      bytes = merged;
      this.pcmRemainder = null;
    }

    if (bytes.length % 2 !== 0) {
      this.pcmRemainder = bytes.slice(bytes.length - 1);
      bytes = bytes.slice(0, bytes.length - 1);
    }

    if (bytes.length < 2) return;

    const int16 = new Int16Array(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    );
    const audioBuffer = context.createBuffer(1, int16.length, sampleRate);
    const channel = audioBuffer.getChannelData(0);

    for (let i = 0; i < int16.length; i++) {
      channel[i] = Math.max(-1, Math.min(1, int16[i] / 32768));
    }

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    source.onended = () => {
      this.pcmSources = this.pcmSources.filter((item) => item !== source);
      if (this.pcmSources.length === 0) {
        this.onPlaybackEnd?.();
      }
    };

    const currentTime = context.currentTime;
    const prebuffer =
      this.pcmSources.length === 0
        ? PCM_INITIAL_PREBUFFER_SECONDS
        : PCM_CONTINUOUS_PREBUFFER_SECONDS;
    if (this.pcmNextTime < currentTime + 0.005) {
      this.pcmNextTime = currentTime + prebuffer;
    }
    const startAt = Math.max(currentTime + prebuffer, this.pcmNextTime);
    source.start(startAt);
    this.pcmNextTime = startAt + audioBuffer.duration;
    this.pcmSources.push(source);
    if (this.startedAt === null) {
      this.startedAt = Date.now();
      this.onPlaybackStart?.();
    }
  }

  stop() {
    this.stopped = true;
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.pcmSources.forEach((source) => {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    });
    this.pcmSources = [];
    this.pcmRemainder = null;
    this.pcmNextTime = this.audioContext?.currentTime ?? 0;
    this.cleanupCurrentUrl();
    while (this.queue.length > 0) {
      const chunk = this.queue.shift();
      if (chunk) URL.revokeObjectURL(chunk.url);
    }
    this.startedAt = null;
    this.onPlaybackEnd?.();
  }

  destroy() {
    this.stop();
  }

  getPlayedMs(): number {
    if (this.startedAt === null) return 0;
    return Math.max(0, Date.now() - this.startedAt);
  }

  private async playNext() {
    if (this.stopped) {
      this.stopped = false;
    }

    const next = this.queue.shift();
    if (!next) {
      this.startedAt = null;
      this.onPlaybackEnd?.();
      return;
    }

    this.currentUrl = next.url;
    this.audio.src = next.url;
    this.startedAt = Date.now();
    this.onPlaybackStart?.();

    try {
      await this.audio.play();
    } catch {
      this.cleanupCurrentUrl();
      void this.playNext();
    }
  }

  private cleanupCurrentUrl() {
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
  }

  private getAudioContext(sampleRate: number): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate });
      this.pcmNextTime = this.audioContext.currentTime;
    }
    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume();
    }
    return this.audioContext;
  }
}
