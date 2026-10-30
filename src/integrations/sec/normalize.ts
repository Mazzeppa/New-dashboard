/**
 * SEC EDGAR companyfacts 정규화 (순수 함수).
 *
 * - 회계연도는 10-K의 연간(350~380일) 사실에서 시작·종료일을 얻는다. 표시 연도는 종료일의 연도다.
 * - 진행 중인 회계연도는 직전 결산일 다음 날을 시작으로 추정한다.
 * - 분기 손익·현금흐름은 3개월 값이 있으면 그것을, 없으면 누적(YTD) 값의 차이로 구한다. 4분기 = 연간 − 3분기 누적.
 * - 같은 기간 값이 여러 번 보고되면 가장 먼저 제출된 값(최초 보고치)을 쓴다.
 * - 같은 계정이라도 시기에 따라 다른 태그를 쓰므로(예: Revenues → RevenueFromContract…) 기간마다 태그 우선순위를 적용한다.
 */
import { quarterlyFromCumulative } from "@/domain/metrics";

export interface SecFact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number | null;
  fp?: string | null;
  form: string;
  filed: string;
  frame?: string;
}

export interface CompanyFacts {
  cik?: number;
  entityName?: string;
  facts: Record<string, Record<string, { units: Record<string, SecFact[]> }>>;
}

interface SecMetricMap {
  kind: "flow" | "instant";
  /** 구성요소마다 대체 태그 목록(앞이 우선). 여러 구성요소는 더한다 */
  components: string[][];
  abs?: boolean;
}

