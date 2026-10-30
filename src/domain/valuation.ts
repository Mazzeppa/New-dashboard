/**
 * 4단계 가치평가 (순수 함수).
 * 금액은 거래 통화의 원 단위, 비율은 소수(0.1 = 10%)로 다룬다.
 * 입력이 덜 채워졌으면 계산 함수는 null과 이유를 돌려준다(화면에서 편집 중인 상태를 허용하기 위해).
 */
import { z } from "zod";
import type { ValueInput } from "./metrics";

export const SCENARIOS = ["bear", "base", "bull"] as const;
export type Scenario = (typeof SCENARIOS)[number];
export const SCENARIO_LABELS: Record<Scenario, string> = { bear: "비관", base: "기본", bull: "낙관" };

export const METHODS = ["dcf", "per", "ev_ebit", "nav"] as const;
export type Method = (typeof METHODS)[number];
export const METHOD_LABELS: Record<Method, string> = {
  dcf: "소유주 이익 DCF",
  per: "정상화 이익 × PER",
  ev_ebit: "정상화 EBIT × EV/EBIT",
  nav: "자산가치",
};

const num = z.number().finite().nullable();

export const dcfInputSchema = z.object({
  /** 기준 연도 소유주 이익 (회사 전체) */
  ownerEarnings: num,
  /** 예측 기간 연 성장률 */
  growth: num,
  /** 예측 기간 (년) */
  years: z.number().int().min(1).max(30).nullable(),
  discountRate: num,
  terminalGrowth: num,
});
export const perInputSchema = z.object({ normalizedEarnings: num, multiple: num });
export const evEbitInputSchema = z.object({ normalizedEbit: num, multiple: num });
export const navInputSchema = z.object({
  bookValue: num,
  adjustments: z.array(z.object({ label: z.string(), amount: z.number().finite() })).max(30),
});

export type DcfInput = z.infer<typeof dcfInputSchema>;
export type PerInput = z.infer<typeof perInputSchema>;
export type EvEbitInput = z.infer<typeof evEbitInputSchema>;
export type NavInput = z.infer<typeof navInputSchema>;

const byScenario = <T extends z.ZodTypeAny>(s: T) => z.object({ bear: s, base: s, bull: s });

export const valuationDataSchema = z
  .object({
    /** 희석 주식 수 */
    shares: num,
    /** 순현금 (현금성자산 − 차입부채). 순부채면 음수 */
    netCash: num,
    representative: z.enum(METHODS),
    probabilities: z.object({ bear: z.number().min(0).max(1), base: z.number().min(0).max(1), bull: z.number().min(0).max(1) }),
    dcf: byScenario(dcfInputSchema),
    per: byScenario(perInputSchema),
    ev_ebit: byScenario(evEbitInputSchema),
    nav: byScenario(navInputSchema),
    notes: z.string().max(10000),
  })
  .superRefine((d, ctx) => {
    const sum = d.probabilities.bear + d.probabilities.base + d.probabilities.bull;
    if (Math.abs(sum - 1) > 1e-6) ctx.addIssue({ code: "custom", path: ["probabilities"], message: `시나리오 확률 합계가 100%여야 합니다 (현재 ${Math.round(sum * 1000) / 10}%).` });
  });

export type ValuationData = z.infer<typeof valuationDataSchema>;

const emptyDcf: DcfInput = { ownerEarnings: null, growth: null, years: 10, discountRate: null, terminalGrowth: null };
const emptyPer: PerInput = { normalizedEarnings: null, multiple: null };
const emptyEv: EvEbitInput = { normalizedEbit: null, multiple: null };
const emptyNav: NavInput = { bookValue: null, adjustments: [] };

export function emptyValuation(): ValuationData {
  const triple = <T>(v: T) => ({ bear: structuredClone(v), base: structuredClone(v), bull: structuredClone(v) });
  return {
    shares: null,
    netCash: null,
    representative: "dcf",
    probabilities: { bear: 0.25, base: 0.5, bull: 0.25 },
    dcf: triple(emptyDcf),
    per: triple(emptyPer),
    ev_ebit: triple(emptyEv),
    nav: triple(emptyNav),
    notes: "",
  };
}

