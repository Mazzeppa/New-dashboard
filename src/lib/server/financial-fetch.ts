import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { FinancialSource } from "@/domain/financials";
import { METRICS } from "@/domain/financials";
import { fetchDartFinancials, resolveCorpCode, type ApiValue } from "@/integrations/dart/client";
import { fetchCompanyFacts, resolveCik } from "@/integrations/sec/client";
import { normalizeCompanyFacts } from "@/integrations/sec/normalize";

export interface FetchSummary {
  provider: "dart" | "sec";
  company: string;
  saved: number;
  unchanged: number;
  skippedManual: number;
  annualYears: number[];
  quarters: string[];
  missingMetrics: string[];
  notes: string[];
}

function log(stockId: number, provider: string, ok: boolean, message: string, detail?: Record<string, unknown>) {
  db.insert(schema.fetchLogs).values({ stockId, provider, ok, message, detail: detail ?? null }).run();
}

/**
 * API 값 저장. 사용자가 직접 넣은 값(수동·보고서)은 overwriteManual이 아니면 덮어쓰지 않는다.
 */
function saveApiValues(stockId: number, source: Extract<FinancialSource, "dart" | "sec">, values: ApiValue[], overwriteManual: boolean) {
  const fv = schema.financialValues;
  let saved = 0;
  let unchanged = 0;
  let skippedManual = 0;
  const now = new Date().toISOString();
  db.transaction((tx) => {
    for (const v of values) {
      const existing = tx
        .select()
        .from(fv)
        .where(and(eq(fv.stockId, stockId), eq(fv.fiscalYear, v.year), eq(fv.fiscalQuarter, v.quarter), eq(fv.metric, v.metric)))
        .get();
      if (existing && (existing.source === "manual" || existing.source === "report") && !overwriteManual) {
        skippedManual++;
        continue;
      }
      if (existing && existing.value === v.value && existing.source === source && existing.sourceRef === v.ref) {
        unchanged++;
        continue;
      }
      tx.insert(fv)
        .values({ stockId, fiscalYear: v.year, fiscalQuarter: v.quarter, metric: v.metric, value: v.value, source, sourceRef: v.ref, consolidated: v.consolidated })
        .onConflictDoUpdate({
          target: [fv.stockId, fv.fiscalYear, fv.fiscalQuarter, fv.metric],
          set: { value: v.value, source, sourceRef: v.ref, consolidated: v.consolidated, updatedAt: now },
        })
        .run();
      saved++;
    }
  });
  return { saved, unchanged, skippedManual };
}

function summarize(values: ApiValue[]) {
  const annualYears = [...new Set(values.filter((v) => v.quarter === 0).map((v) => v.year))].sort();
  const quarters = [...new Set(values.filter((v) => v.quarter > 0).map((v) => `${v.year}Q${v.quarter}`))].sort();
  const present = new Set(values.map((v) => v.metric));
  const missingMetrics = METRICS.filter((m) => !present.has(m.key)).map((m) => m.label);
  return { annualYears, quarters, missingMetrics };
}

export async function fetchFinancialsForStock(stockId: number, opts: { overwriteManual: boolean }): Promise<FetchSummary> {
  const stock = db.select().from(schema.stocks).where(eq(schema.stocks.id, stockId)).get();
  if (!stock) throw new Error("종목을 찾을 수 없습니다.");
  const provider = stock.market === "KR" ? "dart" : stock.market === "US" ? "sec" : null;
  if (!provider) throw new Error("한국·미국 종목만 자동 수집할 수 있습니다. 수동 입력이나 붙여넣기를 쓰세요.");

  try {
    let values: ApiValue[];
    let company: string;
    let notes: string[] = [];
    if (provider === "dart") {
      let corpCode = stock.corpCode;
      company = stock.name ?? stock.ticker ?? "";
      if (!corpCode) {
        const hit = await resolveCorpCode(stock);
        if (!hit) throw new Error(`DART 고유번호를 찾지 못했습니다 (종목코드 ${stock.ticker ?? "-"}). 상장사의 6자리 종목코드인지 확인하세요.`);
        corpCode = hit.corpCode;
        company = hit.corpName;
        db.update(schema.stocks).set({ corpCode }).where(eq(schema.stocks.id, stockId)).run();
      }
      const r = await fetchDartFinancials(corpCode);
      values = r.values;
      notes = r.notes;
      company = `${company} (DART ${corpCode})`;
    } else {
      if (!stock.ticker) throw new Error("미국 종목은 티커가 필요합니다.");
      let cik = stock.cik;
      let title = stock.name ?? stock.ticker;
      if (!cik) {
        const hit = await resolveCik(stock.ticker);
        if (!hit) throw new Error(`SEC에서 티커 ${stock.ticker}를 찾지 못했습니다.`);
        cik = hit.cik;
        title = hit.title;
        db.update(schema.stocks).set({ cik }).where(eq(schema.stocks.id, stockId)).run();
      }
      const facts = await fetchCompanyFacts(cik);
      const norm = normalizeCompanyFacts(facts);
      values = norm.values.map((v) => ({ ...v, consolidated: true }));
      if (stock.currency !== "USD") notes.push(`SEC 값은 USD입니다. 종목 거래 통화(${stock.currency})와 다릅니다.`);
      if (!norm.fiscalYears.length) notes.push("us-gaap 연간 데이터가 없습니다 (외국 기업 20-F 등은 지원하지 않습니다).");
      company = `${facts.entityName ?? title} (CIK ${cik})`;
    }

    const counts = saveApiValues(stockId, provider, values, opts.overwriteManual);
    const summary: FetchSummary = { provider, company, ...counts, ...summarize(values), notes };
    log(stockId, provider, true, `${summary.annualYears.length}개 연도 · ${summary.quarters.length}개 분기 · 저장 ${counts.saved}개`, { ...summary });
    return summary;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(stockId, provider, false, msg);
    throw e;
  }
}
