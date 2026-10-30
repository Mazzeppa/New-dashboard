"use client";

import * as React from "react";
import { parseNumberInput } from "@/domain/format";
import { cn } from "@/lib/cn";

/**
 * 숫자 입력. 저장 값 = 입력 값 × scale (예: 억원 입력 → 원 저장, % 입력 → 소수 저장).
 * 입력 중에는 사용자가 친 문자열을 그대로 두고, 포커스를 잃으면 정리된 형식으로 다시 보여 준다.
 */
export function NumberField({
  value,
  onChange,
  scale = 1,
  decimals = 2,
  suffix,
  className,
  placeholder,
  integer,
  "aria-label": ariaLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  scale?: number;
  decimals?: number;
  suffix?: string;
  className?: string;
  placeholder?: string;
  integer?: boolean;
  "aria-label"?: string;
}) {
  const format = React.useCallback(
    (v: number | null) => (v == null ? "" : (v / scale).toLocaleString("ko-KR", { maximumFractionDigits: integer ? 0 : decimals })),
    [scale, decimals, integer],
  );
  const [text, setText] = React.useState(format(value));
  const [focused, setFocused] = React.useState(false);
  const invalid = text.trim() !== "" && parseNumberInput(text) === null;

  React.useEffect(() => {
    if (!focused) setText(format(value));
  }, [value, focused, format]);

  return (
    <div className={cn("relative", className)}>
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText(format(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseNumberInput(e.target.value);
          if (e.target.value.trim() === "") onChange(null);
          else if (n !== null) onChange(integer ? Math.round(n) : n * scale);
        }}
        className={cn(
          "h-8 w-full rounded-md border bg-surface px-2 text-right text-sm tabular-nums outline-none focus:border-accent focus:ring-2 focus:ring-accent/20",
          suffix && "pr-9",
          invalid ? "border-danger" : "border-border",
        )}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
    </div>
  );
}
