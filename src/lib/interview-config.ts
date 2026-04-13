import type {
  InterviewQuestion,
  InterviewScenario,
  BranchDecision,
  Sentiment,
} from "./types";

const generalInterview: InterviewScenario = {
  id: "general",
  title: "経営者向けwell-beingインタビュー",
  description:
    "経営、組織文化、採用、社会への広がりをwell-beingの視点で深掘りするシナリオ",
  topics: [
    {
      id: "opening_checkin",
      name: "最近の調子と手応え",
      questions: [
        {
          id: "open-1",
          text:
            "最近、仕事をしていて「今日はいい感じだな」と思えた瞬間って、どんなときですか。",
          topic: "opening_checkin",
          followUps: {
            brief:
              "その日は、いつもと何が違っていたのかも少し聞かせてください。",
            detailed:
              "その感覚が生まれた背景に、働き方や周囲との関わりで効いていたことがあれば教えてください。",
            off_topic:
              "最近、仕事の中で自然体でいられた場面や、手応えを感じた場面として教えてください。",
          },
        },
      ],
    },
    {
      id: "leadership_philosophy",
      name: "経営とwell-being",
      questions: [
        {
          id: "lead-1",
          text:
            "社員のウェルビーイングを、会社の成長や利益とどう結びつけて考えていますか。",
          topic: "leadership_philosophy",
          followUps: {
            brief:
              "その考え方が、実際の経営判断や事業づくりに表れた場面があれば教えてください。",
            detailed:
              "社員のwell-beingと事業の持続的な成長が、どうつながっていると見ているのかももう少し聞かせてください。",
            off_topic:
              "社員・生活者・事業の成長、この3つの関係性という観点で教えていただけますか？",
          },
        },
        {
          id: "lead-2",
          text:
            "いま経営トップとして強く持っている問いは何ですか。",
          topic: "leadership_philosophy",
          followUps: {
            brief:
              "その問いを強く持つようになった背景や、きっかけがあれば教えてください。",
            detailed:
              "その問いが、採用や組織づくり、事業の進め方にどう影響しているのかも聞かせてください。",
            negative:
              "まだ答えが見えていない問いでも大丈夫です。いま強く意識しているテーマを教えてください。",
          },
        },
      ],
    },
    {
      id: "executive_self",
      name: "経営者自身の整え方",
      questions: [
        {
          id: "self-1",
          text:
            "経営者として健やかに働き続けるために、日々意識していることは何ですか。",
          topic: "executive_self",
          followUps: {
            brief:
              "睡眠、運動、相談相手、意思決定のリズム、忙しい時期ほど守っている線引きなど、具体的な習慣があれば教えてください。",
            detailed:
              "そうした整え方や立て直し方を意識するようになった原体験や、過去の失敗、影響を受けた人がいれば教えてください。",
            off_topic:
              "ご自身が長く健やかに経営を続けるために必要だと感じる条件や、負荷が高い局面で安定を保つ工夫を教えてください。",
          },
        },
      ],
    },
    {
      id: "culture_trust",
      name: "自然体・透明性・候補者体験",
      questions: [
        {
          id: "culture-1",
          text:
            "社員が無理をせず、自然体で働けていると感じるのは、どんな場面ですか。",
          topic: "culture_trust",
          followUps: {
            brief:
              "そう感じるとき、組織の空気やマネジメント、安心して話せる関係性にどんな特徴がありますか。",
            detailed:
              "逆に、自然体でいられなくなる兆しや、孤立が起きそうな場面はどこに表れますか。",
            negative:
              "自然体という言葉を、御社ではどんな状態として捉えているか教えてください。",
          },
        },
        {
          id: "culture-2",
          text:
            "良いことだけでなく難しさも含めて、社内や候補者に誠実に伝えるために意識していることは何ですか。",
          topic: "culture_trust",
          followUps: {
            brief:
              "採用や日常のマネジメントで、伝えにくいことをあえて言葉にした場面があれば教えてください。",
            detailed:
              "そうした透明性が、候補者体験や入社後の納得感につながった経験があれば教えてください。",
            off_topic:
              "採用でも日常のマネジメントでも構わないので、難しさも含めて誠実に伝える工夫を教えてください。",
          },
        },
      ],
    },
    {
      id: "challenge_growth",
      name: "課題・危機・学習する組織",
      questions: [
        {
          id: "challenge-1",
          text:
            "いま御社が向き合うべき最大の課題は何で、その課題はwell-beingとどう関係していますか。",
          topic: "challenge_growth",
          followUps: {
            brief:
              "その課題は、制度、カルチャー、マネジメント、事業構造のどこに根があると見ていますか。",
            detailed:
              "その課題に向き合うことで、会社がどう変わる必要があると感じていますか。",
            off_topic:
              "いま最も避けて通れない経営課題という観点で教えてください。",
          },
        },
        {
          id: "challenge-2",
          text:
            "社員の心身の健康を守りながら、挑戦や失敗から学ぶ文化をどうつくっていますか。",
          topic: "challenge_growth",
          followUps: {
            brief:
              "制度、運用、対話、マネージャー教育、振り返りなど、特に効いている打ち手があれば教えてください。",
            detailed:
              "心身の健康を守ること、挑戦を促すこと、失敗を学びに変えることをどう両立しているのかも聞かせてください。",
            negative:
              "まだ途上のテーマでも構いません。健康、挑戦、学習の両立で難しさを感じている点があれば教えてください。",
          },
        },
      ],
    },
    {
      id: "diversity_cocreation",
      name: "多様性・摩擦・共創",
      questions: [
        {
          id: "diversity-1",
          text:
            "異なる価値観の摩擦や対立を、組織の成長や新しい価値につなげながら、多様な背景を持つ人が尊重し合って共創できるように、どんな対話の場や仕組みをつくっていますか。",
          topic: "diversity_cocreation",
          followUps: {
            brief:
              "摩擦が起きたときに、避けるのではなく意味ある対話に変える工夫や、機能している場があれば教えてください。",
            detailed:
              "対立や違いを、新しい価値や共創に変えられた経験があれば聞かせてください。",
            off_topic:
              "異なる価値観を活かし合うための場づくりという観点で教えてください。",
          },
        },
      ],
    },
    {
      id: "social_impact",
      name: "社会への広がりと未来への投資",
      questions: [
        {
          id: "impact-1",
          text:
            "御社の事業や働き方、人への投資は、社員や社会の未来のwell-beingにどうつながると考えていますか。",
          topic: "social_impact",
          followUps: {
            brief:
              "顧客や地域社会への影響と、社員への投資のどちらに今特に力を入れているか教えてください。",
            detailed:
              "評価や報酬、教育や働き方への投資が、数年後の組織や社会にどうつながってほしいかも聞かせてください。",
            off_topic:
              "社外への広がりと、未来への投資という観点で御社らしさを教えてください。",
          },
        },
      ],
    },
    {
      id: "closing",
      name: "クロージング",
      questions: [
        {
          id: "close-1",
          text:
            "これから入社する人に、経営者として今約束できることや伝えたいメッセージがあれば教えてください。",
          topic: "closing",
          followUps: {
            positive: "ぜひお答えしますね。",
            neutral: "ありがとうございます。本日はお話しいただきありがとうございました。",
          },
        },
      ],
    },
  ],
};