// ── 계산 결과 ───────────────────────────────────────────────────
export type Calc<T> = { ok: true; value: T } | { ok: false; reason: string };

const missing = (fields: string[]): Calc<never> => ({ ok: false, reason: `입력 필요: ${fields.join(", ")}` });

function need(obj: Record<string, unknown>, labels: Record<string, string>): string[] {
  return Object.entries(labels).filter(([k]) => obj[k] == null).map(([, l]) => l);
}

export interface DcfResult {
  /** 예측 기간 소유주 이익 현재가치 합계 */
  pvForecast: number;
  terminalValue: number;
  pvTerminal: number;
  enterpriseValue: number;
  equityValue: number;
  perShare: number;
  /** 기업가치 중 잔존가치 비중 */
  terminalShare: number;
}

/**
 * 소유주 이익 DCF.
 * 1~N년: OE₀ × (1+g)^t, 잔존가치: OE_N × (1+g_t) / (r − g_t). 주주가치 = 현재가치 합계 + 순현금.
 */
export function dcf(input: DcfInput, shares: number | null, netCash: number | null): Calc<DcfResult> {
  const miss = need({ ...input, shares }, {
    ownerEarnings: "소유주 이익", growth: "성장률", years: "예측 기간", discountRate: "할인율", terminalGrowth: "영구성장률", shares: "주식 수",
  });
  if (miss.length) return missing(miss);
  const { ownerEarnings: oe0, growth: g, years: n, discountRate: r, terminalGrowth: gt } = input as Required<{ [K in keyof DcfInput]: number }>;
  if (r! <= gt!) return { ok: false, reason: "할인율이 영구성장률보다 커야 합니다." };
  if (r! <= -1 || g! <= -1) return { ok: false, reason: "비율이 -100% 이하입니다." };
  if (shares! <= 0) return { ok: false, reason: "주식 수는 0보다 커야 합니다." };

  let pvForecast = 0;
  let oe = oe0!;
  for (let t = 1; t <= n!; t++) {
    oe *= 1 + g!;
    pvForecast += oe / Math.pow(1 + r!, t);
  }
  const terminalValue = (oe * (1 + gt!)) / (r! - gt!);
  const pvTerminal = terminalValue / Math.pow(1 + r!, n!);
  const enterpriseValue = pvForecast + pvTerminal;
  const equityValue = enterpriseValue + (netCash ?? 0);
  return {
    ok: true,
    value: {
      pvForecast,
      terminalValue,
      pvTerminal,
      enterpriseValue,
      equityValue,
      perShare: equityValue / shares!,
      terminalShare: enterpriseValue !== 0 ? pvTerminal / enterpriseValue : 0,
    },
  };
}

export interface SimpleResult {
  equityValue: number;
  perShare: number;
}

/** 정상화 순이익 × 목표 PER = 주주가치 */
export function perValue(input: PerInput, shares: number | null): Calc<SimpleResult> {
  const miss = need({ ...input, shares }, { normalizedEarnings: "정상화 순이익", multiple: "목표 PER", shares: "주식 수" });
  if (miss.length) return missing(miss);
  if (shares! <= 0) return { ok: false, reason: "주식 수는 0보다 커야 합니다." };
  const equityValue = input.normalizedEarnings! * input.multiple!;
  return { ok: true, value: { equityValue, perShare: equityValue / shares! } };
}

/** 정상화 EBIT × 목표 EV/EBIT = 기업가치, + 순현금 = 주주가치 */
export function evEbitValue(input: EvEbitInput, shares: number | null, netCash: number | null): Calc<SimpleResult & { enterpriseValue: number }> {
  const miss = need({ ...input, shares }, { normalizedEbit: "정상화 EBIT", multiple: "목표 EV/EBIT", shares: "주식 수" });
  if (miss.length) return missing(miss);
  if (shares! <= 0) return { ok: false, reason: "주식 수는 0보다 커야 합니다." };
  const enterpriseValue = input.normalizedEbit! * input.multiple!;
  const equityValue = enterpriseValue + (netCash ?? 0);
  return { ok: true, value: { enterpriseValue, equityValue, perShare: equityValue / shares! } };
}

