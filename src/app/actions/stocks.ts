"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { INITIAL_STAGES, type PipelineStage } from "@/domain/pipeline";
import { candidateSchema } from "@/domain/stock";
import { parseNumberInput } from "@/domain/format";
import { fail, today, zodFieldErrors, type ActionResult } from "@/lib/action";
import { importCandidates, type ImportReport } from "@/lib/server/candidates";

function formToObject(fd: FormData) {
  return Object.fromEntries(Array.from(fd.entries()).map(([k, v]) => [k, typeof v === "string" ? v : null]));
}

function tickerTaken(market: string, ticker: string | null, exceptId?: number) {
  if (!ticker) return false;
  return !!db
    .select({ id: schema.stocks.id })
    .from(schema.stocks)
    .where(
      and(
        eq(schema.stocks.market, market as never),
        eq(schema.stocks.ticker, ticker),
        exceptId ? ne(schema.stocks.id, exceptId) : undefined,
      ),
    )
    .get();
}

export async function createStock(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const raw = formToObject(fd);
  const parsed = candidateSchema.safeParse(raw);
  if (!parsed.success) return fail("입력값을 확인하세요.", zodFieldErrors(parsed.error.issues));
  const c = parsed.data;

  const initialStage = (raw.initialStage ?? "idea") as PipelineStage;
  if (!INITIAL_STAGES.includes(initialStage)) return fail("시작 단계가 올바르지 않습니다.");
  if (tickerTaken(c.market, c.ticker)) return fail("같은 시장에 이미 등록된 티커입니다.", { ticker: "중복 티커" });

  const price = parseNumberInput(raw.price);
  const id = db.transaction((tx) => {
    const s = tx.insert(schema.stocks).values({
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
      stage: initialStage,
    }).returning({ id: schema.stocks.id }).get();
    tx.insert(schema.stageTransitions).values({ stockId: s.id, fromStage: null, toStage: initialStage }).run();
    if (price != null && price > 0) {
      tx.insert(schema.prices).values({ stockId: s.id, date: today(), price }).run();
    }
    return s.id;
  });

  revalidatePath("/", "layout");
  redirect(`/stocks/${id}`);
}

export async function updateStock(id: number, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = candidateSchema.safeParse(formToObject(fd));
  if (!parsed.success) return fail("입력값을 확인하세요.", zodFieldErrors(parsed.error.issues));
  const c = parsed.data;
  if (tickerTaken(c.market, c.ticker, id)) return fail("같은 시장에 이미 등록된 티커입니다.", { ticker: "중복 티커" });

  db.update(schema.stocks).set({
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
    updatedAt: new Date().toISOString(),
  }).where(eq(schema.stocks.id, id)).run();

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteStock(id: number): Promise<void> {
  db.delete(schema.stocks).where(eq(schema.stocks.id, id)).run();
  revalidatePath("/", "layout");
  redirect("/pipeline");
}

const priceInput = z.object({
  stockId: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD입니다."),
  price: z.number().positive("가격은 0보다 커야 합니다."),
});

export async function addPrice(input: z.input<typeof priceInput>): Promise<ActionResult> {
  const p = priceInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "입력 오류");
  db.insert(schema.prices).values({ ...p.data, source: "manual" }).run();
  db.update(schema.stocks).set({ updatedAt: new Date().toISOString() }).where(eq(schema.stocks.id, p.data.stockId)).run();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deletePrice(id: number): Promise<ActionResult> {
  db.delete(schema.prices).where(eq(schema.prices.id, id)).run();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function importCandidatesAction(rows: Record<string, unknown>[]): Promise<ActionResult<ImportReport>> {
  if (!Array.isArray(rows) || rows.length === 0) return fail("가져올 행이 없습니다.");
  if (rows.length > 2000) return fail("한 번에 2,000행까지 가져올 수 있습니다.");
  const report = importCandidates(rows, "csv");
  revalidatePath("/", "layout");
  return { ok: true, data: report };
}
