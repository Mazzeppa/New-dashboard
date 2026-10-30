import Link from "next/link";
import {
  getAnalysisSections,
  getValuation,
  listFilterItems,
  listFilterResults,
  listHoldingReviews,
  listMemos,
  listRetrospectives,
  listTrades,
  type StockWithPrice,
} from "@/db/queries";
import { ANALYSIS_SECTIONS } from "@/domain/analysis";
import { formatNumber, formatPrice, formatRatio } from "@/domain/format";
import { computePosition } from "@/domain/portfolio";
import { reviewDue } from "@/domain/review";
import { summarize } from "@/domain/valuation";
import { today } from "@/lib/action";
import { cn } from "@/lib/cn";

type Tone = "ok" | "warn" | "danger" | "muted";
const TONE: Record<Tone, string> = { ok: "text-ok", warn: "text-warn", danger: "text-danger", muted: "text-muted" };

/** 종목이 각 단계에서 어디까지 왔는지 한 줄 요약 */
export function ProcessSummary({ stock }: { stock: StockWithPrice }) {
  const items = listFilterItems({ activeOnly: true });
  const results = new Map(listFilterResults(stock.id).map((r) => [r.itemId, r.answer]));
  const failed = items.filter((i) => results.get(i.id) === "no").length;
  const answered = items.filter((i) => results.get(i.id)).length;

  const sections = getAnalysisSections(stock.id);
  const scored = ANALYSIS_SECTIONS.filter((s) => sections[s.key]?.score != null);

  const valuation = getValuation(stock.id);
  const vs = valuation ? summarize(valuation.data, stock.price) : null;

  const memos = listMemos(stock.id);
  const confirmed = memos.find((m) => m.status === "confirmed");

  const pos = computePosition(listTrades(stock.id));
  const reviews = listHoldingReviews(stock.id);
  const due = stock.stage === "holding" ? reviewDue(reviews[0]?.reviewDate ?? null, stock.stageChangedAt, today()) : null;
  const retros = listRetrospectives(stock.id);

  const tiles: { tab: string; label: string; value: string; tone: Tone }[] = [
    { tab: "filter", label: "1차 필터", value: `${answered}/${items.length} 답${failed ? ` · 실패 ${failed}` : ""}`, tone: failed ? "danger" : answered === items.length && items.length ? "ok" : "muted" },
    { tab: "analysis", label: "심층 분석", value: scored.length ? scored.map((s) => `${s.label.slice(0, 2)} ${sections[s.key]!.score}`).join(" · ") : "평가 없음", tone: scored.length === ANALYSIS_SECTIONS.length ? "ok" : "muted" },
    {
      tab: "valuation",
      label: "가치평가",
      value: vs?.intrinsicValue != null ? `${formatPrice(vs.intrinsicValue, stock.currency)} · MoS ${formatRatio(vs.marginOfSafety, 0)}` : "결과 없음",
      tone: vs?.marginOfSafety == null ? "muted" : vs.marginOfSafety >= 0.3 ? "ok" : vs.marginOfSafety >= 0 ? "warn" : "danger",
    },
    { tab: "memo", label: "투자 메모", value: confirmed ? `v${confirmed.version} 확정${memos[0].status === "draft" ? ` · v${memos[0].version} 작성 중` : ""}` : memos.length ? "작성 중" : "없음", tone: confirmed ? "ok" : "muted" },
    { tab: "trades", label: "포지션", value: pos.quantity > 0 ? `${formatNumber(pos.quantity, 2)}주 · 평단 ${formatPrice(pos.avgCost, stock.currency)}` : pos.realizedPnl ? "정리함" : "없음", tone: pos.errors.length ? "danger" : "muted" },
    {
      tab: "reviews",
      label: "보유 점검",
      value: reviews[0] ? `${reviews[0].reviewDate}${due?.due ? ` · ${due.elapsed}일 경과` : ""}` : due ? `없음 · 보유 ${due.elapsed}일` : "-",
      tone: due?.due ? "warn" : reviews[0] ? "ok" : "muted",
    },
    { tab: "retro", label: "복기", value: retros.length ? `${retros.length}건` : stock.stage === "sold" ? "작성 필요" : "-", tone: stock.stage === "sold" && !retros.some((r) => r.kind === "final") ? "danger" : retros.length ? "ok" : "muted" },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4 xl:grid-cols-7">
      {tiles.map((t, i) => (
        <Link
          key={t.tab}
          href={`/stocks/${stock.id}?tab=${t.tab}`}
          // 7개 타일: 2열·4열 그리드에서 마지막 줄 빈칸이 생기지 않도록 마지막 타일을 넓힌다
          className={cn("bg-surface px-3 py-2.5 hover:bg-surface-2", i === tiles.length - 1 && "col-span-2 xl:col-span-1")}
        >
          <div className="text-xs text-muted">{t.label}</div>
          <div className={cn("mt-0.5 truncate text-sm font-medium tabular-nums", TONE[t.tone])} title={t.value}>
            {t.value}
          </div>
        </Link>
      ))}
    </div>
  );
}
