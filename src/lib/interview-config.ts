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
              "睡眠、運動、相談相手、意思決定のリズムなど、具体的な習慣があれば教えてください。",
            detailed:
              "そうした整え方を意識するようになった原体験や、影響を受けた人がいれば教えてください。",
            off_topic:
              "ご自身が長く健やかに経営を続けるために必要だと感じる条件を教えてください。",
          },
        },
        {
          id: "self-2",
          text:
            "プレッシャーが高い時期に、自分を立て直すために意識していることは何ですか。",
          topic: "executive_self",
          followUps: {
            brief:
              "忙しい時期ほど、あえて守っている習慣や線引きがあれば教えてください。",
            detailed:
              "立て直し方が今の形になった背景に、過去の失敗や学びがあれば聞かせてください。",
            off_topic:
              "負荷が高い局面で、判断力や心身の安定を保つための工夫として教えてください。",
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
              "そう感じるとき、組織の空気やマネジメントにどんな特徴がありますか。",
            detailed:
              "逆に、自然体でいられなくなる兆しはどんな場面に表れますか。",
            negative:
              "自然体という言葉を、御社ではどんな状態として捉えているか教えてください。",
          },
        },
        {
          id: "culture-2",
          text:
            "良いことだけでなく難しさも誠実に伝えるために、何を意識していますか。",
          topic: "culture_trust",
          followUps: {
            brief:
              "伝えにくいことをあえて言葉にした場面があれば教えてください。",
            detailed:
              "透明性を担保することで、結果的に信頼や納得感につながった経験があれば教えてください。",
            off_topic:
              "採用でも日常のマネジメントでも構わないので、誠実に伝える工夫を教えてください。",
          },
        },
        {
          id: "culture-3",
          text:
            "候補者に納得感と誠実さを感じてもらうために、大切にしていることは何ですか。",
          topic: "culture_trust",
          followUps: {
            brief:
              "面接や選考のどの場面で、その姿勢が最も問われると感じますか。",
            detailed:
              "候補者体験を整えることが、入社後のwell-beingやカルチャーフィットにどうつながると見ていますか。",
            negative:
              "候補者にとって耳あたりの良いことだけを言わないために、気をつけていることも教えてください。",
          },
        },
        {
          id: "culture-4",
          text:
            "社員同士の孤立を防ぎ、安心して話せる関係をつくるために、どんなことを意識していますか。",
          topic: "culture_trust",
          followUps: {
            brief:
              "1on1や対話の場、相談経路など、機能している仕組みがあれば教えてください。",
            detailed:
              "安心して話せる状態と、単に仲が良い状態の違いをどう見ていますか。",
            off_topic:
              "心理的安全性を高めるための、日々の小さな工夫でも構いません。",
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
            "いま御社が向き合うべき最大の課題は何ですか。",
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
            "これまでに、組織のカルチャーや社員のウェルビーイングが揺らいだ経験があれば、どのように向き合い、どう乗り越えましたか。",
          topic: "challenge_growth",
          followUps: {
            brief:
              "そのとき最初に表れた違和感や、危機のサインはどこにありましたか。",
            detailed:
              "乗り越える過程で、経営トップとして学んだことや変えた意思決定があれば教えてください。",
            negative:
              "まだ途上のテーマでも構いません。組織が揺らいだ経験として教えてください。",
          },
        },
        {
          id: "challenge-3",
          text:
            "社員の心身の健康を守るために、何に一番力を入れていますか。",
          topic: "challenge_growth",
          followUps: {
            brief:
              "制度、運用、対話、マネージャー教育など、特に重視している打ち手を教えてください。",
            detailed:
              "心身の健康を守ることと、事業の挑戦を止めないことをどう両立していますか。",
            positive:
              "手応えを感じた取り組みや、現場の反応が変わった施策があれば教えてください。",
          },
        },
        {
          id: "challenge-4",
          text:
            "社員が挑戦しやすくなるように、どんな仕組みがありますか。",
          topic: "challenge_growth",
          followUps: {
            brief:
              "挑戦しやすさを高めるうえで、制度とカルチャーのどちらが重要だと感じますか。",
            detailed:
              "挑戦を促しつつ、無理をさせないために意識しているバランスがあれば教えてください。",
            off_topic:
              "新しい提案が出やすい場づくりという観点でも構いません。",
          },
        },
        {
          id: "challenge-5",
          text:
            "失敗を学びに変えるために、大事にしている文化や姿勢は何ですか。",
          topic: "challenge_growth",
          followUps: {
            brief:
              "実際に失敗を学びへ変えられた場面や、振り返りのやり方があれば教えてください。",
            detailed:
              "責任を曖昧にせずに学習する文化を保つために、どんな線引きをしていますか。",
            negative:
              "まだ理想どおりではない部分があれば、そのギャップも教えてください。",
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
            "異なる価値観を持つ人が入ったときに生まれる摩擦を、組織の成長につなげるために意識していることは何ですか。",
          topic: "diversity_cocreation",
          followUps: {
            brief:
              "摩擦が起きたときに、避けるのではなく意味ある対話に変える工夫があれば教えてください。",
            detailed:
              "経営として、どこまでを健全な摩擦と捉え、どこから介入するのかも聞かせてください。",
            off_topic:
              "異なる価値観がぶつかった場面での向き合い方として教えてください。",
          },
        },
        {
          id: "diversity-2",
          text:
            "多様な背景を持つ人が、お互いを尊重しながら働ける組織にするために、どんな取り組みをしていますか。",
          topic: "diversity_cocreation",
          followUps: {
            brief:
              "採用、配置、評価、対話の場づくりなど、特に効いている取り組みがあれば教えてください。",
            detailed:
              "多様性を増やすだけでなく、活かし合う状態へ進めるために必要だと感じることを教えてください。",
            off_topic:
              "尊重しながら働く組織に近づくための具体策という観点で教えてください。",
          },
        },
        {
          id: "diversity-3",
          text:
            "意見や価値観がぶつかった場面で、妥協ではなく新しい価値を生み出せた経験があれば教えてください。",
          topic: "diversity_cocreation",
          followUps: {
            brief:
              "何と何がぶつかって、最終的にどんな新しい価値が生まれたのかを教えてください。",
            detailed:
              "その経験を経て、経営として対立の見方がどう変わったかも聞かせてください。",
            positive:
              "そこに至るまでに、対話の場や関係性がどう機能したのかも気になります。",
          },
        },
        {
          id: "diversity-4",
          text:
            "さまざまな人が関わりながら共創できるように、どのような対話の場や仕組みをつくっていますか。",
          topic: "diversity_cocreation",
          followUps: {
            brief:
              "日常のミーティング、1on1、オフサイトなど、機能している場があれば教えてください。",
            detailed:
              "対話の場を形だけで終わらせず、共創に変えるための工夫があれば教えてください。",
            off_topic:
              "部署横断や世代横断の対話の仕組みでも構いません。",
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
            "御社の事業や働き方は、地域や社会のウェルビーイングにどうつながっていると思いますか。",
          topic: "social_impact",
          followUps: {
            brief:
              "顧客や地域社会に与えている影響を、どう捉えているかもう少し具体的に教えてください。",
            detailed:
              "事業成長と社会課題の接続を、経営としてどのように見立てているのかも聞かせてください。",
            off_topic:
              "社外への広がりという観点で、御社らしさが出る部分を教えてください。",
          },
        },
        {
          id: "impact-2",
          text:
            "成果だけでなく、周囲への支援や健やかな働き方を、評価や報酬にどう反映していますか。",
          topic: "social_impact",
          followUps: {
            brief:
              "制度として明文化していることと、運用で意識していることがあれば分けて教えてください。",
            detailed:
              "短期成果だけでは測れない貢献を、どう見落とさないようにしているかを聞かせてください。",
            negative:
              "まだ難しさを感じている点があれば、その葛藤も含めて教えてください。",
          },
        },
        {
          id: "impact-3",
          text:
            "短期的な成果だけでなく、社員の未来のウェルビーイングにつながる投資として、今取り組んでいることは何ですか。",
          topic: "social_impact",
          followUps: {
            brief:
              "教育、キャリア形成、働き方、健康支援など、どの領域に特に投資しているのか教えてください。",
            detailed:
              "その投資が、数年後にどんな組織や社会の姿につながってほしいと考えていますか。",
            positive:
              "未来への投資と事業の競争力が、どうつながると見ているかも聞かせてください。",
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

  if (evaluation.answerQuality === "brief" && questionIndex < questions.length) {
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

  if (evaluation.answerQuality === "off_topic") {
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
