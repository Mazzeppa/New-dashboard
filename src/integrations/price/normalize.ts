/**
 * 시세 응답 해석 (순수 함수).
 * - 한국 종목: 네이버 증권 모바일 API (m.stock.naver.com/api/stock/{코드}/basic)
 * - 해외 종목·환율: Yahoo Finance chart API (query1.finance.yahoo.com/v8/finance/chart/{심볼})
 * 둘 다 비공식 API라 형식이 바뀌면 여기만 고치면 된다.
 */
import { parseFinancialNumber } from "@/domain/financials";

export interface Quote {
  price: number;
  /** 거래소 현지 기준 날짜 YYYY-MM-DD */
  date: string;
  currency: string;
  /** 원천 심볼 (예: 005930, AAPL, NESN.SW, USDKRW=X) */
  symbol: string;
}

export class QuoteError extends Error {}

export function parseNaverBasic(body: unknown, code: string): Quote {
  const b = body as { closePrice?: string; localTradedAt?: string; code?: string; itemCode?: string };
  if (!b || b.code === "StockConflict" || !b.closePrice) throw new QuoteError(`네이버에서 종목코드 ${code}를 찾지 못했습니다.`);
  const price = parseFinancialNumber(b.closePrice);
  if (price == null || price <= 0) throw new QuoteError(`네이버 가격을 읽을 수 없습니다 (${b.closePrice}).`);
  const date = /^\d{4}-\d{2}-\d{2}/.exec(b.localTradedAt ?? "")?.[0];
  if (!date) throw new QuoteError("네이버 응답에 거래일이 없습니다.");
  return { price, date, currency: "KRW", symbol: b.itemCode ?? code };
}

/** 유닉스 시각 → 해당 시간대의 YYYY-MM-DD */
export function dateInZone(unixSeconds: number, timeZone: string): string {
  // en-CA 로케일은 YYYY-MM-DD 형식을 준다
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(unixSeconds * 1000));
}

export function parseYahooChart(body: unknown, symbol: string): Quote {
  const chart = (body as { chart?: { result?: { meta?: Record<string, unknown> }[] | null; error?: { description?: string } | null } })?.chart;
  const meta = chart?.result?.[0]?.meta;
  if (!meta) throw new QuoteError(`Yahoo에서 ${symbol}을(를) 찾지 못했습니다${chart?.error?.description ? ` (${chart.error.description})` : ""}.`);
  let price = Number(meta.regularMarketPrice);
  let currency = String(meta.currency ?? "");
  if (!(price > 0) || !currency) throw new QuoteError(`Yahoo ${symbol} 가격을 읽을 수 없습니다.`);
  // 런던 상장 종목은 펜스(GBp) 단위로 온다
  if (currency === "GBp" || currency === "GBX") {
    price /= 100;
    currency = "GBP";
  }
  const time = Number(meta.regularMarketTime);
  const tz = typeof meta.exchangeTimezoneName === "string" ? meta.exchangeTimezoneName : "UTC";
  return { price, date: dateInZone(time, tz), currency: currency.toUpperCase(), symbol };
}

/**
 * 종목 → Yahoo 심볼.
 * 미국: BRK.B → BRK-B. 유럽·기타: 티커에 거래소 접미사를 붙여 입력한다(예: NESN.SW, ASML.AS, SHEL.L).
 * 한국: 네이버를 쓰지만 대체용으로 .KS(코스피)를 붙인다.
 */
export function yahooSymbol(market: string, ticker: string): string {
  const t = ticker.trim().toUpperCase();
  if (market === "US") return t.replace(/\./g, "-");
  if (market === "KR") return /^\d{6}$/.test(t) ? `${t}.KS` : t;
  return t;
}

export const fxSymbol = (currency: string) => `${currency.toUpperCase()}KRW=X`;
