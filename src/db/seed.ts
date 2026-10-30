import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { FISHER_15 } from "@/domain/checklist";
import { DEFAULT_PRINCIPLES } from "@/domain/principles";
import { DEFAULT_MISTAKE_TAGS } from "@/domain/review";
import * as schema from "./schema";

/** 2단계 1차 필터 기본 항목 */
export const DEFAULT_FILTER_ITEMS: (typeof schema.filterItems.$inferInsert)[] = [
  {
    text: "사업 모델을 한 문장으로 설명할 수 있다",
    requiresText: true,
    textPrompt: "이 회사는 ___에게 ___을 팔아 돈을 번다",
  },
  { text: "감사의견이 적정이다", autoKey: "audit_opinion" },
  { text: "최근 3년간 CB/BW 발행이나 유상증자를 반복하지 않았다", autoKey: "capital_raise" },
  { text: "최근 3년간 최대주주가 바뀌지 않았다", autoKey: "largest_holder_change" },
  { text: "영업현금흐름이 수년째 마이너스가 아니다", autoKey: "negative_ocf" },
].map((item, i) => ({ ...item, sortOrder: i, origin: "default" }));

/** 비어 있는 DB에만 기본 데이터를 넣는다. 여러 번 실행해도 안전하다. */
export function seed(db: BetterSQLite3Database<typeof schema>) {
  db.transaction((tx) => {
    const hasPrinciples = tx.select({ n: sql<number>`count(*)` }).from(schema.principles).get();
    if (!hasPrinciples?.n) {
      tx.insert(schema.principles).values({ id: 1, version: 1, data: DEFAULT_PRINCIPLES }).run();
      tx.insert(schema.principleVersions)
        .values({ version: 1, data: DEFAULT_PRINCIPLES, reason: "초기 생성 (기본값)" })
        .run();
    }
    const hasItems = tx.select({ n: sql<number>`count(*)` }).from(schema.filterItems).get();
    if (!hasItems?.n) {
      tx.insert(schema.filterItems).values(DEFAULT_FILTER_ITEMS).run();
    }
    const hasMistakeTags = tx.select({ n: sql<number>`count(*)` }).from(schema.mistakeTags).get();
    if (!hasMistakeTags?.n) {
      tx.insert(schema.mistakeTags).values(DEFAULT_MISTAKE_TAGS.map((name) => ({ name, builtin: true }))).run();
    }
    const hasTemplates = tx.select({ n: sql<number>`count(*)` }).from(schema.checklistTemplates).get();
    if (!hasTemplates?.n) {
      const tpl = tx.insert(schema.checklistTemplates)
        .values({ name: FISHER_15.name, description: FISHER_15.description, builtin: true })
        .returning({ id: schema.checklistTemplates.id })
        .get();
      tx.insert(schema.checklistTemplateItems)
        .values(FISHER_15.items.map((it, i) => ({ templateId: tpl.id, text: it.text, help: it.help ?? null, sortOrder: i })))
        .run();
    }
  });
}
