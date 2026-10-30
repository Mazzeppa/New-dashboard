"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { valuationDataSchema } from "@/domain/valuation";
import { fail, zodFieldErrors, type ActionResult } from "@/lib/action";

export async function saveValuation(stockId: number, input: unknown): Promise<ActionResult> {
  const parsed = valuationDataSchema.safeParse(input);
  if (!parsed.success) {
    const fe = zodFieldErrors(parsed.error.issues);
    return fail(Object.values(fe)[0] ?? "입력값을 확인하세요.", fe);
  }
  const now = new Date().toISOString();
  db.insert(schema.valuations)
    .values({ stockId, data: parsed.data })
    .onConflictDoUpdate({ target: schema.valuations.stockId, set: { data: parsed.data, updatedAt: now } })
    .run();
  db.update(schema.stocks).set({ updatedAt: now }).where(eq(schema.stocks.id, stockId)).run();
  revalidatePath("/", "layout");
  return { ok: true };
}
