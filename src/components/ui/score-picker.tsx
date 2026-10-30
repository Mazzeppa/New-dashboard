"use client";

import { SCORE_LABELS } from "@/domain/analysis";
import { cn } from "@/lib/cn";

/** 1~5점 선택. 같은 점수를 다시 누르면 해제 */
export function ScorePicker({
  value,
  onChange,
  disabled,
  size = "md",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex gap-1" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          title={SCORE_LABELS[n]}
          disabled={disabled}
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            "rounded-md border font-semibold tabular-nums transition disabled:opacity-50",
            size === "sm" ? "h-7 w-7 text-xs" : "h-8 w-8 text-sm",
            value === n
              ? n <= 2
                ? "border-danger bg-danger-bg text-danger"
                : n === 3
                  ? "border-warn bg-warn-bg text-warn"
                  : "border-ok bg-ok-bg text-ok"
              : "border-border text-muted hover:bg-surface-2",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