/** 순자산(장부) + 조정 항목 = 조정 순자산 */
export function navValue(input: NavInput, shares: number | null): Calc<SimpleResult & { bookPerShare: number; adjustmentTotal: number }> {
  const miss = need({ ...input, shares }, { bookValue: "순자산", shares: "주식 수" });
  if (miss.length) return missing(miss);
  if (shares! <= 0) return { ok: false, reason: "주식 수는 0보다 커야 합니다." };
  const adjustmentTotal = input.adjustments.reduce((s, a) => s + a.amount, 0);
  const equityValue = input.bookValue! + adjustmentTotal;
  return { ok: true, value: { equityValue, perShare: equityValue / shares!, bookPerShare: input.bookValue! / shares!, adjustmentTotal } };
}

/** 방법·시나리오 하나의 주당 가치 */
export function methodValue(data: ValuationData, method: Method, scenario: Scenario): Calc<number> {
  const r =
    method === "dcf"
      ? dcf(data.dcf[scenario], data.shares, data.netCash)
      : method === "per"
        ? perValue(data.per[scenario], data.shares)
        : method === "ev_ebit"
          ? evEbitValue(data.ev_ebit[scenario], data.shares, data.netCash)
          : navValue(data.nav[scenario], data.shares);
  return r.ok ? { ok: true, value: r.value.perShare } : r;
}

export type ValueGrid = Record<Method, Record<Scenario, Calc<number>>>;

export function valueGrid(data: ValuationData): ValueGrid {
  return Object.fromEntries(
    METHODS.map((m) => [m, Object.fromEntries(SCENARIOS.map((s) => [s, methodValue(data, m, s)]))]),
  ) as ValueGrid;
}

export interface ValuationSummary {
  grid: ValueGrid;
  /** 대표 방법의 시나리오 확률 가중 주당 가치 */
  intrinsicValue: number | null;
  /** 대표 방법의 시나리오별 주당 가치 */
  representativeValues: Partial<Record<Scenario, number>>;
  /** 안전마진 = 1 − 현재가 / 내재가치 */
  marginOfSafety: number | null;
  /** 상승여력 = 내재가치 / 현재가 − 1 */
  upside: number | null;
  /** 비관 시나리오 하락률 = 1 − 비관 가치 / 현재가 (6단계 비중 상한에 쓰인다) */
  bearDownside: number | null;
  reason: string | null;
}

/**
 * 대표 방법의 세 시나리오가 모두 계산될 때만 가중 평균을 낸다.
 * 확률이 0인 시나리오는 비어 있어도 된다.
 */
export function summarize(data: ValuationData, price: number | null): ValuationSummary {
  const grid = valueGrid(data);
  const rep = grid[data.representative];
  const representativeValues: Partial<Record<Scenario, number>> = {};
  let weighted = 0;
  let reason: string | null = null;
  for (const s of SCENARIOS) {
    const c = rep[s];
    if (c.ok) representativeValues[s] = c.value;
    if (data.probabilities[s] === 0) continue;
    if (!c.ok) {
      reason ??= `${METHOD_LABELS[data.representative]} ${SCENARIO_LABELS[s]}: ${c.reason}`;
      continue;
    }
    weighted += c.value * data.probabilities[s];
  }
  const probSum = data.probabilities.bear + data.probabilities.base + data.probabilities.bull;
  if (!reason && Math.abs(probSum - 1) > 1e-6) reason = "시나리오 확률 합계가 100%가 아닙니다.";
  const intrinsicValue = reason ? null : weighted;
  const bear = representativeValues.bear;
  return {
    grid,
    intrinsicValue,
    representativeValues,
    marginOfSafety: intrinsicValue != null && price != null && intrinsicValue > 0 ? 1 - price / intrinsicValue : null,
    upside: intrinsicValue != null && price != null && price > 0 ? intrinsicValue / price - 1 : null,
    bearDownside: bear != null && price != null && price > 0 ? 1 - bear / price : null,
    reason,
  };
}

/** 게이트용: 대표 방법의 기본 시나리오가 계산되면 '가치평가 결과 있음' */
export function hasValuationResult(data: ValuationData): boolean {
  return methodValue(data, data.representative, "base").ok;
}

