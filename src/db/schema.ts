import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Principles } from "@/domain/principles";
import type { GateFailure, PipelineStage, SellReasonType, Stage } from "@/domain/pipeline";
import type { DiscoverySource, Market } from "@/domain/stock";

/** 모든 시각은 ISO 문자열, 날짜는 YYYY-MM-DD 문자열로 저장한다. */
const createdAt = () => text("created_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);
const updatedAt = () => text("updated_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

// ── 0단계: 투자 원칙 ─────────────────────────────────────────────
/** 현재 원칙. 항상 id=1 한 행 */
export const principles = sqliteTable("principles", {
  id: integer("id").primaryKey(),
  version: integer("version").notNull(),
  data: text("data", { mode: "json" }).$type<Principles>().notNull(),
  updatedAt: updatedAt(),
});

export const principleVersions = sqliteTable("principle_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  version: integer("version").notNull().unique(),
  data: text("data", { mode: "json" }).$type<Principles>().notNull(),
  reason: text("reason").notNull(),
  createdAt: createdAt(),
});

// ── 종목과 파이프라인 ───────────────────────────────────────────
export const stocks = sqliteTable(
  "stocks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    market: text("market").$type<Market>().notNull(),
    ticker: text("ticker"),
    name: text("name"),
    currency: text("currency").notNull(),
    industry: text("industry"),
    /** DART 고유번호 (한국) */
    corpCode: text("corp_code"),
    /** SEC CIK (미국) */
    cik: text("cik"),
    stage: text("stage").$type<Stage>().notNull().default("idea"),
    stageChangedAt: text("stage_changed_at").notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    discoverySource: text("discovery_source").$type<DiscoverySource>().notNull().default("other"),
    discoverySourceNote: text("discovery_source_note"),
    note: text("note"),
    watchLow: real("watch_low"),
    watchHigh: real("watch_high"),
    rejectedFromStage: text("rejected_from_stage").$type<PipelineStage>(),
    rejectReason: text("reject_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("stocks_market_ticker_uq").on(t.market, t.ticker),
    index("stocks_stage_idx").on(t.stage),
  ],
);

export const stageTransitions = sqliteTable(
  "stage_transitions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stockId: integer("stock_id").notNull().references(() => stocks.id, { onDelete: "cascade" }),
    /** null = 신규 등록 */
    fromStage: text("from_stage").$type<Stage>(),
    toStage: text("to_stage").$type<Stage>().notNull(),
    /** 이동 시점에 실패했던 게이트 목록 (우회한 경우) */
    gateFailures: text("gate_failures", { mode: "json" }).$type<GateFailure[]>().notNull().default(sql`'[]'`),
    bypassReason: text("bypass_reason"),
    rejectReason: text("reject_reason"),
    sellReasonType: text("sell_reason_type").$type<SellReasonType>(),
    sellReasonText: text("sell_reason_text"),
    createdAt: createdAt(),
  },
  (t) => [index("stage_transitions_stock_idx").on(t.stockId)],
);

// ── 가격 ─────────────────────────────────────────────────────────
export const prices = sqliteTable(
  "prices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stockId: integer("stock_id").notNull().references(() => stocks.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    price: real("price").notNull(),
    /** manual | 이후 추가될 provider 이름 */
    source: text("source").notNull().default("manual"),
    createdAt: createdAt(),
  },
  (t) => [index("prices_stock_date_idx").on(t.stockId, t.date)],
);

// ── 2단계: 1차 필터 ──────────────────────────────────────────────
export const filterItems = sqliteTable("filter_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  description: text("description"),
  /** 이 항목을 통과하려면 서술 입력이 필요한가 (예: 사업 모델 한 문장) */
  requiresText: integer("requires_text", { mode: "boolean" }).notNull().default(false),
  textPrompt: text("text_prompt"),
  /** DART 자동 체크 키 (audit_opinion, capital_raise, largest_holder_change, cb_issue, negative_ocf) */
  autoKey: text("auto_key"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  /** default | user | lesson */
  origin: text("origin").notNull().default("user"),
  /** origin=lesson일 때 출처 복기 id */
  originRef: integer("origin_ref"),
  createdAt: createdAt(),
});

export type FilterAnswer = "yes" | "no";

export const filterResults = sqliteTable(
  "filter_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stockId: integer("stock_id").notNull().references(() => stocks.id, { onDelete: "cascade" }),
    itemId: integer("item_id").notNull().references(() => filterItems.id, { onDelete: "cascade" }),
    answer: text("answer").$type<FilterAnswer>(),
    text: text("text"),
    /** 자동 체크 결과 (사용자가 확인 전) */
    autoAnswer: text("auto_answer").$type<FilterAnswer>(),
    autoEvidence: text("auto_evidence"),
    autoCheckedAt: text("auto_checked_at"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("filter_results_stock_item_uq").on(t.stockId, t.itemId)],
);

export type Stock = typeof stocks.$inferSelect;
export type StageTransition = typeof stageTransitions.$inferSelect;
export type FilterItem = typeof filterItems.$inferSelect;
export type FilterResult = typeof filterResults.$inferSelect;
export type PriceRow = typeof prices.$inferSelect;
