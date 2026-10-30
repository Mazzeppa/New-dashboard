import type { Exposure } from "@/domain/portfolio";
import { formatAmount, formatNumber } from "@/domain/format";
import { cn } from "@/lib/cn";

/** 노출도 막대 (한 계열, 크기 비교). 한도를 넘으면 경고색과 표시 */
export function ExposureBars({ items, limit, note }: { items: Exposure[]; limit?: number; note?: string }) {
  if (!items.length) return <p className="py-4 text-center text-sm text-muted">데이터가 없습니다.</p>;
  const max = Math.max(...items.map((i) => i.weight), limit ?? 0, 1);
  return (
    <div className="flex flex-col gap-2">
      {items.map((i) => {
        const over = limit != null && i.weight > limit;
        return (
          <div key={i.key} className="grid grid-cols-[8rem_minmax(0,1fr)_7.5rem] items-center gap-2 text-sm" title={`${i.key}: ${formatAmount(i.valueKrw, "KRW")}`}>
            <span className="truncate">{i.key}</span>
            <div className="relative h-4 rounded bg-surface-2">
              <div className={cn("absolute inset-y-0 left-0 rounded", over ? "bg-danger" : "bg-series-1")} style={{ width: `${(i.weight / max) * 100}%` }} />
              {limit != null && <div className="absolute inset-y-[-3px] border-l-2 border-dashed border-fg/60" style={{ left: `${(limit / max) * 100}%` }} title={`한도 ${limit}%`} />}
            </div>
            <span className={cn("text-right tabular-nums", over && "font-semibold text-danger")}>
              {formatNumber(i.weight, 1)}% {over && "⚠"}
            </span>
          </div>
        );
      })}
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}
