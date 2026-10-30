/**
 * DART 응답 정규화 (순수 함수, 서버·클라이언트 의존 없음).
 * - 단일회사 전체 재무제표(fnlttSinglAcntAll) → 표준 계정 값
 * - 정기보고서 주요정보·주요사항보고서 → 1차 필터 자동 체크 판정
 */
import { parseFinancialNumber } from "@/domain/financials";
import { formatAmount } from "@/domain/format";

export interface DartAccountRow {
  sj_div: string;
  account_id: string;
  account_nm: string;
  account_detail?: string;
  thstrm_amount?: string | null;
  thstrm_add_amount?: string | null;
}

type Sj = "BS" | "IS" | "CIS" | "CF";

interface Component {
  ids: string[];
  /** 표준계정코드가 없을 때("-표준계정코드 미사용-") 계정명으로 찾는다 */
  names?: string[];
}

interface MetricMap {
  sj: Sj[];
  /** first: 첫 번째로 찾은 구성요소 / sum: 찾은 구성요소를 모두 더함 */
  mode: "first" | "sum";
  components: Component[];
  /** 현금흐름표 부호가 회사마다 달라 절댓값으로 저장하는 계정 */
  abs?: boolean;
}

const IS: Sj[] = ["IS", "CIS"];

/**
 * 표준 계정 ↔ IFRS 계정ID 매핑. 계정ID가 우선이고, 표준계정코드를 쓰지 않은 행은 계정명으로 찾는다.
 * 감가상각비는 이 API의 현금흐름표에 대부분 집계 행(조정)으로만 나와 수집되지 않을 수 있다.
 */
