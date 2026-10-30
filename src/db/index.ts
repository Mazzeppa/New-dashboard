import "server-only";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { seed } from "./seed";

export type DB = BetterSQLite3Database<typeof schema>;

function open(): DB {
  const file = path.resolve(process.env.DATABASE_PATH ?? "./data/app.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  // 앱이 처음 DB에 접근할 때 마이그레이션과 기본 데이터를 적용한다.
  migrate(db, { migrationsFolder: path.resolve("./drizzle") });
  seed(db);
  return db;
}

// dev 서버의 HMR에서 연결이 중복 생성되지 않도록 전역에 보관한다.
const g = globalThis as unknown as { __db?: DB };
export const db: DB = g.__db ?? (g.__db = open());
export { schema };
