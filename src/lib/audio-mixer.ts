export interface MixedAudioResult {
  mixedStream: MediaStream;
  context: AudioContext;
  dispose: () => void;
}

/**
 * Merges two MediaStreams (mic + tab audio) into a single output stream
 * using Web Audio API so the Realtime API hears the full conversation.
 */
export function createMixedStream(
  micStream: MediaStream,
  tabStream: MediaStream
): MixedAudioResult {
  const context = new AudioContext();

  const micSource = context.createMediaStreamSource(micStream);
  const tabSource = context.createMediaStreamSource(tabStream);

  const destination = context.createMediaStreamDestination();

  micSource.connect(destination);
  tabSource.connect(destination);

  const dispose = () => {
    micSource.disconnect();
    tabSource.disconnect();
    context.close();
  };

  return {
    mixedStream: destination.stream,
    context,
    dispose,
  };
}
