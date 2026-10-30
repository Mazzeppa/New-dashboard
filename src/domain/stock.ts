import { z } from "zod";
import { parseNumberInput } from "./format";

export const MARKETS = { KR: "한국", US: "미국", EU: "유럽", OTHER: "기타" } as const;
export type Market = keyof typeof MARKETS;

export const DEFAULT_CURRENCY: Record<Market, string> = {
  KR: "KRW",
  US: "USD",
  EU: "EUR",
  OTHER: "USD",
};

export const DISCOVERY_SOURCES = {
  quant_screen: "정량 스크리닝",
  disclosure: "공시",
  low_52w: "52주 신저가",
  cycle_bottom: "업황 바닥",
  work_experience: "업무 경험",
  other: "기타",
} as const;
export type DiscoverySource = keyof typeof DISCOVERY_SOURCES;

/** 키("quant_screen") 또는 한글 라벨("정량 스크리닝") 모두 허용 */
function normalizeSource(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (s === "") return "other";
  if (s in DISCOVERY_SOURCES) return s;
  const hit = Object.entries(DISCOVERY_SOURCES).find(([, label]) => label === s);
  return hit ? hit[0] : s;
}

function normalizeMarket(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.trim().toUpperCase();
  const alias: Record<string, Market> = { 한국: "KR", 미국: "US", 유럽: "EU", 기타: "OTHER" };
  return alias[v.trim()] ?? s;
}

const optionalText = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null || String(v).trim() === "" ? null : String(v).trim()));

const optionalNumber = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v, ctx) => {
    const n = parseNumberInput(v);
    if (v != null && String(v).trim() !== "" && n === null) {
      ctx.addIssue({ code: "custom", message: "숫자가 아닙니다." });
      return z.NEVER;
    }
    return n;
  });

/**
 * 외부 후보 종목 한 건. CSV 가져오기와 POST /api/candidates가 공유한다.
 * 티커와 종목명 중 하나는 있어야 한다.
 */
export const candidateSchema = z
  .object({
    market: z.preprocess(normalizeMarket, z.enum(["KR", "US", "EU", "OTHER"], "시장은 KR/US/EU/OTHER 중 하나여야 합니다.")),
    ticker: optionalText,
    name: optionalText,
    currency: optionalText,
    industry: optionalText,
    source: z.preprocess(
      normalizeSource,
      z.enum(Object.keys(DISCOVERY_SOURCES) as [DiscoverySource, ...DiscoverySource[]], "알 수 없는 발굴 경로입니다."),
    ).default("other"),
    sourceNote: optionalText,
    note: optionalText,
    watchLow: optionalNumber,
    watchHigh: optionalNumber,
  })
  .superRefine((c, ctx) => {
    if (!c.ticker && !c.name) {
      ctx.addIssue({ code: "custom", message: "티커 또는 종목명이 필요합니다.", path: ["ticker"] });
    }
    if (c.watchLow != null && c.watchHigh != null && c.watchLow > c.watchHigh) {
      ctx.addIssue({ code: "custom", message: "관심 가격 하한이 상한보다 큽니다.", path: ["watchLow"] });
    }
  })
  .transform((c) => ({
    ...c,
    // 엑셀이 한국 종목코드의 앞자리 0을 지우는 경우를 복구한다 (5930 → 005930)
    ticker: c.ticker
      ? c.market === "KR" && /^\d{1,5}$/.test(c.ticker)
        ? c.ticker.padStart(6, "0")
        : c.ticker.toUpperCase()
      : null,
    currency: (c.currency ?? DEFAULT_CURRENCY[c.market]).toUpperCase(),
  }));

export type Candidate = z.output<typeof candidateSchema>;

/** CSV 헤더 별칭 → 스키마 필드 */
const HEADER_ALIASES: Record<string, keyof z.input<typeof candidateSchema>> = {
  market: "market", 시장: "market",
  ticker: "ticker", 티커: "ticker", code: "ticker", 종목코드: "ticker",
  name: "name", 종목명: "name",
  currency: "currency", 통화: "currency",
  industry: "industry", 산업: "industry",
  source: "source", 발굴경로: "source", "발굴 경로": "source",
  source_note: "sourceNote", sourcenote: "sourceNote",
  note: "note", memo: "note", 메모: "note",
  watch_low: "watchLow", watchlow: "watchLow", 관심가하한: "watchLow",
  watch_high: "watchHigh", watchhigh: "watchHigh", 관심가상한: "watchHigh",
};

export function mapCsvRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = HEADER_ALIASES[k.trim().toLowerCase()] ?? HEADER_ALIASES[k.trim()];
    if (key) out[key] = v;
  }
  return out;
}

export function displayName(s: { name: string | null; ticker: string | null }): string {
  return s.name ?? s.ticker ?? "(이름 없음)";
}

/** 현재가가 관심 가격 구간에 있는지. 한쪽만 설정되면 그 한쪽만 본다. */
export function isInWatchRange(
  price: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined,
): boolean {
  if (price == null || (low == null && high == null)) return false;
  if (low != null && price < low) return false;
  if (high != null && price > high) return false;
  return true;
}
