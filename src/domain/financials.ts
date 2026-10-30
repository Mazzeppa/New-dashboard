/**
 * 재무 데이터 표준 계정과 입력 파싱.
 * 값은 거래 통화의 원 단위(1원, 1달러), 주식 수는 주 단위로 저장한다.
 * 기간은 (회계연도, 분기)로 표현하며 분기 0은 연간이다.
 */

export type MetricKind = "money" | "shares";
export type MetricGroup = "is" | "bs" | "cf" | "share";

export interface MetricDef {
  key: string;
  label: string;
  group: MetricGroup;
  kind: MetricKind;
  /** CSV 붙여넣기 때 인식할 다른 이름들 */
  aliases?: string[];
  help?: string;
}

export const METRIC_GROUPS: Record<MetricGroup, string> = {
  is: "손익계산서",
  bs: "재무상태표",
  cf: "현금흐름표",
  share: "주식",
};

export const METRICS: MetricDef[] = [
  { key: "revenue", label: "매출액", group: "is", kind: "money", aliases: ["매출", "영업수익", "수익", "revenue", "sales", "Revenues"] },
  { key: "gross_profit", label: "매출총이익", group: "is", kind: "money", aliases: ["gross profit"] },
  { key: "operating_income", label: "영업이익", group: "is", kind: "money", aliases: ["영업이익(손실)", "operating income", "EBIT"] },
  { key: "interest_expense", label: "이자비용", group: "is", kind: "money", aliases: ["interest expense"] },
  { key: "pretax_income", label: "법인세차감전순이익", group: "is", kind: "money", aliases: ["법인세비용차감전순이익", "세전이익", "pretax income"] },
  { key: "income_tax", label: "법인세비용", group: "is", kind: "money", aliases: ["income tax"] },
  { key: "net_income", label: "당기순이익", group: "is", kind: "money", aliases: ["순이익", "당기순이익(손실)", "net income"] },
  { key: "net_income_parent", label: "지배주주순이익", group: "is", kind: "money", aliases: ["지배기업 소유주지분 순이익", "지배주주 순이익", "net income attributable"] },
  { key: "depreciation", label: "감가상각비(D&A)", group: "is", kind: "money", aliases: ["감가상각비", "감가상각", "D&A", "depreciation"] },

  { key: "total_assets", label: "자산총계", group: "bs", kind: "money", aliases: ["총자산", "total assets"] },
  { key: "current_assets", label: "유동자산", group: "bs", kind: "money", aliases: ["current assets"] },
  { key: "cash", label: "현금성자산", group: "bs", kind: "money", aliases: ["현금및현금성자산", "현금", "cash"], help: "현금및현금성자산 + 단기금융상품" },
  { key: "receivables", label: "매출채권", group: "bs", kind: "money", aliases: ["receivables"] },
  { key: "inventories", label: "재고자산", group: "bs", kind: "money", aliases: ["재고", "inventory", "inventories"] },
  { key: "total_liabilities", label: "부채총계", group: "bs", kind: "money", aliases: ["총부채", "total liabilities"] },
  { key: "current_liabilities", label: "유동부채", group: "bs", kind: "money", aliases: ["current liabilities"] },
  { key: "short_term_debt", label: "단기차입부채", group: "bs", kind: "money", aliases: ["단기차입금", "short-term debt"], help: "단기차입금 + 유동성장기부채 + 유동 사채·리스부채" },
  { key: "long_term_debt", label: "장기차입부채", group: "bs", kind: "money", aliases: ["장기차입금", "long-term debt"], help: "장기차입금 + 사채 + 비유동 리스부채" },
  { key: "total_equity", label: "자본총계", group: "bs", kind: "money", aliases: ["총자본", "자본", "total equity"] },
  { key: "equity_parent", label: "지배주주지분", group: "bs", kind: "money", aliases: ["지배기업 소유주지분", "지배주주자본"] },

  { key: "ocf", label: "영업활동현금흐름", group: "cf", kind: "money", aliases: ["영업현금흐름", "영업활동으로인한현금흐름", "operating cash flow", "OCF"] },
  { key: "capex", label: "CAPEX", group: "cf", kind: "money", aliases: ["유형자산의 취득", "유형자산취득", "설비투자", "capital expenditure"], help: "양수로 입력 (유형·무형자산 취득액)" },
  { key: "dividends_paid", label: "배당금 지급", group: "cf", kind: "money", aliases: ["배당금지급", "배당금의 지급", "dividends paid"], help: "양수로 입력" },
  { key: "buyback", label: "자사주 매입", group: "cf", kind: "money", aliases: ["자기주식의 취득", "자기주식취득", "buyback", "repurchase"], help: "양수로 입력" },

  { key: "shares_outstanding", label: "유통주식수", group: "share", kind: "shares", aliases: ["발행주식수", "주식수", "shares outstanding", "shares"], help: "자기주식 제외, 주 단위" },
];

const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m]));

export function getMetric(key: string): MetricDef | undefined {
  return METRIC_BY_KEY.get(key);
}

export const FINANCIAL_SOURCES = {
  dart: "DART",
  sec: "SEC",
  report: "보고서",
  manual: "수동",
} as const;
export type FinancialSource = keyof typeof FINANCIAL_SOURCES;

// ── 단위 ───────────────────────────────────────────────────────
export interface UnitDef {
  key: string;
  label: string;
  multiplier: number;
}