// ── 역DCF ───────────────────────────────────────────────────────
export interface ReverseDcfResult {
  impliedGrowth: number;
  iterations: number;
}

/**
 * 현재 주가에 내재된 예측 기간 성장률을 이분법으로 구한다.
 * 다른 가정(소유주 이익, 기간, 할인율, 영구성장률, 순현금, 주식 수)은 그대로 둔다.
 * 주당 가치는 성장률에 대해 단조 증가하므로 [lo, hi] 안에서 부호가 바뀌는 지점을 찾는다.
 */
export function reverseDcf(
  input: DcfInput,
  shares: number | null,
  netCash: number | null,
  price: number,
  opts: { lo?: number; hi?: number; tolerance?: number; maxIterations?: number } = {},
): Calc<ReverseDcfResult> {
  const lo0 = opts.lo ?? -0.5;
  const hi0 = opts.hi ?? 1.0;
  const tol = opts.tolerance ?? 1e-7;
  const maxIt = opts.maxIterations ?? 200;
  if (!(price > 0)) return { ok: false, reason: "현재가가 필요합니다." };
  const f = (g: number) => {
    const r = dcf({ ...input, growth: g }, shares, netCash);
    return r.ok ? r.value.perShare - price : null;
  };
  let lo = lo0;
  let hi = hi0;
  const flo = f(lo);
  const fhi = f(hi);
  if (flo == null || fhi == null) {
    const probe = dcf({ ...input, growth: 0 }, shares, netCash);
    return { ok: false, reason: probe.ok ? "계산할 수 없는 가정입니다." : probe.reason };
  }
  if (flo > 0) return { ok: false, reason: `성장률 ${Math.round(lo0 * 100)}%로도 현재가보다 가치가 높습니다 (시장이 극단적 역성장을 가정).` };
  if (fhi < 0) return { ok: false, reason: `성장률 ${Math.round(hi0 * 100)}%로도 현재가에 못 미칩니다.` };
  let it = 0;
  let mid = (lo + hi) / 2;
  while (it < maxIt && hi - lo > tol) {
    mid = (lo + hi) / 2;
    const fm = f(mid)!;
    if (fm === 0) break;
    if (fm < 0) lo = mid;
    else hi = mid;
    it++;
  }
  return { ok: true, value: { impliedGrowth: (lo + hi) / 2, iterations: it } };
}

// ── 민감도 ──────────────────────────────────────────────────────
/** 할인율 × 성장률 격자의 DCF 주당 가치 */
export function dcfSensitivity(
  input: DcfInput,
  shares: number | null,
  netCash: number | null,
  discountRates: number[],
  growthRates: number[],
): (number | null)[][] {
  return discountRates.map((r) =>
    growthRates.map((g) => {
      const res = dcf({ ...input, discountRate: r, growth: g }, shares, netCash);
      return res.ok ? res.value.perShare : null;
    }),
  );
}

// ── 재무 데이터 기반 입력 제안 ───────────────────────────────────
export interface InputSuggestions {
  /** 최근 연도 */
  year: number | null;
  ownerEarnings: number | null;
  ownerEarningsNote: string;
  netCash: number | null;
  netCashNote: string;
  shares: number | null;
  sharesNote: string;
  normalizedEarnings: number | null;
  normalizedEbit: number | null;
  normalizedNote: string;
  bookValue: number | null;
  bookValueNote: string;
}

/**
 * 저장된 재무 데이터로 입력값을 제안한다 (사용자가 버튼을 눌러야 채워진다).
 * - 소유주 이익 = 지배주주순이익 + 감가상각비 − 유지 CAPEX. 감가상각비가 없으면 영업현금흐름 − 유지 CAPEX로 대신한다.
 * - 정상화 이익·EBIT = 최근 5개 연도 평균.
 * - 순현금·순자산·주식 수 = 가장 최근 기간(분기 포함) 값.
 */
