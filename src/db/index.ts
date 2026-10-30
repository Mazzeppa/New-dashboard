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
  sqlite.pragma("busy_timeout = 5000");
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

function instance(): DB {
  return (g.__db ??= open());
}

/**
 * 첫 사용 시점에 연결한다. import만으로는 DB를 열지 않으므로
 * `next build`가 여러 워커에서 모듈을 불러와도 마이그레이션이 경쟁하지 않는다.
 */
export const db: DB = new Proxy({} as DB, {
  get(_target, prop) {
    const real = instance();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
export { schema };
