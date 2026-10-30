"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { getSection, sanitizeAnswers } from "@/domain/analysis";
import { getMetric, type FinancialSource } from "@/domain/financials";
import { fail, type ActionResult } from "@/lib/action";

function touch(stockId: number) {
  db.update(schema.stocks).set({ updatedAt: new Date().toISOString() }).where(eq(schema.stocks.id, stockId)).run();
}

export async function saveAnalysisSection(input: {
  stockId: number;
  section: string;
  answers: Record<string, unknown>;
  score: number | null;
}): Promise<ActionResult> {
  const def = getSection(input.section);
  if (!def) return fail("알 수 없는 분석 항목입니다.");
  if (input.score != null && (!Number.isInteger(input.score) || input.score < 1 || input.score > 5)) {
    return fail("점수는 1~5 사이여야 합니다.");
  }
  const answers = sanitizeAnswers(def, input.answers);
  const now = new Date().toISOString();
  db.insert(schema.analysisSections)
    .values({ stockId: input.stockId, section: def.key, answers, score: input.score })
    .onConflictDoUpdate({
      target: [schema.analysisSections.stockId, schema.analysisSections.section],
      set: { answers, score: input.score, updatedAt: now },
    })
    .run();
  touch(input.stockId);
  revalidatePath(`/stocks/${input.stockId}`);
  return { ok: true };
}

const entrySchema = z.object({
  metric: z.string().refine((k) => !!getMetric(k), "알 수 없는 계정입니다."),
  year: z.number().int().min(1980).max(2100),
  quarter: z.number().int().min(0).max(4),
  /** null이면 해당 값을 삭제 */
  value: z.number().finite().nullable(),
});

/**
 * 재무 값 일괄 저장. 같은 기간·계정이 있으면 덮어쓰고 출처를 갱신한다.
 */
export async function saveFinancialValues(input: {
  stockId: number;
  entries: z.input<typeof entrySchema>[];
  source: Extract<FinancialSource, "manual" | "report">;
  sourceRef?: string | null;
}): Promise<ActionResult<{ saved: number; deleted: number }>> {
  const parsed = z.array(entrySchema).max(5000).safeParse(input.entries);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "입력 오류");
  if (input.source !== "manual" && input.source !== "report") return fail("출처가 올바르지 않습니다.");
  const sourceRef = input.sourceRef?.trim() || null;
  const now = new Date().toISOString();
  const fv = schema.financialValues;
  let saved = 0;
  let deleted = 0;

  db.transaction((tx) => {
    for (const e of parsed.data) {
      const where = and(eq(fv.stockId, input.stockId), eq(fv.fiscalYear, e.year), eq(fv.fiscalQuarter, e.quarter), eq(fv.metric, e.metric));
      if (e.value === null) {
        deleted += tx.delete(fv).where(where).run().changes;
        continue;
      }
      tx.insert(fv)
        .values({
          stockId: input.stockId,
          fiscalYear: e.year,
          fiscalQuarter: e.quarter,
          metric: e.metric,
          value: e.value,
          source: input.source,
          sourceRef,
          consolidated: null,
        })
        .onConflictDoUpdate({
          target: [fv.stockId, fv.fiscalYear, fv.fiscalQuarter, fv.metric],
          set: { value: e.value, source: input.source, sourceRef, consolidated: null, updatedAt: now },
        })
        .run();
      saved++;
    }
  });

  touch(input.stockId);
  revalidatePath(`/stocks/${input.stockId}`);
  return { ok: true, data: { saved, deleted } };
}

export async function deleteFinancialPeriod(stockId: number, year: number, quarter: number): Promise<ActionResult> {
  const fv = schema.financialValues;
  db.delete(fv).where(and(eq(fv.stockId, stockId), eq(fv.fiscalYear, year), eq(fv.fiscalQuarter, quarter))).run();
  touch(stockId);
  revalidatePath(`/stocks/${stockId}`);
  return { ok: true };
}
