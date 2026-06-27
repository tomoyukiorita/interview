import { describe, expect, it } from "vitest";
import {
  buildSidecarMessages,
  buildSidecarSteeringSummary,
  normalizeSidecarMemo,
} from "./interview-sidecar";

describe("interview sidecar helpers", () => {
  it("normalizes sidecar steering fields into short values", () => {
    const memo = normalizeSidecarMemo({
      currentThread: "睡眠と運動の習慣を細かく設計している".repeat(5),
      intervieweeLean: "past",
      energyTrend: "rising",
      shouldStay: true,
      shouldShift: false,
      shiftTo: null,
      reason: "過去の話で具体語と熱量が増えている",
      interviewerMove: "このまま原体験を2手掘る",
      articleTheme: "人の作業を最後まで楽にするAI",
      currentDepth: "enough",
      nextMove: "ask_origin",
      topicFatigue: "high",
      coveredTopics: ["AI任せにしないものづくり", "カタログページまで出す理由"],
      openThreads: ["考えが培われた背景"],
      questionType: "origin",
      anchor: "30代に入って睡眠を重視するようになった変化",
      probe: "その変化を最初に強く感じた場面",
      avoid: "運動回数やタイミングをさらに詰める",
      articleAngle: "休息重視が仕事の集中を変えた話",
      bestScene: "30代に入って仕事の集中が変わった場面",
      humanReaction: "周囲との会議で集中しやすくなった",
      decisionPoint: "睡眠を仕事の土台として扱うと決めた",
      followUp: "何を見て睡眠を優先しようと思ったか",
      anchorWords: ["30代", "睡眠", "仕事への影響", "長すぎる言葉".repeat(5)],
      nextAngle: "30代に入って睡眠を重視するようになったきっかけ",
      forbiddenJump: "運動回数やタイミングをさらに詰める",
    });

    expect(memo.currentThread.length).toBeLessThanOrEqual(80);
    expect(memo.intervieweeLean).toBe("past");
    expect(memo.energyTrend).toBe("rising");
    expect(memo.shouldStay).toBe(true);
    expect(memo.articleTheme).toContain("人の作業");
    expect(memo.currentDepth).toBe("enough");
    expect(memo.nextMove).toBe("ask_origin");
    expect(memo.topicFatigue).toBe("high");
    expect(memo.coveredTopics).toHaveLength(2);
    expect(memo.openThreads[0]).toContain("背景");
    expect(memo.questionType).toBe("origin");
    expect(memo.anchor).toContain("睡眠");
    expect(memo.probe).toContain("場面");
    expect(memo.avoid).toContain("運動回数");
    expect(memo.articleAngle).toContain("休息重視");
    expect(memo.bestScene).toContain("仕事の集中");
    expect(memo.humanReaction).toContain("会議");
    expect(memo.decisionPoint).toContain("土台");
    expect(memo.followUp).toContain("何を見て");
    expect(memo.anchorWords).toHaveLength(4);
    expect(memo.anchorWords[3].length).toBeLessThanOrEqual(24);
    expect(memo.nextAngle).toContain("30代");
    expect(memo.forbiddenJump).toContain("運動回数");
  });

  it("builds a compact steering summary without creating a conversation item", () => {
    const text = buildSidecarSteeringSummary(
      normalizeSidecarMemo({
        currentThread: "睡眠と運動",
        intervieweeLean: "leadership",
        energyTrend: "dropping",
        shouldStay: false,
        shouldShift: true,
        shiftTo: "leadership",
        reason: "生活習慣の細部に寄りすぎている",
        interviewerMove: "経営判断や人との関わりへ転換する",
        questionType: "work",
        articleAngle: "休息が経営判断に出る話",
        bestScene: "休息重視が仕事の判断に出る場面",
        humanReaction: "",
        decisionPoint: "判断が変わった具体的な瞬間",
        followUp: "何を見て判断が変わったか",
        anchor: "休息重視が仕事の判断に出る場面",
        probe: "判断が変わった具体的な瞬間",
        avoid: "メンバーへの声かけ",
        anchorWords: ["休息重視", "仕事の判断"],
        nextAngle: "休息重視が仕事の判断に与えた影響",
        forbiddenJump: "メンバーへの声かけ",
      })
    );

    expect(text).toContain("転換先: leadership");
    expect(text).toContain("記事角度: 休息が経営判断");
    expect(text).toContain("場面: 休息重視");
    expect(text).toContain("判断点: 判断が変わった具体的な瞬間");
    expect(text).toContain("次の切り口: 何を見て判断が変わったか");
    expect(text).toContain("濃い素材: 休息重視");
    expect(text).toContain("聞く切り口: 判断が変わった具体的な瞬間");
    expect(text).toContain("質問型: work");
    expect(text).toContain("拾う語: 休息重視、仕事の判断");
    expect(text).toContain("生活習慣");
    expect(text).toContain("飛ばさない: メンバーへの声かけ");
    expect(text.length).toBeLessThan(520);
  });

  it("builds messages without expanding transcript indefinitely", () => {
    const messages = buildSidecarMessages({
      latestIntervieweeText: "最近、働き方への意識が変わりました。",
      latestInterviewerText: "どんな場面で感じましたか？",
      skeletonInstructions: "会社メモ".repeat(1000),
      transcript: Array.from({ length: 20 }, (_, index) => ({
        role: index % 2 === 0 ? "interviewee" : "interviewer",
        text: `発話${index}`,
      })),
    });

    expect(messages).toHaveLength(2);
    expect(messages[1].content).toContain("発話19");
    expect(messages[1].content).not.toContain("発話0");
    expect(messages[0].content).toContain("理念・哲学へ戻す編集者");
    expect(messages[0].content).toContain("shouldShift");
    expect(messages[0].content).toContain("いきなりそこへ飛ばない");
    expect(messages[0].content).toContain("仕事の進み方");
    expect(messages[0].content).toContain("questionType");
    expect(messages[0].content).toContain("articleAngle");
    expect(messages[0].content).toContain("bestScene");
    expect(messages[0].content).toContain("followUp");
    expect(messages[0].content).toContain("anchor / probe");
    expect(messages[0].content).toContain("anchorWords");
    expect(messages[0].content).toContain("質問文は書かない");
    expect(messages[1].content.length).toBeLessThan(4200);
  });

  it("steers wellbeing habits toward origins or work instead of habit coaching", () => {
    const messages = buildSidecarMessages({
      latestIntervieweeText:
        "30代に入ってから、睡眠と運動が仕事の集中にかなり影響すると感じるようになりました。",
      latestInterviewerText:
        "どのくらい寝て、どのくらい運動できると、ちょうどいいと感じますか？",
      skeletonInstructions: "",
      transcript: [
        {
          role: "interviewee",
          text: "体と気持ちが元気な方が細かい作業がはかどります。",
        },
      ],
    });

    const systemPrompt = messages[0].content;

    expect(systemPrompt).toContain("睡眠・運動・食事");
    expect(systemPrompt).toContain("origin / value / work");
    expect(systemPrompt).toContain("回数や時間を詰め続けない");
  });

  it("keeps people and organization topics behind the work bridge", () => {
    const memo = normalizeSidecarMemo({
      currentThread: "体調と仕事の集中",
      intervieweeLean: "present",
      energyTrend: "steady",
      shouldStay: false,
      shouldShift: true,
      shiftTo: "leadership",
      reason: "仕事への影響は出ているが、人や組織の話はまだない",
      interviewerMove: "本人の仕事観を先に聞く",
      questionType: "work",
      anchorWords: ["集中", "細かい作業"],
      nextAngle: "体調が仕事の優先順位に出る場面",
      forbiddenJump: "メンバーへの声かけ",
    });

    const text = buildSidecarSteeringSummary(memo);

    expect(memo.questionType).toBe("work");
    expect(text).toContain("飛ばさない: メンバーへの声かけ");
    expect(text).toContain("質問型: work");
  });

  it("prioritizes the richest material before question type conversion", () => {
    const messages = buildSidecarMessages({
      latestIntervieweeText:
        "自分でテストして、知り合いにも試してもらった時に、間が広すぎると人が喋りづらそうだったので、このレイテンシ調整は必須だと思いました。",
      latestInterviewerText:
        "最初に遅いと使いにくいと感じた具体的な場面はどんな時でしたか？",
      skeletonInstructions: "",
      transcript: [],
    });

    const systemPrompt = messages[0].content;

    expect(systemPrompt).toContain("価値観、方針、理念、哲学");
    expect(systemPrompt).toContain("anchor");
    expect(systemPrompt).toContain("probe");
    expect(systemPrompt).toContain("avoid");
    expect(systemPrompt).toContain("知り合いに試してもらった時");
    expect(systemPrompt).toContain("bestScene");
    expect(systemPrompt).toContain("どんな様子を見て直す必要を感じたか");
    expect(systemPrompt).toContain("原点や内面の意味づけへ急ぐ");
    expect(systemPrompt).toContain("いつ頃からですか？");
  });

  it("asks for product context before drilling into implementation details", () => {
    const messages = buildSidecarMessages({
      latestIntervieweeText:
        "思い通りのアプリケーションが作れて、機能同士が有機的に動いて、ストレスなく使える体験になりました。",
      latestInterviewerText:
        "どんな動きをしたときに、これは狙い通りだと感じましたか。",
      skeletonInstructions: "",
      transcript: [],
    });

    const systemPrompt = messages[0].content;

    expect(systemPrompt).toContain("何のアプリ");
    expect(systemPrompt).toContain("誰が使う");
    expect(systemPrompt).toContain("ログや画面状態");
    expect(systemPrompt).toContain("理念や哲学");
  });

  it("uses editor state to decide when to leave a concrete branch", () => {
    const messages = buildSidecarMessages({
      latestIntervieweeText:
        "5社分のカタログを見て、何ページにあるかまで表示しないと作業は楽にならないと思いました。",
      latestInterviewerText:
        "ページまで出すことを外せない条件にしたんですね。",
      skeletonInstructions: "### 理念・哲学の取っかかり\n- Beyond Intelligence",
      editorState: {
        articleTheme:
          "Beyond Intelligenceとは、AI任せにせず人の作業を最後まで楽にする思想",
        coveredTopics: [
          "AI任せにしないものづくり",
          "クリスマスツリー会社向け画像検索アプリ",
          "カタログページまで出す理由",
        ],
        openThreads: ["人の作業を最後まで楽にする考えが培われた背景"],
      },
      transcript: [],
    });

    const systemPrompt = messages[0].content;
    const userPrompt = messages[1].content;

    expect(systemPrompt).toContain("編集長用の進行台帳");
    expect(systemPrompt).toContain("currentDepth");
    expect(systemPrompt).toContain("nextMove");
    expect(systemPrompt).toContain("topicFatigue");
    expect(systemPrompt).toContain("enough");
    expect(systemPrompt).toContain("次案件の作業手順");
    expect(userPrompt).toContain("articleTheme");
    expect(userPrompt).toContain("カタログページまで出す理由");
    expect(userPrompt).toContain("培われた背景");
  });

  it("moves short negative answers toward values instead of more specifics", () => {
    const messages = buildSidecarMessages({
      latestIntervieweeText: "ちょっと覚えてないです。",
      latestInterviewerText:
        "最近の打ち合わせで、印象に残った一言や反応はありましたか？",
      skeletonInstructions: "### 理念・哲学の取っかかり\n- Beyond Intelligence",
      editorState: {
        articleTheme:
          "Beyond Intelligenceとは、AI任せにせず人の作業を最後まで楽にする思想",
        coveredTopics: ["顧客の納得感", "要件外まで考えるものづくり"],
        openThreads: ["その考えが培われた背景", "会社として譲れない軸"],
      },
      transcript: [],
    });

    const systemPrompt = messages[0].content;

    expect(systemPrompt).toContain("覚えてない");
    expect(systemPrompt).toContain("特にない");
    expect(systemPrompt).toContain("lift_to_value");
    expect(systemPrompt).toContain("さらに反応や打ち合わせの具体を聞く");
  });

  it("normalizes chapter and research control fields for editorial authority", () => {
    const memo = normalizeSidecarMemo({
      currentThread: "クリスマスツリー会社の画像検索アプリ",
      currentDepth: "enough",
      nextMove: "connect_company_philosophy",
      topicFatigue: "high",
      currentChapter: "concrete_example",
      chapterProgress: "complete",
      nextChapter: "origin",
      chapterInstruction:
        "具体例は十分なので、Beyond Intelligence の考え方が培われた背景へ移る",
      researchAnchor: "Beyond Intelligence",
      usedResearchAnchors: ["画像検索アプリ"],
      pendingResearchAnchors: ["Beyond Intelligence", "顧客の作業を最後まで楽にする"],
      researchReturnPoint: "Beyond Intelligence の思想に戻す",
      editorialPriority: "override",
      allowedQuestionTypes: ["origin", "value"],
      forbiddenQuestionTypes: [
        "same_branch_deepening",
        "reaction_chasing",
        "implementation_detail",
      ],
    });

    expect(memo.currentChapter).toBe("concrete_example");
    expect(memo.chapterProgress).toBe("complete");
    expect(memo.nextChapter).toBe("origin");
    expect(memo.chapterInstruction).toContain("具体例は十分");
    expect(memo.researchAnchor).toBe("Beyond Intelligence");
    expect(memo.usedResearchAnchors).toEqual(["画像検索アプリ"]);
    expect(memo.pendingResearchAnchors).toContain("Beyond Intelligence");
    expect(memo.researchReturnPoint).toContain("思想");
    expect(memo.editorialPriority).toBe("override");
    expect(memo.allowedQuestionTypes).toEqual(["origin", "value"]);
    expect(memo.forbiddenQuestionTypes).toContain("same_branch_deepening");

    const summary = buildSidecarSteeringSummary(memo);
    expect(summary).toContain("章: concrete_example");
    expect(summary).toContain("章進行: complete");
    expect(summary).toContain("次章: origin");
    expect(summary).toContain("リサーチ戻り先: Beyond Intelligence");
    expect(summary).toContain("禁止質問: same_branch_deepening");
  });

  it("puts chapter transitions and research return points into the sidecar contract", () => {
    const messages = buildSidecarMessages({
      latestIntervieweeText:
        "5社分のカタログを見て、ページまで表示しないと作業は楽にならないと思いました。",
      latestInterviewerText:
        "ページまで出すことを外せない条件にしたんですね。",
      skeletonInstructions: "### 理念・哲学の取っかかり\n- Beyond Intelligence",
      editorState: {
        articleTheme:
          "Beyond Intelligenceとは、AI任せにせず人の作業を最後まで楽にする思想",
        coveredTopics: ["カタログページまで出す理由"],
        openThreads: ["その考えが培われた背景"],
        lastChapter: "concrete_example",
        nextChapter: "origin",
        lastDepth: "enough",
        lastTopicFatigue: "high",
        usedResearchAnchors: ["画像検索アプリ"],
        pendingResearchAnchors: ["Beyond Intelligence"],
        lastResearchReturnPoint: "Beyond Intelligence の思想",
      },
      transcript: [],
    });

    const systemPrompt = messages[0].content;
    const userPrompt = messages[1].content;

    expect(systemPrompt).toContain("currentChapter");
    expect(systemPrompt).toContain("nextChapter");
    expect(systemPrompt).toContain("chapterProgress");
    expect(systemPrompt).toContain("章遷移");
    expect(systemPrompt).toContain("同じ章の質問を続けない");
    expect(systemPrompt).toContain("researchReturnPoint");
    expect(systemPrompt).toContain("usedResearchAnchors");
    expect(systemPrompt).toContain("pendingResearchAnchors");
    expect(userPrompt).toContain("lastResearchReturnPoint");
    expect(userPrompt).toContain("Beyond Intelligence");
  });
});
