"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { PitchDetector } from "pitchy";
import type { AudioFeatures, SpeechAudioMetrics } from "@/lib/types";

const BUFFER_SIZE = 2048;
const HISTORY_MAX = 300;
const SAVE_INTERVAL_MS = 500;

export interface AudioAnalysisState {
  isAnalyzing: boolean;
  currentFeatures: AudioFeatures | null;
  history: AudioFeatures[];
  pitchHistory: number[];
  energyHistory: number[];
}

interface AudioAnalysisActions {
  startAnalysis: (mediaStream: MediaStream) => void;
  stopAnalysis: () => void;
  clearHistory: () => void;
  getSaveHistory: () => AudioFeatures[];
  computeMetrics: (startTime: number, endTime: number) => SpeechAudioMetrics | null;
}

function computeMetricsFromSamples(
  samples: AudioFeatures[],
  baselineAvgPitch: number | null,
  baselineAvgEnergy: number
): SpeechAudioMetrics {
  const pitchSamples = samples
    .map((s) => s.pitch)
    .filter((p): p is number => p !== null && p > 0);
  const energies = samples.map((s) => s.energy);
  const loudnesses = samples.map((s) => s.loudness);
  const centroids = samples.map((s) => s.spectralCentroid);

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const avgPitch = pitchSamples.length > 0 ? avg(pitchSamples) : null;
  const maxPitch =
    pitchSamples.length > 0 ? Math.max(...pitchSamples) : null;
  const minPitch =
    pitchSamples.length > 0 ? Math.min(...pitchSamples) : null;
  const pitchRange =
    maxPitch !== null && minPitch !== null ? maxPitch - minPitch : null;

  const avgEnergy = avg(energies);
  const maxEnergy = energies.length > 0 ? Math.max(...energies) : 0;
  const avgLoudness = avg(loudnesses);
  const avgSpectralCentroid = avg(centroids);

  let excitementScore = 50;

  if (avgPitch !== null && baselineAvgPitch !== null && baselineAvgPitch > 0) {
    const pitchRatio = avgPitch / baselineAvgPitch;
    excitementScore += (pitchRatio - 1) * 40;
  }

  if (baselineAvgEnergy > 0) {
    const energyRatio = avgEnergy / baselineAvgEnergy;
    excitementScore += (energyRatio - 1) * 30;
  }

  if (pitchRange !== null) {
    const varianceBoost = Math.min(pitchRange / 100, 1) * 15;
    excitementScore += varianceBoost;
  }

  if (avgSpectralCentroid > 5) {
    excitementScore += Math.min((avgSpectralCentroid - 5) / 10, 1) * 10;
  }

  excitementScore = Math.max(0, Math.min(100, Math.round(excitementScore)));

  return {
    avgPitch,
    maxPitch,
    minPitch,
    pitchRange,
    avgEnergy,
    maxEnergy,
    avgLoudness,
    avgSpectralCentroid,
    excitementScore,
    sampleCount: samples.length,
  };
}

const PITCH_RMS_THRESHOLD = 0.002;
const PITCH_MIN_HZ = 70;
const PITCH_MAX_HZ = 450;
const PITCH_MIN_CLARITY = 0.85;

// pitchy's PitchDetector (McLeod Pitch Method) is allocation-heavy to build,
// so reuse one instance per input length across analysis frames.
let pitchDetector: PitchDetector<Float32Array> | null = null;
let pitchDetectorSize = 0;

function detectPitch(
  analyserNode: AnalyserNode,
  sampleRate: number
): number | null {
  const bufferLength = analyserNode.fftSize;
  const buffer = new Float32Array(bufferLength);
  analyserNode.getFloatTimeDomainData(buffer);

  let rms = 0;
  for (let i = 0; i < bufferLength; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / bufferLength);
  if (rms < PITCH_RMS_THRESHOLD) return null;

  if (!pitchDetector || pitchDetectorSize !== bufferLength) {
    pitchDetector = PitchDetector.forFloat32Array(bufferLength);
    pitchDetectorSize = bufferLength;
  }
  const [pitch, clarity] = pitchDetector.findPitch(buffer, sampleRate);
  if (
    clarity < PITCH_MIN_CLARITY ||
    pitch < PITCH_MIN_HZ ||
    pitch > PITCH_MAX_HZ
  ) {
    return null;
  }
  return pitch;
}

