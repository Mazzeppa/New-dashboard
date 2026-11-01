import "server-only";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { db, schema } from "@/db";

export const BACKUP_APP = "value-process";

/**
 * 백업에 포함하는 테이블. 외래키 순서대로(참조되는 쪽 먼저) 나열한다.
 * 외부 API 캐시(dart_corps, sec_tickers, kv)는 다시 받을 수 있으므로 뺀다.
 */
const TABLES: [string, SQLiteTable][] = [
  ["principles", schema.principles],
  ["principleVersions", schema.principleVersions],
  ["stocks", schema.stocks],
  ["stageTransitions", schema.stageTransitions],
  ["prices", schema.prices],
  ["filterItems", schema.filterItems],
  ["filterResults", schema.filterResults],
  ["analysisSections", schema.analysisSections],
  ["financialValues", schema.financialValues],
  ["fetchLogs", schema.fetchLogs],
  ["checklistTemplates", schema.checklistTemplates],
  ["checklistTemplateItems", schema.checklistTemplateItems],
  ["stockChecklists", schema.stockChecklists],
  ["checklistAnswers", schema.checklistAnswers],
  ["valuations", schema.valuations],
  ["memos", schema.memos],
  ["positionPlans", schema.positionPlans],
  ["trades", schema.trades],
  ["fxRates", schema.fxRates],
  ["cashBalances", schema.cashBalances],
  ["tags", schema.tags],
  ["stockTags", schema.stockTags],
  ["holdingReviews", schema.holdingReviews],
  ["retrospectives", schema.retrospectives],
  ["mistakeTags", schema.mistakeTags],
  ["retrospectiveTags", schema.retrospectiveTags],
];

/** 적용된 마이그레이션 수 = 데이터 스키마 버전 */
export function schemaVersion(): number {
  const row = db.get<{ n: number }>(sql`select count(*) as n from __drizzle_migrations`);
  return row?.n ?? 0;
}

/** 테이블별 행 수 (설정 화면 표시용) */
export function countRows(): Record<string, number> {
  return Object.fromEntries(TABLES.map(([name, table]) => [name, db.select({ n: sql<number>`count(*)` }).from(table).get()?.n ?? 0]));
}

export interface Backup {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  counts: Record<string, number>;
  tables: Record<string, Record<string, unknown>[]>;
}

export function exportBackup(): Backup {
  const tables: Backup["tables"] = {};
  const counts: Record<string, number> = {};
  for (const [name, table] of TABLES) {
    const rows = db.select().from(table).all() as Record<string, unknown>[];
    tables[name] = rows;
    counts[name] = rows.length;
  }
  return { app: BACKUP_APP, schemaVersion: schemaVersion(), exportedAt: new Date().toISOString(), counts, tables };
}

const backupSchema = z.object({
  app: z.literal(BACKUP_APP, "이 앱의 백업 파일이 아닙니다."),
  schemaVersion: z.number().int(),
  exportedAt: z.string(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

/** 가져오기 전에 현재 데이터를 data/backups/에 자동 저장한다 */
function savePreImportCopy(): string {
  const dir = path.resolve(path.dirname(process.env.DATABASE_PATH ?? "./data/app.db"), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `pre-import-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(exportBackup()));
  return file;
}

export interface ImportResult {
  counts: Record<string, number>;
  skippedTables: string[];
  preImportCopy: string;
}

/**
 * 백업으로 전체 데이터를 교체한다. 한 트랜잭션에서 지우고 다시 넣으므로 실패하면 그대로다.
 * 더 새 버전 앱의 백업은 거부한다. 예전 버전 백업은 받는다(마이그레이션이 추가만 하기 때문).
 */
export function importBackup(raw: unknown): ImportResult {
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "백업 파일 형식이 올바르지 않습니다.");
  const b = parsed.data;
  const current = schemaVersion();
  // 마이그레이션은 테이블·컬럼 추가만 하므로 예전 백업은 그대로 넣을 수 있다(없는 컬럼은 기본값, 없는 테이블은 빈 채로).
  // 더 새 버전 앱의 백업은 모르는 컬럼이 있을 수 있어 거부한다.
  if (b.schemaVersion > current) {
    throw new Error(`더 새 버전 앱의 백업입니다 (백업 ${b.schemaVersion}, 현재 앱 ${current}). 앱을 업데이트한 뒤 복원하세요.`);
  }
  const known = new Set(TABLES.map(([n]) => n));
  const skippedTables = Object.keys(b.tables).filter((n) => !known.has(n));
  if (!b.tables.principles?.length) throw new Error("백업에 투자 원칙이 없습니다. 손상된 파일일 수 있습니다.");

  const preImportCopy = savePreImportCopy();
  const counts: Record<string, number> = {};
  db.transaction((tx) => {
    tx.run(sql`PRAGMA defer_foreign_keys = ON`);
    for (const [, table] of [...TABLES].reverse()) tx.delete(table).run();
    for (const [name, table] of TABLES) {
      const rows = b.tables[name] ?? [];
      for (let i = 0; i < rows.length; i += 200) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tx.insert(table).values(rows.slice(i, i + 200) as any).run();
      }
      counts[name] = rows.length;
    }
  });
  return { counts, skippedTables, preImportCopy };
}
