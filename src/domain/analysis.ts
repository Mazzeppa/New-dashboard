/**
 * 3단계 심층 분석의 비재무 탭(사업 이해, 경쟁우위, 경영진·지배구조) 정의.
 * 각 탭은 안내 질문(필드 목록)과 1~5점 평가로 구성된다. 답은 { [fieldKey]: 값 } JSON으로 저장한다.
 */

export type AnalysisSection = "business" | "moat" | "governance";

export type FieldDef =
  | { key: string; type: "text"; label: string; help?: string; rows?: number }
  | { key: string; type: "select"; label: string; help?: string; options: Record<string, string> }
  | { key: string; type: "multiselect"; label: string; help?: string; options: Record<string, string> }
  | { key: string; type: "percent"; label: string; help?: string };

export type FieldValue = string | string[] | number | null;
export type AnalysisAnswers = Record<string, FieldValue>;

export interface SectionDef {
  key: AnalysisSection;
  label: string;
  description: string;
  scoreLabel: string;
  fields: FieldDef[];
}

export const MOAT_TYPES = {
  switching_cost: "전환비용",
  network: "네트워크 효과",
  scale: "규모의 경제",
  intangible: "무형자산",
} as const;

export const MOAT_DIRECTIONS = { widening: "확대", stable: "유지", narrowing: "축소" } as const;

export const ANALYSIS_SECTIONS: SectionDef[] = [
  {
    key: "business",
    label: "사업 이해",
    description: "이 회사가 어떻게 돈을 버는지, 무엇이 매출과 이익을 움직이는지 이해했는가.",
    scoreLabel: "사업 이해도",
    fields: [
      { key: "who_pays", type: "text", label: "누가 돈을 내는가?", help: "최종 고객, 결제 주체, 매출 비중이 큰 고객군" },
      { key: "why_choose", type: "text", label: "고객이 왜 이 회사를 고르는가?", help: "가격, 품질, 관계, 대체 불가성 등. 고객 입장에서 써 본다" },
      {
        key: "revenue_driver",
        type: "select",
        label: "매출 동인",
        options: { price: "단가 중심", volume: "물량 중심", both: "단가와 물량 모두" },
      },
      { key: "revenue_driver_note", type: "text", label: "매출 동인 설명", help: "단가와 물량을 각각 무엇이 결정하는가", rows: 2 },
      { key: "fixed_cost_pct", type: "percent", label: "고정비 비중 (추정, %)", help: "영업 레버리지 판단용. 매출이 10% 줄면 이익은 얼마나 줄어드는가" },
      { key: "fixed_cost_note", type: "text", label: "비용 구조 설명", rows: 2 },
    ],
  },
  {
    key: "moat",
    label: "경쟁우위",
    description: "경쟁사가 이 회사의 초과이익을 빼앗지 못하는 이유가 있는가. 있다면 넓어지는가 좁아지는가.",
    scoreLabel: "해자 강도",
    fields: [
      { key: "moat_types", type: "multiselect", label: "해자 유형", options: MOAT_TYPES },
      { key: "moat_direction", type: "select", label: "해자 방향", options: MOAT_DIRECTIONS },
      { key: "moat_evidence", type: "text", label: "근거", help: "숫자로 확인되는 증거(점유율 추이, ROIC 지속성, 가격 인상력 등)", rows: 5 },
      { key: "moat_threats", type: "text", label: "해자를 무너뜨릴 수 있는 것", rows: 3 },
    ],
  },
  {
    key: "governance",
    label: "경영진·지배구조",
    description: "경영진이 소수주주의 돈을 어떻게 다뤄 왔는가.",
    scoreLabel: "경영진·지배구조",
    fields: [
      { key: "alloc_mna", type: "text", label: "자본배분 이력: M&A", rows: 2 },
      { key: "alloc_dividend", type: "text", label: "자본배분 이력: 배당", rows: 2 },
      { key: "alloc_buyback", type: "text", label: "자본배분 이력: 자사주 (매입·소각)", rows: 2 },
      { key: "alloc_issuance", type: "text", label: "자본배분 이력: 증자·CB/BW", rows: 2 },
      { key: "related_party", type: "text", label: "계열사 간 거래", help: "일감 몰아주기, 내부거래 비중, 지주사 수수료 등", rows: 3 },
      {
        key: "alignment",
        type: "select",
        label: "지배주주와 소수주주의 이해 일치",
        options: { aligned: "일치", partial: "부분 일치", conflicted: "불일치" },
      },
      { key: "alignment_note", type: "text", label: "판단 근거", rows: 3 },
    ],
  },
];

export const SCORE_LABELS: Record<number, string> = {
  1: "매우 나쁨",
  2: "나쁨",
  3: "보통",
  4: "좋음",
  5: "매우 좋음",
};

export function getSection(key: string): SectionDef | undefined {
  return ANALYSIS_SECTIONS.find((s) => s.key === key);
}

/** 정의에 없는 키를 버리고 타입에 맞지 않는 값을 정리한다 */
export function sanitizeAnswers(section: SectionDef, raw: Record<string, unknown>): AnalysisAnswers {
  const out: AnalysisAnswers = {};
  for (const f of section.fields) {
    const v = raw[f.key];
    switch (f.type) {
      case "text":
        out[f.key] = typeof v === "string" && v.trim() ? v : null;
        break;
      case "select":
        out[f.key] = typeof v === "string" && v in f.options ? v : null;
        break;
      case "multiselect":
        out[f.key] = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x in f.options) : [];
        break;
      case "percent": {
        const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
        out[f.key] = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
        break;
      }
    }
  }
  return out;
}

/** 채워진 필드 수 / 전체 필드 수 */
export function completion(section: SectionDef, answers: AnalysisAnswers | null | undefined): { filled: number; total: number } {
  const total = section.fields.length;
  if (!answers) return { filled: 0, total };
  const filled = section.fields.filter((f) => {
    const v = answers[f.key];
    return Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== "";
  }).length;
  return { filled, total };
}
