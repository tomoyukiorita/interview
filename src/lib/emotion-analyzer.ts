import type { AudioFeatures, EmotionLabel, EmotionState } from "./types";

interface BaselineStats {
  avgPitch: number | null;
  avgEnergy: number;
  avgZcr: number;
  avgSpectralFlatness: number;
  avgLoudness: number;
}

function computeBaseline(history: AudioFeatures[]): BaselineStats {
  if (history.length === 0) {
    return {
      avgPitch: null,
      avgEnergy: 0,
      avgZcr: 0,
      avgSpectralFlatness: 0,
      avgLoudness: 0,
    };
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const pitches = history
    .map((h) => h.pitch)
    .filter((p): p is number => p !== null && p > 0);

  return {
    avgPitch: pitches.length > 0 ? avg(pitches) : null,
    avgEnergy: avg(history.map((h) => h.energy)),
    avgZcr: avg(history.map((h) => h.zcr)),
    avgSpectralFlatness: avg(history.map((h) => h.spectralFlatness)),
    avgLoudness: avg(history.map((h) => h.loudness)),
  };
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function pickLabel(
  excitement: number,
  nervousness: number,
  confidence: number,
  engagement: number
): EmotionLabel {
  if (engagement < 30) return "disengaged";
  if (nervousness > 65 && confidence < 40) return "nervous";
  if (confidence < 35 && excitement < 40) return "hesitant";
  if (excitement > 65 && engagement > 55) return "enthusiastic";
  if (confidence > 60 && nervousness < 40) return "confident";
  return "neutral";
}

/**
 * Analyse a short window of AudioFeatures (typically 1-3 seconds)
 * against session-wide baseline statistics and return an EmotionState.
 */
export function analyzeEmotion(
  recentSamples: AudioFeatures[],
  fullHistory: AudioFeatures[]
): EmotionState {
  const baseline = computeBaseline(fullHistory);
  const now = Date.now();

  if (recentSamples.length === 0) {
    return {
      excitement: 50,
      nervousness: 50,
      confidence: 50,
      engagement: 50,
      label: "neutral",
      timestamp: now,
    };
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const pitches = recentSamples
    .map((s) => s.pitch)
    .filter((p): p is number => p !== null && p > 0);
  const avgPitch = pitches.length > 0 ? avg(pitches) : null;
  const pitchRange =
    pitches.length > 1 ? Math.max(...pitches) - Math.min(...pitches) : 0;
  const avgEnergy = avg(recentSamples.map((s) => s.energy));
  const avgZcr = avg(recentSamples.map((s) => s.zcr));
  const avgSf = avg(recentSamples.map((s) => s.spectralFlatness));
  const avgLoudness = avg(recentSamples.map((s) => s.loudness));

  // --- Excitement: high pitch + high energy + wide pitch variation ---
  let excitement = 50;
  if (avgPitch !== null && baseline.avgPitch !== null && baseline.avgPitch > 0) {
    excitement += (avgPitch / baseline.avgPitch - 1) * 50;
  }
  if (baseline.avgEnergy > 0) {
    excitement += (avgEnergy / baseline.avgEnergy - 1) * 30;
  }
  excitement += Math.min(pitchRange / 80, 1) * 20;

  // --- Nervousness: high pitch + low energy + high ZCR (voice tremor) ---
  let nervousness = 40;
  if (avgPitch !== null && baseline.avgPitch !== null && baseline.avgPitch > 0) {
    nervousness += (avgPitch / baseline.avgPitch - 1) * 35;
  }
  if (baseline.avgEnergy > 0 && avgEnergy < baseline.avgEnergy) {
    nervousness += (1 - avgEnergy / baseline.avgEnergy) * 25;
  }
  if (baseline.avgZcr > 0) {
    nervousness += (avgZcr / baseline.avgZcr - 1) * 15;
  }

  // --- Confidence: stable pitch + adequate energy + low spectral flatness ---
  let confidence = 50;
  const pitchStability = pitches.length > 1 ? 1 - Math.min(pitchRange / 120, 1) : 0.5;
  confidence += pitchStability * 20;
  if (baseline.avgEnergy > 0) {
    confidence += Math.min(avgEnergy / baseline.avgEnergy, 2) * 15 - 15;
  }
  if (baseline.avgSpectralFlatness > 0) {
    const sfRatio = avgSf / baseline.avgSpectralFlatness;
    confidence -= (sfRatio - 1) * 10;
  }

  // --- Engagement: active energy changes + loudness + pitch inflection ---
  let engagement = 50;
  if (baseline.avgLoudness > 0) {
    engagement += (avgLoudness / baseline.avgLoudness - 1) * 25;
  }
  engagement += Math.min(pitchRange / 60, 1) * 20;
  if (baseline.avgEnergy > 0 && avgEnergy > baseline.avgEnergy * 0.3) {
    engagement += 10;
  }

  excitement = clamp(excitement);
  nervousness = clamp(nervousness);
  confidence = clamp(confidence);
  engagement = clamp(engagement);

  return {
    excitement,
    nervousness,
    confidence,
    engagement,
    label: pickLabel(excitement, nervousness, confidence, engagement),
    timestamp: now,
  };
}

export const EMOTION_LABELS_JA: Record<EmotionLabel, string> = {
  enthusiastic: "熱心",
  confident: "自信あり",
  nervous: "緊張",
  hesitant: "迷い",
  disengaged: "関心低下",
  neutral: "普通",
};

export const EMOTION_COLORS: Record<EmotionLabel, string> = {
  enthusiastic: "text-orange-400 bg-orange-400/10 border-orange-400/30",
  confident: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  nervous: "text-blue-400 bg-blue-400/10 border-blue-400/30",
  hesitant: "text-purple-400 bg-purple-400/10 border-purple-400/30",
  disengaged: "text-gray-400 bg-gray-400/10 border-gray-400/30",
  neutral: "text-muted-foreground bg-muted border-border",
};
