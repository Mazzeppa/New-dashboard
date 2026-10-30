/**
 * 재무 지표 계산 (순수 함수).
 * 입력은 financial_values와 같은 긴 형식의 값 목록이고, 기간별 지표 행을 돌려준다.
 */
import { comparePeriods, periodKey, type Period } from "./financials";

export interface ValueInput {
  metric: string;
  year: number;
  quarter: number;
  value: number;
}

export interface MetricOptions {
  /** CAPEX 중 유지 CAPEX 비율 (0~100). null이면 유지/성장 구분을 하지 않는다 */
  maintenanceCapexPct?: number | null;
  /** 실효세율을 구할 수 없을 때 쓰는 세율 (0~1) */
  defaultTaxRate?: number;
}

export interface MetricRow {
  period: Period;
  key: string;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  ocf: number | null;
  capex: number | null;
  fcf: number | null;
  /** 영업현금흐름 / 순이익 (순이익이 0 이하이면 null) */
  ocfToNetIncome: number | null;
  maintenanceCapex: number | null;
  growthCapex: number | null;
  /** 영업현금흐름 − 유지 CAPEX */
  ownerFcf: number | null;
  roe: number | null;
  roic: number | null;
  /** ROIC 계산에 쓴 세율 */
  taxRate: number | null;
  investedCapital: number | null;
  /** 부채총계 / 자본총계 */
  debtRatio: number | null;
  netDebt: number | null;
  /** 순운전자본 = (유동자산 − 현금성자산) − (유동부채 − 단기차입부채) */
  nwc: number | null;
  nwcChange: number | null;
}

export const DEFAULT_TAX_RATE = 0.25;

const div = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : a / b);
const sub = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);
const sumOrNull = (...xs: (number | null)[]) => (xs.every((x) => x == null) ? null : xs.reduce<number>((s, x) => s + (x ?? 0), 0));

function previousPeriod(p: Period): Period {
  if (p.quarter === 0) return { year: p.year - 1, quarter: 0 };
  return p.quarter === 1 ? { year: p.year - 1, quarter: 4 } : { year: p.year, quarter: p.quarter - 1 };
}

/** 기초·기말 평균. 직전 기간 값이 없으면 기말 값 */
function avg(cur: number | null, prev: number | null): number | null {
  if (cur == null) return null;
  return prev == null ? cur : (cur + prev) / 2;
}

export function computeMetrics(values: ValueInput[], periodType: "annual" | "quarter", opts: MetricOptions = {}): MetricRow[] {
  const byPeriod = new Map<string, Map<string, number>>();
  const periods = new Map<string, Period>();
  for (const v of values) {
    if (periodType === "annual" ? v.quarter !== 0 : v.quarter === 0) continue;
    const p = { year: v.year, quarter: v.quarter };
    const k = periodKey(p);
    periods.set(k, p);
    if (!byPeriod.has(k)) byPeriod.set(k, new Map());
    byPeriod.get(k)!.set(v.metric, v.value);
  }

  const get = (p: Period, m: string): number | null => byPeriod.get(periodKey(p))?.get(m) ?? null;
  const annualize = periodType === "quarter" ? 4 : 1;
  const maintPct = opts.maintenanceCapexPct;
  const defaultTax = opts.defaultTaxRate ?? DEFAULT_TAX_RATE;

  const debt = (p: Period) => sumOrNull(get(p, "short_term_debt"), get(p, "long_term_debt"));
  const equity = (p: Period) => get(p, "total_equity");
  const parentEquity = (p: Period) => get(p, "equity_parent") ?? get(p, "total_equity");
  const investedCapital = (p: Period) => {
    const e = equity(p);
    if (e == null) return null;
    return e + (debt(p) ?? 0) - (get(p, "cash") ?? 0);
  };
  const nwc = (p: Period) => {
    const ca = get(p, "current_assets");
    const cl = get(p, "current_liabilities");
    if (ca == null || cl == null) return null;
    return ca - (get(p, "cash") ?? 0) - (cl - (get(p, "short_term_debt") ?? 0));
  };

  return [...periods.values()].sort(comparePeriods).map((p) => {
    const prev = previousPeriod(p);
    const revenue = get(p, "revenue");
    const oi = get(p, "operating_income");
    const ni = get(p, "net_income");
    const niParent = get(p, "net_income_parent") ?? ni;
    const ocf = get(p, "ocf");
    const capex = get(p, "capex");

    const pretax = get(p, "pretax_income");
    const tax = get(p, "income_tax");
    const effective = pretax != null && tax != null && pretax > 0 ? tax / pretax : null;
    const taxRate = effective != null && effective >= 0 && effective <= 0.5 ? effective : defaultTax;

    const ic = investedCapital(p);
    const avgIc = avg(ic, investedCapital(prev));
    const nopat = oi == null ? null : oi * (1 - taxRate);
    const avgEq = avg(parentEquity(p), parentEquity(prev));

    const maint = capex != null && maintPct != null ? capex * (maintPct / 100) : null;
    const curNwc = nwc(p);
    const prevNwc = nwc(prev);

    return {
      period: p,
      key: periodKey(p),
      revenue,
      operatingIncome: oi,
      netIncome: ni,
      operatingMargin: div(oi, revenue),
      netMargin: div(ni, revenue),
      ocf,
      capex,
      fcf: sub(ocf, capex),
      ocfToNetIncome: ni != null && ni > 0 ? div(ocf, ni) : null,
      maintenanceCapex: maint,
      growthCapex: sub(capex, maint),
      ownerFcf: sub(ocf, maint),
      roe: niParent != null && avgEq != null && avgEq > 0 ? (niParent * annualize) / avgEq : null,
      roic: nopat != null && avgIc != null && avgIc > 0 ? (nopat * annualize) / avgIc : null,
      taxRate: oi == null ? null : taxRate,
      investedCapital: ic,
      debtRatio: div(get(p, "total_liabilities"), equity(p)),
      netDebt: debt(p) == null && get(p, "cash") == null ? null : (debt(p) ?? 0) - (get(p, "cash") ?? 0),
      nwc: curNwc,
      nwcChange: sub(curNwc, prevNwc),
    };
  });
}

