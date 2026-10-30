"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getPrinciples, getStock } from "@/db/queries";
import { holdingReviewSchema, retrospectiveSchema } from "@/domain/review";
import { fail, zodFieldErrors, type ActionResult } from "@/lib/action";

function done(): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true };
}

function touch(stockId: number) {
  db.update(schema.stocks).set({ updatedAt: new Date().toISOString() }).where(eq(schema.stocks.id, stockId)).run();
}

// ── 7단계: 보유 점검 ───────────────────────────────────────────
export async function saveHoldingReview(stockId: number, input: unknown): Promise<ActionResult> {
  const p = holdingReviewSchema.safeParse(input);
  if (!p.success) return fail(Object.values(zodFieldErrors(p.error.issues))[0] ?? "입력값을 확인하세요.");
  const stock = getStock(stockId);
  if (!stock) return fail("종목을 찾을 수 없습니다.");
  db.insert(schema.holdingReviews).values({ stockId, ...p.data, price: stock.price }).run();
  touch(stockId);
  return done();
}

export async function deleteHoldingReview(id: number): Promise<ActionResult> {
  db.delete(schema.holdingReviews).where(eq(schema.holdingReviews.id, id)).run();
  return done();
}

// ── 8단계: 복기 ────────────────────────────────────────────────
function setRetroTags(retroId: number, names: string[]) {
  db.delete(schema.retrospectiveTags).where(eq(schema.retrospectiveTags.retrospectiveId, retroId)).run();
  for (const name of [...new Set(names)]) {
    db.insert(schema.mistakeTags).values({ name }).onConflictDoNothing().run();
    const tag = db.select().from(schema.mistakeTags).where(eq(schema.mistakeTags.name, name)).get()!;
    db.insert(schema.retrospectiveTags).values({ retrospectiveId: retroId, tagId: tag.id }).onConflictDoNothing().run();
  }
}

/** 복기 저장 (id가 있으면 수정). 실수 태그는 없으면 새로 만든다 */
export async function saveRetrospective(stockId: number, input: unknown, id?: number): Promise<ActionResult<{ id: number }>> {
  const p = retrospectiveSchema.safeParse(input);
  if (!p.success) return fail(Object.values(zodFieldErrors(p.error.issues))[0] ?? "입력값을 확인하세요.");
  const { tags, ...data } = p.data;
  const retroId = db.transaction(() => {
    let rid = id;
    if (rid) {
      db.update(schema.retrospectives).set({ ...data, updatedAt: new Date().toISOString() }).where(eq(schema.retrospectives.id, rid)).run();
    } else {
      rid = db.insert(schema.retrospectives).values({ stockId, ...data }).returning({ id: schema.retrospectives.id }).get().id;
    }
    setRetroTags(rid, tags);
    return rid;
  });
  touch(stockId);
  revalidatePath("/", "layout");
  return { ok: true, data: { id: retroId } };
}

export async function deleteRetrospective(id: number): Promise<ActionResult> {
  db.delete(schema.retrospectives).where(eq(schema.retrospectives.id, id)).run();
  return done();
}

/**
 * 교훈을 프로세스에 반영한다.
 * - principle: 0단계 원칙 조항에 추가 (새 원칙 버전, 변경 사유에 출처 기록)
 * - filter: 2단계 1차 필터 체크리스트에 항목 추가 (origin=lesson)
 */
export async function applyLesson(retroId: number, target: "principle" | "filter", text: string): Promise<ActionResult> {
  const t = text.trim();
  if (!t) return fail("반영할 문장을 적으세요.");
  const retro = db.select().from(schema.retrospectives).where(eq(schema.retrospectives.id, retroId)).get();
  if (!retro) return fail("복기를 찾을 수 없습니다.");
  const stock = getStock(retro.stockId);
  const source = `${stock?.name ?? stock?.ticker ?? "종목"} 복기(${retro.date})`;
  const now = new Date().toISOString();

  db.transaction((tx) => {
    if (target === "principle") {
      const current = getPrinciples();
      const data = { ...current.data, rules: [...current.data.rules, t] };
      const version = current.version + 1;
      tx.update(schema.principles).set({ version, data, updatedAt: now }).where(eq(schema.principles.id, 1)).run();
      tx.insert(schema.principleVersions).values({ version, data, reason: `교훈 반영: ${source}` }).run();
    } else {
      const items = tx.select({ o: schema.filterItems.sortOrder }).from(schema.filterItems).all();
      const max = items.reduce((m, r) => Math.max(m, r.o), -1);
      tx.insert(schema.filterItems)
        .values({ text: t, description: `교훈: ${source}`, sortOrder: max + 1, origin: "lesson", originRef: retroId })
        .run();
    }
    tx.update(schema.retrospectives)
      .set({ appliedLessons: [...retro.appliedLessons, { target, text: t, at: now }], updatedAt: now })
      .where(eq(schema.retrospectives.id, retroId))
      .run();
  });
  return done();
}

export async function addMistakeTag(name: string): Promise<ActionResult> {
  const n = name.trim();
  if (!n || n.length > 50) return fail("태그 이름을 확인하세요.");
  db.insert(schema.mistakeTags).values({ name: n }).onConflictDoNothing().run();
  return done();
}

export async function deleteMistakeTag(id: number): Promise<ActionResult> {
  const used = db.select().from(schema.retrospectiveTags).where(eq(schema.retrospectiveTags.tagId, id)).get();
  if (used) return fail("복기에 쓰인 태그는 지울 수 없습니다.");
  db.delete(schema.mistakeTags).where(eq(schema.mistakeTags.id, id)).run();
  return done();
}
