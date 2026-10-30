"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setMaintenanceCapexPct } from "@/app/actions/data";
import { Alert, Button, Card, CardHeader, EmptyState, Input } from "@/components/ui";
import { computeMetrics, summarizeMetrics, type MetricRow, type ValueInput } from "@/domain/metrics";
import { formatAmount, formatNumber, formatRatio, parseNumberInput } from "@/domain/format";
import { cn } from "@/lib/cn";
import { MetricCharts } from "./metric-charts";

type Mode = "annual" | "quarter";

interface RowDef {
  key: keyof MetricRow;
  label: string;
  kind: "amount" | "ratio" | "multiple";
  help?: string;
  group?: string;
}

const ROWS: RowDef[] = [
  { key: "revenue", label: "매출액", kind: "amount", group: "실적" },
  { key: "operatingIncome", label: "영업이익", kind: "amount" },
  { key: "netIncome", label: "순이익", kind: "amount" },
  { key: "operatingMargin", label: "영업이익률", kind: "ratio" },
  { key: "netMargin", label: "순이익률", kind: "ratio" },
  { key: "roe", label: "ROE", kind: "ratio", group: "자본효율", help: "지배주주순이익 / 평균 지배주주지분 (분기는 연환산)" },
  { key: "roic", label: "ROIC", kind: "ratio", help: "영업이익 × (1 − 세율) / 평균 투하자본(자본총계 + 차입부채 − 현금성자산). 분기는 연환산" },
  { key: "taxRate", label: "ROIC 적용 세율", kind: "ratio", help: "실효세율이 0~50% 밖이거나 구할 수 없으면 25%" },
  { key: "ocf", label: "영업현금흐름", kind: "amount", group: "현금흐름" },
  { key: "ocfToNetIncome", label: "영업현금흐름 / 순이익", kind: "multiple", help: "1배 미만이 이어지면 이익의 질을 의심" },
  { key: "capex", label: "CAPEX", kind: "amount" },
  { key: "maintenanceCapex", label: "유지 CAPEX", kind: "amount", help: "CAPEX × 유지 CAPEX 비율" },
  { key: "growthCapex", label: "성장 CAPEX", kind: "amount" },
  { key: "fcf", label: "FCF", kind: "amount", help: "영업현금흐름 − CAPEX" },
  { key: "ownerFcf", label: "영업현금흐름 − 유지 CAPEX", kind: "amount" },
  { key: "debtRatio", label: "부채비율", kind: "ratio", group: "재무구조", help: "부채총계 / 자본총계" },
  { key: "netDebt", label: "순차입금", kind: "amount", help: "차입부채 − 현금성자산 (음수면 순현금)" },
  { key: "nwc", label: "순운전자본", kind: "amount", help: "(유동자산 − 현금성자산) − (유동부채 − 단기차입부채)" },
  { key: "nwcChange", label: "순운전자본 증감", kind: "amount" },
];

