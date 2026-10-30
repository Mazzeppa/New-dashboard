"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { runDartChecks, resolveCorpCode } from "@/integrations/dart/client";
import { checkNegativeOcf, type CheckResult } from "@/integrations/dart/normalize";
import { fail, type ActionResult } from "@/lib/action";
import { fetchFinancialsForStock, type FetchSummary } from "@/lib/server/financial-fetch";

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function fetchFinancials(stockId: number, overwriteManual: boolean): Promise<ActionResult<FetchSummary>> {
  try {
    const summary = await fetchFinancialsForStock(stockId, { overwriteManual });
    revalidatePath(`/stocks/${stockId}`);
    return { ok: true, data: summary };
  } catch (e) {
    revalidatePath(`/stocks/${stockId}`);
    return fail(errorMessage(e));
  }
}

export async function setMaintenanceCapexPct(stockId: number, pct: number | null): Promise<ActionResult> {
  if (pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) return fail("0~100 사이로 입력하세요.");
  db.update(schema.stocks).set({ maintenanceCapexPct: pct }).where(eq(schema.stocks.id, stockId)).run();
  revalidatePath(`/stocks/${stockId}`);
  return { ok: true };
}

/**
 * 1차 필터 자동 체크. 결과는 autoAnswer/autoEvidence에만 저장하고, 사용자가 확인한 뒤 '적용'해야 확정된다.
 * - 한국 종목: DART 감사의견, 증자·CB/BW, 최대주주 변동
 * - 모든 시장: 저장된 연간 영업현금흐름
 */
export async function runFilterAutoChecks(stockId: number): Promise<ActionResult<{ checked: number; notes: string[] }>> {
  const stock = db.select().from(schema.stocks).where(eq(schema.stocks.id, stockId)).get();
  if (!stock) return fail("종목을 찾을 수 없습니다.");
  const items = db.select().from(schema.filterItems).where(and(isNotNull(schema.filterItems.autoKey), eq(schema.filterItems.active, true))).all();
  const results: Record<string, CheckResult> = {};
  const notes: string[] = [];

  const ocf = db
    .select()
    .from(schema.financialValues)
    .where(and(eq(schema.financialValues.stockId, stockId), eq(schema.financialValues.metric, "ocf"), eq(schema.financialValues.fiscalQuarter, 0)))
    .all()
    .map((r) => ({ year: r.fiscalYear, value: r.value }));
  results.negative_ocf = checkNegativeOcf(ocf, stock.currency);
  if (!ocf.length) notes.push("영업현금흐름은 재무 데이터를 먼저 수집하거나 입력해야 판정할 수 있습니다.");

  if (stock.market === "KR") {
    try {
      let corpCode = stock.corpCode;
      if (!corpCode) {
        const hit = await resolveCorpCode(stock);
        if (!hit) throw new Error("DART 고유번호를 찾지 못했습니다.");
        corpCode = hit.corpCode;
        db.update(schema.stocks).set({ corpCode }).where(eq(schema.stocks.id, stockId)).run();
      }
      Object.assign(results, await runDartChecks(corpCode));
    } catch (e) {
      notes.push(`DART 자동 체크 실패: ${errorMessage(e)}`);
    }
  } else {
    notes.push("감사의견·증자·최대주주 자동 체크는 한국 종목(DART)만 지원합니다.");
  }

  const now = new Date().toISOString();
  let checked = 0;
  db.transaction((tx) => {
    for (const item of items) {
      const r = results[item.autoKey!];
      if (!r) continue;
      tx.insert(schema.filterResults)
        .values({ stockId, itemId: item.id, autoAnswer: r.answer, autoEvidence: r.evidence, autoCheckedAt: now })
        .onConflictDoUpdate({
          target: [schema.filterResults.stockId, schema.filterResults.itemId],
          set: { autoAnswer: r.answer, autoEvidence: r.evidence, autoCheckedAt: now },
        })
        .run();
      checked++;
    }
    tx.insert(schema.fetchLogs).values({ stockId, provider: "filter_checks", ok: checked > 0, message: `자동 체크 ${checked}개 항목`, detail: { results, notes } }).run();
  });

  revalidatePath(`/stocks/${stockId}`);
  return { ok: true, data: { checked, notes } };
}

/** 자동 체크 결과를 사용자 답으로 확정한다 */
export async function applyAutoAnswer(stockId: number, itemId: number): Promise<ActionResult> {
  const r = db
    .select()
    .from(schema.filterResults)
    .where(and(eq(schema.filterResults.stockId, stockId), eq(schema.filterResults.itemId, itemId)))
    .get();
  if (!r?.autoAnswer) return fail("적용할 자동 체크 결과가 없습니다.");
  db.update(schema.filterResults).set({ answer: r.autoAnswer, updatedAt: new Date().toISOString() }).where(eq(schema.filterResults.id, r.id)).run();
  revalidatePath(`/stocks/${stockId}`);
  return { ok: true };
}