const userResearchInterview: InterviewScenario = {
  id: "user_research",
  title: "ユーザーリサーチ",
  description: "プロダクトのユーザー体験に関するインタビュー",
  topics: [
    {
      id: "context",
      name: "利用背景",
      questions: [
        {
          id: "ur-1",
          text: "普段どのようなシーンでこのサービスを利用されていますか？",
          topic: "context",
          followUps: {
            brief: "頻度はどのくらいですか？",
            detailed: "他のサービスと比較して選んだ理由はありますか？",
          },
        },
        {
          id: "ur-2",
          text: "このサービスを使い始めたきっかけを教えてください。",
          topic: "context",
          followUps: {
            brief: "何か特定の問題を解決するためでしたか？",
            detailed: "当時の期待と現在の満足度はいかがですか？",
          },
        },
      ],
    },
    {
      id: "experience_ux",
      name: "使用体験",
      questions: [
        {
          id: "ur-3",
          text: "使っていて特に気に入っている機能は何ですか？",
          topic: "experience_ux",
          followUps: {
            brief: "その機能がなかったらどうしますか？",
            detailed: "その機能をもっと良くするアイデアはありますか？",
          },
        },
        {
          id: "ur-4",
          text: "使いにくいと感じる部分はありますか？",
          topic: "experience_ux",
          followUps: {
            positive: "改善案があればぜひ教えてください。",
            negative: "特にストレスを感じる場面を詳しく教えてください。",
            neutral: "理想的にはどう動いてほしいですか？",
          },
        },
      ],
    },
    {
      id: "needs",
      name: "ニーズ・要望",
      questions: [
        {
          id: "ur-5",
          text: "あったらいいなと思う機能はありますか？",
          topic: "needs",
          followUps: {
            brief: "どのような場面でそれが必要になりますか？",
            detailed: "それがあったらどのくらい使用頻度が変わりますか？",
          },
        },
      ],
    },
    {
      id: "closing",
      name: "クロージング",
      questions: [
        {
          id: "ur-close",
          text: "最後に、このサービスについて他に何かお伝えしたいことはありますか？",
          topic: "closing",
          followUps: {
            positive: "貴重なご意見ありがとうございます。",
            neutral: "本日は貴重なお時間をいただきありがとうございました。",
          },
        },
      ],
    },
  ],
};