export const SEC_MAPPING: Record<string, SecMetricMap> = {
  revenue: {
    kind: "flow",
    components: [["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax"]],
  },
  gross_profit: { kind: "flow", components: [["GrossProfit"]] },
  operating_income: { kind: "flow", components: [["OperatingIncomeLoss"]] },
  interest_expense: { kind: "flow", components: [["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt"]] },
  pretax_income: {
    kind: "flow",
    components: [[
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
      "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    ]],
  },
  income_tax: { kind: "flow", components: [["IncomeTaxExpenseBenefit"]] },
  net_income: { kind: "flow", components: [["ProfitLoss", "NetIncomeLoss"]] },
  net_income_parent: { kind: "flow", components: [["NetIncomeLoss"]] },
  depreciation: { kind: "flow", components: [["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "DepreciationAmortizationAndAccretionNet"]] },

  total_assets: { kind: "instant", components: [["Assets"]] },
  current_assets: { kind: "instant", components: [["AssetsCurrent"]] },
  cash: {
    kind: "instant",
    components: [["CashAndCashEquivalentsAtCarryingValue"], ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"]],
  },
  receivables: { kind: "instant", components: [["AccountsReceivableNetCurrent"]] },
  inventories: { kind: "instant", components: [["InventoryNet"]] },
  total_liabilities: { kind: "instant", components: [["Liabilities"]] },
  current_liabilities: { kind: "instant", components: [["LiabilitiesCurrent"]] },
  short_term_debt: { kind: "instant", components: [["LongTermDebtCurrent"], ["ShortTermBorrowings"], ["CommercialPaper"]] },
  long_term_debt: { kind: "instant", components: [["LongTermDebtNoncurrent"]] },
  total_equity: { kind: "instant", components: [["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "StockholdersEquity"]] },
  equity_parent: { kind: "instant", components: [["StockholdersEquity"]] },

  ocf: { kind: "flow", components: [["NetCashProvidedByUsedInOperatingActivities"]] },
  capex: { kind: "flow", abs: true, components: [["PaymentsToAcquirePropertyPlantAndEquipment"]] },
  dividends_paid: { kind: "flow", abs: true, components: [["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"]] },
  buyback: { kind: "flow", abs: true, components: [["PaymentsForRepurchaseOfCommonStock"]] },
};

const DAY = 86_400_000;
const t = (d: string) => Date.parse(d + "T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const days = (a: string, b: string) => Math.round((t(b) - t(a)) / DAY);
const near = (a: string, b: string, tol = 10) => Math.abs(days(a, b)) <= tol;

function addMonths(d: string, n: number): string {
  const x = new Date(t(d));
  x.setUTCMonth(x.getUTCMonth() + n);
  return iso(x.getTime());
}

export interface FiscalYear {
  label: number;
  start: string;
  end: string;
  /** 진행 중(연간 값 미확정) */
  inProgress: boolean;
}

export interface SecValue {
  metric: string;
  year: number;
  quarter: number;
  value: number;
  ref: string;
}

function usd(facts: CompanyFacts, tag: string): SecFact[] {
  return facts.facts["us-gaap"]?.[tag]?.units?.USD ?? [];
}

/** 같은 기간 중복 보고 → 가장 먼저 제출된 값 */
function earliest(fs: SecFact[]): SecFact | undefined {
  return fs.reduce<SecFact | undefined>((best, f) => (!best || f.filed < best.filed ? f : best), undefined);
}

export function fiscalYears(facts: CompanyFacts): FiscalYear[] {
  const probe = ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "NetIncomeLoss", "NetCashProvidedByUsedInOperatingActivities", "OperatingIncomeLoss"];
  const byEnd = new Map<string, string>();
  let latestEnd = "";
  for (const tag of probe) {
    for (const f of usd(facts, tag)) {
      if (f.end > latestEnd) latestEnd = f.end;
      if (!f.start || !f.form.startsWith("10-K")) continue;
      const len = days(f.start, f.end);
      if (len >= 350 && len <= 380 && !byEnd.has(f.end)) byEnd.set(f.end, f.start);
    }
  }
  const years = [...byEnd.entries()]
    .map(([end, start]) => ({ label: new Date(t(end)).getUTCFullYear(), start, end, inProgress: false }))
    .sort((a, b) => (a.end < b.end ? -1 : 1));
  // 같은 표시 연도가 둘이면(결산월 변경) 나중 것을 쓴다
  const dedup = years.filter((y, i) => !years.slice(i + 1).some((z) => z.label === y.label));
  const last = dedup[dedup.length - 1];
  if (last && latestEnd > last.end) {
    const start = iso(t(last.end) + DAY);
    const end = iso(t(addMonths(start, 12)) - DAY);
    dedup.push({ label: new Date(t(end)).getUTCFullYear(), start, end, inProgress: true });
  }
  return dedup;
}

function quarterEnd(fy: FiscalYear, k: number): string {
  return k === 4 ? fy.end : iso(t(addMonths(fy.start, 3 * k)) - DAY);
}

/** 한 태그로 회계연도의 연간·분기 값을 구한다 */
function flowForTag(fs: SecFact[], fy: FiscalYear): { annual?: number; quarters: Partial<Record<1 | 2 | 3 | 4, number>> } {
  const durations = fs.filter((f) => f.start);
  const cum: Partial<Record<1 | 2 | 3 | 4, number>> = {};
  const standalone: Partial<Record<1 | 2 | 3 | 4, number>> = {};
  for (const k of [1, 2, 3, 4] as const) {
    const qEnd = quarterEnd(fy, k);
    const ytd = earliest(durations.filter((f) => near(f.start!, fy.start) && near(f.end, qEnd)));
    if (ytd) cum[k] = ytd.val;
    const qStart = k === 1 ? fy.start : iso(t(quarterEnd(fy, k - 1)) + DAY);
    const three = earliest(durations.filter((f) => near(f.end, qEnd) && near(f.start!, qStart) && days(f.start!, f.end) >= 80 && days(f.start!, f.end) <= 100));
    if (three) standalone[k] = three.val;
  }
  const annual = fy.inProgress ? undefined : earliest(durations.filter((f) => near(f.start!, fy.start) && near(f.end, fy.end) && f.form.startsWith("10-K")))?.val;
  if (annual != null) cum[4] = annual;
  return { annual, quarters: quarterlyFromCumulative(cum, standalone) };
}

function instantForTag(fs: SecFact[], date: string): number | undefined {
  return earliest(fs.filter((f) => !f.start && near(f.end, date)))?.val;
}

export interface NormalizeOptions {
  annualYears?: number;
  quarters?: number;
}

export function normalizeCompanyFacts(facts: CompanyFacts, opts: NormalizeOptions = {}): { values: SecValue[]; fiscalYears: FiscalYear[] } {
  const fys = fiscalYears(facts);
  const values: SecValue[] = [];

  for (const [metric, map] of Object.entries(SEC_MAPPING)) {
    for (const fy of fys) {
      // 기간(연간 + 4개 분기)별로 구성요소 합계를 낸다
      const slots: { quarter: number; parts: { v: number; tag: string }[] }[] = [0, 1, 2, 3, 4].map((q) => ({ quarter: q, parts: [] }));
      for (const alternatives of map.components) {
        const filled = new Set<number>();
        for (const tag of alternatives) {
          const fs = usd(facts, tag);
          if (!fs.length) continue;
          if (map.kind === "flow") {
            const r = flowForTag(fs, fy);
            if (r.annual != null && !filled.has(0)) {
              slots[0].parts.push({ v: r.annual, tag });
              filled.add(0);
            }
            for (const q of [1, 2, 3, 4] as const) {
              if (r.quarters[q] != null && !filled.has(q)) {
                slots[q].parts.push({ v: r.quarters[q]!, tag });
                filled.add(q);
              }
            }
          } else {
            for (const q of [0, 1, 2, 3, 4]) {
              if (filled.has(q) || (q === 0 && fy.inProgress)) continue;
              const v = instantForTag(fs, quarterEnd(fy, q === 0 ? 4 : q));
              if (v != null) {
                slots[q].parts.push({ v, tag });
                filled.add(q);
              }
            }
          }
        }
      }
      for (const s of slots) {
        if (!s.parts.length) continue;
        const v = s.parts.reduce((a, p) => a + (map.abs ? Math.abs(p.v) : p.v), 0);
        values.push({ metric, year: fy.label, quarter: s.quarter, value: v, ref: `us-gaap:${s.parts.map((p) => p.tag).join("+")}` });
      }
    }
  }

  // 유통주식수: 표지(dei)의 기준일과 가장 가까운 직전 기간에 붙인다
  const shares = facts.facts.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? [];
  const periodEnds = fys.flatMap((fy) =>
    [1, 2, 3, 4].map((k) => ({ year: fy.label, quarter: k, end: quarterEnd(fy, k) })).concat(fy.inProgress ? [] : [{ year: fy.label, quarter: 0, end: fy.end }]),
  );
  const sharesBy = new Map<string, { v: number; date: string }>();
  for (const f of shares) {
    const candidates = periodEnds.filter((p) => p.end <= f.end && days(p.end, f.end) <= 120);
    if (!candidates.length) continue;
    const latest = candidates.reduce((a, b) => (b.end > a.end ? b : a)).end;
    for (const p of candidates.filter((c) => c.end === latest)) {
      const k = `${p.year}|${p.quarter}`;
      const prev = sharesBy.get(k);
      if (!prev || f.end < prev.date) sharesBy.set(k, { v: f.val, date: f.end });
    }
  }
  for (const [k, s] of sharesBy) {
    const [year, quarter] = k.split("|").map(Number);
    values.push({ metric: "shares_outstanding", year, quarter, value: s.v, ref: `dei:EntityCommonStockSharesOutstanding (${s.date})` });
  }

  // 최근 N개 연도 / N개 분기로 제한
  const annualYears = opts.annualYears ?? 10;
  const quarterCount = opts.quarters ?? 12;
  const yearsWithData = [...new Set(values.filter((v) => v.quarter === 0).map((v) => v.year))].sort((a, b) => b - a).slice(0, annualYears);
  const qKeys = [...new Set(values.filter((v) => v.quarter > 0 && v.metric !== "shares_outstanding").map((v) => v.year * 10 + v.quarter))]
    .sort((a, b) => b - a)
    .slice(0, quarterCount);
  return {
    values: values.filter((v) => (v.quarter === 0 ? yearsWithData.includes(v.year) : qKeys.includes(v.year * 10 + v.quarter))),
    fiscalYears: fys,
  };
}
