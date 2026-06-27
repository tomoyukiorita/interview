import { extractReadableText } from "./interview-prep";

/**
 * Site research fetcher.
 *
 * Fetches a company site for interview prep: top page + prioritized
 * sub-pages (about / mission / message ...), with SPA recovery that pulls
 * visible copy out of same-origin JS bundles when the served HTML is an
 * empty shell.
 *
 * The entry point is `getSiteResearchFetcher()` so the implementation can
 * later be swapped for a rendering scraper (e.g. Firecrawl) behind the same
 * interface.
 */

export interface SiteResearchPage {
  url: string;
  label: string;
  text: string;
}

export interface SiteResearchResult {
  pages: SiteResearchPage[];
  combinedText: string;
}

export interface SiteResearchFetcher {
  fetchSite(url: string): Promise<SiteResearchResult>;
}

const FETCH_TIMEOUT_MS = 8000;
const MAX_SUB_PAGES = 4;
const MAX_SCRIPT_BUNDLES = 3;
const MAX_PAGE_TEXT_LENGTH = 6000;
const MAX_COMBINED_TEXT_LENGTH = 24000;
/** Below this, a page is considered an empty SPA shell / unusable. */
const MIN_PAGE_TEXT_LENGTH = 120;

const USER_AGENT =
  "Mozilla/5.0 (compatible; InterviewPrepBot/1.0; +https://example.com/bot)";

/** Path/anchor keywords that signal philosophy- or company-related pages. */
const SUB_PAGE_KEYWORDS: { pattern: RegExp; score: number }[] = [
  { pattern: /philosophy|mission|vision|purpose|理念|ミッション|ビジョン/i, score: 10 },
  { pattern: /message|ceo|founder|president|代表|社長|創業/i, score: 9 },
  { pattern: /about|company|profile|私たち|会社概要|会社案内/i, score: 8 },
  { pattern: /story|history|culture|values|沿革|文化|価値観/i, score: 7 },
  { pattern: /service|product|business|事業|サービス|プロダクト/i, score: 5 },
  { pattern: /recruit|careers?|採用/i, score: 4 },
  { pattern: /news|topics|press|ニュース|お知らせ/i, score: 2 },
];

const NON_HTML_EXTENSION =
  /\.(?:pdf|jpe?g|png|gif|svg|webp|ico|css|js|json|xml|zip|mp4|mp3|woff2?)(?:[?#]|$)/i;

const JAPANESE_CHAR = /[ぁ-んァ-ヶ一-龠々]/;

export function hasEnoughResearchText(text: string): boolean {
  return text.trim().length >= MIN_PAGE_TEXT_LENGTH;
}

/**
 * Collect same-origin links from HTML, prioritized by how likely the page is
 * to contain philosophy / company material. Returns absolute URLs.
 */
export function extractSameOriginLinks(html: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }

  const scored = new Map<string, number>();
  const anchorRegex = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRegex.exec(html))) {
    const [, href, inner] = match;
    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      continue;
    }
    if (resolved.origin !== base.origin) continue;
    if (NON_HTML_EXTENSION.test(resolved.pathname)) continue;
    resolved.hash = "";
    const normalized = resolved.href.replace(/\/$/, "");
    const baseNormalized = base.href.replace(/\/$/, "");
    if (normalized === baseNormalized) continue;

    const anchorText = inner.replace(/<[^>]+>/g, " ");
    const haystack = `${resolved.pathname} ${anchorText}`;
    let score = 0;
    for (const { pattern, score: s } of SUB_PAGE_KEYWORDS) {
      if (pattern.test(haystack)) score = Math.max(score, s);
    }
    if (score === 0) continue;
    scored.set(normalized, Math.max(scored.get(normalized) ?? 0, score));
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SUB_PAGES)
    .map(([url]) => url);
}

