import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { CompanyFacts } from "./normalize";

const TICKERS_TTL_DAYS = 30;

export class SecError extends Error {}

function headers(): HeadersInit {
  const ua = process.env.SEC_USER_AGENT?.trim();
  if (!ua) throw new SecError("SEC_USER_AGENT가 설정되지 않았습니다. .env에 '이름 이메일' 형식으로 넣으세요 (SEC 요구사항).");
  return { "User-Agent": ua, Accept: "application/json" };
}

async function getJson<T>(url: string, timeoutMs: number): Promise<T> {
  const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (res.status === 404) throw new SecError("SEC에 해당 회사의 XBRL 데이터가 없습니다.");
  if (res.status === 403) throw new SecError("SEC가 요청을 거부했습니다. SEC_USER_AGENT에 실제 이름과 이메일을 넣었는지 확인하세요.");
  if (!res.ok) throw new SecError(`SEC 응답 오류 (HTTP ${res.status})`);
  return (await res.json()) as T;
}

export async function syncSecTickers(): Promise<number> {
  const data = await getJson<Record<string, { cik_str: number; ticker: string; title: string }>>("https://www.sec.gov/files/company_tickers.json", 60_000);
  const rows = Object.values(data).map((r) => ({ ticker: r.ticker.toUpperCase(), cik: String(r.cik_str).padStart(10, "0"), title: r.title }));
  const unique = [...new Map(rows.map((r) => [r.ticker, r])).values()];
  db.transaction((tx) => {
    tx.delete(schema.secTickers).run();
    for (let i = 0; i < unique.length; i += 500) tx.insert(schema.secTickers).values(unique.slice(i, i + 500)).run();
    const now = new Date().toISOString();
    tx.insert(schema.kv).values({ key: "sec_tickers_synced_at", value: now }).onConflictDoUpdate({ target: schema.kv.key, set: { value: now, updatedAt: now } }).run();
  });
  return unique.length;
}

/** 티커 → CIK. SEC는 클래스 주식을 BRK-B처럼 하이픈으로 쓴다 */
export async function resolveCik(ticker: string): Promise<{ cik: string; title: string } | null> {
  const synced = db.select().from(schema.kv).where(eq(schema.kv.key, "sec_tickers_synced_at")).get();
  const count = db.select({ n: sql<number>`count(*)` }).from(schema.secTickers).get()?.n ?? 0;
  if (!synced || !count || Date.now() - Date.parse(synced.value) > TICKERS_TTL_DAYS * 86_400_000) await syncSecTickers();
  const t = ticker.toUpperCase();
  for (const candidate of [t, t.replace(/\./g, "-"), t.replace(/[.-]/g, "")]) {
    const r = db.select().from(schema.secTickers).where(eq(schema.secTickers.ticker, candidate)).get();
    if (r) return { cik: r.cik, title: r.title };
  }
  return null;
}

export async function fetchCompanyFacts(cik: string): Promise<CompanyFacts> {
  return getJson<CompanyFacts>(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik.padStart(10, "0")}.json`, 120_000);
}
