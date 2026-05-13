import { describe, expect, it } from "vitest";

import { buildDialectAwareQuestionText } from "./realtime-dialect";

describe("realtime dialect helpers", () => {
  it("keeps standard questions unchanged by default", () => {
    expect(
      buildDialectAwareQuestionText(
        "いま経営トップとして強く持っている問いは何ですか。",
        "standard"
      )
    ).toBe("いま経営トップとして強く持っている問いは何ですか。");
  });

  it("converts common question endings to polite Kansai wording", () => {
    expect(
      buildDialectAwareQuestionText(
        "いま経営トップとして強く持っている問いは何ですか。",
        "kansai"
      )
    ).toContain("何やと思いますか？");
    expect(
      buildDialectAwareQuestionText(
        "そこから会社の成長や利益とのつながりを、どう捉えていますか。",
        "kansai"
      )
    ).toContain("どんなふうに捉えてはりますか？");
    expect(
      buildDialectAwareQuestionText(
        "背景をもう少し聞かせてください。",
        "kansai"
      )
    ).toContain("聞かせてもらえますか？");
  });

  it("converts standalone te-imasu-ka endings to te-harimasu-ka", () => {
    expect(
      buildDialectAwareQuestionText(
        "そのテーマを大事にしていますか。",
        "kansai"
      )
    ).toContain("大事にしてはりますか？");
    expect(
      buildDialectAwareQuestionText(
        "どんな取り組みをされていますか。",
        "kansai"
      )
    ).toContain("されてはりますか？");
    expect(
      buildDialectAwareQuestionText(
        "そのときどう感じていますか",
        "kansai"
      )
    ).toContain("感じてはりますか？");
    expect(
      buildDialectAwareQuestionText(
        "なぜですか",
        "kansai"
      )
    ).toContain("なんでやと思いますか？");
  });
});
