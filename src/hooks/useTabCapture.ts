"use client";

import { useCallback, useRef, useState } from "react";

export interface TabCaptureState {
  isCapturing: boolean;
  intervieweeStream: MediaStream | null;
  error: string | null;
}

interface TabCaptureActions {
  startCapture: () => Promise<MediaStream | null>;
  stopCapture: () => void;
}

export function useTabCapture(): [TabCaptureState, TabCaptureActions] {
  const [state, setState] = useState<TabCaptureState>({
    isCapturing: false,
    intervieweeStream: null,
    error: null,
  });

  const streamRef = useRef<MediaStream | null>(null);

  const startCapture = useCallback(async (): Promise<MediaStream | null> => {
    try {
      setState((prev) => ({ ...prev, error: null }));

      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: { width: 1, height: 1 },
      });

      // Discard the video track immediately; we only need audio.
      for (const track of displayStream.getVideoTracks()) {
        track.stop();
        displayStream.removeTrack(track);
      }

      const audioTracks = displayStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error(
          "タブの音声が取得できませんでした。タブを選択する際に「タブの音声を共有」にチェックを入れてください。"
        );
      }

      const audioOnlyStream = new MediaStream(audioTracks);
      streamRef.current = audioOnlyStream;

      audioTracks[0].addEventListener("ended", () => {
        setState({
          isCapturing: false,
          intervieweeStream: null,
          error: null,
        });
        streamRef.current = null;
      });

      setState({
        isCapturing: true,
        intervieweeStream: audioOnlyStream,
        error: null,
      });

      return audioOnlyStream;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "タブ音声のキャプチャに失敗しました";
      setState((prev) => ({ ...prev, error: message }));
      return null;
    }
  }, []);

  const stopCapture = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setState({
      isCapturing: false,
      intervieweeStream: null,
      error: null,
    });
  }, []);

  return [state, { startCapture, stopCapture }];
}
