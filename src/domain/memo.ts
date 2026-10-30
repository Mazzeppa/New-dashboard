/**
 * 5단계 투자 메모 (순수 함수).
 * 확정하면 그 시점의 가치평가 결과·현재가·메모 내용을 스냅샷으로 고정하고, 이후 수정은 새 버전으로만 한다.
 */
import { z } from "zod";
import { formatAmount, formatPrice, formatRatio } from "./format";
import {
  METHOD_LABELS,
  METHODS,
  SCENARIO_LABELS,
  SCENARIOS,
  summarize,
  type Method,
  type Scenario,
  type ValuationData,
} from "./valuation";

// ── 매도 조건 ──────────────────────────────────────────────────
/** 구조화된 매도 조건에 쓸 수 있는 지표 (7단계 보유 점검에서 최신 재무 데이터로 자동 평가) */
export const SELL_METRICS = {
  operatingMargin: { label: "영업이익률", kind: "ratio" },
  netMargin: { label: "순이익률", kind: "ratio" },
  revenueGrowth: { label: "매출 성장률(전년 동기 대비)", kind: "ratio" },
  roe: { label: "ROE", kind: "ratio" },
  roic: { label: "ROIC", kind: "ratio" },
  debtRatio: { label: "부채비율", kind: "ratio" },
  ocfToNetIncome: { label: "영업현금흐름 / 순이익", kind: "multiple" },
  revenue: { label: "매출액", kind: "amount" },
  operatingIncome: { label: "영업이익", kind: "amount" },
  fcf: { label: "FCF", kind: "amount" },
} as const;
export type SellMetric = keyof typeof SELL_METRICS;

export const OPERATORS = { "<": "<", "<=": "≤", ">": ">", ">=": "≥" } as const;
export type Operator = keyof typeof OPERATORS;

export const sellConditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("structured"),
    metric: z.enum(Object.keys(SELL_METRICS) as [SellMetric, ...SellMetric[]]),
    operator: z.enum(["<", "<=", ">", ">="]),
    /** ratio는 소수(0.1 = 10%), multiple은 배수, amount는 원 단위 */
    threshold: z.number().finite(),
    /** 연속 기간 수 */
    periods: z.number().int().min(1).max(12),
    periodType: z.enum(["quarter", "annual"]),
    note: z.string().max(500).default(""),
  }),
  z.object({ type: z.literal("text"), text: z.string().max(1000) }),
]);
export type SellCondition = z.infer<typeof sellConditionSchema>;

export function describeCondition(c: SellCondition, currency: string): string {
  if (c.type === "text") return c.text;
  const m = SELL_METRICS[c.metric];
  const v = m.kind === "ratio" ? formatRatio(c.threshold) : m.kind === "multiple" ? `${c.threshold}배` : formatAmount(c.threshold, currency);
  const span = `${c.periods}${c.periodType === "quarter" ? "분기" : "년"} 연속`;
  return `${m.label} ${OPERATORS[c.operator]} ${v}, ${span}${c.note ? ` (${c.note})` : ""}`;
}

// ── 메모 내용 ──────────────────────────────────────────────────
export const memoContentSchema = z.object({
  /** 핵심 논리 최대 3개 */
  theses: z.array(z.string().max(2000)).max(3),
  /** 시장이 잘못 보고 있는 점과 내가 다르게 보는 이유 */
  mispricing: z.string().max(5000),
  catalysts: z
    .array(
      z.object({
        description: z.string().max(1000),
        /** 예상 시점 YYYY-MM-DD (월 단위 예상이면 그 달 1일) */
        expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
      }),
    )
    .max(20),
  /** "3년 뒤 이 투자가 실패했다면 그 이유는?" */
  premortem: z.string().max(5000),
  sellConditions: z.array(sellConditionSchema).max(20),
});
export type MemoContent = z.infer<typeof memoContentSchema>;

export function emptyMemo(): MemoContent {
  return { theses: [""], mispricing: "", catalysts: [{ description: "", expectedDate: null }], premortem: "", sellConditions: [] };
}

const filled = (s: string | null | undefined) => !!s && s.trim().length > 0;

/** 필수 항목 중 비어 있는 것 */
export function memoMissing(c: MemoContent): string[] {
  const out: string[] = [];
  if (!c.theses.some(filled)) out.push("핵심 논리");
  if (!filled(c.mispricing)) out.push("시장이 잘못 보고 있는 점");
  if (!c.catalysts.some((x) => filled(x.description))) out.push("촉매");
  else if (c.catalysts.some((x) => filled(x.description) && !x.expectedDate)) out.push("촉매 예상 시점");
  if (!filled(c.premortem)) out.push("프리모템");
  if (!c.sellConditions.some((s) => s.type === "structured" || filled(s.text))) out.push("매도 조건");
  return out;
}

/** 빈 줄·빈 항목을 걷어 낸다 (확정 전에 정리) */
export function cleanMemo(c: MemoContent): MemoContent {
  return {
    theses: c.theses.map((t) => t.trim()).filter(Boolean),
    mispricing: c.mispricing.trim(),
    catalysts: c.catalysts.filter((x) => filled(x.description)).map((x) => ({ ...x, description: x.description.trim() })),
    premortem: c.premortem.trim(),
    sellConditions: c.sellConditions.filter((s) => s.type === "structured" || filled(s.text)),
  };
}

