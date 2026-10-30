"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { fetchFinancials } from "@/app/actions/data";
import { Alert, Badge, Button, Card, CardHeader } from "@/components/ui";
import type { FetchLog } from "@/db/schema";
import { formatDateTime } from "@/domain/format";
import type { FetchSummary } from "@/lib/server/financial-fetch";

export function FetchPanel({
  stock,
  logs,
}: {
  stock: { id: number; market: string; ticker: string | null; corpCode: string | null; cik: string | null };
  logs: FetchLog[];
}) {
  const router = useRouter();
  const [overwrite, setOverwrite] = React.useState(false);
  const [result, setResult] = React.useState<FetchSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const provider = stock.market === "KR" ? "DART" : stock.market === "US" ? "SEC EDGAR" : null;
  const id = stock.market === "KR" ? stock.corpCode && `고유번호 ${stock.corpCode}` : stock.cik && `CIK ${stock.cik}`;

  const run = () =>
    start(async () => {
      setError(null);
      setResult(null);
      const r = await fetchFinancials(stock.id, overwrite);
      if (r.ok) setResult(r.data);
      else setError(r.error);
      router.refresh();
    });

  const dataLogs = logs.filter((l) => l.provider === "dart" || l.provider === "sec");

  return (
    <Card>
      <CardHeader
        title="데이터 수집"
        description={
          provider
            ? `${provider}에서 최근 10년 연간과 최근 12개 분기 재무제표를 가져옵니다. ${stock.market === "KR" ? "연결재무제표를 우선하고, 없으면 별도재무제표를 씁니다." : "us-gaap 태그 기준이며 최초 보고치를 씁니다."}`
            : "한국·미국 외 종목은 자동 수집을 지원하지 않습니다. 아래 원자료에 직접 입력하거나 붙여넣으세요."
        }
        actions={id && <Badge>{id}</Badge>}
      />
      {provider && (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={run} disabled={pending}>
              <Download size={14} />
              {pending ? "수집 중… (첫 수집은 1~2분 걸릴 수 있습니다)" : `${provider}에서 수집`}
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              직접 입력한 값(수동·보고서)도 덮어쓰기
            </label>
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          {result && (
            <Alert tone="ok" title={`${result.company}: 저장 ${result.saved}개 · 변화 없음 ${result.unchanged}개${result.skippedManual ? ` · 직접 입력 유지 ${result.skippedManual}개` : ""}`}>
              <div className="flex flex-col gap-0.5 text-xs">
                <span>연간: {result.annualYears.join(", ") || "없음"}</span>
                <span>분기: {result.quarters.length ? `${result.quarters[0]} ~ ${result.quarters[result.quarters.length - 1]} (${result.quarters.length}개)` : "없음"}</span>
                {result.missingMetrics.length > 0 && <span>찾지 못한 계정: {result.missingMetrics.join(", ")} (직접 입력 가능)</span>}
                {result.notes.map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
            </Alert>
          )}
          {dataLogs.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">수집 기록 ({dataLogs.length})</summary>
              <ul className="mt-1 flex flex-col gap-0.5">
                {dataLogs.map((l) => (
                  <li key={l.id}>
                    {formatDateTime(l.createdAt)} · {l.provider.toUpperCase()} · {l.ok ? l.message : <span className="text-danger">실패: {l.message}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
