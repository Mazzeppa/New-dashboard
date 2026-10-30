"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MetricRow } from "@/domain/metrics";
import { formatAmount, formatRatio } from "@/domain/format";

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

interface SeriesDef {
  key: keyof MetricRow;
  label: string;
}

type Datum = Record<string, number | string | null>;

function toData(rows: MetricRow[], series: SeriesDef[]): Datum[] {
  return rows.map((r) => Object.fromEntries([["period", r.key], ...series.map((s) => [s.key, r[s.key] as number | null])]));
}

function Legend({ series }: { series: SeriesDef[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted">
      {series.map((s, i) => (
        <span key={String(s.key)} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[i] }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/** Recharts가 content 요소에 주입하는 값 중 쓰는 것만 */
interface InjectedTooltipProps {
  active?: boolean;
  payload?: { dataKey?: unknown; value?: unknown }[];
  label?: string | number;
}

function ChartTooltip({ active, payload, label, series, fmt }: InjectedTooltipProps & { series: SeriesDef[]; fmt: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-fg">{label}</div>
      {series.map((s, i) => {
        const p = payload.find((x) => x.dataKey === s.key);
        return (
          <div key={String(s.key)} className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-sm" style={{ background: SERIES[i] }} />
              {s.label}
            </span>
            <span className="tabular-nums text-fg">{p?.value == null ? "-" : fmt(p.value as number)}</span>
          </div>
        );
      })}
    </div>
  );
}

const axisProps = {
  tick: { fill: "var(--muted)", fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: "var(--border)" },
} as const;

function ChartFrame({ title, series, children }: { title: string; series: SeriesDef[]; children: React.ReactElement }) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <Legend series={series} />
      </figcaption>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function AmountBars({ rows, series, currency, title }: { rows: MetricRow[]; series: SeriesDef[]; currency: string; title: string }) {
  const data = toData(rows, series);
  const fmt = (v: number) => formatAmount(v, currency);
  return (
    <ChartFrame title={title} series={series}>
      <BarChart data={data} barGap={2} barCategoryGap="20%" margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
        <XAxis dataKey="period" {...axisProps} />
        <YAxis {...axisProps} axisLine={false} width={72} tickFormatter={fmt} />
        <ReferenceLine y={0} stroke="var(--muted)" strokeOpacity={0.6} />
        <Tooltip cursor={{ fill: "var(--surface-2)", opacity: 0.6 }} content={<ChartTooltip series={series} fmt={fmt} />} />
        {series.map((s, i) => (
          <Bar key={String(s.key)} dataKey={s.key as string} name={s.label} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        ))}
      </BarChart>
    </ChartFrame>
  );
}

function RatioLines({ rows, series, title }: { rows: MetricRow[]; series: SeriesDef[]; title: string }) {
  const data = toData(rows, series);
  const fmt = (v: number) => formatRatio(v);
  return (
    <ChartFrame title={title} series={series}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="period" {...axisProps} />
        <YAxis {...axisProps} axisLine={false} width={48} tickFormatter={(v: number) => formatRatio(v, Number.isInteger(Math.round(v * 1000) / 10) ? 0 : 1)} />
        <ReferenceLine y={0} stroke="var(--muted)" strokeOpacity={0.6} />
        <Tooltip cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }} content={<ChartTooltip series={series} fmt={fmt} />} />
        {series.map((s, i) => (
          <Line
            key={String(s.key)}
            dataKey={s.key as string}
            name={s.label}
            stroke={SERIES[i]}
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)", fill: SERIES[i] }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--surface)" }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartFrame>
  );
}

export function MetricCharts({ rows, currency }: { rows: MetricRow[]; currency: string }) {
  if (rows.length === 0) return null;
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <AmountBars
        title="실적"
        rows={rows}
        currency={currency}
        series={[
          { key: "revenue", label: "매출액" },
          { key: "operatingIncome", label: "영업이익" },
          { key: "netIncome", label: "순이익" },
        ]}
      />
      <RatioLines
        title="수익성"
        rows={rows}
        series={[
          { key: "operatingMargin", label: "영업이익률" },
          { key: "roe", label: "ROE" },
          { key: "roic", label: "ROIC" },
        ]}
      />
      <AmountBars
        title="현금흐름"
        rows={rows}
        currency={currency}
        series={[
          { key: "ocf", label: "영업현금흐름" },
          { key: "capex", label: "CAPEX" },
          { key: "fcf", label: "FCF" },
        ]}
      />
    </div>
  );
}
