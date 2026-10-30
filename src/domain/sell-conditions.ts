/**
 * 7단계 매도 조건 자동 평가 (순수 함수).
 * 구조화된 조건은 최신 재무 데이터의 최근 N개 연속 기간이 모두 조건을 만족하면 '충족'이다.
 * 분기 조건인데 분기 데이터가 없으면 '수동 확인 필요', 서술형 조건도 '수동 확인 필요'다.
 */
import { formatAmount, formatNumber, formatRatio } from "./format";
import { periodKey, type Period } from "./financials";
import { describeCondition, SELL_METRICS, type Operator, type SellCondition } from "./memo";
import { computeMetrics, type MetricRow, type ValueInput } from "./metrics";

export type ConditionStatus = "triggered" | "clear" | "manual" | "insufficient";

export const CONDITION_STATUS_LABELS: Record<ConditionStatus, string> = {
  triggered: "조건 충족 (매도 검토)",
  clear: "미충족",
  manual: "수동 확인 필요",
  insufficient: "데이터 부족",
};

export interface ConditionEvaluation {
  description: string;
  status: ConditionStatus;
  detail: string;
  observations: { period: string; value: number | null }[];
}

export function compare(v: number, op: Operator, t: number): boolean {
  switch (op) {
    case "<": return v < t;
    case "<=": return v <= t;
    case ">": return v > t;
    case ">=": return v >= t;
  }
}

function prevPeriod(p: Period): Period {
  if (p.quarter === 0) return { year: p.year - 1, quarter: 0 };
  return p.quarter === 1 ? { year: p.year - 1, quarter: 4 } : { year: p.year, quarter: p.quarter - 1 };
}

/** 지표 값. 매출 성장률은 전년 동기 대비로 따로 계산한다 */
function metricValue(rows: Map<string, MetricRow>, p: Period, metric: SellCondition & { type: "structured" }): number | null {
  const row = rows.get(periodKey(p));
  if (metric.metric === "revenueGrowth") {
    const prior = rows.get(periodKey({ year: p.year - 1, quarter: p.quarter }));
    if (!row?.revenue || !prior?.revenue || prior.revenue <= 0) return null;
    return row.revenue / prior.revenue - 1;
  }
  if (!row) return null;
  const v = row[metric.metric as keyof MetricRow];
  return typeof v === "number" ? v : null;
}

export function formatMetricValue(metric: keyof typeof SELL_METRICS, v: number | null, currency: string): string {
  if (v == null) return "-";
  const kind = SELL_METRICS[metric].kind;
  return kind === "ratio" ? formatRatio(v) : kind === "multiple" ? `${formatNumber(v, 2)}배` : formatAmount(v, currency);
}

export function evaluateSellCondition(
  c: SellCondition,
  values: ValueInput[],
  currency: string,
  opts: { maintenanceCapexPct?: number | null } = {},
): ConditionEvaluation {
  const description = describeCondition(c, currency);
  if (c.type === "text") return { description, status: "manual", detail: "서술형 조건은 직접 판단합니다.", observations: [] };

  const rows = computeMetrics(values, c.periodType, { maintenanceCapexPct: opts.maintenanceCapexPct });
  if (!rows.length) {
    return c.periodType === "quarter"
      ? { description, status: "manual", detail: "분기 재무 데이터가 없어 수동 확인이 필요합니다.", observations: [] }
      : { description, status: "insufficient", detail: "연간 재무 데이터가 없습니다.", observations: [] };
  }
  const byKey = new Map(rows.map((r) => [r.key, r]));
  // 지표 값이 있는 가장 최근 기간부터 거꾸로 N개 연속 기간
  const latest = [...rows].reverse().find((r) => metricValue(byKey, r.period, c) != null);
  if (!latest) return { description, status: "insufficient", detail: `${SELL_METRICS[c.metric].label}을(를) 계산할 데이터가 없습니다.`, observations: [] };

  const periods: Period[] = [latest.period];
  while (periods.length < c.periods) periods.unshift(prevPeriod(periods[0]));
  const observations = periods.map((p) => ({ period: periodKey(p), value: metricValue(byKey, p, c) }));
  const shown = observations.map((o) => `${o.period} ${formatMetricValue(c.metric, o.value, currency)}`).join(", ");

  const missing = observations.filter((o) => o.value == null);
  if (missing.length) {
    return {
      description,
      status: c.periodType === "quarter" ? "manual" : "insufficient",
      detail: `${missing.map((o) => o.period).join(", ")} 데이터가 없어 판정할 수 없습니다 (${shown}).`,
      observations,
    };
  }
  const hits = observations.filter((o) => compare(o.value!, c.operator, c.threshold)).length;
  const triggered = hits === observations.length;
  return {
    description,
    status: triggered ? "triggered" : "clear",
    detail: triggered ? `최근 ${c.periods}기 모두 충족: ${shown}` : `최근 ${c.periods}기 중 ${hits}기 충족: ${shown}`,
    observations,
  };
}
