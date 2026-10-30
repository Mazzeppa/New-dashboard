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

/** 종목별 최신 가격 (date 최신, 같은 날이면 나중에 입력한 것). 모듈 로드 시 DB를 열지 않도록 함수로 둔다 */
const latestPriceSubquery = () =>
  db
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
  const latestPrice = latestPriceSubquery();
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
  const latestPrice = latestPriceSubquery();
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

// ── 3단계: 심층 분석 ────────────────────────────────────────────
export function getAnalysisSections(stockId: number) {
  const rows = db.select().from(schema.analysisSections).where(eq(schema.analysisSections.stockId, stockId)).all();
  return Object.fromEntries(rows.map((r) => [r.section, r])) as Partial<Record<string, (typeof rows)[number]>>;
}

export function listFinancialValues(stockId: number) {
  return db
    .select()
    .from(schema.financialValues)
    .where(eq(schema.financialValues.stockId, stockId))
    .orderBy(asc(schema.financialValues.fiscalYear), asc(schema.financialValues.fiscalQuarter))
    .all();
}

// ── 체크리스트 템플릿 ───────────────────────────────────────────
export function listTemplates() {
  const { checklistTemplates: t, checklistTemplateItems: i, stockChecklists: sc } = schema;
  return db
    .select({
      template: t,
      itemCount: sql<number>`(select count(*) from ${i} where ${i.templateId} = ${t.id} and ${i.active} = 1)`,
      usedBy: sql<number>`(select count(*) from ${sc} where ${sc.templateId} = ${t.id})`,
    })
    .from(t)
    .orderBy(desc(t.builtin), asc(t.id))
    .all();
}

export function getTemplateWithItems(templateId: number) {
  const template = db.select().from(schema.checklistTemplates).where(eq(schema.checklistTemplates.id, templateId)).get();
  if (!template) return null;
  const items = db
    .select({
      item: schema.checklistTemplateItems,
      used: sql<number>`(select count(*) from ${schema.checklistAnswers} where ${schema.checklistAnswers.itemId} = ${schema.checklistTemplateItems.id})`,
    })
    .from(schema.checklistTemplateItems)
    .where(eq(schema.checklistTemplateItems.templateId, templateId))
    .orderBy(asc(schema.checklistTemplateItems.sortOrder), asc(schema.checklistTemplateItems.id))
    .all();
  return { template, items: items.map((r) => ({ ...r.item, used: r.used })) };
}

/** 종목에 적용된 체크리스트: 템플릿, 항목(활성 + 답이 있는 비활성), 답 */
export function getStockChecklists(stockId: number) {
  const applied = db
    .select({ sc: schema.stockChecklists, template: schema.checklistTemplates })
    .from(schema.stockChecklists)
    .innerJoin(schema.checklistTemplates, eq(schema.checklistTemplates.id, schema.stockChecklists.templateId))
    .where(eq(schema.stockChecklists.stockId, stockId))
    .orderBy(asc(schema.stockChecklists.id))
    .all();
  return applied.map(({ sc, template }) => {
    const answers = db.select().from(schema.checklistAnswers).where(eq(schema.checklistAnswers.stockChecklistId, sc.id)).all();
    const answered = new Set(answers.filter((a) => a.score != null || a.memo).map((a) => a.itemId));
    const items = db
      .select()
      .from(schema.checklistTemplateItems)
      .where(eq(schema.checklistTemplateItems.templateId, template.id))
      .orderBy(asc(schema.checklistTemplateItems.sortOrder), asc(schema.checklistTemplateItems.id))
      .all()
      .filter((i) => i.active || answered.has(i.id));
    return { id: sc.id, createdAt: sc.createdAt, template, items, answers };
  });
}

export function listFetchLogs(stockId: number, limit = 5) {
  return db
    .select()
    .from(schema.fetchLogs)
    .where(eq(schema.fetchLogs.stockId, stockId))
    .orderBy(desc(schema.fetchLogs.createdAt), desc(schema.fetchLogs.id))
    .limit(limit)
    .all();
}
