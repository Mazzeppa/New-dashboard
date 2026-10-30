"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { getGateContext } from "@/db/queries";
import { evaluateMove, isStage, type MoveEvaluation, type SellReasonType, type Stage } from "@/domain/pipeline";
import { fail, type ActionResult } from "@/lib/action";

export interface MoveRequest {
  stockId: number;
  to: Stage;
  bypassReason?: string;
  rejectReason?: string;
  sellReasonType?: SellReasonType;
  sellReasonText?: string;
}

function load(stockId: number) {
  return db.select().from(schema.stocks).where(eq(schema.stocks.id, stockId)).get();
}

/** 이동 전에 필요한 입력과 게이트 실패를 미리 확인한다 (입력 누락 오류는 제외하고 보여줌). */
export async function previewMove(stockId: number, to: Stage): Promise<ActionResult<MoveEvaluation & { from: Stage }>> {
  const s = load(stockId);
  if (!s) return fail("종목을 찾을 수 없습니다.");
  if (!isStage(to)) return fail("알 수 없는 단계입니다.");
  const ev = evaluateMove({ from: s.stage, to }, getGateContext(stockId));
  return { ok: true, data: { ...ev, from: s.stage } };
}

export type MoveResult = ActionResult<{ from: Stage; to: Stage }> | { ok: false; error: string; gateFailures: MoveEvaluation["gateFailures"] };

export async function moveStock(req: MoveRequest): Promise<MoveResult> {
  const s = load(req.stockId);
  if (!s) return fail("종목을 찾을 수 없습니다.");
  if (!isStage(req.to)) return fail("알 수 없는 단계입니다.");

  const ev = evaluateMove(
    {
      from: s.stage,
      to: req.to,
      rejectReason: req.rejectReason,
      sellReasonType: req.sellReasonType,
      sellReasonText: req.sellReasonText,
    },
    getGateContext(req.stockId),
  );
  if (ev.errors.length) return fail(ev.errors.join(" "));

  const bypass = req.bypassReason?.trim() || null;
  if (ev.gateFailures.length && !bypass) {
    return { ok: false, error: "게이트 조건을 충족하지 못했습니다. 진행하려면 우회 사유를 입력하세요.", gateFailures: ev.gateFailures };
  }

  const now = new Date().toISOString();
  const toRejected = req.to === "rejected";
  const fromRejected = s.stage === "rejected";

  db.transaction((tx) => {
    tx.update(schema.stocks).set({
      stage: req.to,
      stageChangedAt: now,
      updatedAt: now,
      ...(toRejected
        ? { rejectedFromStage: s.stage === "rejected" ? s.rejectedFromStage : s.stage, rejectReason: req.rejectReason!.trim() }
        : fromRejected
          ? { rejectedFromStage: null, rejectReason: null }
          : {}),
    }).where(eq(schema.stocks.id, s.id)).run();

    tx.insert(schema.stageTransitions).values({
      stockId: s.id,
      fromStage: s.stage,
      toStage: req.to,
      gateFailures: ev.gateFailures,
      bypassReason: ev.gateFailures.length ? bypass : null,
      rejectReason: toRejected ? req.rejectReason!.trim() : null,
      sellReasonType: req.to === "sold" ? req.sellReasonType : null,
      sellReasonText: req.to === "sold" ? req.sellReasonText?.trim() || null : null,
      createdAt: now,
    }).run();
  });

  revalidatePath("/", "layout");
  return { ok: true, data: { from: s.stage, to: req.to } };
}
