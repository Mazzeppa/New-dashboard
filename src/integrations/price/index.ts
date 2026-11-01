import "server-only";
import { fxSymbol, parseNaverBasic, parseYahooChart, QuoteError, yahooSymbol, type Quote } from "./normalize";

export { QuoteError, type Quote };

export interface PriceTarget {
  market: string;
  ticker: string | null;
  currency: string;
}

/**
 * 외부 시세 소스. 새 소스를 붙이려면 이 인터페이스를 구현하고 providersFor()에 넣는다.
 * 수동 입력 가격은 prices 테이블에 source='manual'로 저장되며 같은 날짜에서는 자동 값보다 우선한다.
 */
export interface PriceProvider {
  readonly name: string;
  fetchQuote(target: PriceTarget): Promise<Quote>;
}

const HEADERS = { "User-Agent": "Mozilla/5.0 (value-process personal app)", Accept: "application/json" };

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  // 둘 다 없는 종목에도 JSON 오류 본문을 주므로 상태 코드와 무관하게 본문을 해석한다
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new QuoteError(`시세 응답을 읽을 수 없습니다 (HTTP ${res.status}).`);
  }
}

export const naverProvider: PriceProvider = {
  name: "naver",
  async fetchQuote(t) {
    const code = t.ticker?.trim().toUpperCase();
    if (!code) throw new QuoteError("종목코드가 없습니다.");
    return parseNaverBasic(await getJson(`https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}/basic`), code);
  },
};

export const yahooProvider: PriceProvider = {
  name: "yahoo",
  async fetchQuote(t) {
    if (!t.ticker?.trim()) throw new QuoteError("티커가 없습니다.");
    const symbol = yahooSymbol(t.market, t.ticker);
    return parseYahooChart(await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`), symbol);
  },
};

/** 시장별 시세 소스 (앞이 우선, 실패하면 다음) */
export function providersFor(t: PriceTarget): PriceProvider[] {
  return t.market === "KR" ? [naverProvider, yahooProvider] : [yahooProvider];
}

/**
 * 종목 현재가. 소스를 차례로 시도하고, 받은 통화가 종목의 거래 통화와 다르면 거부한다
 * (예: 유럽 종목에 거래소 접미사를 빠뜨려 미국 동명 티커를 받은 경우).
 */
export async function fetchStockQuote(t: PriceTarget): Promise<Quote & { source: string }> {
  const errors: string[] = [];
  for (const p of providersFor(t)) {
    try {
      const q = await p.fetchQuote(t);
      if (q.currency !== t.currency.toUpperCase()) {
        errors.push(`${p.name}: 통화가 다릅니다 (시세 ${q.currency}, 종목 ${t.currency}${t.market !== "KR" && t.market !== "US" ? ". 티커에 거래소 접미사(예: .SW, .AS, .L)를 붙였는지 확인하세요" : ""})`);
        continue;
      }
      return { ...q, source: p.name };
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new QuoteError(errors.join(" / "));
}

/** 통화 1단위당 원 */
export async function fetchFxQuote(currency: string): Promise<Quote> {
  const symbol = fxSymbol(currency);
  const q = parseYahooChart(await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`), symbol);
  if (q.currency !== "KRW") throw new QuoteError(`${symbol} 환율 통화가 KRW가 아닙니다 (${q.currency}).`);
  return q;
}
