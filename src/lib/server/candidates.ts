import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { candidateSchema, type Candidate } from "@/domain/stock";
import { zodFieldErrors } from "@/lib/action";

export interface ImportReport {
  created: { row: number; id: number; label: string }[];
  skipped: { row: number; label: string; reason: string }[];
  errors: { row: number; messages: string[] }[];
}

/**
 * 외부 후보 종목 일괄 등록. CSV 가져오기 화면과 POST /api/candidates가 함께 쓴다.
 * 같은 시장·티커가 이미 있으면 건너뛴다. 모두 '아이디어' 단계로 들어간다.
 */
export function importCandidates(rows: unknown[], origin: string): ImportReport {
  const report: ImportReport = { created: [], skipped: [], errors: [] };
  const valid: { row: number; c: Candidate }[] = [];

  rows.forEach((raw, i) => {
    const row = i + 1;
    const parsed = candidateSchema.safeParse(raw);
    if (!parsed.success) {
      report.errors.push({ row, messages: Object.entries(zodFieldErrors(parsed.error.issues)).map(([k, m]) => `${k}: ${m}`) });
    } else {
      valid.push({ row, c: parsed.data });
    }
  });

  db.transaction((tx) => {
    const seen = new Set<string>();
    for (const { row, c } of valid) {
      const label = c.name ?? c.ticker ?? "";
      if (c.ticker) {
        const key = `${c.market}:${c.ticker}`;
        const exists =
          seen.has(key) ||
          tx.select({ id: schema.stocks.id }).from(schema.stocks)
            .where(and(eq(schema.stocks.market, c.market), eq(schema.stocks.ticker, c.ticker))).get();
        if (exists) {
          report.skipped.push({ row, label, reason: "이미 등록된 종목" });
          continue;
        }
        seen.add(key);
      }
      const stock = tx.insert(schema.stocks).values({
        market: c.market,
        ticker: c.ticker,
        name: c.name,
        currency: c.currency,
        industry: c.industry,
        discoverySource: c.source,
        discoverySourceNote: c.sourceNote,
        note: c.note,
        watchLow: c.watchLow,
        watchHigh: c.watchHigh,
        stage: "idea",
      }).returning({ id: schema.stocks.id }).get();
      tx.insert(schema.stageTransitions).values({
        stockId: stock.id,
        fromStage: null,
        toStage: "idea",
        bypassReason: null,
      }).run();
      report.created.push({ row, id: stock.id, label });
    }
  });

  if (report.created.length) {
    console.info(`[candidates] ${origin}: ${report.created.length}건 등록`);
  }
  return report;
}
