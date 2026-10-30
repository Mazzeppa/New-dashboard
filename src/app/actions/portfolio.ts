"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { listTrades } from "@/db/queries";
import { computePosition } from "@/domain/portfolio";
import { CURRENCIES } from "@/domain/format";
import { fail, type ActionResult } from "@/lib/action";

function done(): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true };
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD입니다.");

const tradeInput = z.object({
  stockId: z.number().int(),
  date,
  side: z.enum(["buy", "sell"]),
  quantity: z.number().positive("수량은 0보다 커야 합니다."),
  price: z.number().nonnegative("가격을 확인하세요."),
  fee: z.number().nonnegative("수수료를 확인하세요."),
  memo: z.string().max(2000).nullable(),
});

export async function addTrade(input: z.input<typeof tradeInput>): Promise<ActionResult> {
  const p = tradeInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  const stock = db.select().from(schema.stocks).where(eq(schema.stocks.id, p.data.stockId)).get();
  if (!stock) return fail("종목을 찾을 수 없습니다.");
  if (p.data.side === "sell") {
    // 매도 시점까지의 보유 수량을 넘지 않는지 확인
    const before = listTrades(stock.id).filter((t) => t.date <= p.data.date);
    const pos = computePosition(before);
    if (p.data.quantity > pos.quantity + 1e-9) return fail(`${p.data.date} 기준 보유 수량(${pos.quantity})보다 많이 팔 수 없습니다.`);
  }
  db.insert(schema.trades).values({ ...p.data, currency: stock.currency, memo: p.data.memo?.trim() || null }).run();
  db.update(schema.stocks).set({ updatedAt: new Date().toISOString() }).where(eq(schema.stocks.id, stock.id)).run();
  return done();
}

export async function deleteTrade(id: number): Promise<ActionResult> {
  db.delete(schema.trades).where(eq(schema.trades.id, id)).run();
  return done();
}

const planInput = z.object({
  stockId: z.number().int(),
  conviction: z.number().int().min(1).max(5),
  targetPct: z.number().min(0).max(100),
  capPct: z.number(),
  lossCapPct: z.number().nullable(),
  bearDownside: z.number().nullable(),
  rangeMinPct: z.number().nullable(),
  rangeMaxPct: z.number().nullable(),
  warnings: z.array(z.string()),
  note: z.string().max(2000).nullable(),
});

/** 비중 결정 기록. 당시의 상한·권장 범위·경고를 그대로 남긴다 */
export async function savePositionPlan(input: z.input<typeof planInput>): Promise<ActionResult> {
  const p = planInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  if (p.data.warnings.length && !p.data.note?.trim()) return fail("경고가 있습니다. 그래도 이 비중으로 정한 이유를 메모에 적으세요.");
  db.insert(schema.positionPlans).values({ ...p.data, note: p.data.note?.trim() || null }).run();
  return done();
}

const currency = z.enum(CURRENCIES);

export async function addFxRate(input: { currency: string; date: string; rateToKrw: number }): Promise<ActionResult> {
  const p = z.object({ currency, date, rateToKrw: z.number().positive("환율은 0보다 커야 합니다.") }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  if (p.data.currency === "KRW") return fail("KRW는 환율이 필요 없습니다.");
  db.insert(schema.fxRates).values(p.data).run();
  return done();
}

export async function deleteFxRate(id: number): Promise<ActionResult> {
  db.delete(schema.fxRates).where(eq(schema.fxRates.id, id)).run();
  return done();
}

export async function setCashBalance(input: { currency: string; amount: number | null }): Promise<ActionResult> {
  const p = z.object({ currency, amount: z.number().finite().nullable() }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  if (p.data.amount == null || p.data.amount === 0) {
    db.delete(schema.cashBalances).where(eq(schema.cashBalances.currency, p.data.currency)).run();
  } else {
    db.insert(schema.cashBalances)
      .values({ currency: p.data.currency, amount: p.data.amount })
      .onConflictDoUpdate({ target: schema.cashBalances.currency, set: { amount: p.data.amount, updatedAt: new Date().toISOString() } })
      .run();
  }
  return done();
}

export async function addStockTag(stockId: number, name: string): Promise<ActionResult> {
  const n = name.trim();
  if (!n) return fail("태그 이름을 입력하세요.");
  if (n.length > 50) return fail("태그 이름이 너무 깁니다.");
  db.insert(schema.tags).values({ name: n }).onConflictDoNothing().run();
  const tag = db.select().from(schema.tags).where(eq(schema.tags.name, n)).get()!;
  db.insert(schema.stockTags).values({ stockId, tagId: tag.id }).onConflictDoNothing().run();
  return done();
}

export async function removeStockTag(stockId: number, name: string): Promise<ActionResult> {
  const tag = db.select().from(schema.tags).where(eq(schema.tags.name, name)).get();
  if (!tag) return { ok: true };
  db.delete(schema.stockTags).where(and(eq(schema.stockTags.stockId, stockId), eq(schema.stockTags.tagId, tag.id))).run();
  return done();
}
