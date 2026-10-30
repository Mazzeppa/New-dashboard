import { z } from "zod";

export const INVESTMENT_STYLES = {
  deep_value: "딥밸류",
  quality: "퀄리티",
  special_situation: "특수상황",
} as const;
export type InvestmentStyle = keyof typeof INVESTMENT_STYLES;

export const convictionBandSchema = z.object({
  level: z.number().int().min(1).max(5),
  /** 비중 상한 대비 비율(%) */
  minPct: z.number().min(0).max(100),
  maxPct: z.number().min(0).max(100),
});
export type ConvictionBand = z.infer<typeof convictionBandSchema>;

export const DEFAULT_CONVICTION_BANDS: ConvictionBand[] = [1, 2, 3, 4, 5].map((level) => ({
  level,
  minPct: (level - 1) * 20,
  maxPct: level * 20,
}));

export const principlesSchema = z
  .object({
    styles: z
      .array(
        z.object({
          style: z.enum(["deep_value", "quality", "special_situation"]),
          weight: z.number().min(0).max(100),
        }),
      )
      .min(1, "투자 스타일을 하나 이상 선택하세요."),
    industries: z.array(z.string().trim().min(1)),
    leveragePolicy: z.string(),
    maxPositionPct: z.number().gt(0, "0보다 커야 합니다.").max(100),
    maxIndustryPct: z.number().gt(0, "0보다 커야 합니다.").max(100),
    maxLossPerPositionPct: z.number().gt(0, "0보다 커야 합니다.").max(100),
    convictionBands: z.array(convictionBandSchema).length(5),
    /** 서술형 원칙 조항. 복기의 교훈이 여기에 추가된다 */
    rules: z.array(z.string().trim().min(1)),
  })
  .superRefine((p, ctx) => {
    const sum = p.styles.reduce((a, s) => a + s.weight, 0);
    if (Math.abs(sum - 100) > 0.01) {
      ctx.addIssue({ code: "custom", path: ["styles"], message: `스타일 비중 합계가 100%여야 합니다 (현재 ${sum}%).` });
    }
    if (p.maxPositionPct > p.maxIndustryPct) {
      ctx.addIssue({ code: "custom", path: ["maxPositionPct"], message: "종목당 최대 비중이 산업당 최대 비중보다 큽니다." });
    }
    for (const b of p.convictionBands) {
      if (b.minPct > b.maxPct) {
        ctx.addIssue({ code: "custom", path: ["convictionBands"], message: `확신도 ${b.level}의 하한이 상한보다 큽니다.` });
      }
    }
  });

export type Principles = z.infer<typeof principlesSchema>;

export const DEFAULT_PRINCIPLES: Principles = {
  styles: [{ style: "quality", weight: 100 }],
  industries: [],
  leveragePolicy: "레버리지를 쓰지 않는다.",
  maxPositionPct: 15,
  maxIndustryPct: 30,
  maxLossPerPositionPct: 2,
  convictionBands: DEFAULT_CONVICTION_BANDS,
  rules: [],
};

/** 두 원칙 사이에서 바뀐 항목 이름 목록 (버전 이력 표시용) */
export function diffPrinciples(a: Principles, b: Principles): string[] {
  const labels: Record<keyof Principles, string> = {
    styles: "투자 스타일",
    industries: "능력의 범위",
    leveragePolicy: "레버리지 정책",
    maxPositionPct: "종목당 최대 비중",
    maxIndustryPct: "산업당 최대 비중",
    maxLossPerPositionPct: "종목당 허용 최대 손실",
    convictionBands: "확신도별 권장 범위",
    rules: "원칙 조항",
  };
  return (Object.keys(labels) as (keyof Principles)[])
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map((k) => labels[k]);
}
