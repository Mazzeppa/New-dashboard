"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2, Wand2 } from "lucide-react";
import { saveValuation } from "@/app/actions/valuation";
import { Alert, Badge, Button, Card, CardHeader, Input, Select, Textarea } from "@/components/ui";
import { unitsFor } from "@/domain/financials";
import { formatAmount, formatDateTime, formatNumber, formatPrice, formatRatio } from "@/domain/format";
import {
  dcf,
  dcfSensitivity,
  evEbitValue,
  METHOD_LABELS,
  METHODS,
  navValue,
  perValue,
  reverseDcf,
  SCENARIO_LABELS,
  SCENARIOS,
  summarize,
  type InputSuggestions,
  type Method,
  type Scenario,
  type ValuationData,
} from "@/domain/valuation";
import { cn } from "@/lib/cn";
import { FootballField } from "./football-field";
import { NumberField } from "./number-field";

type MethodData<M extends Method> = ValuationData[M]["base"];

export function ValuationWorkspace({
  stockId,
  currency,
  price,
  priceDate,
  initial,
  updatedAt,
  suggestions,
}: {
  stockId: number;
  currency: string;
  price: number | null;
  priceDate: string | null;
  initial: ValuationData;
  updatedAt: string | null;
  suggestions: InputSuggestions;
}) {
  const router = useRouter();
  const units = unitsFor(currency);
  const [unitKey, setUnitKey] = React.useState(units[0].key);
  const unit = units.find((u) => u.key === unitKey) ?? units[0];
  const [data, setData] = React.useState<ValuationData>(initial);
  const [dirty, setDirty] = React.useState(false);
  const [tab, setTab] = React.useState<Method>(initial.representative);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(updatedAt);
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const update = (fn: (d: ValuationData) => void) => {
    setData((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };

  const setScenario = <M extends Method>(m: M, s: Scenario, patch: Partial<MethodData<M>>) =>
    update((d) => {
      Object.assign(d[m][s], patch);
    });

  const copyBase = (m: Method) =>
    update((d) => {
      d[m].bear = structuredClone(d[m].base) as never;
      d[m].bull = structuredClone(d[m].base) as never;
    });

  const summary = summarize(data, price);
  const probSum = data.probabilities.bear + data.probabilities.base + data.probabilities.bull;

  const save = () =>
    start(async () => {
      const r = await saveValuation(stockId, data);
      if (!r.ok) return setError(r.error);
      setError(null);
      setDirty(false);
      setSavedAt(new Date().toISOString());
      router.refresh();
    });

  const money = { scale: unit.multiplier, decimals: unit.multiplier >= 1e6 ? 2 : 0, suffix: unit.label.replace(`${currency} `, "") };

  return (
    <div className="flex flex-col gap-5 pb-20">
      {/* ── 요약 ───────────────────────────────────── */}
      <Card>
        <CardHeader
          title="가치평가 요약"
          description="대표 방법의 시나리오별 주당 가치를 확률로 가중해 내재가치로 씁니다. 다른 방법은 참고 범위입니다. 계산은 거래 통화 기준입니다."
          actions={savedAt && <span className="text-xs text-muted">저장 {formatDateTime(savedAt)}</span>}
        />
        <div className="flex flex-col gap-5 p-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-5">
            <Tile label="현재가" value={formatPrice(price, currency)} sub={price == null ? <Link className="underline" href={`/stocks/${stockId}?tab=overview`}>개요에서 입력</Link> : priceDate} />
            <Tile label="내재가치 (가중)" value={formatPrice(summary.intrinsicValue, currency)} strong />
            <Tile
              label="안전마진"
              value={formatRatio(summary.marginOfSafety)}
              sub="1 − 현재가 / 내재가치"
              tone={summary.marginOfSafety == null ? undefined : summary.marginOfSafety >= 0.3 ? "ok" : summary.marginOfSafety >= 0 ? "warn" : "danger"}
            />
            <Tile label="상승여력" value={formatRatio(summary.upside)} sub="내재가치 / 현재가 − 1" />
            <Tile label="비관 시나리오 하락률" value={formatRatio(summary.bearDownside)} sub="6단계 비중 상한에 사용" />
          </div>
          {summary.reason && <Alert tone="warn">내재가치를 계산할 수 없습니다: {summary.reason}</Alert>}

          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">대표 방법</span>
              <Select
                className="w-56"
                value={data.representative}
                onChange={(e) => update((d) => void (d.representative = e.target.value as Method))}
              >
                {METHODS.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </option>
                ))}
              </Select>
            </label>
            {SCENARIOS.map((s) => (
              <label key={s} className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{SCENARIO_LABELS[s]} 확률</span>
                <NumberField
                  className="w-24"
                  value={data.probabilities[s]}
                  scale={0.01}
                  decimals={1}
                  suffix="%"
                  aria-label={`${SCENARIO_LABELS[s]} 확률`}
                  onChange={(v) => update((d) => void (d.probabilities[s] = Math.max(0, Math.min(1, v ?? 0))))}
                />
              </label>
            ))}
            <span className={cn("pb-2 text-xs", Math.abs(probSum - 1) > 1e-6 ? "text-danger" : "text-muted")}>합계 {formatNumber(probSum * 100, 1)}%</span>
          </div>

          <FootballField grid={summary.grid} representative={data.representative} price={price} intrinsicValue={summary.intrinsicValue} currency={currency} />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="px-2 py-1.5 text-left font-medium">방법 (주당 가치)</th>
                  {SCENARIOS.map((s) => (
                    <th key={s} className="px-2 py-1.5 text-right font-medium">
                      {SCENARIO_LABELS[s]} {formatNumber(data.probabilities[s] * 100, 0)}%
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-right font-medium">기본 / 현재가</th>
                </tr>
              </thead>
              <tbody>
                {METHODS.map((m) => {
                  const base = summary.grid[m].base;
                  return (
                    <tr key={m} className={cn("border-b border-border/60", m === data.representative && "font-semibold")}>
                      <td className="px-2 py-1.5">
                        <button type="button" className="hover:underline" onClick={() => setTab(m)}>
                          {METHOD_LABELS[m]}
                        </button>
                        {m === data.representative && <Badge tone="accent" className="ml-2">대표</Badge>}
                      </td>
                      {SCENARIOS.map((s) => {
                        const c = summary.grid[m][s];
                        return (
                          <td key={s} className="num px-2 py-1.5" title={c.ok ? undefined : c.reason}>
                            {c.ok ? formatPrice(c.value, currency) : <span className="text-muted">-</span>}
                          </td>
                        );
                      })}
                      <td className="num px-2 py-1.5">{base.ok && price ? formatRatio(base.value / price - 1) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* ── 공통 입력 ──────────────────────────────── */}
      <Card>
        <CardHeader
          title="공통 입력"
          description="모든 방법에 쓰입니다. 금액은 아래 단위로 입력합니다."
          actions={
            <Select className="w-36" value={unitKey} onChange={(e) => setUnitKey(e.target.value)} aria-label="금액 단위">
              {units.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </Select>
          }
        />
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <SuggestedField
            label="희석 주식 수 (주)"
            note={suggestions.sharesNote}
            suggestion={suggestions.shares}
            onUse={() => update((d) => void (d.shares = suggestions.shares))}
            formatSuggestion={(v) => `${formatNumber(v)}주`}
          >
            <NumberField value={data.shares} integer onChange={(v) => update((d) => void (d.shares = v))} aria-label="희석 주식 수" />
          </SuggestedField>
          <SuggestedField
            label="순현금 (순부채면 음수)"
            note={suggestions.netCashNote}
            suggestion={suggestions.netCash}
            onUse={() => update((d) => void (d.netCash = suggestions.netCash))}
            formatSuggestion={(v) => formatAmount(v, currency)}
          >
            <NumberField value={data.netCash} {...money} onChange={(v) => update((d) => void (d.netCash = v))} aria-label="순현금" />
          </SuggestedField>
        </div>
      </Card>

      {/* ── 방법별 입력 ────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap gap-1 border-b border-border px-2 pt-2">
          {METHODS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setTab(m)}
              className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === m ? "border-accent font-semibold" : "border-transparent text-muted hover:text-fg")}
            >
              {METHOD_LABELS[m]}
              {m === data.representative && <span className="ml-1 text-xs text-accent">대표</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => copyBase(tab)}>
              <Copy size={12} /> 기본 시나리오를 비관·낙관에 복사
            </Button>
            <span className="text-xs text-muted">복사한 뒤 시나리오마다 다른 가정만 고치세요.</span>
          </div>

          {tab === "dcf" && (
            <ScenarioTable
              rows={[
                {
                  label: "소유주 이익 (기준 연도)",
                  help: suggestions.ownerEarningsNote,
                  suggestion: suggestions.ownerEarnings != null ? { text: formatAmount(suggestions.ownerEarnings, currency), apply: (s) => setScenario("dcf", s, { ownerEarnings: suggestions.ownerEarnings }) } : undefined,
                  render: (s) => <NumberField value={data.dcf[s].ownerEarnings} {...money} onChange={(v) => setScenario("dcf", s, { ownerEarnings: v })} />,
                },
                { label: "성장률 (예측 기간, 연)", render: (s) => <NumberField value={data.dcf[s].growth} scale={0.01} decimals={2} suffix="%" onChange={(v) => setScenario("dcf", s, { growth: v })} /> },
                { label: "예측 기간", render: (s) => <NumberField value={data.dcf[s].years} integer suffix="년" onChange={(v) => setScenario("dcf", s, { years: v == null ? null : Math.max(1, Math.min(30, v)) })} /> },
                { label: "할인율", render: (s) => <NumberField value={data.dcf[s].discountRate} scale={0.01} decimals={2} suffix="%" onChange={(v) => setScenario("dcf", s, { discountRate: v })} /> },
                { label: "영구성장률", render: (s) => <NumberField value={data.dcf[s].terminalGrowth} scale={0.01} decimals={2} suffix="%" onChange={(v) => setScenario("dcf", s, { terminalGrowth: v })} /> },
              ]}
              results={(s) => {
                const r = dcf(data.dcf[s], data.shares, data.netCash);
                return r.ok
                  ? [
                      ["주당 가치", formatPrice(r.value.perShare, currency)],
                      ["예측 기간 현재가치", formatAmount(r.value.pvForecast, currency)],
                      ["잔존가치 현재가치", formatAmount(r.value.pvTerminal, currency)],
                      ["잔존가치 비중", formatRatio(r.value.terminalShare)],
                      ["주주가치", formatAmount(r.value.equityValue, currency)],
                    ]
                  : r.reason;
              }}
            />
          )}

          {tab === "per" && (
            <ScenarioTable
              rows={[
                {
                  label: "정상화 순이익",
                  help: `제안: ${suggestions.normalizedNote} 지배주주순이익. 사이클 정점·저점을 걷어낸 값을 쓰세요.`,
                  suggestion: suggestions.normalizedEarnings != null ? { text: formatAmount(suggestions.normalizedEarnings, currency), apply: (s) => setScenario("per", s, { normalizedEarnings: suggestions.normalizedEarnings }) } : undefined,
                  render: (s) => <NumberField value={data.per[s].normalizedEarnings} {...money} onChange={(v) => setScenario("per", s, { normalizedEarnings: v })} />,
                },
                { label: "목표 PER", render: (s) => <NumberField value={data.per[s].multiple} decimals={1} suffix="배" onChange={(v) => setScenario("per", s, { multiple: v })} /> },
              ]}
              results={(s) => {
                const r = perValue(data.per[s], data.shares);
                return r.ok ? [["주당 가치", formatPrice(r.value.perShare, currency)], ["주주가치", formatAmount(r.value.equityValue, currency)]] : r.reason;
              }}
            />
          )}

          {tab === "ev_ebit" && (
            <ScenarioTable
              rows={[
                {
                  label: "정상화 EBIT",
                  help: `제안: ${suggestions.normalizedNote} 영업이익`,
                  suggestion: suggestions.normalizedEbit != null ? { text: formatAmount(suggestions.normalizedEbit, currency), apply: (s) => setScenario("ev_ebit", s, { normalizedEbit: suggestions.normalizedEbit }) } : undefined,
                  render: (s) => <NumberField value={data.ev_ebit[s].normalizedEbit} {...money} onChange={(v) => setScenario("ev_ebit", s, { normalizedEbit: v })} />,
                },
                { label: "목표 EV/EBIT", render: (s) => <NumberField value={data.ev_ebit[s].multiple} decimals={1} suffix="배" onChange={(v) => setScenario("ev_ebit", s, { multiple: v })} /> },
              ]}
              results={(s) => {
                const r = evEbitValue(data.ev_ebit[s], data.shares, data.netCash);
                return r.ok
                  ? [["주당 가치", formatPrice(r.value.perShare, currency)], ["기업가치", formatAmount(r.value.enterpriseValue, currency)], ["주주가치 (+순현금)", formatAmount(r.value.equityValue, currency)]]
                  : r.reason;
              }}
            />
          )}

          {tab === "nav" && (
            <NavEditor
              data={data}
              money={money}
              currency={currency}
              suggestion={suggestions.bookValue != null ? { text: formatAmount(suggestions.bookValue, currency), note: suggestions.bookValueNote } : null}
              onUseSuggestion={(s) => setScenario("nav", s, { bookValue: suggestions.bookValue })}
              onChange={(s, patch) => setScenario("nav", s, patch)}
            />
          )}
        </div>
      </Card>

      <ReverseDcfCard data={data} price={price} currency={currency} />

      <Card>
        <CardHeader title="가정의 근거" description="왜 이 성장률·할인율·멀티플인지 적어 두면 복기 때 판단을 검증할 수 있습니다." />
        <div className="p-4">
          <Textarea className="min-h-28" value={data.notes} onChange={(e) => update((d) => void (d.notes = e.target.value))} />
        </div>
      </Card>

      {/* ── 저장 바 ───────────────────────────────── */}
      <div className="fixed right-0 bottom-0 left-0 z-30 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur md:left-14 lg:left-52">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={save} disabled={pending || !dirty}>
            저장
          </Button>
          {dirty ? <span className="text-xs text-warn">저장하지 않은 변경이 있습니다.</span> : <span className="text-xs text-muted">변경 사항이 없습니다.</span>}
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      </div>
    </div>
  );
}

const TONE_TEXT = { ok: "text-ok", warn: "text-warn", danger: "text-danger" } as const;

function Tile({ label, value, sub, strong, tone }: { label: string; value: string; sub?: React.ReactNode; strong?: boolean; tone?: "ok" | "warn" | "danger" }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("mt-0.5 tabular-nums", strong ? "text-xl font-bold" : "text-lg font-semibold", tone && TONE_TEXT[tone])}>{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function SuggestedField({
  label,
  note,
  suggestion,
  onUse,
  formatSuggestion,
  children,
}: {
  label: string;
  note: string;
  suggestion: number | null;
  onUse: () => void;
  formatSuggestion: (v: number) => string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {suggestion != null && (
          <button type="button" onClick={onUse} className="inline-flex items-center gap-1 text-accent hover:underline">
            <Wand2 size={12} /> 제안값 {formatSuggestion(suggestion)} 사용
          </button>
        )}
        <span>{note}</span>
      </div>
    </div>
  );
}

interface ScenarioRow {
  label: string;
  help?: string;
  suggestion?: { text: string; apply: (s: Scenario) => void };
  render: (s: Scenario) => React.ReactNode;
}

function ScenarioTable({ rows, results }: { rows: ScenarioRow[]; results: (s: Scenario) => [string, string][] | string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th className="w-64 px-2 py-1 text-left font-medium">가정</th>
            {SCENARIOS.map((s) => (
              <th key={s} className="px-2 py-1 text-left font-medium">
                {SCENARIO_LABELS[s]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="align-top">
              <td className="px-2 py-1.5">
                <div>{r.label}</div>
                {r.help && <div className="text-xs text-muted">{r.help}</div>}
                {r.suggestion && (
                  <button
                    type="button"
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                    onClick={() => SCENARIOS.forEach((s) => r.suggestion!.apply(s))}
                  >
                    <Wand2 size={12} /> 제안값 {r.suggestion.text}을 세 시나리오에 채우기
                  </button>
                )}
              </td>
              {SCENARIOS.map((s) => (
                <td key={s} className="px-2 py-1.5">
                  {r.render(s)}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-border align-top">
            <td className="px-2 py-2 text-xs font-medium text-muted">결과</td>
            {SCENARIOS.map((s) => {
              const res = results(s);
              return (
                <td key={s} className="px-2 py-2 text-xs">
                  {typeof res === "string" ? (
                    <span className="text-muted">{res}</span>
                  ) : (
                    <dl className="flex flex-col gap-0.5">
                      {res.map(([k, v], i) => (
                        <div key={k} className="flex justify-between gap-2">
                          <dt className="text-muted">{k}</dt>
                          <dd className={cn("tabular-nums", i === 0 && "text-sm font-semibold")}>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function NavEditor({
  data,
  money,
  currency,
  suggestion,
  onUseSuggestion,
  onChange,
}: {
  data: ValuationData;
  money: { scale: number; decimals: number; suffix: string };
  currency: string;
  suggestion: { text: string; note: string } | null;
  onUseSuggestion: (s: Scenario) => void;
  onChange: (s: Scenario, patch: Partial<ValuationData["nav"]["base"]>) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {suggestion && (
        <button type="button" className="inline-flex w-fit items-center gap-1 text-xs text-accent hover:underline" onClick={() => SCENARIOS.forEach(onUseSuggestion)}>
          <Wand2 size={12} /> 순자산 제안값 {suggestion.text} ({suggestion.note})을 세 시나리오에 채우기
        </button>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {SCENARIOS.map((s) => {
          const nav = data.nav[s];
          const r = navValue(nav, data.shares);
          return (
            <div key={s} className="flex flex-col gap-2 rounded-md border border-border p-3">
              <div className="text-sm font-semibold">{SCENARIO_LABELS[s]}</div>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-muted">순자산 (장부)</span>
                <NumberField value={nav.bookValue} {...money} onChange={(v) => onChange(s, { bookValue: v })} />
              </label>
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-muted">조정 항목 (가산 +, 차감 −)</span>
                {nav.adjustments.map((a, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <Input
                      className="h-8 text-xs"
                      placeholder="예: 토지 재평가"
                      value={a.label}
                      onChange={(e) => onChange(s, { adjustments: nav.adjustments.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)) })}
                    />
                    <NumberField
                      className="w-32 shrink-0"
                      value={a.amount}
                      {...money}
                      onChange={(v) => onChange(s, { adjustments: nav.adjustments.map((x, xi) => (xi === i ? { ...x, amount: v ?? 0 } : x)) })}
                    />
                    <button type="button" aria-label="조정 항목 삭제" className="text-muted hover:text-danger" onClick={() => onChange(s, { adjustments: nav.adjustments.filter((_, xi) => xi !== i) })}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="inline-flex w-fit items-center gap-1 text-accent hover:underline"
                  onClick={() => onChange(s, { adjustments: [...nav.adjustments, { label: "", amount: 0 }] })}
                >
                  <Plus size={12} /> 조정 항목 추가
                </button>
              </div>
              <div className="mt-1 border-t border-border pt-2 text-xs">
                {r.ok ? (
                  <dl className="flex flex-col gap-0.5">
                    <div className="flex justify-between"><dt className="text-muted">주당 순자산</dt><dd className="tabular-nums">{formatPrice(r.value.bookPerShare, currency)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">조정 합계</dt><dd className="tabular-nums">{formatAmount(r.value.adjustmentTotal, currency)}</dd></div>
                    <div className="flex justify-between"><dt className="text-muted">주당 조정 순자산</dt><dd className="text-sm font-semibold tabular-nums">{formatPrice(r.value.perShare, currency)}</dd></div>
                  </dl>
                ) : (
                  <span className="text-muted">{r.reason}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReverseDcfCard({ data, price, currency }: { data: ValuationData; price: number | null; currency: string }) {
  const base = data.dcf.base;
  const result = price != null ? reverseDcf(base, data.shares, data.netCash, price) : null;
  const mine = base.growth;

  const r0 = base.discountRate;
  const g0 = base.growth;
  const grid =
    r0 != null && g0 != null
      ? (() => {
          const rs = [-0.02, -0.01, 0, 0.01, 0.02].map((d) => r0 + d);
          const gs = [-0.04, -0.02, 0, 0.02, 0.04].map((d) => g0 + d);
          return { rs, gs, values: dcfSensitivity(base, data.shares, data.netCash, rs, gs) };
        })()
      : null;

  return (
    <Card>
      <CardHeader
        title="역DCF와 민감도"
        description="현재 주가가 정당화되려면 예측 기간에 몇 % 성장해야 하는지 이분법으로 역산합니다. 성장률을 뺀 나머지 가정은 DCF 기본 시나리오를 씁니다."
      />
      <div className="flex flex-col gap-5 p-4">
        {price == null ? (
          <Alert tone="warn">현재가가 없습니다. 개요 탭에서 가격을 입력하세요.</Alert>
        ) : result && !result.ok ? (
          <Alert tone="warn">{result.reason}</Alert>
        ) : result?.ok ? (
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
            <Tile label={`현재가 ${formatPrice(price, currency)}에 내재된 성장률`} value={formatRatio(result.value.impliedGrowth, 2)} strong />
            <Tile label="내 기본 가정 성장률" value={formatRatio(mine, 2)} />
            <div className="bg-surface px-3 py-2.5 text-sm">
              {mine == null ? null : result.value.impliedGrowth > mine ? (
                <span>시장은 내 기본 가정보다 <b>{formatRatio(result.value.impliedGrowth - mine, 1)}p 높은</b> 성장을 이미 가격에 반영하고 있습니다.</span>
              ) : (
                <span>시장은 내 기본 가정보다 <b>{formatRatio(mine - result.value.impliedGrowth, 1)}p 낮은</b> 성장만 반영하고 있습니다. 내 가정이 맞다면 저평가입니다.</span>
              )}
            </div>
          </div>
        ) : null}

        {grid && (
          <div className="overflow-x-auto">
            <div className="mb-1 text-xs font-medium text-muted">민감도: 주당 가치 (행: 할인율, 열: 성장률). 현재가 이상이면 초록색</div>
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-xs font-medium text-muted">r \ g</th>
                  {grid.gs.map((g, j) => (
                    <th key={j} className={cn("px-3 py-1 text-right text-xs font-medium", j === 2 ? "text-fg" : "text-muted")}>
                      {formatRatio(g, 1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rs.map((r, i) => (
                  <tr key={i}>
                    <th className={cn("px-2 py-1 text-right text-xs font-medium", i === 2 ? "text-fg" : "text-muted")}>{formatRatio(r, 1)}</th>
                    {grid.values[i].map((v, j) => (
                      <td
                        key={j}
                        className={cn(
                          "num px-3 py-1",
                          i === 2 && j === 2 && "font-bold ring-1 ring-fg ring-inset",
                          v != null && price != null && (v >= price ? "bg-ok-bg text-ok" : "text-muted"),
                        )}
                      >
                        {v == null ? "-" : formatPrice(v, currency)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}
