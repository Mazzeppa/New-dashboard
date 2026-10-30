"use client";

import { formatPrice } from "@/domain/format";
import { METHOD_LABELS, METHODS, SCENARIO_LABELS, SCENARIOS, type Method, type ValueGrid } from "@/domain/valuation";
import { cn } from "@/lib/cn";

interface Row {
  method: Method;
  values: Partial<Record<(typeof SCENARIOS)[number], number>>;
  min: number;
  max: number;
}

/** 0이나 음수를 포함할 수 있는 축에 맞는 깔끔한 눈금 */
function niceTicks(lo: number, hi: number, count = 5): number[] {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= hi + 1e-9; t += step) ticks.push(Math.round(t / step) * step);
  return ticks;
}

/**
 * 방법별 주당 가치 범위(비관~낙관)와 기본 시나리오, 현재가·내재가치 기준선.
 */
export function FootballField({
  grid,
  representative,
  price,
  intrinsicValue,
  currency,
}: {
  grid: ValueGrid;
  representative: Method;
  price: number | null;
  intrinsicValue: number | null;
  currency: string;
}) {
  const rows: Row[] = METHODS.flatMap((m) => {
    const values: Row["values"] = {};
    for (const s of SCENARIOS) {
      const c = grid[m][s];
      if (c.ok) values[s] = c.value;
    }
    const vs = Object.values(values);
    return vs.length ? [{ method: m, values, min: Math.min(...vs), max: Math.max(...vs) }] : [];
  });

  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-muted">계산된 가치가 없습니다. 아래에서 방법별 가정을 입력하세요.</p>;
  }

  const all = rows.flatMap((r) => [r.min, r.max]).concat(price != null ? [price] : [], intrinsicValue != null ? [intrinsicValue] : []);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.08;
  lo = lo >= 0 && lo - pad < 0 ? 0 : lo - pad;
  hi += pad;
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const ticks = niceTicks(lo, hi);

  return (
    <div className="flex flex-col gap-1">
      <div className="mb-1 flex flex-wrap gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-series-1" /> 비관~낙관 범위
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-fg" /> 기본 시나리오
        </span>
        {price != null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-0 border-l-2 border-dashed border-danger" /> 현재가 {formatPrice(price, currency)}
          </span>
        )}
        {intrinsicValue != null && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-0.5 bg-ok" /> 내재가치(가중) {formatPrice(intrinsicValue, currency)}
          </span>
        )}
      </div>

      {rows.map((r) => {
        const isRep = r.method === representative;
        return (
          <div key={r.method} className="group grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <div className={cn("truncate text-xs", isRep ? "font-semibold text-fg" : "text-muted")}>
              {METHOD_LABELS[r.method]}
              {isRep && <span className="ml-1 text-accent">대표</span>}
            </div>
            <div className="relative h-9">
              {/* 기준선 */}
              {price != null && <div className="absolute inset-y-0 border-l-2 border-dashed border-danger" style={{ left: `${pos(price)}%` }} />}
              {intrinsicValue != null && <div className="absolute inset-y-0 w-0.5 bg-ok" style={{ left: `${pos(intrinsicValue)}%` }} />}
              {/* 범위 막대 */}
              <div
                className={cn("absolute top-2 h-5 rounded bg-series-1", isRep ? "opacity-100" : "opacity-50")}
                style={{ left: `${pos(r.min)}%`, width: `max(${pos(r.max) - pos(r.min)}%, 3px)` }}
              />
              {r.values.base != null && (
                <div className="absolute top-1 h-7 w-0.5 bg-fg ring-2 ring-surface" style={{ left: `${pos(r.values.base)}%` }} />
              )}
              {/* 호버 툴팁 */}
              <div className="pointer-events-none absolute -top-1 z-20 hidden -translate-y-full rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg group-hover:block" style={{ left: `min(${pos(r.min)}%, calc(100% - 12rem))` }}>
                <div className="mb-1 font-semibold">{METHOD_LABELS[r.method]}</div>
                {SCENARIOS.map((s) => (
                  <div key={s} className="flex justify-between gap-6">
                    <span className="text-muted">{SCENARIO_LABELS[s]}</span>
                    <span className="tabular-nums">{r.values[s] != null ? formatPrice(r.values[s], currency) : "-"}</span>
                  </div>
                ))}
                {price != null && r.values.base != null && (
                  <div className="mt-1 border-t border-border pt-1 text-muted">기본 / 현재가 {((r.values.base / price - 1) * 100).toFixed(1)}%</div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* 축 */}
      <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <div />
        <div className="relative h-5 border-t border-border">
          {ticks.map((t) => (
            <span key={t} className="absolute top-1 -translate-x-1/2 text-[11px] whitespace-nowrap text-muted tabular-nums" style={{ left: `${pos(t)}%` }}>
              {formatPrice(t, currency)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