/** Collect same-origin `<script src>` bundle URLs from HTML. */
export function extractScriptUrls(html: string, baseUrl: string): string[] {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  const urls: string[] = [];
  const scriptRegex = /<script\b[^>]*\bsrc=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptRegex.exec(html))) {
    let resolved: URL;
    try {
      resolved = new URL(match[1], base);
    } catch {
      continue;
    }
    if (resolved.origin !== base.origin) continue;
    if (!urls.includes(resolved.href)) urls.push(resolved.href);
  }
  return urls.slice(0, MAX_SCRIPT_BUNDLES);
}

/**
 * Recover visible site copy from a JS bundle by extracting string literals
 * that contain Japanese text. This is how we read JS-rendered SPAs without a
 * headless browser: UI copy survives bundling as plain string literals.
 */
export function extractJapaneseTextFromScript(js: string): string {
  const literalRegex = /(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  const seen = new Set<string>();
  const parts: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = literalRegex.exec(js))) {
    const raw = match[2];
    if (raw.length < 4 || raw.length > 1000) continue;
    if (!JAPANESE_CHAR.test(raw)) continue;
    const text = raw
      .replace(/\\n/g, " ")
      .replace(/\\(["'`])/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
  }
  return parts.join(" ").slice(0, MAX_PAGE_TEXT_LENGTH);
}

async function fetchWithTimeout(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/javascript,text/javascript,*/*",
      },
      signal: controller.signal,
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function pageLabel(url: string, baseUrl: string): string {
  try {
    const parsed = new URL(url);
    const base = new URL(baseUrl);
    if (
      parsed.href.replace(/\/$/, "") === base.href.replace(/\/$/, "") ||
      parsed.pathname === "/"
    ) {
      return "トップページ";
    }
    return parsed.pathname;
  } catch {
    return url;
  }
}

async function fetchSiteWithNativeFetch(
  url: string
): Promise<SiteResearchResult> {
  const pages: SiteResearchPage[] = [];

  const rootHtml = await fetchWithTimeout(url);
  let rootText = extractReadableText(rootHtml).slice(0, MAX_PAGE_TEXT_LENGTH);

  // SPA recovery: the served HTML is an empty shell, so pull the visible
  // copy out of the JS bundles instead. One pass at the root is enough —
  // the bundle contains the copy for the whole app.
  let usedSpaRecovery = false;
  if (!hasEnoughResearchText(rootText) && rootHtml) {
    const scriptUrls = extractScriptUrls(rootHtml, url);
    const bundleTexts = await Promise.all(scriptUrls.map(fetchWithTimeout));
    const recovered = bundleTexts
      .map(extractJapaneseTextFromScript)
      .filter(Boolean)
      .join(" ")
      .slice(0, MAX_PAGE_TEXT_LENGTH);
    if (recovered) {
      rootText = `${rootText} ${recovered}`.trim().slice(0, MAX_PAGE_TEXT_LENGTH);
      usedSpaRecovery = true;
    }
  }

  if (rootText) {
    pages.push({ url, label: pageLabel(url, url), text: rootText });
  }

  // Sub-page crawl. Skipped after SPA recovery: sub-pages of an SPA return
  // the same empty shell, and the bundle pass above already covered them.
  if (!usedSpaRecovery && rootHtml) {
    const subUrls = extractSameOriginLinks(rootHtml, url);
    const subHtmls = await Promise.all(subUrls.map(fetchWithTimeout));
    subUrls.forEach((subUrl, i) => {
      const text = extractReadableText(subHtmls[i]).slice(
        0,
        MAX_PAGE_TEXT_LENGTH
      );
      if (!hasEnoughResearchText(text)) return;
      pages.push({ url: subUrl, label: pageLabel(subUrl, url), text });
    });
  }

  const combinedText = pages
    .map((page) => `【${page.label}】\n${page.text}`)
    .join("\n\n")
    .slice(0, MAX_COMBINED_TEXT_LENGTH);

  return { pages, combinedText };
}

const nativeFetcher: SiteResearchFetcher = {
  fetchSite: fetchSiteWithNativeFetch,
};

/**
 * Returns the active fetcher. Currently always the native-fetch
 * implementation; a rendering scraper (Firecrawl etc.) can be plugged in
 * here later behind the same interface.
 */
export function getSiteResearchFetcher(): SiteResearchFetcher {
  return nativeFetcher;
}