export function unitsFor(currency: string): UnitDef[] {
  if (currency === "KRW") {
    return [
      { key: "eok", label: "억원", multiplier: 1e8 },
      { key: "mil", label: "백만원", multiplier: 1e6 },
      { key: "thou", label: "천원", multiplier: 1e3 },
      { key: "one", label: "원", multiplier: 1 },
    ];
  }
  return [
    { key: "M", label: `${currency} 백만 (M)`, multiplier: 1e6 },
    { key: "K", label: `${currency} 천 (K)`, multiplier: 1e3 },
    { key: "B", label: `${currency} 십억 (B)`, multiplier: 1e9 },
    { key: "one", label: currency, multiplier: 1 },
  ];
}

// ── 기간 ───────────────────────────────────────────────────────
export interface Period {
  year: number;
  /** 0 = 연간, 1~4 = 분기 */
  quarter: number;
}

export function periodKey(p: Period): string {
  return p.quarter ? `${p.year}Q${p.quarter}` : String(p.year);
}

export function comparePeriods(a: Period, b: Period): number {
  return a.year - b.year || a.quarter - b.quarter;
}

/**
 * "2023", "FY2023", "2023년", "2023Q1", "2023 1Q", "2023.1Q", "1Q23", "1Q2023", "2023-Q1" 등을 해석한다.
 * "2023/12"처럼 연월만 있는 헤더는 자료에 따라 연간(결산월)일 수도 분기일 수도 있으므로 monthMode로 정한다.
 */
export function parsePeriod(raw: string, monthMode: "annual" | "quarter" = "annual"): Period | null {
  const s = raw.trim().toUpperCase().replace(/\s+/g, "").replace(/년$/, "");
  const fixYear = (y: string) => {
    const n = Number(y);
    return y.length === 2 ? 2000 + n : n;
  };
  let m = /^(?:FY)?(\d{4})(?:\(?A\)?)?$/.exec(s);
  if (m) return valid({ year: fixYear(m[1]), quarter: 0 });
  m = /^(\d{4})[-./]?Q([1-4])$/.exec(s) ?? /^(\d{4})[-./]?([1-4])Q$/.exec(s);
  if (m) return valid({ year: fixYear(m[1]), quarter: Number(m[2]) });
  m = /^([1-4])Q[-./']?(\d{2}|\d{4})$/.exec(s) ?? /^Q([1-4])[-./']?(\d{2}|\d{4})$/.exec(s);
  if (m) return valid({ year: fixYear(m[2]), quarter: Number(m[1]) });
  m = /^(\d{4})[-./](0?[1-9]|1[0-2])$/.exec(s);
  if (m) {
    const month = Number(m[2]);
    if (monthMode === "annual") return valid({ year: Number(m[1]), quarter: 0 });
    if (month % 3 === 0) return valid({ year: Number(m[1]), quarter: month / 3 });
  }
  return null;
}

function valid(p: Period): Period | null {
  return p.year >= 1980 && p.year <= 2100 ? p : null;
}

// ── 숫자 ───────────────────────────────────────────────────────
/**
 * 재무제표 숫자 해석. "1,234", "(1,234)" → -1234, "△1,234"/"▲" → -1234, "-"·"" → null
 */
export function parseFinancialNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim().replace(/[,\s원$€£]/g, "");
  if (s === "" || s === "-" || s === "—" || s.toUpperCase() === "N/A") return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (/^[△▲]/.test(s)) {
    neg = true;
    s = s.slice(1);
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

// ── 붙여넣기 해석 ───────────────────────────────────────────────
const normalizeLabel = (s: string) => s.toLowerCase().replace(/[\s()·\-_/]/g, "");

const LABEL_INDEX = (() => {
  const idx = new Map<string, string>();
  for (const m of METRICS) {
    for (const name of [m.key, m.label, ...(m.aliases ?? [])]) idx.set(normalizeLabel(name), m.key);
  }
  return idx;
})();

export function matchMetric(label: string): string | null {
  return LABEL_INDEX.get(normalizeLabel(label)) ?? null;
}

export interface ParsedValue {
  metric: string;
  year: number;
  quarter: number;
  value: number;
}

export interface GridParseResult {
  values: ParsedValue[];
  periods: Period[];
  unknownRows: string[];
  badHeaders: string[];
  badCells: number;
}

/**
 * 표 형태 붙여넣기 해석. 첫 행은 [아무거나, 기간1, 기간2, ...], 이후 행은 [계정명, 값1, 값2, ...].
 * 금액 계정에는 multiplier(단위)를 곱하고, 주식 수 계정에는 곱하지 않는다.
 */
export function parseFinancialGrid(
  rows: string[][],
  multiplier: number,
  monthMode: "annual" | "quarter" = "annual",
): GridParseResult {
  const result: GridParseResult = { values: [], periods: [], unknownRows: [], badHeaders: [], badCells: 0 };
  if (rows.length < 2) return result;
  const header = rows[0];
  const cols: (Period | null)[] = header.map((h, i) => {
    if (i === 0) return null;
    if (!h?.trim()) return null;
    const p = parsePeriod(h, monthMode);
    if (!p) result.badHeaders.push(h);
    return p;
  });
  result.periods = cols.filter((p): p is Period => !!p);

  for (const row of rows.slice(1)) {
    const label = row[0]?.trim();
    if (!label) continue;
    const metric = matchMetric(label);
    if (!metric) {
      result.unknownRows.push(label);
      continue;
    }
    const mult = getMetric(metric)!.kind === "shares" ? 1 : multiplier;
    row.forEach((cell, i) => {
      const p = cols[i];
      if (!p) return;
      const n = parseFinancialNumber(cell);
      if (n === null) {
        if (cell?.trim() && !/^[-—]$/.test(cell.trim())) result.badCells++;
        return;
      }
      result.values.push({ metric, year: p.year, quarter: p.quarter, value: n * mult });
    });
  }
  return result;
}