export function useAudioAnalysis(): [
  AudioAnalysisState,
  AudioAnalysisActions
] {
  const [state, setState] = useState<AudioAnalysisState>({
    isAnalyzing: false,
    currentFeatures: null,
    history: [],
    pitchHistory: [],
    energyHistory: [],
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const meydaRef = useRef<{ stop: () => void } | null>(null);
  const saveHistoryRef = useRef<AudioFeatures[]>([]);
  const lastSaveTimestampRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      stopAnalysis();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startAnalysis = useCallback(async (mediaStream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(mediaStream);
      sourceRef.current = source;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = BUFFER_SIZE;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      let meydaAnalyzer: { start: () => void; stop: () => void } | null = null;
      try {
        const Meyda = (await import("meyda")).default;
        meydaAnalyzer = Meyda.createMeydaAnalyzer({
          audioContext,
          source,
          bufferSize: 512,
          featureExtractors: [
            "rms",
            "energy",
            "spectralCentroid",
            "spectralFlatness",
            "zcr",
            "loudness",
          ] as never[],
          callback: (features: Record<string, unknown>) => {
            const pitch = detectPitch(analyser, audioContext.sampleRate);
            const now = Date.now();

            const audioFeatures: AudioFeatures = {
              rms: (features.rms as number) || 0,
              energy: (features.energy as number) || 0,
              spectralCentroid: (features.spectralCentroid as number) || 0,
              spectralFlatness: (features.spectralFlatness as number) || 0,
              zcr: (features.zcr as number) || 0,
              loudness:
                ((features.loudness as { total?: number })?.total as number) ||
                0,
              pitch,
              timestamp: now,
            };

            if (now - lastSaveTimestampRef.current >= SAVE_INTERVAL_MS) {
              lastSaveTimestampRef.current = now;
              saveHistoryRef.current.push(audioFeatures);
            }

            setState((prev) => {
              const newHistory = [...prev.history, audioFeatures].slice(
                -HISTORY_MAX
              );
              const newPitchHistory = [
                ...prev.pitchHistory,
                pitch ?? 0,
              ].slice(-HISTORY_MAX);
              const newEnergyHistory = [
                ...prev.energyHistory,
                audioFeatures.energy,
              ].slice(-HISTORY_MAX);

              return {
                ...prev,
                currentFeatures: audioFeatures,
                history: newHistory,
                pitchHistory: newPitchHistory,
                energyHistory: newEnergyHistory,
              };
            });
          },
        });
        meydaAnalyzer.start();
        meydaRef.current = meydaAnalyzer;
      } catch {
        console.warn(
          "Meyda not available, falling back to basic analysis"
        );
        startBasicAnalysis(analyser, audioContext.sampleRate);
      }

      setState((prev) => ({ ...prev, isAnalyzing: true }));
    } catch (err) {
      console.error("Audio analysis start failed:", err);
    }
  }, []);

  const startBasicAnalysis = useCallback(
    (analyser: AnalyserNode, sampleRate: number) => {
      const frequencyData = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(frequencyData);

        let sum = 0;
        for (let i = 0; i < frequencyData.length; i++) {
          sum += frequencyData[i];
        }
        const avgEnergy = sum / frequencyData.length / 255;

        let weightedSum = 0;
        let weightTotal = 0;
        for (let i = 0; i < frequencyData.length; i++) {
          weightedSum += i * frequencyData[i];
          weightTotal += frequencyData[i];
        }
        const centroid =
          weightTotal > 0
            ? (weightedSum / weightTotal / frequencyData.length) * sampleRate
            : 0;

        const pitch = detectPitch(analyser, sampleRate);
        const now = Date.now();

        const features: AudioFeatures = {
          rms: avgEnergy,
          energy: avgEnergy,
          spectralCentroid: centroid,
          spectralFlatness: 0,
          zcr: 0,
          loudness: avgEnergy,
          pitch,
          timestamp: now,
        };

        if (now - lastSaveTimestampRef.current >= SAVE_INTERVAL_MS) {
          lastSaveTimestampRef.current = now;
          saveHistoryRef.current.push(features);
        }

        setState((prev) => {
          const newHistory = [...prev.history, features].slice(-HISTORY_MAX);
          const newPitchHistory = [
            ...prev.pitchHistory,
            pitch ?? 0,
          ].slice(-HISTORY_MAX);
          const newEnergyHistory = [
            ...prev.energyHistory,
            features.energy,
          ].slice(-HISTORY_MAX);

          return {
            ...prev,
            currentFeatures: features,
            history: newHistory,
            pitchHistory: newPitchHistory,
            energyHistory: newEnergyHistory,
          };
        });

        animFrameRef.current = requestAnimationFrame(tick);
      };

      tick();
    },
    []
  );

  const stopAnalysis = useCallback(() => {
    if (meydaRef.current) {
      meydaRef.current.stop();
      meydaRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setState((prev) => ({ ...prev, isAnalyzing: false }));
  }, []);

  const clearHistory = useCallback(() => {
    saveHistoryRef.current = [];
    lastSaveTimestampRef.current = 0;
    setState((prev) => ({
      ...prev,
      history: [],
      pitchHistory: [],
      energyHistory: [],
    }));
  }, []);

  const getSaveHistory = useCallback(() => {
    return saveHistoryRef.current;
  }, []);

  const computeMetrics = useCallback(
    (startTime: number, endTime: number): SpeechAudioMetrics | null => {
      const all = saveHistoryRef.current;
      if (all.length === 0) return null;

      const samples = all.filter(
        (f) => f.timestamp >= startTime && f.timestamp <= endTime
      );
      if (samples.length === 0) return null;

      const allPitches = all
        .map((s) => s.pitch)
        .filter((p): p is number => p !== null && p > 0);
      const baselineAvgPitch =
        allPitches.length > 0
          ? allPitches.reduce((a, b) => a + b, 0) / allPitches.length
          : null;
      const allEnergies = all.map((s) => s.energy);
      const baselineAvgEnergy =
        allEnergies.length > 0
          ? allEnergies.reduce((a, b) => a + b, 0) / allEnergies.length
          : 0;

      return computeMetricsFromSamples(
        samples,
        baselineAvgPitch,
        baselineAvgEnergy
      );
    },
    []
  );

  return [
    state,
    { startAnalysis, stopAnalysis, clearHistory, getSaveHistory, computeMetrics },
  ];
}
