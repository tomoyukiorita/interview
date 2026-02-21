import type {
  InterviewScenario,
  InterviewTopic,
  BranchDecision,
  Sentiment,
} from "./types";

const generalInterview: InterviewScenario = {
  id: "general",
  title: "一般インタビュー",
  description: "幅広いトピックをカバーする標準的なインタビュー",
  topics: [
    {
      id: "icebreak",
      name: "アイスブレイク",
      questions: [
        {
          id: "ice-1",
          text: "まず簡単に自己紹介をお願いできますか？",
          topic: "icebreak",
          followUps: {
            brief: "もう少し詳しくお聞かせいただけますか？例えば、最近取り組んでいることなど。",
            detailed: "ありがとうございます。それでは本題に入りましょう。",
          },
        },
        {
          id: "ice-2",
          text: "今日のインタビューに期待していることはありますか？",
          topic: "icebreak",
          followUps: {
            positive: "素晴らしいですね。ぜひお話を聞かせてください。",
            neutral: "かしこまりました。リラックスしてお話しいただければと思います。",
          },
        },
      ],
    },
    {
      id: "experience",
      name: "経験・スキル",
      questions: [
        {
          id: "exp-1",
          text: "これまでのご経験の中で、最も挑戦的だったプロジェクトについて教えてください。",
          topic: "experience",
          followUps: {
            brief: "そのプロジェクトで具体的にどのような役割を果たしましたか？",
            detailed: "その経験から何を学びましたか？",
            off_topic: "プロジェクトの規模感や期間について教えていただけますか？",
          },
        },
        {
          id: "exp-2",
          text: "チームで仕事をする際に、大切にしていることは何ですか？",
          topic: "experience",
          followUps: {
            brief: "具体的なエピソードがあれば教えてください。",
            detailed: "その価値観が実際に役立ったケースはありますか？",
          },
        },
        {
          id: "exp-3",
          text: "直近で新しく身につけたスキルや知識はありますか？",
          topic: "experience",
          followUps: {
            positive: "どのように学習しましたか？",
            negative: "今後学んでみたい分野はありますか？",
          },
        },
      ],
    },
    {
      id: "technical",
      name: "技術的深掘り",
      questions: [
        {
          id: "tech-1",
          text: "普段の開発で使っている技術スタックについて教えてください。",
          topic: "technical",
          followUps: {
            brief: "その中で最も得意なものはどれですか？",
            detailed: "その技術を選んだ理由は何ですか？",
          },
        },
        {
          id: "tech-2",
          text: "技術的に難しい問題を解決した経験を教えてください。",
          topic: "technical",
          followUps: {
            brief: "どのようなアプローチで解決しましたか？",
            detailed: "その解決策を他の場面で応用したことはありますか？",
            off_topic: "日常の開発で困ることはどんなことがありますか？",
          },
        },
        {
          id: "tech-3",
          text: "コードの品質を保つために実践していることはありますか？",
          topic: "technical",
          followUps: {
            brief: "具体的なツールやプラクティスはありますか？",
            detailed: "チーム全体でそれを浸透させるためにどうしていますか？",
          },
        },
      ],
    },
    {
      id: "behavioral",
      name: "行動・人物面",
      questions: [
        {
          id: "beh-1",
          text: "困難な状況に直面したとき、どのように対処しますか？",
          topic: "behavioral",
          followUps: {
            brief: "最近そのような状況はありましたか？",
            detailed: "その結果はどうでしたか？",
          },
        },
        {
          id: "beh-2",
          text: "チームメンバーと意見が対立したとき、どのように解決しましたか？",
          topic: "behavioral",
          followUps: {
            brief: "具体的なシチュエーションを教えてください。",
            detailed: "振り返って、別のアプローチも考えられましたか？",
            negative: "対立を避けるために普段から心がけていることはありますか？",
          },
        },
        {
          id: "beh-3",
          text: "自分の弱みだと感じているところと、それにどう向き合っているか教えてください。",
          topic: "behavioral",
          followUps: {
            brief: "それを改善するために何か取り組んでいることはありますか？",
            detailed: "その自己認識が仕事にどう影響していますか？",
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
          text: "最後に、何か質問や伝えておきたいことはありますか？",
          topic: "closing",
          followUps: {
            positive: "ぜひお答えしますね。",
            neutral: "かしこまりました。本日はありがとうございました。",
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
      reason: "全てのトピックが完了しました",
      shouldHandoff: true,
      handoffTarget: "closing",
    };
  }

  const currentTopic = topics[topicIndex];
  const questions = currentTopic.questions;

  if (evaluation.answerQuality === "brief" && questionIndex < questions.length) {
    const currentQ = questions[questionIndex];
    const followUp = currentQ.followUps["brief"] || currentQ.followUps[Object.keys(currentQ.followUps)[0]];
    return {
      nextQuestionId: currentQ.id,
      reason: `回答が短いため、フォローアップ: ${followUp}`,
      shouldHandoff: false,
    };
  }

  if (evaluation.answerQuality === "off_topic") {
    const currentQ = questions[questionIndex];
    const followUp = currentQ.followUps["off_topic"] || currentQ.followUps[Object.keys(currentQ.followUps)[0]];
    return {
      nextQuestionId: currentQ.id,
      reason: `話題がそれたため、軌道修正: ${followUp}`,
      shouldHandoff: false,
    };
  }

  const nextQIndex = questionIndex + 1;
  if (nextQIndex < questions.length && !evaluation.topicCovered) {
    return {
      nextQuestionId: questions[nextQIndex].id,
      reason: "トピック内の次の質問に進みます",
      shouldHandoff: false,
    };
  }

  const nextTopicIndex = topicIndex + 1;
  if (nextTopicIndex < topics.length) {
    const nextTopic = topics[nextTopicIndex];

    if (
      nextTopic.id === "technical" &&
      evaluation.sentiment === "negative"
    ) {
      return {
        nextQuestionId: nextTopic.questions[0].id,
        reason: "回答者がナーバスなため、技術的な質問は慎重に進めます",
        suggestedTopic: nextTopic.id,
        shouldHandoff: true,
        handoffTarget: "TechnicalTopicAgent",
      };
    }

    if (nextTopic.id === "behavioral") {
      return {
        nextQuestionId: nextTopic.questions[0].id,
        reason: "行動面の質問に移行します",
        suggestedTopic: nextTopic.id,
        shouldHandoff: true,
        handoffTarget: "BehavioralTopicAgent",
      };
    }

    return {
      nextQuestionId: nextTopic.questions[0].id,
      reason: `次のトピック「${nextTopic.name}」に移ります`,
      suggestedTopic: nextTopic.id,
      shouldHandoff: false,
    };
  }

  return {
    nextQuestionId: "end",
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
