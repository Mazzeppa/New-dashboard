"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getPrinciples } from "@/db/queries";
import { diffPrinciples, principlesSchema } from "@/domain/principles";
import { fail, zodFieldErrors, type ActionResult } from "@/lib/action";

/** 원칙을 저장하고 새 버전을 남긴다. 변경 사유는 필수다. */
export async function savePrinciples(input: unknown, reason: string): Promise<ActionResult<{ version: number }>> {
  const parsed = principlesSchema.safeParse(input);
  if (!parsed.success) return fail("입력값을 확인하세요.", zodFieldErrors(parsed.error.issues));
  if (!reason?.trim()) return fail("변경 사유를 입력하세요.", { reason: "필수" });

  const current = getPrinciples();
  const changed = diffPrinciples(current.data, parsed.data);
  if (changed.length === 0) return fail("바뀐 내용이 없습니다.");

  const version = current.version + 1;
  db.transaction((tx) => {
    tx.update(schema.principles)
      .set({ version, data: parsed.data, updatedAt: new Date().toISOString() })
      .where(eq(schema.principles.id, 1))
      .run();
    tx.insert(schema.principleVersions).values({ version, data: parsed.data, reason: reason.trim() }).run();
  });

  revalidatePath("/", "layout");
  return { ok: true, data: { version } };
}
