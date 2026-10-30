/**
 * 체크리스트 템플릿(내 프레임워크)과 점수 요약.
 * 점수는 1~5 (높을수록 투자에 유리). 질문은 "예"가 좋은 방향이 되도록 쓴다.
 */

export interface TemplateSeed {
  name: string;
  description: string;
  items: { text: string; help?: string }[];
}

export const FISHER_15: TemplateSeed = {
  name: "필립 피셔 15개 질문",
  description: "『위대한 기업에 투자하라』의 15가지 포인트. 1점(매우 부정적) ~ 5점(매우 긍정적)으로 평가한다.",
  items: [
    { text: "향후 최소 몇 년간 매출을 크게 늘릴 만한 시장 잠재력이 있는 제품이나 서비스를 가졌는가?" },
    { text: "현재 제품군의 성장 잠재력이 소진된 뒤에도 매출을 더 늘릴 신제품·공정을 계속 개발하려는 경영진의 의지가 있는가?" },
    { text: "회사 규모에 비해 연구개발 노력은 얼마나 효과적인가?" },
    { text: "평균 이상의 영업 조직을 갖추었는가?" },
    { text: "충분한 이익률을 내고 있는가?" },
    { text: "이익률을 유지하거나 개선하기 위해 무엇을 하고 있는가?" },
    { text: "노사 관계와 인사 관리가 탁월한가?" },
    { text: "경영진 사이의 관계가 탁월한가?" },
    { text: "경영진의 층이 두터운가?" },
    { text: "원가 분석과 회계 관리가 훌륭한가?" },
    { text: "경쟁사 대비 이 회사가 얼마나 뛰어난지 알려 주는, 해당 산업 특유의 다른 단서가 있는가?" },
    { text: "이익에 대해 단기가 아닌 장기적 관점을 가졌는가?" },
    {
      text: "성장에 필요한 자금을 대규모 증자 없이 조달할 수 있는가?",
      help: "원문: 성장을 위해 주식을 많이 발행해 기존 주주의 이익이 상쇄되지 않는가",
    },
    {
      text: "좋을 때뿐 아니라 문제와 실망스러운 일이 생겼을 때도 투자자에게 솔직하게 말하는가?",
    },
    { text: "경영진의 정직성에 의문의 여지가 없는가?" },
  ],
};

export interface ScoreSummary {
  answered: number;
  total: number;
  average: number | null;
  /** 2점 이하 항목 수 */
  weak: number;
}

export function summarizeScores(scores: (number | null | undefined)[]): ScoreSummary {
  const valid = scores.filter((s): s is number => typeof s === "number" && s >= 1 && s <= 5);
  return {
    answered: valid.length,
    total: scores.length,
    average: valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null,
    weak: valid.filter((s) => s <= 2).length,
  };
}
