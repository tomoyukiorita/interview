import { NextResponse } from "next/server";
import {
  buildFallbackSkeleton,
  buildPrepMessages,
  buildSkeletonInstructions,
  filterSkeletonToSource,
  interviewSkeletonSchema,
  isSkeletonGrounded,
  PREP_MODEL,
  type InterviewSkeleton,
} from "@/lib/interview-prep";
import {
  getSiteResearchFetcher,
  hasEnoughResearchText,
} from "@/lib/site-research-fetcher";

async function generateSkeleton(
  url: string,
  pageText: string,
  apiKey: string
): Promise<InterviewSkeleton | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PREP_MODEL,
        messages: buildPrepMessages(url, pageText),
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error("interview-prep: LLM request failed", await res.text());
      return null;
    }
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";
    if (!content) return null;
    const parsed = interviewSkeletonSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      console.error("interview-prep: schema validation failed", parsed.error);
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.error("interview-prep: generation error", error);
    return null;
  }
}

export async function POST(req: Request) {
  let url = "";
  try {
    const body = await req.json();
    url = typeof body?.url === "string" ? body.url.trim() : "";
  } catch {
    url = "";
  }

  if (!url) {
    return NextResponse.json(
      { error: "url is required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const research = await getSiteResearchFetcher().fetchSite(url);
  const pageText = research.combinedText;

  // Anti-fabrication guard: with no real page text the prep LLM invents
  // plausible missions and CEO names, which the interview brain then quotes
  // as fact. Better a generic map than a fabricated one.
  let skeleton: InterviewSkeleton | null = null;
  if (apiKey && hasEnoughResearchText(pageText)) {
    skeleton = await generateSkeleton(url, pageText, apiKey);
    // A company name absent from the page text means the model described a
    // different company from its training data: discard the whole skeleton.
    if (skeleton && !isSkeletonGrounded(skeleton, pageText)) {
      console.warn(
        `interview-prep: ungrounded companyName "${skeleton.companyName}" for ${url}; using fallback`
      );
      skeleton = null;
    }
    // Verify quote fields against the actual page text: drop anything the
    // LLM invented so it can never be quoted at the interviewee as fact.
    if (skeleton) {
      skeleton = filterSkeletonToSource(skeleton, pageText);
    }
  }

  const usedFallback = skeleton === null;
  const resolved = skeleton ?? buildFallbackSkeleton(url);

  console.log(
    `interview-prep: ${url} pages=${research.pages.length} textChars=${pageText.length} usedFallback=${usedFallback}`
  );

  return NextResponse.json({
    skeleton: resolved,
    instructions: buildSkeletonInstructions(resolved, { usedFallback }),
    usedFallback,
  });
}
