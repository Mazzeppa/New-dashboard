import "server-only";
import { eq, sql } from "drizzle-orm";
import { unzipSync, strFromU8 } from "fflate";
import { db, schema } from "@/db";
import { quarterlyFromCumulative } from "@/domain/metrics";
import { pool } from "@/lib/pool";
import {
  checkAuditOpinion,
  checkCapitalRaises,
  checkLargestHolderChange,
  commonSharesOutstanding,
  DART_MAPPING,
  normalizeDartStatement,
  type AuditRow,
  type BondDecisionRow,
  type CapitalChangeRow,
  type CheckResult,
  type DartAccountRow,
  type DartStockTotalRow,
  type HolderChangeRow,
  type NormalizedStatement,
} from "./normalize";

const BASE = "https://opendart.fss.or.kr/api";
const CORPS_TTL_DAYS = 30;

export class DartError extends Error {}

function apiKey(): string {
  const key = process.env.DART_API_KEY;
  if (!key) throw new DartError("DART_API_KEY가 설정되지 않았습니다. .env를 확인하세요.");
  return key;
}

const STATUS_MESSAGES: Record<string, string> = {
  "010": "등록되지 않은 DART API 키입니다.",
  "011": "사용할 수 없는 DART API 키입니다.",
  "012": "접근할 수 없는 IP입니다.",
  "020": "DART 요청 한도를 넘었습니다(하루 2만 건). 내일 다시 시도하세요.",
  "800": "DART 시스템 점검 중입니다.",
  "900": "DART에서 알 수 없는 오류가 발생했습니다.",
};

