"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { refreshAllPrices, refreshPricesIfDue } from "@/app/actions/prices";
import { Button } from "@/components/ui";
import { formatDateTime } from "@/domain/format";
import type { RefreshResult } from "@/lib/server/price-refresh";
import { cn } from "@/lib/cn";

/**
 * 현재가·환율 갱신 막대. autoDue면 화면을 연 직후 백그라운드로 한 번 갱신한다(하루 1회).
 */
export function PriceRefreshBar({ last, autoDue }: { last: RefreshResult | null; autoDue: boolean }) {
  const router = useRouter();
  const [result, setResult] = React.useState<RefreshResult | null>(last);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const started = React.useRef(false);

  const run = React.useCallback(
    (onlyIfDue: boolean) =>
      start(async () => {
        const r = onlyIfDue ? await refreshPricesIfDue() : await refreshAllPrices();
        if (!r.ok) return setError(r.error);
        setError(null);
        if (r.data) {
          setResult(r.data);
          router.refresh();
        }
      }),
    [router],
  );

  React.useEffect(() => {
    if (autoDue && !started.current) {
      started.current = true;
      run(true);
    }
  }, [autoDue, run]);

  const failures = result ? [...result.failed.map((f) => `${f.name}: ${f.error}`), ...result.fxFailed.map((f) => `${f.currency} 환율: ${f.error}`)] : [];

  return (
    <div className="flex flex-col items-end gap-1 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-muted">
          {pending
            ? "현재가·환율 갱신 중…"
            : result
              ? `시세 ${formatDateTime(result.at)} · 종목 ${result.updated.length} · 환율 ${result.fx.length}${failures.length ? "" : " 갱신"}`
              : "시세를 아직 가져오지 않았습니다"}
        </span>
        <Button size="sm" onClick={() => run(false)} disabled={pending} title="네이버(한국)·Yahoo(해외·환율)에서 가져옵니다">
          <RefreshCw size={12} className={cn(pending && "animate-spin")} /> 가격 갱신
        </Button>
      </div>
      {error && <span className="text-danger">{error}</span>}
      {!pending && failures.length > 0 && (
        <details className="max-w-md text-right">
          <summary className="cursor-pointer text-warn">실패 {failures.length}건</summary>
          <ul className="mt-1 text-left text-muted">
            {failures.map((f) => (
              <li key={f}>· {f}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
