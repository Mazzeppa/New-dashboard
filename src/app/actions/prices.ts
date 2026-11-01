"use server";

import { revalidatePath } from "next/cache";
import { fail, type ActionResult } from "@/lib/action";
import { refreshDue, refreshPrices, setAutoRefresh, type RefreshResult } from "@/lib/server/price-refresh";

export async function refreshAllPrices(): Promise<ActionResult<RefreshResult>> {
  try {
    const r = await refreshPrices();
    revalidatePath("/", "layout");
    return { ok: true, data: r };
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/** 하루 1회 자동 갱신: 오늘 아직 갱신하지 않았을 때만 실행 */
export async function refreshPricesIfDue(): Promise<ActionResult<RefreshResult | null>> {
  if (!refreshDue()) return { ok: true, data: null };
  return refreshAllPrices();
}

export async function refreshStockPrice(stockId: number): Promise<ActionResult<RefreshResult>> {
  const r = await refreshPrices({ stockIds: [stockId] });
  revalidatePath("/", "layout");
  if (r.failed.length) return fail(r.failed[0].error);
  return { ok: true, data: r };
}

export async function setPriceAutoRefresh(on: boolean): Promise<ActionResult> {
  setAutoRefresh(on);
  revalidatePath("/", "layout");
  return { ok: true };
}
