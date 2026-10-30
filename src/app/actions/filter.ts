"use server";

import { and, asc, eq, gt, lt, desc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import type { FilterAnswer } from "@/db/schema";
import { fail, type ActionResult } from "@/lib/action";

export async function saveFilterResult(input: {
  stockId: number;
  itemId: number;
  answer: FilterAnswer | null;
  text?: string | null;
}): Promise<ActionResult> {
  const now = new Date().toISOString();
  db.insert(schema.filterResults)
    .values({ stockId: input.stockId, itemId: input.itemId, answer: input.answer, text: input.text ?? null })
    .onConflictDoUpdate({
      target: [schema.filterResults.stockId, schema.filterResults.itemId],
      set: { answer: input.answer, text: input.text ?? null, updatedAt: now },
    })
    .run();
  db.update(schema.stocks).set({ updatedAt: now }).where(eq(schema.stocks.id, input.stockId)).run();
  revalidatePath(`/stocks/${input.stockId}`);
  return { ok: true };
}

const itemInput = z.object({
  text: z.string().trim().min(1, "항목 문구를 입력하세요."),
  description: z.string().trim().nullable().optional(),
  requiresText: z.boolean().default(false),
  textPrompt: z.string().trim().nullable().optional(),
});

export async function addFilterItem(
  input: z.input<typeof itemInput> & { origin?: "user" | "lesson"; originRef?: number },
): Promise<ActionResult> {
  const p = itemInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "입력 오류");
  const max = db.select({ m: sql<number>`coalesce(max(${schema.filterItems.sortOrder}), -1)` }).from(schema.filterItems).get();
  db.insert(schema.filterItems).values({
    ...p.data,
    description: p.data.description || null,
    textPrompt: p.data.textPrompt || null,
    sortOrder: (max?.m ?? -1) + 1,
    origin: input.origin ?? "user",
    originRef: input.originRef ?? null,
  }).run();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function updateFilterItem(id: number, input: z.input<typeof itemInput>): Promise<ActionResult> {
  const p = itemInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "입력 오류");
  db.update(schema.filterItems).set({
    ...p.data,
    description: p.data.description || null,
    textPrompt: p.data.textPrompt || null,
  }).where(eq(schema.filterItems.id, id)).run();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setFilterItemActive(id: number, active: boolean): Promise<ActionResult> {
  db.update(schema.filterItems).set({ active }).where(eq(schema.filterItems.id, id)).run();
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 순서를 위/아래 이웃과 바꾼다 */
export async function moveFilterItem(id: number, dir: "up" | "down"): Promise<ActionResult> {
  const item = db.select().from(schema.filterItems).where(eq(schema.filterItems.id, id)).get();
  if (!item) return fail("항목을 찾을 수 없습니다.");
  const neighbor = db
    .select()
    .from(schema.filterItems)
    .where(dir === "up" ? lt(schema.filterItems.sortOrder, item.sortOrder) : gt(schema.filterItems.sortOrder, item.sortOrder))
    .orderBy(dir === "up" ? desc(schema.filterItems.sortOrder) : asc(schema.filterItems.sortOrder))
    .limit(1)
    .get();
  if (!neighbor) return { ok: true };
  db.transaction((tx) => {
    tx.update(schema.filterItems).set({ sortOrder: neighbor.sortOrder }).where(eq(schema.filterItems.id, item.id)).run();
    tx.update(schema.filterItems).set({ sortOrder: item.sortOrder }).where(eq(schema.filterItems.id, neighbor.id)).run();
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 답변 기록이 있는 항목은 삭제하지 않고 비활성화하도록 안내한다 (과거 판단 보존) */
export async function deleteFilterItem(id: number): Promise<ActionResult> {
  const used = db.select({ n: sql<number>`count(*)` }).from(schema.filterResults)
    .where(and(eq(schema.filterResults.itemId, id))).get();
  if (used?.n) return fail("이미 종목 기록에 쓰인 항목입니다. 삭제 대신 비활성화하세요.");
  db.delete(schema.filterItems).where(eq(schema.filterItems.id, id)).run();
  revalidatePath("/", "layout");
  return { ok: true };
}