export const scenarios: InterviewScenario[] = [
  generalInterview,
  userResearchInterview,
];

export function getScenarioById(
  id: string
): InterviewScenario | undefined {
  return scenarios.find((s) => s.id === id);
}

export function getScenarioList() {
  return scenarios.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    topicCount: s.topics.length,
  }));
}

interface AnswerEvaluation {
  answerSummary: string;
  sentiment: Sentiment;
  topicCovered: boolean;
  answerQuality: "detailed" | "adequate" | "brief" | "off_topic";
  currentAgentName?: string;
  topicFollowUpCount?: number;
}

function getAgentForTopic(topicId: string): string | undefined {
  if (topicId === "executive_self" || topicId === "social_impact") {
    return "LeadershipWellbeingAgent";
  }

  if (
    topicId === "culture_trust" ||
    topicId === "challenge_growth" ||
    topicId === "diversity_cocreation"
  ) {
    return "OrganizationCultureAgent";
  }

  if (topicId === "closing") {
    return "ClosingAgent";
  }

  return undefined;
}

function buildDecision(
  question: InterviewQuestion,
  reason: string,
  overrides: Partial<
    Omit<
    BranchDecision,
    "nextQuestionId" | "nextQuestionText" | "reason"
    >
  > = {},
  nextQuestionText?: string
): BranchDecision {
  return {
    nextQuestionId: question.id,
    nextQuestionText: nextQuestionText ?? question.text,
    reason,
    shouldHandoff: overrides.shouldHandoff ?? false,
    ...overrides,
  };
}

