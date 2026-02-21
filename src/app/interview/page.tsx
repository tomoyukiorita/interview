"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { InterviewRoom } from "@/components/InterviewRoom";
import type { InterviewMode } from "@/lib/types";
import { Loader2 } from "lucide-react";

function InterviewPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const mode = (searchParams.get("mode") || "auto") as InterviewMode;
  const scenarioId = searchParams.get("scenario") || "general";

  const handleEnd = () => {
    router.push("/");
  };

  return (
    <InterviewRoom mode={mode} scenarioId={scenarioId} onEnd={handleEnd} />
  );
}

export default function InterviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-background">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      }
    >
      <InterviewPageInner />
    </Suspense>
  );
}