export const DART_MAPPING: Record<string, MetricMap> = {
  revenue: { sj: IS, mode: "first", components: [{ ids: ["ifrs-full_Revenue"], names: ["매출액", "수익(매출액)", "영업수익", "매출"] }] },
  gross_profit: { sj: IS, mode: "first", components: [{ ids: ["ifrs-full_GrossProfit"], names: ["매출총이익"] }] },
  operating_income: { sj: IS, mode: "first", components: [{ ids: ["dart_OperatingIncomeLoss"], names: ["영업이익", "영업이익(손실)"] }] },
  pretax_income: { sj: IS, mode: "first", components: [{ ids: ["ifrs-full_ProfitLossBeforeTax"], names: ["법인세비용차감전순이익", "법인세비용차감전순이익(손실)"] }] },
  income_tax: { sj: IS, mode: "first", components: [{ ids: ["ifrs-full_IncomeTaxExpenseContinuingOperations"], names: ["법인세비용", "법인세비용(수익)"] }] },
  net_income: { sj: IS, mode: "first", components: [{ ids: ["ifrs-full_ProfitLoss"], names: ["당기순이익", "당기순이익(손실)"] }] },
  net_income_parent: { sj: IS, mode: "first", components: [{ ids: ["ifrs-full_ProfitLossAttributableToOwnersOfParent"] }] },
  depreciation: {
    sj: ["CF"],
    mode: "sum",
    components: [
      { ids: ["ifrs-full_AdjustmentsForDepreciationExpense", "ifrs-full_AdjustmentsForDepreciationAndAmortisationExpense"], names: ["감가상각비"] },
      { ids: ["ifrs-full_AdjustmentsForAmortisationExpense"], names: ["무형자산상각비"] },
    ],
  },

  total_assets: { sj: ["BS"], mode: "first", components: [{ ids: ["ifrs-full_Assets"], names: ["자산총계"] }] },
  current_assets: { sj: ["BS"], mode: "first", components: [{ ids: ["ifrs-full_CurrentAssets"], names: ["유동자산"] }] },
  cash: {
    sj: ["BS"],
    mode: "sum",
    components: [
      { ids: ["ifrs-full_CashAndCashEquivalents"], names: ["현금및현금성자산"] },
      { ids: ["ifrs-full_ShorttermDepositsNotClassifiedAsCashEquivalents", "dart_ShortTermDepositsNotClassifiedAsCashEquivalents"], names: ["단기금융상품"] },
    ],
  },
  receivables: {
    sj: ["BS"],
    mode: "first",
    components: [
      { ids: ["ifrs-full_CurrentTradeReceivables", "dart_ShortTermTradeReceivable"], names: ["매출채권"] },
      { ids: ["ifrs-full_TradeAndOtherCurrentReceivables"], names: ["매출채권및기타채권", "매출채권 및 기타채권"] },
    ],
  },
  inventories: { sj: ["BS"], mode: "first", components: [{ ids: ["ifrs-full_Inventories"], names: ["재고자산"] }] },
  total_liabilities: { sj: ["BS"], mode: "first", components: [{ ids: ["ifrs-full_Liabilities"], names: ["부채총계"] }] },
  current_liabilities: { sj: ["BS"], mode: "first", components: [{ ids: ["ifrs-full_CurrentLiabilities"], names: ["유동부채"] }] },
  short_term_debt: {
    sj: ["BS"],
    mode: "sum",
    components: [
      { ids: ["ifrs-full_ShorttermBorrowings", "dart_ShortTermBorrowings"], names: ["단기차입금"] },
      { ids: ["ifrs-full_CurrentPortionOfLongtermBorrowings", "dart_CurrentPortionOfLongTermBorrowings"], names: ["유동성장기부채", "유동성장기차입금"] },
      { ids: ["ifrs-full_CurrentPortionOfNoncurrentBondsIssued", "dart_CurrentPortionOfBonds"], names: ["유동성사채"] },
      { ids: ["ifrs-full_CurrentLeaseLiabilities"], names: ["유동리스부채", "리스부채(유동)"] },
    ],
  },
  long_term_debt: {
    sj: ["BS"],
    mode: "sum",
    components: [
      { ids: ["ifrs-full_NoncurrentPortionOfNoncurrentBondsIssued", "dart_BondsIssued", "ifrs-full_BondsIssued"], names: ["사채"] },
      { ids: ["ifrs-full_NoncurrentPortionOfNoncurrentLoansReceived", "ifrs-full_LongtermBorrowings", "dart_LongTermBorrowingsGross"], names: ["장기차입금"] },
      { ids: ["ifrs-full_NoncurrentLeaseLiabilities"], names: ["비유동리스부채", "리스부채(비유동)", "장기리스부채"] },
    ],
  },
  total_equity: { sj: ["BS"], mode: "first", components: [{ ids: ["ifrs-full_Equity"], names: ["자본총계"] }] },
  equity_parent: { sj: ["BS"], mode: "first", components: [{ ids: ["ifrs-full_EquityAttributableToOwnersOfParent"], names: ["지배기업 소유주지분", "지배기업소유주지분"] }] },

  ocf: { sj: ["CF"], mode: "first", components: [{ ids: ["ifrs-full_CashFlowsFromUsedInOperatingActivities"], names: ["영업활동현금흐름", "영업활동으로인한현금흐름"] }] },
  capex: {
    sj: ["CF"],
    mode: "sum",
    abs: true,
    components: [
      { ids: ["ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities"], names: ["유형자산의 취득", "유형자산의취득"] },
      { ids: ["ifrs-full_PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities"], names: ["무형자산의 취득", "무형자산의취득"] },
    ],
  },
  dividends_paid: {
    sj: ["CF"],
    mode: "first",
    abs: true,
    components: [{ ids: ["ifrs-full_DividendsPaidClassifiedAsFinancingActivities"], names: ["배당금의지급", "배당금의 지급", "배당금지급"] }],
  },
  buyback: {
    sj: ["CF"],
    mode: "first",
    abs: true,
    components: [{ ids: ["ifrs-full_PurchaseOfTreasuryShares", "dart_AcquisitionOfTreasuryShares"], names: ["자기주식의 취득", "자기주식의취득"] }],
  },
};

const NO_STD = "-표준계정코드 미사용-";
const norm = (s: string) => s.replace(/\s/g, "");
/** 2018년 이전 보고서는 IFRS 계정ID 접두어가 "ifrs_"다 → "ifrs-full_"로 통일 */
const canonicalId = (id: string) => id.replace(/^ifrs_/, "ifrs-full_");

export interface NormalizedStatement {
  values: Record<string, number>;
  /** 계정별로 사용한 원천 계정ID/계정명 */
  refs: Record<string, string>;
}

/**
 * 한 보고서의 계정 목록을 표준 계정으로 정리한다.
 * kind=annual: 사업보고서(당기 금액). kind=cumulative: 분기·반기보고서에서 손익은 누적 금액(thstrm_add_amount)을 쓴다.
 */