// ── 스냅샷 ─────────────────────────────────────────────────────
/** 방법 × 시나리오 주당 가치 (계산 안 된 칸은 null) */
export type SnapshotGrid = Record<Method, Record<Scenario, number | null>>;

export interface MemoSnapshot {
  takenAt: string;
  currency: string;
  price: number | null;
  priceDate: string | null;
  content: MemoContent;
  valuation: {
    data: ValuationData;
    intrinsicValue: number | null;
    marginOfSafety: number | null;
    upside: number | null;
    bearDownside: number | null;
    representative: Method;
    grid: SnapshotGrid;
  } | null;
}

export function buildSnapshot(input: {
  takenAt: string;
  currency: string;
  price: number | null;
  priceDate: string | null;
  content: MemoContent;
  valuation: ValuationData | null;
}): MemoSnapshot {
  let valuation: MemoSnapshot["valuation"] = null;
  if (input.valuation) {
    const s = summarize(input.valuation, input.price);
    valuation = {
      data: structuredClone(input.valuation),
      intrinsicValue: s.intrinsicValue,
      marginOfSafety: s.marginOfSafety,
      upside: s.upside,
      bearDownside: s.bearDownside,
      representative: input.valuation.representative,
      grid: Object.fromEntries(
        METHODS.map((m) => [m, Object.fromEntries(SCENARIOS.map((sc) => {
          const c = s.grid[m][sc];
          return [sc, c.ok ? c.value : null];
        }))]),
      ) as SnapshotGrid,
    };
  }
  return { takenAt: input.takenAt, currency: input.currency, price: input.price, priceDate: input.priceDate, content: structuredClone(input.content), valuation };
}

// ── 마크다운 ───────────────────────────────────────────────────
export function memoToMarkdown(input: {
  stockName: string;
  ticker: string | null;
  market: string;
  version: number;
  status: "draft" | "confirmed";
  confirmedAt: string | null;
  content: MemoContent;
  snapshot: MemoSnapshot | null;
}): string {
  const { content: c, snapshot: snap } = input;
  const cur = snap?.currency ?? "KRW";
  const lines: string[] = [];
  lines.push(`# 투자 메모: ${input.stockName}${input.ticker ? ` (${input.ticker})` : ""}`);
  lines.push("");
  lines.push(`- 시장: ${input.market}`);
  lines.push(`- 버전: v${input.version} (${input.status === "confirmed" ? `확정 ${input.confirmedAt?.slice(0, 10) ?? ""}` : "작성 중"})`);
  if (snap) {
    lines.push(`- 확정 시점 현재가: ${formatPrice(snap.price, cur)}${snap.priceDate ? ` (${snap.priceDate})` : ""}`);
    if (snap.valuation) {
      lines.push(`- 내재가치(가중): ${formatPrice(snap.valuation.intrinsicValue, cur)} · 대표 방법: ${METHOD_LABELS[snap.valuation.representative]}`);
      lines.push(`- 안전마진: ${formatRatio(snap.valuation.marginOfSafety)} · 비관 하락률: ${formatRatio(snap.valuation.bearDownside)}`);
    }
  }
  lines.push("");
  lines.push("## 핵심 논리");
  c.theses.filter(filled).forEach((t, i) => lines.push(`${i + 1}. ${t}`));
  lines.push("");
  lines.push("## 시장이 잘못 보고 있는 점과 내가 다르게 보는 이유");
  lines.push(c.mispricing || "-");
  lines.push("");
  lines.push("## 촉매와 예상 시점");
  if (!c.catalysts.some((x) => filled(x.description))) lines.push("-");
  c.catalysts.filter((x) => filled(x.description)).forEach((x) => lines.push(`- ${x.expectedDate ?? "시점 미정"}: ${x.description}`));
  lines.push("");
  lines.push("## 프리모템: 3년 뒤 이 투자가 실패했다면 그 이유는?");
  lines.push(c.premortem || "-");
  lines.push("");
  lines.push("## 매도 조건");
  if (!c.sellConditions.length) lines.push("-");
  c.sellConditions.forEach((s) => lines.push(`- ${describeCondition(s, cur)}`));
  if (snap?.valuation) {
    lines.push("");
    lines.push("## 가치평가 (확정 시점)");
    lines.push("");
    lines.push(`| 방법 | ${SCENARIOS.map((s) => `${SCENARIO_LABELS[s]} (${Math.round(snap.valuation!.data.probabilities[s] * 100)}%)`).join(" | ")} |`);
    lines.push(`|---|${SCENARIOS.map(() => "---:").join("|")}|`);
    for (const m of METHODS) {
      const row = snap.valuation.grid[m];
      if (SCENARIOS.every((s) => row[s] == null)) continue;
      lines.push(`| ${METHOD_LABELS[m]}${m === snap.valuation.representative ? " (대표)" : ""} | ${SCENARIOS.map((s) => formatPrice(row[s], cur)).join(" | ")} |`);
    }
    if (snap.valuation.data.notes.trim()) {
      lines.push("");
      lines.push("### 가정의 근거");
      lines.push(snap.valuation.data.notes.trim());
    }
  }
  lines.push("");
  return lines.join("\n");
}
