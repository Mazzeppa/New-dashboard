import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { listCashBalances, listPositions } from "@/db/queries";
import { displayName } from "@/domain/stock";
import { fetchFxQuote, fetchStockQuote } from "@/integrations/price";
import { pool } from "@/lib/pool";

/** 자동 갱신 대상: 아직 진행 중인 종목 (매도·복기 완료·탈락은 제외) */
export const ACTIVE_STAGES = ["idea", "filter", "analysis", "valuation", "memo", "buy_wait", "holding"] as const;

export interface RefreshResult {
  at: string;
  updated: { stockId: number; name: string; price: number; date: string; source: string }[];
  failed: { stockId: number; name: string; error: string }[];
  fx: { currency: string; rate: number; date: string }[];
  fxFailed: { currency: string; error: string }[];
}

const KEY_AT = "prices_refreshed_at";
const KEY_RESULT = "prices_last_result";
const KEY_AUTO = "price_auto_refresh";

function kvGet(key: string): string | null {
  return db.select().from(schema.kv).where(eq(schema.kv.key, key)).get()?.value ?? null;
}
function kvSet(key: string, value: string) {
  const now = new Date().toISOString();
  db.insert(schema.kv).values({ key, value }).onConflictDoUpdate({ target: schema.kv.key, set: { value, updatedAt: now } }).run();
}

/** 한국 날짜 YYYY-MM-DD */
export function todayKst(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function autoRefreshEnabled(): boolean {
  return kvGet(KEY_AUTO) !== "off";
}
export function setAutoRefresh(on: boolean) {
  kvSet(KEY_AUTO, on ? "on" : "off");
}

export function lastRefresh(): RefreshResult | null {
  const raw = kvGet(KEY_RESULT);
  try {
    return raw ? (JSON.parse(raw) as RefreshResult) : null;
  } catch {
    return null;
  }
}

/** 오늘(한국 시각) 아직 갱신하지 않았는가 */
export function refreshDue(): boolean {
  const at = kvGet(KEY_AT);
  return !at || todayKst(new Date(at)) !== todayKst();
}

/** 같은 종목·날짜·출처의 자동 가격은 한 행만 둔다 (하루에 여러 번 갱신해도 최신 값으로 교체) */
function saveQuote(stockId: number, date: string, price: number, source: string) {
  db.transaction((tx) => {
    tx.delete(schema.prices).where(and(eq(schema.prices.stockId, stockId), eq(schema.prices.date, date), eq(schema.prices.source, source))).run();
    tx.insert(schema.prices).values({ stockId, date, price, source }).run();
  });
}

function saveFx(currency: string, date: string, rate: number) {
  db.transaction((tx) => {
    tx.delete(schema.fxRates)
      .where(and(eq(schema.fxRates.currency, currency), eq(schema.fxRates.date, date), eq(schema.fxRates.source, "yahoo")))
      .run();
    tx.insert(schema.fxRates).values({ currency, date, rateToKrw: rate, source: "yahoo" }).run();
  });
}

const g = globalThis as unknown as { __priceRefresh?: Promise<RefreshResult> };

/**
 * 현재가와 환율을 외부 시세에서 가져와 저장한다.
 * stockIds를 주면 그 종목만(단계와 무관), 없으면 진행 중인 모든 종목 + 필요한 통화 환율.
 * 동시에 두 번 돌지 않도록 진행 중인 작업이 있으면 그 결과를 기다린다.
 */
export function refreshPrices(opts: { stockIds?: number[] } = {}): Promise<RefreshResult> {
  if (!opts.stockIds && g.__priceRefresh) return g.__priceRefresh;
  const run = (async () => {
    const stocks = opts.stockIds
      ? db.select().from(schema.stocks).where(inArray(schema.stocks.id, opts.stockIds)).all()
      : db.select().from(schema.stocks).where(inArray(schema.stocks.stage, [...ACTIVE_STAGES])).all();

    const result: RefreshResult = { at: new Date().toISOString(), updated: [], failed: [], fx: [], fxFailed: [] };
    await pool(stocks, 4, async (s) => {
      const name = displayName(s);
      if (!s.ticker) {
        result.failed.push({ stockId: s.id, name, error: "티커가 없습니다." });
        return;
      }
      try {
        const q = await fetchStockQuote({ market: s.market, ticker: s.ticker, currency: s.currency });
        saveQuote(s.id, q.date, q.price, q.source);
        result.updated.push({ stockId: s.id, name, price: q.price, date: q.date, source: q.source });
      } catch (e) {
        result.failed.push({ stockId: s.id, name, error: e instanceof Error ? e.message : String(e) });
      }
    });

    if (!opts.stockIds) {
      const currencies = new Set<string>();
      for (const s of stocks) currencies.add(s.currency);
      for (const p of listPositions()) if (p.position.quantity > 0) currencies.add(p.stock.currency);
      for (const c of listCashBalances()) currencies.add(c.currency);
      currencies.delete("KRW");
      await pool([...currencies], 4, async (cur) => {
        try {
          const q = await fetchFxQuote(cur);
          saveFx(cur, q.date, q.price);
          result.fx.push({ currency: cur, rate: q.price, date: q.date });
        } catch (e) {
          result.fxFailed.push({ currency: cur, error: e instanceof Error ? e.message : String(e) });
        }
      });
      kvSet(KEY_AT, result.at);
      kvSet(KEY_RESULT, JSON.stringify(result));
    }
    return result;
  })();
  if (!opts.stockIds) {
    g.__priceRefresh = run;
    run.finally(() => {
      if (g.__priceRefresh === run) g.__priceRefresh = undefined;
    });
  }
  return run;
}
