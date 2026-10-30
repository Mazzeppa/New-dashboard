/**
 * 숫자 표기. 원화는 억원/조원, 달러는 $M/$B, 천 단위 구분 기호.
 * 값은 항상 원 단위(1원, 1달러) 숫자로 받는다.
 */

export const CURRENCIES = ["KRW", "USD", "EUR", "CHF", "GBP", "JPY", "HKD"] as const;
export type Currency = (typeof CURRENCIES)[number];

const SYMBOL: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CHF: "CHF ",
  HKD: "HK$",
};

const EOK = 1e8;
const JO = 1e12;

function num(value: number, maxFrac: number, minFrac = 0): string {
  return value.toLocaleString("ko-KR", {
    maximumFractionDigits: maxFrac,
    minimumFractionDigits: minFrac,
  });
}

function isBlank(v: number | null | undefined): v is null | undefined {
  return v === null || v === undefined || Number.isNaN(v);
}

/** 큰 금액(매출, 시가총액 등) 표기 */
export function formatAmount(value: number | null | undefined, currency: string): string {
  if (isBlank(value)) return "-";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (currency === "KRW") {
    if (abs >= JO) return `${sign}${num(abs / JO, 2)}조원`;
    // 100억 미만은 소수 둘째 자리까지 (1.36억원), 그 이상은 정수 (5,234억원)
    if (abs >= EOK) return `${sign}${num(abs / EOK, abs < 100 * EOK ? 2 : 0)}억원`;
    return `${sign}${num(abs, 0)}원`;
  }
  const sym = SYMBOL[currency] ?? `${currency} `;
  if (abs >= 1e9) return `${sign}${sym}${num(abs / 1e9, 2)}B`;
  if (abs >= 1e6) return `${sign}${sym}${num(abs / 1e6, 1)}M`;
  return `${sign}${sym}${num(abs, 0)}`;
}

/** 주가·주당 가치 표기 */
export function formatPrice(value: number | null | undefined, currency: string): string {
  if (isBlank(value)) return "-";
  if (currency === "KRW" || currency === "JPY") {
    return currency === "KRW" ? `${num(value, 0)}원` : `¥${num(value, 0)}`;
  }
  const sign = value < 0 ? "-" : "";
  const sym = SYMBOL[currency] ?? `${currency} `;
  return `${sign}${sym}${num(Math.abs(value), 2, 2)}`;
}

export function formatNumber(value: number | null | undefined, maxFrac = 0): string {
  if (isBlank(value)) return "-";
  return num(value, maxFrac);
}

/** 0.123 → "12.3%" */
export function formatRatio(value: number | null | undefined, frac = 1): string {
  if (isBlank(value)) return "-";
  return `${num(value * 100, frac, frac)}%`;
}

/** 12.3 → "12.3%" (이미 퍼센트 단위인 값) */
export function formatPct(value: number | null | undefined, frac = 1): string {
  if (isBlank(value)) return "-";
  return `${num(value, frac)}%`;
}

/** 입력 문자열 → 숫자. 콤마 허용, 빈 값은 null */
export function parseNumberInput(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/[,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function daysBetween(fromIso: string, to: Date = new Date()): number {
  const ms = to.getTime() - new Date(fromIso).getTime();
  return Math.floor(ms / 86_400_000);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}
