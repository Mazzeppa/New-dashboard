import "server-only";
import { and, asc, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { GateContext, PipelineStage } from "@/domain/pipeline";
import { db, schema } from "./index";

const { stocks, prices, stageTransitions, filterItems, filterResults, principles, principleVersions } = schema;

export function getPrinciples() {
  const row = db.select().from(principles).where(eq(principles.id, 1)).get();
  if (!row) throw new Error("원칙 데이터가 없습니다.");
  return row;
}

export function listPrincipleVersions() {
  return db.select().from(principleVersions).orderBy(desc(principleVersions.version)).all();
}

/** 종목별 최신 가격 (date 최신, 같은 날이면 나중에 입력한 것) */
const latestPrice = db
  .select({
    stockId: prices.stockId,
    price: prices.price,
    date: prices.date,
    rn: sql<number>`row_number() over (partition by ${prices.stockId} order by ${prices.date} desc, ${prices.id} desc)`.as("rn"),
  })
  .from(prices)
  .as("lp");

export type StockWithPrice = typeof schema.stocks.$inferSelect & {
  price: number | null;
  priceDate: string | null;
};

export function listStocks(opts: { includeRejected?: boolean } = {}): StockWithPrice[] {
  return db
    .select({
      stock: stocks,
      price: latestPrice.price,
      priceDate: latestPrice.date,
    })
    .from(stocks)
    .leftJoin(latestPrice, and(eq(latestPrice.stockId, stocks.id), eq(latestPrice.rn, 1)))
    .where(opts.includeRejected ? undefined : ne(stocks.stage, "rejected"))
    .orderBy(desc(stocks.updatedAt))
    .all()
    .map((r) => ({ ...r.stock, price: r.price, priceDate: r.priceDate }));
}

export function listRejected() {
  return db.select().from(stocks).where(eq(stocks.stage, "rejected")).orderBy(desc(stocks.stageChangedAt)).all();
}

export function getStock(id: number): StockWithPrice | null {
  const row = db
    .select({ stock: stocks, price: latestPrice.price, priceDate: latestPrice.date })
    .from(stocks)
    .leftJoin(latestPrice, and(eq(latestPrice.stockId, stocks.id), eq(latestPrice.rn, 1)))
    .where(eq(stocks.id, id))
    .get();
  return row ? { ...row.stock, price: row.price, priceDate: row.priceDate } : null;
}

export function listPrices(stockId: number) {
  return db.select().from(prices).where(eq(prices.stockId, stockId)).orderBy(desc(prices.date), desc(prices.id)).all();
}

export function listTransitions(stockId: number) {
  return db
    .select()
    .from(stageTransitions)
    .where(eq(stageTransitions.stockId, stockId))
    .orderBy(desc(stageTransitions.createdAt), desc(stageTransitions.id))
    .all();
}

/** 게이트를 우회한 이동 기록 */
export function listBypassRecords(limit = 20) {
  return db
    .select({ t: stageTransitions, name: stocks.name, ticker: stocks.ticker })
    .from(stageTransitions)
    .innerJoin(stocks, eq(stocks.id, stageTransitions.stockId))
    .where(isNotNull(stageTransitions.bypassReason))
    .orderBy(desc(stageTransitions.createdAt))
    .limit(limit)
    .all();
}

/**
 * 게이트 판정용 컨텍스트.
 * 가치평가·메모·복기 테이블은 이후 개발 단계에서 추가되며, 그때 이 함수를 채운다.
 */
export function getGateContext(stockId: number): GateContext {
  const s = db.select({ rejectedFromStage: stocks.rejectedFromStage }).from(stocks).where(eq(stocks.id, stockId)).get();
  return {
    hasValuation: false,
    memoComplete: false,
    memoConfirmed: false,
    hasRetrospective: false,
    rejectedFromStage: (s?.rejectedFromStage ?? null) as PipelineStage | null,
  };
}

export function stageCounts(): Record<string, number> {
  const rows = db
    .select({ stage: stocks.stage, n: sql<number>`count(*)` })
    .from(stocks)
    .groupBy(stocks.stage)
    .all();
  return Object.fromEntries(rows.map((r) => [r.stage, r.n]));
}

export function listFilterItems(opts: { activeOnly?: boolean } = {}) {
  return db
    .select()
    .from(filterItems)
    .where(opts.activeOnly ? eq(filterItems.active, true) : undefined)
    .orderBy(asc(filterItems.sortOrder), asc(filterItems.id))
    .all();
}

export function listFilterResults(stockId: number) {
  return db.select().from(filterResults).where(eq(filterResults.stockId, stockId)).all();
}