export function normalizeDartStatement(rows: DartAccountRow[], kind: "annual" | "cumulative"): NormalizedStatement {
  const usable = rows.filter((r) => !r.account_detail || r.account_detail === "-");
  const amount = (r: DartAccountRow) => {
    const raw = kind === "cumulative" && (r.sj_div === "IS" || r.sj_div === "CIS") ? (r.thstrm_add_amount ?? r.thstrm_amount) : r.thstrm_amount;
    return parseFinancialNumber(raw);
  };
  const findRow = (sjs: Sj[], c: Component): DartAccountRow | undefined => {
    for (const sj of sjs) {
      const inSj = usable.filter((r) => r.sj_div === sj);
      const byId = inSj.find((r) => c.ids.includes(canonicalId(r.account_id)) && amount(r) != null);
      if (byId) return byId;
      const names = (c.names ?? []).map(norm);
      const byName = inSj.find((r) => (r.account_id === NO_STD || !r.account_id.includes("_")) && names.includes(norm(r.account_nm)) && amount(r) != null);
      if (byName) return byName;
    }
    return undefined;
  };

  const out: NormalizedStatement = { values: {}, refs: {} };
  for (const [metric, map] of Object.entries(DART_MAPPING)) {
    const found = map.components.map((c) => findRow(map.sj, c)).filter((r): r is DartAccountRow => !!r);
    if (!found.length) continue;
    const used = map.mode === "first" ? found.slice(0, 1) : found;
    const val = used.reduce((s, r) => s + (map.abs ? Math.abs(amount(r)!) : amount(r)!), 0);
    out.values[metric] = val;
    out.refs[metric] = used.map((r) => (r.account_id === NO_STD ? r.account_nm : r.account_id)).join(" + ");
  }
  return out;
}

// ── 주식 수 ────────────────────────────────────────────────────
export interface DartStockTotalRow {
  se: string;
  distb_stock_co?: string;
  istc_totqy?: string;
}

/** 주식의 총수 현황 → 보통주 유통주식수 (자기주식 제외) */
export function commonSharesOutstanding(rows: DartStockTotalRow[]): number | null {
  const common = rows.find((r) => r.se?.replace(/\s/g, "") === "보통주");
  return common ? parseFinancialNumber(common.distb_stock_co) : null;
}

// ── 1차 필터 자동 체크 ─────────────────────────────────────────
export interface CheckResult {
  answer: "yes" | "no" | null;
  evidence: string;
}

