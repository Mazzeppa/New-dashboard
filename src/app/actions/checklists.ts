"use server";

import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { fail, type ActionResult } from "@/lib/action";

const { checklistTemplates: T, checklistTemplateItems: I, stockChecklists: SC, checklistAnswers: A } = schema;

function done(): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true };
}

// ── 종목에 적용 ─────────────────────────────────────────────────
export async function applyTemplate(stockId: number, templateId: number): Promise<ActionResult> {
  const tpl = db.select({ id: T.id }).from(T).where(eq(T.id, templateId)).get();
  if (!tpl) return fail("템플릿을 찾을 수 없습니다.");
  const exists = db.select({ id: SC.id }).from(SC).where(and(eq(SC.stockId, stockId), eq(SC.templateId, templateId))).get();
  if (exists) return fail("이미 적용한 템플릿입니다.");
  db.insert(SC).values({ stockId, templateId }).run();
  return done();
}

export async function removeStockChecklist(stockChecklistId: number): Promise<ActionResult> {
  db.delete(SC).where(eq(SC.id, stockChecklistId)).run();
  return done();
}

export async function saveChecklistAnswer(input: {
  stockChecklistId: number;
  itemId: number;
  score: number | null;
  memo: string | null;
}): Promise<ActionResult> {
  if (input.score != null && (!Number.isInteger(input.score) || input.score < 1 || input.score > 5)) {
    return fail("점수는 1~5 사이여야 합니다.");
  }
  const memo = input.memo?.trim() || null;
  db.insert(A)
    .values({ stockChecklistId: input.stockChecklistId, itemId: input.itemId, score: input.score, memo })
    .onConflictDoUpdate({
      target: [A.stockChecklistId, A.itemId],
      set: { score: input.score, memo, updatedAt: new Date().toISOString() },
    })
    .run();
  const sc = db.select({ stockId: SC.stockId }).from(SC).where(eq(SC.id, input.stockChecklistId)).get();
  if (sc) {
    db.update(schema.stocks).set({ updatedAt: new Date().toISOString() }).where(eq(schema.stocks.id, sc.stockId)).run();
    revalidatePath(`/stocks/${sc.stockId}`);
  }
  return { ok: true };
}

// ── 템플릿 편집 ─────────────────────────────────────────────────
const templateInput = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요."),
  description: z.string().trim().nullable().optional(),
});

export async function createTemplate(input: z.input<typeof templateInput>): Promise<ActionResult<{ id: number }>> {
  const p = templateInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  const row = db.insert(T).values({ name: p.data.name, description: p.data.description || null }).returning({ id: T.id }).get();
  revalidatePath("/", "layout");
  return { ok: true, data: { id: row.id } };
}

export async function updateTemplate(id: number, input: z.input<typeof templateInput>): Promise<ActionResult> {
  const p = templateInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  db.update(T).set({ name: p.data.name, description: p.data.description || null }).where(eq(T.id, id)).run();
  return done();
}

/** 템플릿 복제 (기본 템플릿을 바탕으로 내 프레임워크를 만들 때) */
export async function duplicateTemplate(id: number): Promise<ActionResult<{ id: number }>> {
  const src = db.select().from(T).where(eq(T.id, id)).get();
  if (!src) return fail("템플릿을 찾을 수 없습니다.");
  const items = db.select().from(I).where(and(eq(I.templateId, id), eq(I.active, true))).orderBy(asc(I.sortOrder)).all();
  const newId = db.transaction((tx) => {
    const row = tx.insert(T).values({ name: `${src.name} (사본)`, description: src.description }).returning({ id: T.id }).get();
    if (items.length) {
      tx.insert(I).values(items.map((it, i) => ({ templateId: row.id, text: it.text, help: it.help, sortOrder: i }))).run();
    }
    return row.id;
  });
  revalidatePath("/", "layout");
  return { ok: true, data: { id: newId } };
}

export async function deleteTemplate(id: number): Promise<ActionResult> {
  const used = db.select({ n: sql<number>`count(*)` }).from(SC).where(eq(SC.templateId, id)).get();
  if (used?.n) return fail(`종목 ${used.n}개에 적용된 템플릿입니다. 먼저 종목에서 제거하세요.`);
  db.delete(T).where(eq(T.id, id)).run();
  return done();
}

const itemInput = z.object({
  text: z.string().trim().min(1, "질문을 입력하세요."),
  help: z.string().trim().nullable().optional(),
});

export async function addTemplateItem(templateId: number, input: z.input<typeof itemInput>): Promise<ActionResult> {
  const p = itemInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  const max = db.select({ m: sql<number>`coalesce(max(${I.sortOrder}), -1)` }).from(I).where(eq(I.templateId, templateId)).get();
  db.insert(I).values({ templateId, text: p.data.text, help: p.data.help || null, sortOrder: (max?.m ?? -1) + 1 }).run();
  return done();
}

export async function updateTemplateItem(id: number, input: z.input<typeof itemInput>): Promise<ActionResult> {
  const p = itemInput.safeParse(input);
  if (!p.success) return fail(p.error.issues[0].message);
  db.update(I).set({ text: p.data.text, help: p.data.help || null }).where(eq(I.id, id)).run();
  return done();
}

export async function setTemplateItemActive(id: number, active: boolean): Promise<ActionResult> {
  db.update(I).set({ active }).where(eq(I.id, id)).run();
  return done();
}

export async function moveTemplateItem(id: number, dir: "up" | "down"): Promise<ActionResult> {
  const item = db.select().from(I).where(eq(I.id, id)).get();
  if (!item) return fail("항목을 찾을 수 없습니다.");
  const neighbor = db
    .select()
    .from(I)
    .where(and(eq(I.templateId, item.templateId), dir === "up" ? lt(I.sortOrder, item.sortOrder) : gt(I.sortOrder, item.sortOrder)))
    .orderBy(dir === "up" ? desc(I.sortOrder) : asc(I.sortOrder))
    .limit(1)
    .get();
  if (!neighbor) return { ok: true };
  db.transaction((tx) => {
    tx.update(I).set({ sortOrder: neighbor.sortOrder }).where(eq(I.id, item.id)).run();
    tx.update(I).set({ sortOrder: item.sortOrder }).where(eq(I.id, neighbor.id)).run();
  });
  return done();
}

/** 답이 기록된 항목은 삭제하지 않고 비활성화하도록 안내한다 */
export async function deleteTemplateItem(id: number): Promise<ActionResult> {
  const used = db.select({ n: sql<number>`count(*)` }).from(A).where(eq(A.itemId, id)).get();
  if (used?.n) return fail("이미 종목 평가에 쓰인 항목입니다. 삭제 대신 비활성화하세요.");
  db.delete(I).where(eq(I.id, id)).run();
  return done();
}