export function getNextQuestionFromScenario(
  scenario: InterviewScenario,
  topicIndex: number,
  questionIndex: number,
  evaluation: AnswerEvaluation
): BranchDecision {
  const topics = scenario.topics;

  if (topicIndex >= topics.length) {
    return {
      nextQuestionId: "end",
      nextQuestionText: "本日のインタビューは以上です。ありがとうございました。",
      reason: "全てのトピックが完了しました",
      shouldHandoff: true,
      handoffTarget: "closing",
    };
  }

  const currentTopic = topics[topicIndex];
  const questions = currentTopic.questions;
  const canUseTopicFollowUp = (evaluation.topicFollowUpCount ?? 0) < 1;

  if (
    evaluation.answerQuality === "brief" &&
    questionIndex < questions.length &&
    canUseTopicFollowUp
  ) {
    const currentQ = questions[questionIndex];
    const followUp =
      currentQ.followUps["brief"] ||
      currentQ.followUps[Object.keys(currentQ.followUps)[0]];
    return buildDecision(
      currentQ,
      `回答が短いため、フォローアップ: ${followUp}`,
      { shouldHandoff: false },
      followUp
    );
  }

  if (evaluation.answerQuality === "off_topic" && canUseTopicFollowUp) {
    const currentQ = questions[questionIndex];
    const followUp =
      currentQ.followUps["off_topic"] ||
      currentQ.followUps[Object.keys(currentQ.followUps)[0]];
    return buildDecision(
      currentQ,
      `話題がそれたため、軌道修正: ${followUp}`,
      { shouldHandoff: false },
      followUp
    );
  }

  const nextQIndex = questionIndex + 1;
  if (nextQIndex < questions.length && !evaluation.topicCovered) {
    return buildDecision(questions[nextQIndex], "トピック内の次の質問に進みます", {
      shouldHandoff: false,
    });
  }

  const nextTopicIndex = topicIndex + 1;
  if (nextTopicIndex < topics.length) {
    const nextTopic = topics[nextTopicIndex];
    const targetAgent = getAgentForTopic(nextTopic.id);
    const shouldHandoffToTarget =
      Boolean(targetAgent) && targetAgent !== evaluation.currentAgentName;

    if (
      nextTopic.id === "executive_self" ||
      nextTopic.id === "social_impact"
    ) {
      return buildDecision(
        nextTopic.questions[0],
        "経営哲学や経営者自身の視点をさらに深掘りします",
        {
          suggestedTopic: nextTopic.id,
          shouldHandoff: shouldHandoffToTarget,
          handoffTarget: shouldHandoffToTarget ? targetAgent : undefined,
        }
      );
    }

    if (
      nextTopic.id === "culture_trust" ||
      nextTopic.id === "challenge_growth" ||
      nextTopic.id === "diversity_cocreation"
    ) {
      return buildDecision(
        nextTopic.questions[0],
        "組織文化や採用、多様性のテーマを深掘りします",
        {
          suggestedTopic: nextTopic.id,
          shouldHandoff: shouldHandoffToTarget,
          handoffTarget: shouldHandoffToTarget ? targetAgent : undefined,
        }
      );
    }

    if (nextTopic.id === "closing") {
      return buildDecision(
        nextTopic.questions[0],
        "最後の振り返りとクロージングに移ります",
        {
          suggestedTopic: nextTopic.id,
          shouldHandoff: shouldHandoffToTarget,
          handoffTarget: shouldHandoffToTarget ? targetAgent : undefined,
        }
      );
    }

    return buildDecision(
      nextTopic.questions[0],
      `次のトピック「${nextTopic.name}」に移ります`,
      {
        suggestedTopic: nextTopic.id,
        shouldHandoff: false,
      }
    );
  }

  return {
    nextQuestionId: "end",
    nextQuestionText: "本日のインタビューは以上です。ありがとうございました。",
    reason: "全てのトピックが完了しました",
    shouldHandoff: true,
    handoffTarget: "closing",
  };
}

export function getCurrentQuestion(
  scenario: InterviewScenario,
  topicIndex: number,
  questionIndex: number
) {
  if (topicIndex >= scenario.topics.length) return null;
  const topic = scenario.topics[topicIndex];
  if (questionIndex >= topic.questions.length) return null;
  return {
    topic: topic.name,
    question: topic.questions[questionIndex],
  };
}
