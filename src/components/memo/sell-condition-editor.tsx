"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import { NumberField } from "@/components/valuation/number-field";
import { unitsFor } from "@/domain/financials";
import { OPERATORS, SELL_METRICS, type Operator, type SellCondition, type SellMetric } from "@/domain/memo";

export function SellConditionEditor({
  value,
  onChange,
  currency,
}: {
  value: SellCondition[];
  onChange: (v: SellCondition[]) => void;
  currency: string;
}) {
  const unit = unitsFor(currency)[0];
  const set = (i: number, c: SellCondition) => onChange(value.map((x, xi) => (xi === i ? c : x)));

  return (
    <div className="flex flex-col gap-2">
      {value.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2">
          {c.type === "structured" ? (
            <>
              <Select
                className="h-8 w-56 text-xs"
                aria-label="지표"
                value={c.metric}
                onChange={(e) => set(i, { ...c, metric: e.target.value as SellMetric, threshold: 0 })}
              >
                {Object.entries(SELL_METRICS).map(([k, m]) => (
                  <option key={k} value={k}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <Select className="h-8 w-16 text-xs" aria-label="조건" value={c.operator} onChange={(e) => set(i, { ...c, operator: e.target.value as Operator })}>
                {Object.entries(OPERATORS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
              {SELL_METRICS[c.metric].kind === "ratio" ? (
                <NumberField className="w-28" aria-label="기준값" value={c.threshold} scale={0.01} decimals={2} suffix="%" onChange={(v) => set(i, { ...c, threshold: v ?? 0 })} />
              ) : SELL_METRICS[c.metric].kind === "multiple" ? (
                <NumberField className="w-28" aria-label="기준값" value={c.threshold} decimals={2} suffix="배" onChange={(v) => set(i, { ...c, threshold: v ?? 0 })} />
              ) : (
                <NumberField className="w-36" aria-label="기준값" value={c.threshold} scale={unit.multiplier} decimals={1} suffix={unit.label.replace(`${currency} `, "")} onChange={(v) => set(i, { ...c, threshold: v ?? 0 })} />
              )}
              <NumberField className="w-20" aria-label="지속 기간" value={c.periods} integer onChange={(v) => set(i, { ...c, periods: Math.max(1, Math.min(12, v ?? 1)) })} />
              <Select className="h-8 w-28 text-xs" aria-label="기간 단위" value={c.periodType} onChange={(e) => set(i, { ...c, periodType: e.target.value as "quarter" | "annual" })}>
                <option value="quarter">분기 연속</option>
                <option value="annual">년 연속</option>
              </Select>
              <Input className="h-8 min-w-40 flex-1 text-xs" placeholder="메모 (선택)" value={c.note} onChange={(e) => set(i, { ...c, note: e.target.value })} />
            </>
          ) : (
            <Input className="h-8 flex-1 text-sm" placeholder="서술형 매도 조건 (예: 창업주가 경영에서 물러나면)" value={c.text} onChange={(e) => set(i, { ...c, text: e.target.value })} />
          )}
          <button type="button" aria-label="조건 삭제" className="text-muted hover:text-danger" onClick={() => onChange(value.filter((_, xi) => xi !== i))}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => onChange([...value, { type: "structured", metric: "operatingMargin", operator: "<", threshold: 0.1, periods: 2, periodType: "quarter", note: "" }])}
        >
          <Plus size={12} /> 구조화된 조건 (지표 + 조건 + 기준값 + 지속 기간)
        </Button>
        <Button size="sm" onClick={() => onChange([...value, { type: "text", text: "" }])}>
          <Plus size={12} /> 서술형 조건
        </Button>
      </div>
    </div>
  );
}
