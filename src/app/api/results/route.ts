import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { InterviewResult } from "@/lib/types";

const RESULTS_DIR = path.join(process.cwd(), "data", "results");

async function ensureDir() {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
}

export async function POST(request: NextRequest) {
  try {
    const result: InterviewResult = await request.json();
    await ensureDir();

    const filename = `interview-${result.id}-${Date.now()}.json`;
    const filepath = path.join(RESULTS_DIR, filename);

    await fs.writeFile(filepath, JSON.stringify(result, null, 2), "utf-8");

    return NextResponse.json({ success: true, filename });
  } catch (error) {
    console.error("Failed to save results:", error);
    return NextResponse.json(
      { error: "Failed to save results" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    await ensureDir();
    const files = await fs.readdir(RESULTS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const results: InterviewResult[] = [];
    for (const file of jsonFiles) {
      const content = await fs.readFile(
        path.join(RESULTS_DIR, file),
        "utf-8"
      );
      results.push(JSON.parse(content));
    }

    results.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));

    return NextResponse.json(results);
  } catch (error) {
    console.error("Failed to read results:", error);
    return NextResponse.json(
      { error: "Failed to read results" },
      { status: 500 }
    );
  }
}
