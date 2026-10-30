import "server-only";
import { and, asc, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { GateContext, PipelineStage } from "@/domain/pipeline";
import { hasValuationResult } from "@/domain/valuation";
import { memoMissing } from "@/domain/memo";
import { computePosition } from "@/domain/portfolio";
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
 */
export function getGateContext(stockId: number): GateContext {
  const s = db.select({ rejectedFromStage: stocks.rejectedFromStage }).from(stocks).where(eq(stocks.id, stockId)).get();
  const valuation = getValuation(stockId);
  const memos = listMemos(stockId);
  const confirmed = memos.find((m) => m.status === "confirmed");
  return {
    hasValuation: !!valuation && hasValuationResult(valuation.data),
    // 확정본이 있으면 필수 항목은 확정 때 이미 검증됐다. 없으면 작성 중인 버전을 본다
    memoComplete: !!confirmed || (!!memos[0] && memoMissing(memos[0].content).length === 0),
    memoConfirmed: !!confirmed,
    hasRetrospective: listRetrospectives(stockId).some((r) => r.kind === "final"),
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

export function getValuation(stockId: number) {
  return db.select().from(schema.valuations).where(eq(schema.valuations.stockId, stockId)).get() ?? null;
}

// ── 5단계: 메모 ─────────────────────────────────────────────────
/** 최신 버전이 앞 */
export function listMemos(stockId: number) {
  return db.select().from(schema.memos).where(eq(schema.memos.stockId, stockId)).orderBy(desc(schema.memos.version)).all();
}

export function getMemo(id: number) {
  return db.select().from(schema.memos).where(eq(schema.memos.id, id)).get() ?? null;
}

// ── 6단계: 매매·포트폴리오 ──────────────────────────────────────
export function listTrades(stockId: number) {
  return db.select().from(schema.trades).where(eq(schema.trades.stockId, stockId)).orderBy(desc(schema.trades.date), desc(schema.trades.id)).all();
}

export function listPositionPlans(stockId: number) {
  return db.select().from(schema.positionPlans).where(eq(schema.positionPlans.stockId, stockId)).orderBy(desc(schema.positionPlans.createdAt)).all();
}

/** 통화별 최신 환율 */
export function latestFxRates(): Record<string, { rate: number; date: string }> {
  const rows = db.select().from(schema.fxRates).orderBy(asc(schema.fxRates.date), asc(schema.fxRates.id)).all();
  const out: Record<string, { rate: number; date: string }> = {};
  for (const r of rows) out[r.currency] = { rate: r.rateToKrw, date: r.date };
  return out;
}

export function listFxRates(limit = 50) {
  return db.select().from(schema.fxRates).orderBy(desc(schema.fxRates.date), desc(schema.fxRates.id)).limit(limit).all();
}

export function listCashBalances() {
  return db.select().from(schema.cashBalances).orderBy(asc(schema.cashBalances.currency)).all();
}

export function listTags() {
  return db.select().from(schema.tags).orderBy(asc(schema.tags.name)).all();
}

export function stockTagNames(stockId: number): string[] {
  return db
    .select({ name: schema.tags.name })
    .from(schema.stockTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.stockTags.tagId))
    .where(eq(schema.stockTags.stockId, stockId))
    .orderBy(asc(schema.tags.name))
    .all()
    .map((r) => r.name);
}

/** 매매 기록이 있는 모든 종목의 포지션 (포트폴리오·비중 계산용) */
export function listPositions() {
  const allTrades = db.select().from(schema.trades).all();
  const byStock = new Map<number, typeof allTrades>();
  for (const t of allTrades) byStock.set(t.stockId, [...(byStock.get(t.stockId) ?? []), t]);
  const stocksById = new Map(listStocks({ includeRejected: true }).map((s) => [s.id, s]));
  const tagRows = db
    .select({ stockId: schema.stockTags.stockId, name: schema.tags.name })
    .from(schema.stockTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.stockTags.tagId))
    .all();
  return [...byStock.entries()].flatMap(([stockId, ts]) => {
    const stock = stocksById.get(stockId);
    if (!stock) return [];
    return [{ stock, position: computePosition(ts), tags: tagRows.filter((t) => t.stockId === stockId).map((t) => t.name) }];
  });
}

// ── 7·8단계: 점검·복기 ─────────────────────────────────────────
export function listHoldingReviews(stockId: number) {
  return db
    .select()
    .from(schema.holdingReviews)
    .where(eq(schema.holdingReviews.stockId, stockId))
    .orderBy(desc(schema.holdingReviews.reviewDate), desc(schema.holdingReviews.id))
    .all();
}

function tagsByRetro(): Map<number, string[]> {
  const rows = db
    .select({ retroId: schema.retrospectiveTags.retrospectiveId, name: schema.mistakeTags.name })
    .from(schema.retrospectiveTags)
    .innerJoin(schema.mistakeTags, eq(schema.mistakeTags.id, schema.retrospectiveTags.tagId))
    .all();
  const m = new Map<number, string[]>();
  for (const r of rows) m.set(r.retroId, [...(m.get(r.retroId) ?? []), r.name]);
  return m;
}

export function listRetrospectives(stockId: number) {
  const tags = tagsByRetro();
  return db
    .select()
    .from(schema.retrospectives)
    .where(eq(schema.retrospectives.stockId, stockId))
    .orderBy(desc(schema.retrospectives.date), desc(schema.retrospectives.id))
    .all()
    .map((r) => ({ ...r, tags: tags.get(r.id) ?? [] }));
}

/** 대시보드 통계용: 모든 복기 (중간 복기 포함) */
export function listAllRetrospectives() {
  const tags = tagsByRetro();
  return db
    .select({ r: schema.retrospectives, name: stocks.name, ticker: stocks.ticker })
    .from(schema.retrospectives)
    .innerJoin(stocks, eq(stocks.id, schema.retrospectives.stockId))
    .orderBy(desc(schema.retrospectives.date))
    .all()
    .map(({ r, name, ticker }) => ({ ...r, stockName: name ?? ticker ?? "", tags: tags.get(r.id) ?? [] }));
}

export function listMistakeTags() {
  return db.select().from(schema.mistakeTags).orderBy(desc(schema.mistakeTags.builtin), asc(schema.mistakeTags.name)).all();
}

/** 보유 종목별 마지막 점검일과 보유 시작 시점(보유 단계로 들어온 시각) */
export function holdingReviewStatus() {
  const holding = db.select().from(stocks).where(eq(stocks.stage, "holding")).all();
  return holding.map((s) => {
    const last = db
      .select({ d: schema.holdingReviews.reviewDate })
      .from(schema.holdingReviews)
      .where(eq(schema.holdingReviews.stockId, s.id))
      .orderBy(desc(schema.holdingReviews.reviewDate))
      .limit(1)
      .get();
    const lastRetro = db
      .select({ d: schema.retrospectives.date })
      .from(schema.retrospectives)
      .where(eq(schema.retrospectives.stockId, s.id))
      .orderBy(desc(schema.retrospectives.date))
      .limit(1)
      .get();
    return { stock: s, lastReviewDate: last?.d ?? null, lastRetroDate: lastRetro?.d ?? null, holdingSince: s.stageChangedAt };
  });
}

/** 진행 중인 종목들의 최신 메모 촉매. 마지막 보유 점검에서 발생·빗나감으로 표시한 촉매는 뺀다 */
export function activeCatalysts() {
  const active = db.select().from(stocks).all().filter((s) => !["rejected", "sold", "reviewed"].includes(s.stage));
  return active.flatMap((s) => {
    const memo = listMemos(s.id)[0];
    if (!memo) return [];
    const lastReview = listHoldingReviews(s.id)[0];
    const resolved = new Set((lastReview?.catalysts ?? []).filter((c) => c.status !== "pending").map((c) => c.description));
    return memo.content.catalysts
      .filter((c) => c.expectedDate && c.description.trim() && !resolved.has(c.description))
      .map((c) => ({ stockId: s.id, stockName: s.name ?? s.ticker ?? "", description: c.description, expectedDate: c.expectedDate! }));
  });
}

/** 매도했지만 최종 복기가 없는 종목 */
export function stocksAwaitingRetro() {
  const sold = db.select().from(stocks).where(eq(stocks.stage, "sold")).all();
  return sold.filter((s) => !listRetrospectives(s.id).some((r) => r.kind === "final"));
}

/** 특정 종목의 게이트 우회 기록 */
export function listStockBypasses(stockId: number) {
  return db
    .select()
    .from(stageTransitions)
    .where(and(eq(stageTransitions.stockId, stockId), isNotNull(stageTransitions.bypassReason)))
    .orderBy(asc(stageTransitions.createdAt))
    .all();
}

export function listMistakeTagsWithUsage() {
  const used = db
    .select({ tagId: schema.retrospectiveTags.tagId, n: sql<number>`count(*)` })
    .from(schema.retrospectiveTags)
    .groupBy(schema.retrospectiveTags.tagId)
    .all();
  const m = new Map(used.map((u) => [u.tagId, u.n]));
  return listMistakeTags().map((t) => ({ ...t, used: m.get(t.id) ?? 0 }));
}
