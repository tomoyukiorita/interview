import { describe, expect, it } from "vitest";
import {
  extractJapaneseTextFromScript,
  extractSameOriginLinks,
  extractScriptUrls,
  hasEnoughResearchText,
} from "./site-research-fetcher";

const BASE = "https://example.com/";

describe("hasEnoughResearchText", () => {
  it("rejects empty or shell-page text", () => {
    expect(hasEnoughResearchText("")).toBe(false);
    expect(hasEnoughResearchText("NLP, Inc. | Beyond Intelligence")).toBe(
      false
    );
  });

  it("accepts substantial page text", () => {
    expect(hasEnoughResearchText("私たちは。".repeat(50))).toBe(true);
  });
});

describe("extractSameOriginLinks", () => {
  const html = `
    <nav>
      <a href="/about">私たちについて</a>
      <a href="/service">事業内容</a>
      <a href="/recruit">採用情報</a>
      <a href="/blog/12345">日々の記録</a>
      <a href="https://twitter.com/example">X</a>
      <a href="/files/company.pdf">会社案内PDF</a>
      <a href="/philosophy">理念</a>
      <a href="/">ホーム</a>
    </nav>`;

  it("keeps same-origin philosophy/company pages, prioritized", () => {
    const links = extractSameOriginLinks(html, BASE);
    expect(links[0]).toBe("https://example.com/philosophy");
    expect(links).toContain("https://example.com/about");
    expect(links).toContain("https://example.com/service");
  });

  it("drops external links, files, unrelated pages, and the root itself", () => {
    const links = extractSameOriginLinks(html, BASE);
    expect(links).not.toContain("https://twitter.com/example");
    expect(links.some((l) => l.endsWith(".pdf"))).toBe(false);
    expect(links).not.toContain("https://example.com/blog/12345");
    expect(links).not.toContain("https://example.com");
  });

  it("scores by anchor text too, not just the path", () => {
    const links = extractSameOriginLinks(
      `<a href="/x1">代表メッセージ</a>`,
      BASE
    );
    expect(links).toEqual(["https://example.com/x1"]);
  });
});

describe("extractScriptUrls", () => {
  it("collects same-origin script bundles", () => {
    const html = `
      <script type="module" crossorigin src="/assets/index-abc.js"></script>
      <script src="https://cdn.example.org/lib.js"></script>`;
    expect(extractScriptUrls(html, BASE)).toEqual([
      "https://example.com/assets/index-abc.js",
    ]);
  });
});

describe("extractJapaneseTextFromScript", () => {
  it("recovers Japanese UI copy from string literals", () => {
    const js =
      'const a="AIの可能性を、デザインの力で解き放つ。";let b=\'事業内容\';fn(`未来を実装する`);';
    const text = extractJapaneseTextFromScript(js);
    expect(text).toContain("AIの可能性を、デザインの力で解き放つ。");
    expect(text).toContain("事業内容");
    expect(text).toContain("未来を実装する");
  });

  it("skips non-Japanese literals and dedupes", () => {
    const js = 'x("className");y("理念と哲学");z("理念と哲学");';
    expect(extractJapaneseTextFromScript(js)).toBe("理念と哲学");
  });

  it("unescapes quotes and collapses escaped newlines", () => {
    const js = 'm("妥協\\"しない\\"こと\\nそれが軸");';
    expect(extractJapaneseTextFromScript(js)).toBe('妥協"しない"こと それが軸');
  });
});