export function suggestInputs(values: ValueInput[], maintenanceCapexPct: number | null): InputSuggestions {
  const annual = values.filter((v) => v.quarter === 0);
  const years = [...new Set(annual.map((v) => v.year))].sort((a, b) => b - a);
  const latest = years[0] ?? null;
  const getA = (m: string, y: number) => annual.find((v) => v.metric === m && v.year === y)?.value ?? null;

  // 가장 최근 기간(분기 포함)의 재무상태 값
  const latestOf = (m: string) => {
    const rows = values.filter((v) => v.metric === m).sort((a, b) => b.year - a.year || (b.quarter || 5) - (a.quarter || 5));
    return rows[0] ?? null;
  };
  const label = (v: { year: number; quarter: number }) => (v.quarter ? `${v.year}Q${v.quarter}` : `${v.year}`);

  let ownerEarnings: number | null = null;
  let ownerEarningsNote = "연간 재무 데이터가 없습니다.";
  if (latest != null) {
    const ni = getA("net_income_parent", latest) ?? getA("net_income", latest);
    const da = getA("depreciation", latest);
    const capex = getA("capex", latest);
    const ocf = getA("ocf", latest);
    const maint = capex != null && maintenanceCapexPct != null ? capex * (maintenanceCapexPct / 100) : null;
    const maintNote = maintenanceCapexPct == null ? "유지 CAPEX 비율 미입력 → CAPEX 전액을 유지 CAPEX로 봄" : `유지 CAPEX = CAPEX × ${maintenanceCapexPct}%`;
    const maintUsed = maint ?? capex;
    if (ni != null && da != null && maintUsed != null) {
      ownerEarnings = ni + da - maintUsed;
      ownerEarningsNote = `${latest}년 지배주주순이익 + 감가상각비 − 유지 CAPEX (${maintNote})`;
    } else if (ocf != null && maintUsed != null) {
      ownerEarnings = ocf - maintUsed;
      ownerEarningsNote = `${latest}년 영업현금흐름 − 유지 CAPEX (감가상각비가 없어 대체, ${maintNote})`;
    } else {
      ownerEarningsNote = `${latest}년 순이익·감가상각비·영업현금흐름·CAPEX 중 필요한 값이 없습니다.`;
    }
  }

  // 순현금은 시점이 섞이지 않도록 현금성자산이 있는 가장 최근 기간 하나에서만 구한다
  const cash = latestOf("cash");
  const samePeriod = (m: string) => (cash ? values.find((v) => v.metric === m && v.year === cash.year && v.quarter === cash.quarter) ?? null : null);
  const std = samePeriod("short_term_debt");
  const ltd = samePeriod("long_term_debt");
  const netCash = cash ? cash.value - (std?.value ?? 0) - (ltd?.value ?? 0) : null;
  const missingDebt = [!std && "단기차입부채", !ltd && "장기차입부채"].filter(Boolean);

  const shares = latestOf("shares_outstanding");
  const equity = latestOf("equity_parent") ?? latestOf("total_equity");

  const recent5 = years.slice(0, 5);
  const avgOf = (m: string, fallback?: string) => {
    const xs = recent5.map((y) => getA(m, y) ?? (fallback ? getA(fallback, y) : null)).filter((x): x is number => x != null);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  };

  return {
    year: latest,
    ownerEarnings,
    ownerEarningsNote,
    netCash,
    netCashNote: cash
      ? `${label(cash)} 현금성자산 − 단기·장기 차입부채${missingDebt.length ? ` (${missingDebt.join("·")}는 이 기간에 없어 0으로 봄)` : ""}`
      : "현금성자산 데이터가 없습니다.",
    shares: shares?.value ?? null,
    sharesNote: shares ? `${label(shares)} 유통주식수 (희석 주식은 직접 반영)` : "주식 수 데이터가 없습니다.",
    normalizedEarnings: avgOf("net_income_parent", "net_income"),
    normalizedEbit: avgOf("operating_income"),
    normalizedNote: recent5.length ? `최근 ${recent5.length}개 연도(${recent5[recent5.length - 1]}~${recent5[0]}) 평균` : "연간 데이터가 없습니다.",
    bookValue: equity?.value ?? null,
    bookValueNote: equity ? `${label(equity)} 지배주주지분` : "자본 데이터가 없습니다.",
  };
}
