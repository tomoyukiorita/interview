import type { RealtimeSpeechStylePreset } from "./types";

export function buildDialectAwareQuestionText(
  text: string,
  speechStyle: RealtimeSpeechStylePreset
): string {
  if (speechStyle !== "kansai") return text;

  return (
    text
      .replace(/聞かせてください/g, "聞かせてもらえますか？")
      .replace(/教えてください/g, "教えてもらえますか？")
      .replace(/お話しください/g, "お話してもらえますか？")
      .replace(/お聞かせください/g, "聞かせてもらえますか？")
      .replace(/どう感じていますか/g, "どんなふうに感じてはりますか？")
      .replace(/どう思っていますか/g, "どんなふうに思てはりますか？")
      .replace(/どう捉えていますか/g, "どんなふうに捉えてはりますか？")
      .replace(/どう考えていますか/g, "どんなふうに考えてはりますか？")
      // 一般的な「〜ていますか」を「〜てはりますか」へ
      .replace(/思っていますか[？?。]?/g, "思てはりますか？")
      .replace(/感じていますか[？?。]?/g, "感じてはりますか？")
      .replace(/考えていますか[？?。]?/g, "考えてはりますか？")
      .replace(/捉えていますか[？?。]?/g, "捉えてはりますか？")
      .replace(/見ていますか[？?。]?/g, "見てはりますか？")
      .replace(/持っていますか[？?。]?/g, "持ってはりますか？")
      .replace(/やっていますか[？?。]?/g, "やってはりますか？")
      .replace(/されていますか[？?。]?/g, "されてはりますか？")
      .replace(/取り組んでいますか[？?。]?/g, "取り組んではりますか？")
      .replace(/経験していますか[？?。]?/g, "経験してはりますか？")
      .replace(/意識していますか[？?。]?/g, "意識してはりますか？")
      .replace(/大事にしていますか[？?。]?/g, "大事にしてはりますか？")
      // 何ですか / なぜですか 系
      .replace(/何ですか/g, "何やと思いますか？")
      .replace(/なんですか/g, "何やと思いますか？")
      .replace(/なぜですか/g, "なんでやと思いますか？")
      .replace(/どうしてですか/g, "どうしてやと思いますか？")
      .replace(/どんなときですか/g, "どんなときやと思いますか？")
      .replace(/ありますか/g, "ありますか？")
  );
}