export function MetricsPanel({
  stockId,
  currency,
  values,
  maintenanceCapexPct,
}: {
  stockId: number;
  currency: string;
  values: ValueInput[];
  maintenanceCapexPct: number | null;
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>("annual");
  const [maint, setMaint] = React.useState(maintenanceCapexPct?.toString() ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const all = React.useMemo(
    () => computeMetrics(values, mode, { maintenanceCapexPct }),
    [values, mode, maintenanceCapexPct],
  );
  const rows = mode === "annual" ? all.slice(-10) : all.slice(-12);
  const annualRows = React.useMemo(() => computeMetrics(values, "annual", { maintenanceCapexPct }), [values, maintenanceCapexPct]);

  const saveMaint = () =>
    start(async () => {
      const raw = parseNumberInput(maint);
      const r = await setMaintenanceCapexPct(stockId, raw);
      if (!r.ok) return setError(r.error);
      setError(null);
      router.refresh();
    });

  const fmt = (d: RowDef, v: number | null) =>
    v == null ? "-" : d.kind === "amount" ? formatAmount(v, currency) : d.kind === "ratio" ? formatRatio(v) : `${formatNumber(v, 2)}배`;

  return (
    <Card>
      <CardHeader
        title="재무 지표"
        description="저장된 재무 데이터로 자동 계산합니다. 숫자를 고치면 바로 반영됩니다."
        actions={
          <div className="inline-flex rounded-md border border-border p-0.5 text-sm">
            {(["annual", "quarter"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn("rounded px-3 py-1", mode === m ? "bg-surface-2 font-semibold" : "text-muted")}
              >
                {m === "annual" ? "연간 10년" : "분기 12개"}
              </button>
            ))}
          </div>
        }
      />
      {rows.length === 0 ? (
        <EmptyState>{mode === "annual" ? "연간" : "분기"} 재무 데이터가 없습니다. 위에서 수집하거나 아래 원자료에 입력하세요.</EmptyState>
      ) : (
        <div className="flex flex-col gap-6 p-4">
          <SummaryTiles rows={annualRows} />
          <MetricCharts rows={rows} currency={currency} />

          <div className="flex flex-wrap items-end gap-2 rounded-md bg-surface-2 p-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="font-medium">유지 CAPEX 비율 (%)</span>
              <span className="text-xs text-muted">CAPEX 중 현재 사업을 유지하는 데 드는 몫. 판단해서 입력합니다.</span>
              <div className="flex gap-2">
                <Input className="w-24 text-right" inputMode="decimal" value={maint} onChange={(e) => setMaint(e.target.value)} placeholder="예: 60" />
                <Button onClick={saveMaint} disabled={pending || maint === (maintenanceCapexPct?.toString() ?? "")}>
                  적용
                </Button>
              </div>
            </label>
            {error && <Alert tone="danger">{error}</Alert>}
          </div>

          <div className="overflow-x-auto">
            <table className="border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-10 min-w-48 bg-surface px-3 py-2 text-left text-xs font-medium text-muted">지표</th>
                  {rows.map((r) => (
                    <th key={r.key} className="min-w-24 px-2 py-2 text-right text-xs font-medium text-muted">
                      {r.key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((d) => (
                  <React.Fragment key={String(d.key)}>
                    {d.group && (
                      <tr>
                        <td colSpan={rows.length + 1} className="sticky left-0 bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
                          {d.group}
                        </td>
                      </tr>
                    )}
                    <tr className="border-b border-border/60">
                      <td className="sticky left-0 z-10 bg-surface px-3 py-1.5" title={d.help}>
                        {d.label}
                        {d.help && <span className="ml-1 cursor-help text-xs text-muted">ⓘ</span>}
                      </td>
                      {rows.map((r) => {
                        const v = r[d.key] as number | null;
                        return (
                          <td key={r.key} className={cn("num px-2 py-1.5", v != null && v < 0 && "text-danger")}>
                            {fmt(d, v)}
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

function SummaryTiles({ rows }: { rows: MetricRow[] }) {
  const ten = summarizeMetrics(rows, 10);
  // 데이터가 5년 이하면 10년 요약은 5년 요약과 같으므로 생략
  const periods = [{ n: 10, s: ten }, { n: 5, s: summarizeMetrics(rows, 5) }].filter((x) => x.s.years > 0 && (x.n === 5 || ten.years > 5));
  if (!periods.length) return null;
  const items = (s: ReturnType<typeof summarizeMetrics>) => [
    { label: "매출 CAGR", value: formatRatio(s.revenueCagr) },
    { label: "평균 영업이익률", value: formatRatio(s.avgOperatingMargin) },
    { label: "평균 ROE", value: formatRatio(s.avgRoe) },
    { label: "평균 ROIC", value: formatRatio(s.avgRoic) },
    { label: "누적 OCF / 순이익", value: s.cumulativeOcfToNetIncome == null ? "-" : `${formatNumber(s.cumulativeOcfToNetIncome, 2)}배` },
    { label: "FCF 흑자 연도", value: s.fcfYears ? `${s.positiveFcfYears} / ${s.fcfYears}년` : "-" },
  ];
  return (
    <div className="flex flex-col gap-3">
      {periods.map(({ n, s }) => (
        <div key={n}>
          <div className="mb-1 text-xs font-medium text-muted">
            최근 {Math.min(n, s.years)}년 {s.years < n && `(데이터 ${s.years}년)`}
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
            {items(s).map((it) => (
              <div key={it.label} className="bg-surface px-3 py-2">
                <div className="text-xs text-muted">{it.label}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums">{it.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