export interface MetricSummary {
  years: number;
  revenueCagr: number | null;
  avgOperatingMargin: number | null;
  avgRoe: number | null;
  avgRoic: number | null;
  /** 누적 영업현금흐름 / 누적 순이익 */
  cumulativeOcfToNetIncome: number | null;
  positiveFcfYears: number;
  fcfYears: number;
}

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** 최근 n개 연간 행 요약 */
export function summarizeMetrics(rows: MetricRow[], n: number): MetricSummary {
  const recent = rows.filter((r) => r.period.quarter === 0).slice(-n);
  const withRev = recent.filter((r) => r.revenue != null && r.revenue > 0);
  let cagr: number | null = null;
  if (withRev.length >= 2) {
    const first = withRev[0];
    const last = withRev[withRev.length - 1];
    const span = last.period.year - first.period.year;
    if (span > 0) cagr = Math.pow(last.revenue! / first.revenue!, 1 / span) - 1;
  }
  const both = recent.filter((r) => r.ocf != null && r.netIncome != null);
  const sumNi = both.reduce((a, r) => a + r.netIncome!, 0);
  const fcfRows = recent.filter((r) => r.fcf != null);
  return {
    years: recent.length,
    revenueCagr: cagr,
    avgOperatingMargin: mean(recent.map((r) => r.operatingMargin)),
    avgRoe: mean(recent.map((r) => r.roe)),
    avgRoic: mean(recent.map((r) => r.roic)),
    cumulativeOcfToNetIncome: sumNi > 0 ? both.reduce((a, r) => a + r.ocf!, 0) / sumNi : null,
    positiveFcfYears: fcfRows.filter((r) => r.fcf! > 0).length,
    fcfYears: fcfRows.length,
  };
}

/**
 * 누적(YTD) 값으로 분기 단독 값을 만든다. cum[1..4] = 1분기 누적, 반기 누적, 3분기 누적, 연간.
 * 직접 구한 분기 단독 값(standalone)이 있으면 그것을 우선한다.
 */
export function quarterlyFromCumulative(
  cum: Partial<Record<1 | 2 | 3 | 4, number>>,
  standalone: Partial<Record<1 | 2 | 3 | 4, number>> = {},
): Partial<Record<1 | 2 | 3 | 4, number>> {
  const out: Partial<Record<1 | 2 | 3 | 4, number>> = {};
  // c[0] = 0 (기초)
  const c: (number | undefined)[] = [0, cum[1], cum[2], cum[3], cum[4]];
  for (const q of [1, 2, 3, 4] as const) {
    const prev = c[q - 1];
    if (standalone[q] != null) {
      out[q] = standalone[q];
      if (c[q] == null && prev != null) c[q] = prev + standalone[q]!;
    } else if (c[q] != null && prev != null) {
      out[q] = c[q]! - prev;
    }
  }
  return out;
}
