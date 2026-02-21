"use client";

import { useRef, useEffect } from "react";
import { cn } from "@/lib/cn";

interface AudioVisualizerProps {
  energyHistory: number[];
  pitchHistory: number[];
  currentEnergy: number;
  currentPitch: number | null;
  isSpeaking: boolean;
  className?: string;
}

export function AudioVisualizer({
  energyHistory,
  pitchHistory,
  currentEnergy,
  currentPitch,
  isSpeaking,
  className,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = "#09090b";
      ctx.fillRect(0, 0, w, h);

      const barCount = Math.min(energyHistory.length, 100);
      const barWidth = w / barCount;
      const startIdx = Math.max(0, energyHistory.length - barCount);

      for (let i = 0; i < barCount; i++) {
        const energy = energyHistory[startIdx + i] || 0;
        const barHeight = energy * h * 3;

        const pitch = pitchHistory[startIdx + i] || 0;
        const hue = pitch > 0 ? Math.min(270, (pitch / 400) * 270) : 240;
        const saturation = energy > 0.01 ? 70 : 20;
        const lightness = 30 + energy * 200;

        ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${Math.min(lightness, 70)}%)`;

        const x = i * barWidth;
        const y = h / 2 - barHeight / 2;
        ctx.fillRect(x, y, barWidth - 1, barHeight);

        ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${Math.min(lightness + 10, 80)}%)`;
        ctx.fillRect(x, y, barWidth - 1, 2);
      }

      if (isSpeaking) {
        const pulseRadius = 4 + currentEnergy * 30;
        ctx.beginPath();
        ctx.arc(w - 20, 20, pulseRadius, 0, Math.PI * 2);
        ctx.fillStyle = "#22c55e";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(w - 20, 20, pulseRadius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(34, 197, 94, 0.3)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [energyHistory, pitchHistory, currentEnergy, isSpeaking]);

  return (
    <div className={cn("relative rounded-lg overflow-hidden border border-border", className)}>
      <canvas
        ref={canvasRef}
        width={600}
        height={120}
        className="w-full h-full"
      />
      <div className="absolute bottom-2 left-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span>
          エネルギー:{" "}
          <span className="text-foreground font-mono">
            {currentEnergy.toFixed(3)}
          </span>
        </span>
        <span>
          ピッチ:{" "}
          <span className="text-foreground font-mono">
            {currentPitch ? `${currentPitch.toFixed(0)} Hz` : "---"}
          </span>
        </span>
        {isSpeaking && (
          <span className="text-success font-medium">発話中</span>
        )}
      </div>
    </div>
  );
}
