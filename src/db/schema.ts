import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { AnalysisAnswers, AnalysisSection } from "@/domain/analysis";
import type { FinancialSource } from "@/domain/financials";
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

// ── 3단계: 심층 분석 ────────────────────────────────────────────
/** 비재무 탭(사업 이해, 경쟁우위, 경영진·지배구조). 종목·탭당 한 행 */
export const analysisSections = sqliteTable(
  "analysis_sections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stockId: integer("stock_id").notNull().references(() => stocks.id, { onDelete: "cascade" }),
    section: text("section").$type<AnalysisSection>().notNull(),
    answers: text("answers", { mode: "json" }).$type<AnalysisAnswers>().notNull().default(sql`'{}'`),
    /** 1~5 */
    score: integer("score"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("analysis_sections_stock_section_uq").on(t.stockId, t.section)],
);

/**
 * 재무 데이터 (긴 형식). 값은 거래 통화의 원 단위, 주식 수는 주 단위.
 * fiscalQuarter 0 = 연간. 출처(source)와 원천 계정(sourceRef)을 함께 남긴다.
 */
export const financialValues = sqliteTable(
  "financial_values",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stockId: integer("stock_id").notNull().references(() => stocks.id, { onDelete: "cascade" }),
    fiscalYear: integer("fiscal_year").notNull(),
    fiscalQuarter: integer("fiscal_quarter").notNull().default(0),
    metric: text("metric").notNull(),
    value: real("value").notNull(),
    source: text("source").$type<FinancialSource>().notNull(),
    /** 원천 계정ID·XBRL 태그·보고서명 등 */
    sourceRef: text("source_ref"),
    /** 연결(true) / 별도(false) / 모름(null) */
    consolidated: integer("consolidated", { mode: "boolean" }),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("financial_values_uq").on(t.stockId, t.fiscalYear, t.fiscalQuarter, t.metric),
    index("financial_values_stock_idx").on(t.stockId),
  ],
);

// ── 체크리스트 템플릿 ───────────────────────────────────────────
export const checklistTemplates = sqliteTable("checklist_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  /** 기본 제공 템플릿(필립 피셔 15 등) */
  builtin: integer("builtin", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

export const checklistTemplateItems = sqliteTable(
  "checklist_template_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    templateId: integer("template_id").notNull().references(() => checklistTemplates.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    help: text("help"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("checklist_template_items_tpl_idx").on(t.templateId)],
);

/** 종목에 적용한 템플릿 */
export const stockChecklists = sqliteTable(
  "stock_checklists",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stockId: integer("stock_id").notNull().references(() => stocks.id, { onDelete: "cascade" }),
    templateId: integer("template_id").notNull().references(() => checklistTemplates.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("stock_checklists_uq").on(t.stockId, t.templateId)],
);

export const checklistAnswers = sqliteTable(
  "checklist_answers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stockChecklistId: integer("stock_checklist_id").notNull().references(() => stockChecklists.id, { onDelete: "cascade" }),
    itemId: integer("item_id").notNull().references(() => checklistTemplateItems.id, { onDelete: "restrict" }),
    /** 1~5 */
    score: integer("score"),
    memo: text("memo"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("checklist_answers_uq").on(t.stockChecklistId, t.itemId)],
);

export type Stock = typeof stocks.$inferSelect;
export type StageTransition = typeof stageTransitions.$inferSelect;
export type FilterItem = typeof filterItems.$inferSelect;
export type FilterResult = typeof filterResults.$inferSelect;
export type PriceRow = typeof prices.$inferSelect;
export type AnalysisSectionRow = typeof analysisSections.$inferSelect;
export type FinancialValue = typeof financialValues.$inferSelect;
export type ChecklistTemplate = typeof checklistTemplates.$inferSelect;
export type ChecklistTemplateItem = typeof checklistTemplateItems.$inferSelect;
export type ChecklistAnswer = typeof checklistAnswers.$inferSelect;