function parseKoreanDate(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const m = /(\d{4})\s*[.\-년/]\s*(\d{1,2})\s*[.\-월/]\s*(\d{1,2})/.exec(raw);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

function yearsBefore(asOf: string, years: number): string {
  const d = new Date(asOf + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export interface AuditRow {
  bsns_year: string;
  adt_opinion?: string | null;
  adtor?: string | null;
}

/** 감사의견: 사업보고서에 나온 당기·전기·전전기 의견이 모두 적정인가 */
export function checkAuditOpinion(rows: AuditRow[], reportYear: number): CheckResult {
  const opinions = rows
    .filter((r) => r.adt_opinion && r.adt_opinion.trim() !== "-")
    .map((r) => ({ period: r.bsns_year.replace(/\s+/g, " ").trim(), opinion: r.adt_opinion!.trim(), auditor: r.adtor ?? "" }));
  const unique = opinions.filter((o, i) => opinions.findIndex((x) => x.period === o.period) === i);
  if (!unique.length) return { answer: null, evidence: `${reportYear} 사업보고서에서 감사의견을 찾지 못함` };
  const bad = unique.filter((o) => /부적정|한정|거절/.test(o.opinion) || !/적정/.test(o.opinion));
  const summary = unique.map((o) => `${o.period} ${o.opinion}${o.auditor ? `(${o.auditor})` : ""}`).join(", ");
  return { answer: bad.length ? "no" : "yes", evidence: `${reportYear} 사업보고서: ${summary}` };
}

export interface CapitalChangeRow {
  isu_dcrs_de?: string | null;
  isu_dcrs_stle?: string | null;
  isu_dcrs_qy?: string | null;
}

export interface BondDecisionRow {
  rcept_no: string;
  bd_tm?: string | null;
  bd_knd?: string | null;
  bd_fta?: string | null;
}

/**
 * 최근 3년 자금조달 반복 여부. 유상증자(증자 현황의 발행일) + CB·BW 발행결정(회차 기준, 정정공시 중복 제거)이
 * 합쳐서 2건 이상이면 '반복'으로 보고 실패 처리한다.
 */
export function checkCapitalRaises(
  increases: CapitalChangeRow[],
  convertibles: BondDecisionRow[],
  warrants: BondDecisionRow[],
  asOf: string,
): CheckResult {
  const since = yearsBefore(asOf, 3);
  const rights = increases
    .filter((r) => r.isu_dcrs_stle?.includes("유상증자"))
    .map((r) => ({ date: parseKoreanDate(r.isu_dcrs_de), kind: r.isu_dcrs_stle!.trim() }))
    .filter((r): r is { date: string; kind: string } => !!r.date && r.date >= since);
  const uniqRights = rights.filter((r, i) => rights.findIndex((x) => x.date === r.date && x.kind === r.kind) === i);

  const bonds = (rows: BondDecisionRow[], label: string) => {
    const recent = rows
      .map((r) => ({ ...r, date: `${r.rcept_no.slice(0, 4)}-${r.rcept_no.slice(4, 6)}-${r.rcept_no.slice(6, 8)}` }))
      .filter((r) => r.date >= since);
    const seen = new Map<string, (typeof recent)[number]>();
    for (const r of recent) {
      const key = r.bd_tm?.trim() || r.rcept_no;
      if (!seen.has(key) || seen.get(key)!.date > r.date) seen.set(key, r);
    }
    return [...seen.values()].map((r) => `${r.date} ${label}${r.bd_tm ? ` ${r.bd_tm}회차` : ""}${r.bd_fta ? ` ${r.bd_fta}원` : ""}`);
  };

  const events = [
    ...uniqRights.map((r) => `${r.date} ${r.kind}`),
    ...bonds(convertibles, "CB"),
    ...bonds(warrants, "BW"),
  ].sort();
  const evidence = events.length ? `최근 3년(${since} 이후) ${events.length}건: ${events.join("; ")}` : `최근 3년(${since} 이후) 유상증자·CB·BW 없음`;
  return { answer: events.length >= 2 ? "no" : "yes", evidence };
}

export interface HolderChangeRow {
  change_on?: string | null;
  mxmm_shrholdr_nm?: string | null;
  change_cause?: string | null;
}

/** 최대주주 변동: 최근 3년 안에 변동일이 있으면 실패 */
export function checkLargestHolderChange(rows: HolderChangeRow[], asOf: string): CheckResult {
  const since = yearsBefore(asOf, 3);
  const changes = rows
    .map((r) => ({ date: parseKoreanDate(r.change_on), name: r.mxmm_shrholdr_nm?.replace(/\s+/g, " ").trim() ?? "", cause: r.change_cause?.trim() ?? "" }))
    .filter((r) => r.date);
  const recent = changes.filter((r) => r.date! >= since);
  if (recent.length) {
    return { answer: "no", evidence: `최근 3년 최대주주 변동: ${recent.map((r) => `${r.date} ${r.name}${r.cause && r.cause !== "-" ? ` (${r.cause})` : ""}`).join("; ")}` };
  }
  const last = changes.sort((a, b) => (a.date! < b.date! ? 1 : -1))[0];
  return { answer: "yes", evidence: last ? `최근 3년 변동 없음 (마지막 변동 ${last.date} ${last.name})` : "최대주주 변동 기록 없음" };
}

/** 영업현금흐름: 최근 2개 연도가 모두 음수면 실패 (재무 데이터로 판정, 시장 무관) */
export function checkNegativeOcf(annualOcf: { year: number; value: number }[], currency: string): CheckResult {
  const sorted = [...annualOcf].sort((a, b) => a.year - b.year);
  if (sorted.length < 2) return { answer: null, evidence: "연간 영업현금흐름 데이터가 2년 미만" };
  const recent = sorted.slice(-3);
  const lastTwoNegative = recent.slice(-2).every((r) => r.value < 0);
  return {
    answer: lastTwoNegative ? "no" : "yes",
    evidence: `영업현금흐름 ${recent.map((r) => `${r.year} ${formatAmount(r.value, currency)}`).join(", ")}`,
  };
}