/** DART JSON API 호출. 데이터 없음(013)은 null, 그 밖의 오류는 DartError */
export async function dartList<T>(endpoint: string, params: Record<string, string>): Promise<T[] | null> {
  const qs = new URLSearchParams({ crtfc_key: apiKey(), ...params });
  const res = await fetch(`${BASE}/${endpoint}.json?${qs}`, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
  if (!res.ok) throw new DartError(`DART 응답 오류 (HTTP ${res.status})`);
  const body = (await res.json()) as { status: string; message: string; list?: T[] };
  if (body.status === "013") return null;
  if (body.status !== "000") throw new DartError(STATUS_MESSAGES[body.status] ?? `DART 오류 ${body.status}: ${body.message}`);
  return body.list ?? [];
}

// ── 고유번호(corp_code) ───────────────────────────────────────
function corpsSyncedAt(): number | null {
  const row = db.select().from(schema.kv).where(eq(schema.kv.key, "dart_corps_synced_at")).get();
  return row ? Date.parse(row.value) : null;
}

/** corpCode.xml(zip, 약 3.6MB)을 받아 상장사 고유번호만 캐시한다. 연결이 끊기면 한 번 더 시도한다 */
export async function syncDartCorps(): Promise<number> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${BASE}/corpCode.xml?crtfc_key=${apiKey()}`, { signal: AbortSignal.timeout(300_000), cache: "no-store" });
      if (!res.ok) throw new DartError(`고유번호 파일을 받지 못했습니다 (HTTP ${res.status})`);
      return loadDartCorpsZip(new Uint8Array(await res.arrayBuffer()));
    } catch (e) {
      lastError = e;
      if (e instanceof DartError && !/HTTP 5/.test(e.message)) break;
    }
  }
  throw lastError instanceof DartError ? lastError : new DartError(`고유번호 파일 다운로드 실패: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

/** 내려받은 corpCode zip을 해석해 캐시에 넣는다 */
export function loadDartCorpsZip(buf: Uint8Array): number {
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
    // zip이 아니면 오류 JSON/XML이다
    throw new DartError(`고유번호 파일 대신 오류 응답을 받았습니다: ${strFromU8(buf).slice(0, 200)}`);
  }
  const files = unzipSync(buf);
  const xml = strFromU8(Object.values(files)[0]);
  const rows: (typeof schema.dartCorps.$inferInsert)[] = [];
  const tag = (block: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(block)?.[1]?.trim() ?? "";
  for (const m of xml.matchAll(/<list>([\s\S]*?)<\/list>/g)) {
    const stockCode = tag(m[1], "stock_code");
    if (!stockCode) continue;
    rows.push({ corpCode: tag(m[1], "corp_code"), corpName: tag(m[1], "corp_name"), stockCode, modifyDate: tag(m[1], "modify_date") });
  }
  if (rows.length < 1000) throw new DartError(`고유번호 목록이 비정상적으로 적습니다 (${rows.length}건)`);
  db.transaction((tx) => {
    tx.delete(schema.dartCorps).run();
    for (let i = 0; i < rows.length; i += 500) tx.insert(schema.dartCorps).values(rows.slice(i, i + 500)).run();
    tx.insert(schema.kv)
      .values({ key: "dart_corps_synced_at", value: new Date().toISOString() })
      .onConflictDoUpdate({ target: schema.kv.key, set: { value: new Date().toISOString(), updatedAt: new Date().toISOString() } })
      .run();
  });
  return rows.length;
}

/** 종목코드(또는 정확한 종목명)로 고유번호를 찾는다. 캐시가 없거나 오래됐으면 먼저 갱신한다 */
export async function resolveCorpCode(stock: { ticker: string | null; name: string | null }): Promise<{ corpCode: string; corpName: string } | null> {
  const synced = corpsSyncedAt();
  const count = db.select({ n: sql<number>`count(*)` }).from(schema.dartCorps).get()?.n ?? 0;
  if (!synced || !count || Date.now() - synced > CORPS_TTL_DAYS * 86_400_000) await syncDartCorps();
  const find = () => {
    if (stock.ticker) {
      const r = db.select().from(schema.dartCorps).where(eq(schema.dartCorps.stockCode, stock.ticker)).get();
      if (r) return r;
    }
    if (stock.name) return db.select().from(schema.dartCorps).where(eq(schema.dartCorps.corpName, stock.name)).get();
    return undefined;
  };
  const hit = find();
  return hit ? { corpCode: hit.corpCode, corpName: hit.corpName } : null;
}

// ── 재무제표 ──────────────────────────────────────────────────
const REPORT = { q1: "11013", h1: "11012", q3: "11014", fy: "11011" } as const;

interface FetchedStatement extends NormalizedStatement {
  consolidated: boolean;
}

async function fetchStatement(corpCode: string, year: number, reprt: string, kind: "annual" | "cumulative", pref: { fsDiv: "CFS" | "OFS" }): Promise<FetchedStatement | null> {
  const order: ("CFS" | "OFS")[] = pref.fsDiv === "CFS" ? ["CFS", "OFS"] : ["OFS", "CFS"];
  for (const fsDiv of order) {
    const list = await dartList<DartAccountRow>("fnlttSinglAcntAll", { corp_code: corpCode, bsns_year: String(year), reprt_code: reprt, fs_div: fsDiv });
    if (list && list.length) {
      pref.fsDiv = fsDiv;
      return { ...normalizeDartStatement(list, kind), consolidated: fsDiv === "CFS" };
    }
  }
  return null;
}

export interface ApiValue {
  metric: string;
  year: number;
  quarter: number;
  value: number;
  ref: string;
  consolidated: boolean | null;
}

const FLOW_METRICS = new Set(Object.entries(DART_MAPPING).filter(([, m]) => m.sj.some((s) => s !== "BS")).map(([k]) => k));

/**
 * 최근 10개 사업연도(연간)와 최근 12개 분기를 수집한다.
 * 연결재무제표를 우선하고 없으면 별도재무제표를 쓴다. 분기 손익·현금흐름은 누적 금액의 차이로 구한다.
 */
export async function fetchDartFinancials(corpCode: string, now = new Date()): Promise<{ values: ApiValue[]; reports: number; notes: string[] }> {
  const Y = now.getFullYear();
  const pref = { fsDiv: "CFS" as "CFS" | "OFS" };
  const notes: string[] = [];

  const annualYears = Array.from({ length: 11 }, (_, i) => Y - i); // 올해 사업보고서가 아직 없을 수 있어 11개를 본다
  const annual = new Map<number, FetchedStatement>();
  const annualRes = await pool(annualYears, 4, (y) => fetchStatement(corpCode, y, REPORT.fy, "annual", pref));
  annualYears.forEach((y, i) => annualRes[i] && annual.set(y, annualRes[i]!));

  const qYears = [Y, Y - 1, Y - 2, Y - 3];
  const jobs = qYears.flatMap((y) => (["q1", "h1", "q3"] as const).map((r) => ({ y, r })));
  const qRes = await pool(jobs, 4, (j) => fetchStatement(corpCode, j.y, REPORT[j.r], "cumulative", pref));
  const cumulative = new Map<string, FetchedStatement>();
  jobs.forEach((j, i) => qRes[i] && cumulative.set(`${j.y}|${j.r}`, qRes[i]!));

  const values: ApiValue[] = [];
  const annualKept = [...annual.keys()].sort((a, b) => b - a).slice(0, 10);
  for (const y of annualKept) {
    const st = annual.get(y)!;
    for (const [metric, v] of Object.entries(st.values)) {
      values.push({ metric, year: y, quarter: 0, value: v, ref: `${y} 사업보고서 · ${st.refs[metric]}`, consolidated: st.consolidated });
    }
  }

  const quarterly: ApiValue[] = [];
  for (const y of qYears) {
    const byQ: Record<1 | 2 | 3 | 4, FetchedStatement | undefined> = {
      1: cumulative.get(`${y}|q1`),
      2: cumulative.get(`${y}|h1`),
      3: cumulative.get(`${y}|q3`),
      4: annual.get(y),
    };
    const reportName = { 1: "1분기보고서", 2: "반기보고서", 3: "3분기보고서", 4: "사업보고서" } as const;
    const metrics = new Set(Object.values(byQ).flatMap((s) => (s ? Object.keys(s.values) : [])));
    for (const metric of metrics) {
      if (FLOW_METRICS.has(metric)) {
        const cum: Partial<Record<1 | 2 | 3 | 4, number>> = {};
        for (const q of [1, 2, 3, 4] as const) if (byQ[q]?.values[metric] != null) cum[q] = byQ[q]!.values[metric];
        const qs = quarterlyFromCumulative(cum);
        for (const q of [1, 2, 3, 4] as const) {
          if (qs[q] == null) continue;
          const src = byQ[q]!;
          quarterly.push({
            metric, year: y, quarter: q, value: qs[q]!,
            ref: q === 1 ? `${y} ${reportName[1]} · ${src.refs[metric]}` : `${y} ${reportName[q]} 누적 − 직전 누적 · ${src.refs[metric]}`,
            consolidated: src.consolidated,
          });
        }
      } else {
        for (const q of [1, 2, 3, 4] as const) {
          const src = byQ[q];
          if (src?.values[metric] == null) continue;
          quarterly.push({ metric, year: y, quarter: q, value: src.values[metric], ref: `${y} ${reportName[q]} · ${src.refs[metric]}`, consolidated: src.consolidated });
        }
      }
    }
  }
  const qKeys = [...new Set(quarterly.map((v) => v.year * 10 + v.quarter))].sort((a, b) => b - a).slice(0, 12);
  values.push(...quarterly.filter((v) => qKeys.includes(v.year * 10 + v.quarter)));

  // 유통주식수: 사업보고서 기준 + 가장 최근 분기
  const shareJobs: { y: number; q: number; reprt: string }[] = annualKept.map((y) => ({ y, q: 0, reprt: REPORT.fy }));
  const latestQ = qKeys[0];
  if (latestQ && latestQ % 10 !== 4) {
    const qy = Math.floor(latestQ / 10);
    const qq = latestQ % 10;
    shareJobs.push({ y: qy, q: qq, reprt: qq === 1 ? REPORT.q1 : qq === 2 ? REPORT.h1 : REPORT.q3 });
  }
  const shares = await pool(shareJobs, 4, (j) =>
    dartList<DartStockTotalRow>("stockTotqySttus", { corp_code: corpCode, bsns_year: String(j.y), reprt_code: j.reprt }),
  );
  shareJobs.forEach((j, i) => {
    const n = shares[i] ? commonSharesOutstanding(shares[i]!) : null;
    if (n != null) values.push({ metric: "shares_outstanding", year: j.y, quarter: j.q, value: n, ref: `${j.y} 주식의 총수 현황 · 보통주 유통주식수`, consolidated: null });
  });

  if (!annual.size) notes.push("사업보고서 재무제표를 찾지 못했습니다 (금융업 등 일부 회사는 이 API가 제공하지 않습니다).");
  if ([...annual.values()].some((s) => !s.consolidated)) notes.push("일부 연도는 연결재무제표가 없어 별도재무제표를 사용했습니다.");
  return { values, reports: annual.size + cumulative.size, notes };
}

// ── 1차 필터 자동 체크 ─────────────────────────────────────────
/** 가장 최근 정기보고서에서 목록을 가져온다 (3분기 → 반기 → 1분기 → 직전 사업보고서 순) */
async function latestPeriodic<T>(endpoint: string, corpCode: string, now: Date): Promise<{ list: T[]; label: string } | null> {
  const Y = now.getFullYear();
  const tries: [number, string, string][] = [
    [Y, REPORT.q3, "3분기보고서"], [Y, REPORT.h1, "반기보고서"], [Y, REPORT.q1, "1분기보고서"],
    [Y - 1, REPORT.fy, "사업보고서"], [Y - 1, REPORT.q3, "3분기보고서"], [Y - 2, REPORT.fy, "사업보고서"],
  ];
  for (const [y, r, name] of tries) {
    const list = await dartList<T>(endpoint, { corp_code: corpCode, bsns_year: String(y), reprt_code: r });
    // 항목이 '-'뿐인 목록도 "해당 없음"이라는 유효한 답이다
    if (list) return { list, label: `${y} ${name}` };
  }
  return null;
}

export async function runDartChecks(corpCode: string, now = new Date()): Promise<Record<string, CheckResult>> {
  const asOf = now.toISOString().slice(0, 10);
  const Y = now.getFullYear();
  const out: Record<string, CheckResult> = {};

  // 감사의견: 가장 최근 사업보고서 (당기·전기·전전기)
  let audit: CheckResult = { answer: null, evidence: "최근 사업보고서에서 감사의견을 찾지 못함" };
  for (const y of [Y - 1, Y - 2]) {
    const list = await dartList<AuditRow>("accnutAdtorNmNdAdtOpinion", { corp_code: corpCode, bsns_year: String(y), reprt_code: REPORT.fy });
    if (list?.length) {
      audit = checkAuditOpinion(list, y);
      break;
    }
  }
  out.audit_opinion = audit;

  const bgn = `${Y - 3}${asOf.slice(5, 7)}${asOf.slice(8, 10)}`;
  const end = asOf.replace(/-/g, "");
  const [increases, cbs, bws, holders] = await Promise.all([
    latestPeriodic<CapitalChangeRow>("irdsSttus", corpCode, now),
    dartList<BondDecisionRow>("cvbdIsDecsn", { corp_code: corpCode, bgn_de: bgn, end_de: end }),
    dartList<BondDecisionRow>("bdwtIsDecsn", { corp_code: corpCode, bgn_de: bgn, end_de: end }),
    latestPeriodic<HolderChangeRow>("hyslrChgSttus", corpCode, now),
  ]);
  const raise = checkCapitalRaises(increases?.list ?? [], cbs ?? [], bws ?? [], asOf);
  out.capital_raise = { ...raise, evidence: `${raise.evidence} [증자 현황: ${increases?.label ?? "없음"}, CB·BW: 주요사항보고서]` };
  const holder = holders ? checkLargestHolderChange(holders.list, asOf) : { answer: null, evidence: "최대주주 변동 현황을 찾지 못함" };
  out.largest_holder_change = holders ? { ...holder, evidence: `${holder.evidence} [${holders.label}]` } : holder;
  return out;
}
