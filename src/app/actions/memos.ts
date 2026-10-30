"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getStock, getValuation, listMemos } from "@/db/queries";
import { buildSnapshot, cleanMemo, memoContentSchema, memoMissing } from "@/domain/memo";
import { fail, type ActionResult } from "@/lib/action";

function done(stockId: number): ActionResult {
  db.update(schema.stocks).set({ updatedAt: new Date().toISOString() }).where(eq(schema.stocks.id, stockId)).run();
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 작성 중인 버전을 저장한다. 메모가 없으면 v1을 만든다. 최신 버전이 확정본이면 먼저 새 버전을 만들어야 한다 */
export async function saveMemoDraft(stockId: number, input: unknown): Promise<ActionResult> {
  const parsed = memoContentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");
  const latest = listMemos(stockId)[0];
  if (latest?.status === "confirmed") return fail("확정된 메모는 고칠 수 없습니다. '새 버전으로 수정'을 쓰세요.");
  if (latest) {
    db.update(schema.memos).set({ content: parsed.data, updatedAt: new Date().toISOString() }).where(eq(schema.memos.id, latest.id)).run();
  } else {
    db.insert(schema.memos).values({ stockId, version: 1, status: "draft", content: parsed.data }).run();
  }
  return done(stockId);
}

/**
 * 작성 중인 버전을 확정한다. 필수 항목이 모두 있어야 하며,
 * 그 시점의 가치평가 결과·현재가·메모 내용을 스냅샷으로 고정한다.
 */
export async function confirmMemo(stockId: number, input: unknown): Promise<ActionResult<{ version: number }>> {
  const parsed = memoContentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "입력값을 확인하세요.");
  const content = cleanMemo(parsed.data);
  const missing = memoMissing(content);
  if (missing.length) return fail(`필수 항목이 비어 있습니다: ${missing.join(", ")}`);

  const stock = getStock(stockId);
  if (!stock) return fail("종목을 찾을 수 없습니다.");
  const latest = listMemos(stockId)[0];
  if (latest?.status === "confirmed") return fail("이미 확정된 버전입니다.");

  const now = new Date().toISOString();
  const snapshot = buildSnapshot({
    takenAt: now,
    currency: stock.currency,
    price: stock.price,
    priceDate: stock.priceDate,
    content,
    valuation: getValuation(stockId)?.data ?? null,
  });
  let version = 1;
  if (latest) {
    version = latest.version;
    db.update(schema.memos)
      .set({ status: "confirmed", content, snapshot, confirmedAt: now, updatedAt: now })
      .where(and(eq(schema.memos.id, latest.id), eq(schema.memos.status, "draft")))
      .run();
  } else {
    db.insert(schema.memos).values({ stockId, version, status: "confirmed", content, snapshot, confirmedAt: now }).run();
  }
  done(stockId);
  return { ok: true, data: { version } };
}

/** 확정본을 바탕으로 새 버전(작성 중)을 만든다. 원본은 그대로 남는다 */
export async function createMemoRevision(stockId: number, reason: string): Promise<ActionResult> {
  if (!reason?.trim()) return fail("새 버전을 만드는 이유를 적으세요.");
  const latest = listMemos(stockId)[0];
  if (!latest) return fail("메모가 없습니다.");
  if (latest.status !== "confirmed") return fail("이미 작성 중인 버전이 있습니다.");
  db.insert(schema.memos)
    .values({ stockId, version: latest.version + 1, status: "draft", content: latest.content, revisionReason: reason.trim() })
    .run();
  return done(stockId);
}

/** 작성 중인 새 버전을 버린다 (확정본이 있을 때만) */
export async function discardMemoDraft(stockId: number): Promise<ActionResult> {
  const [latest, prev] = listMemos(stockId);
  if (!latest || latest.status !== "draft") return fail("작성 중인 버전이 없습니다.");
  if (!prev) return fail("첫 버전은 버릴 수 없습니다. 내용을 지우고 다시 쓰세요.");
  db.delete(schema.memos).where(eq(schema.memos.id, latest.id)).run();
  return done(stockId);
}
