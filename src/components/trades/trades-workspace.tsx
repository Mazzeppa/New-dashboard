"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { addTrade, deleteTrade, savePositionPlan } from "@/app/actions/portfolio";
import { useStageMove } from "@/components/pipeline/use-stage-move";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Table, Textarea, DownloadButton } from "@/components/ui";
import { NumberField } from "@/components/valuation/number-field";
import type { PositionPlanRow, TradeRow } from "@/db/schema";
import { formatAmount, formatDateTime, formatNumber, formatPrice, formatRatio } from "@/domain/format";
import { stageIndex, type PipelineStage, type Stage } from "@/domain/pipeline";
import type { Position } from "@/domain/portfolio";
import type { ConvictionBand } from "@/domain/principles";
import { positionCap, recommendedRange, sizingWarnings } from "@/domain/sizing";
import { today } from "@/lib/action";
import { cn } from "@/lib/cn";

interface SizingContext {
  principles: { maxLossPerPositionPct: number; maxPositionPct: number; maxIndustryPct: number; convictionBands: ConvictionBand[]; industries: string[] };
  bearDownside: number | null;
  bearValue: number | null;
  portfolioTotalKrw: number;
  currentWeight: number;
  industryOthersPct: number | null;
  fxRate: number | null;
  fxDate: string | null;
}

export function TradesWorkspace({
  stock,
  trades,
  position,
  plans,
  sizing,
}: {
  stock: { id: number; name: string; stage: Stage; currency: string; industry: string | null; price: number | null };
  trades: TradeRow[];
  position: Position;
  plans: PositionPlanRow[];
  sizing: SizingContext;
}) {
  const { request, dialog } = useStageMove();
  const stageBeforeHolding = stock.stage !== "rejected" && stageIndex(stock.stage as PipelineStage) < stageIndex("holding");
  const marketValue = stock.price != null ? stock.price * position.quantity : null;
  const unrealized = marketValue != null && position.quantity > 0 ? marketValue - position.costBasis : null;

  return (
    <div className="flex flex-col gap-5">
      {position.quantity > 0 && stageBeforeHolding && (
        <Alert tone="warn" title="보유 중인데 파이프라인 단계가 보유 이전입니다">
          <Button size="sm" className="mt-1" onClick={() => request({ id: stock.id, label: stock.name }, "holding")}>
            보유 단계로 이동
          </Button>
        </Alert>
      )}
      {position.quantity === 0 && trades.length > 0 && stock.stage === "holding" && (
        <Alert tone="warn" title="전량 매도했습니다. 매도 단계로 옮기고 사유를 기록하세요">
          <Button size="sm" className="mt-1" onClick={() => request({ id: stock.id, label: stock.name }, "sold")}>
            매도 단계로 이동
          </Button>
        </Alert>
      )}
      {dialog}

      <SizingHelper stock={stock} sizing={sizing} position={position} plans={plans} />

      <Card>
        <CardHeader
          title="포지션"
          description={`이동평균법, 수수료 포함 · 통화 ${stock.currency}`}
          actions={
            trades.length > 0 && (
              <DownloadButton size="sm" href={`/api/export/trades?stockId=${stock.id}`}>
                매매 기록 CSV
              </DownloadButton>
            )
          }
        />
        <div className="grid grid-cols-2 gap-px overflow-hidden border-b border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["보유 수량", `${formatNumber(position.quantity, 4)}주`],
            ["평균단가", formatPrice(position.avgCost, stock.currency)],
            ["원가", formatAmount(position.costBasis, stock.currency)],
            ["평가액", formatAmount(marketValue, stock.currency)],
            ["평가손익", unrealized == null ? "-" : `${formatAmount(unrealized, stock.currency)} (${formatRatio(position.costBasis > 0 ? unrealized / position.costBasis : null)})`],
            ["실현손익", formatAmount(position.realizedPnl, stock.currency)],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-3 py-2">
              <div className="text-xs text-muted">{k}</div>
              <div className="font-semibold tabular-nums">{v}</div>
            </div>
          ))}
        </div>
        {position.errors.map((e) => (
          <div key={e} className="px-4 pt-3">
            <Alert tone="danger">{e}</Alert>
          </div>
        ))}
        <TradeForm stockId={stock.id} currency={stock.currency} defaultPrice={stock.price} />
        <TradeList trades={trades} currency={stock.currency} />
      </Card>
    </div>
  );
}

function SizingHelper({ stock, sizing, position, plans }: { stock: { id: number; currency: string; industry: string | null; price: number | null }; sizing: SizingContext; position: Position; plans: PositionPlanRow[] }) {
  const router = useRouter();
  const p = sizing.principles;
  const [conviction, setConviction] = React.useState<number | null>(plans[0]?.conviction ?? null);
  const [target, setTarget] = React.useState<number | null>(plans[0]?.targetPct ?? null);
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [savedMsg, setSavedMsg] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const cap = positionCap(p.maxLossPerPositionPct, p.maxPositionPct, sizing.bearDownside);
  const range = recommendedRange(cap.cap, conviction, p.convictionBands);
  const warnings =
    target != null
      ? sizingWarnings({
          targetPct: target,
          cap,
          maxPositionPct: p.maxPositionPct,
          range,
          industryPctAfter: sizing.industryOthersPct == null ? null : sizing.industryOthersPct + target,
          maxIndustryPct: p.maxIndustryPct,
          industry: stock.industry,
          circleOfCompetence: p.industries,
        })
      : [];

  const targetKrw = target != null ? (sizing.portfolioTotalKrw * target) / 100 : null;
  const targetLocal = targetKrw != null && sizing.fxRate ? targetKrw / sizing.fxRate : null;
  const targetShares = targetLocal != null && stock.price ? targetLocal / stock.price : null;
  const delta = targetShares != null ? targetShares - position.quantity : null;

  const save = () =>
    start(async () => {
      if (conviction == null || target == null) return setError("확신도와 목표 비중을 입력하세요.");
      const r = await savePositionPlan({
        stockId: stock.id,
        conviction,
        targetPct: target,
        capPct: cap.cap,
        lossCapPct: cap.lossCap,
        bearDownside: sizing.bearDownside,
        rangeMinPct: range?.min ?? null,
        rangeMaxPct: range?.max ?? null,
        warnings,
        note,
      });
      if (!r.ok) return setError(r.error);
      setError(null);
      setNote("");
      setSavedMsg("비중 결정을 기록했습니다.");
      router.refresh();
    });

  return (
    <Card>
      <CardHeader title="비중 도우미" description="비중 상한 = 종목당 허용 최대 손실 ÷ 비관 시나리오 하락률. 확신도에 따라 상한 안에서 권장 범위를 제시합니다." />
      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
          <Stat label="비관 시나리오 하락률" value={formatRatio(sizing.bearDownside)} sub={sizing.bearValue != null ? `비관 가치 ${formatPrice(sizing.bearValue, stock.currency)}` : <Link className="underline" href={`/stocks/${stock.id}?tab=valuation`}>가치평가에서 입력</Link>} />
          <Stat label="비중 상한" value={`${formatNumber(cap.cap, 1)}%`} sub={cap.basis} strong />
          <Stat label="권장 범위" value={range ? `${formatNumber(range.min, 1)} ~ ${formatNumber(range.max, 1)}%` : "-"} sub={conviction ? `확신도 ${conviction}` : "확신도를 고르세요"} />
          <Stat label="현재 비중" value={`${formatNumber(sizing.currentWeight, 1)}%`} sub={`포트폴리오 ${formatAmount(sizing.portfolioTotalKrw, "KRW")}`} />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium">확신도</span>
            <div className="inline-flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={conviction === n}
                  onClick={() => setConviction(n)}
                  className={cn("h-8 w-8 rounded-md border text-sm font-semibold", conviction === n ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:bg-surface-2")}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">목표 비중</span>
            <NumberField className="w-28" value={target} decimals={2} suffix="%" onChange={setTarget} aria-label="목표 비중" />
          </label>
          {range && (
            <Button size="sm" onClick={() => setTarget(Math.round(((range.min + range.max) / 2) * 10) / 10)}>
              권장 범위 중간값
            </Button>
          )}
          {targetShares != null && (
            <div className="text-sm text-muted">
              목표 {formatAmount(targetLocal, stock.currency)} ≈ {formatNumber(targetShares, 0)}주 · 현재 대비 {delta! >= 0 ? "+" : ""}
              {formatNumber(delta, 0)}주
            </div>
          )}
        </div>
        {sizing.portfolioTotalKrw <= 0 && (
          <Alert tone="warn">
            포트폴리오 총액이 0입니다. <Link className="underline" href="/portfolio">포트폴리오</Link>에서 현금을 입력하면 목표 수량을 계산합니다.
          </Alert>
        )}
        {stock.currency !== "KRW" && sizing.fxRate == null && (
          <Alert tone="warn">
            {stock.currency} 환율이 없습니다. <Link className="underline" href="/portfolio">포트폴리오</Link>에서 입력하세요.
          </Alert>
        )}
        {warnings.length > 0 && (
          <Alert tone="danger" title="원칙 한도 경고">
            <ul className="list-disc pl-5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Alert>
        )}
        <Field label={warnings.length ? "그래도 이 비중으로 정한 이유 (필수)" : "메모 (선택)"}>
          <Textarea className="min-h-14" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={save} disabled={pending || conviction == null || target == null}>
            비중 결정 기록
          </Button>
          {error && <span className="text-xs text-danger">{error}</span>}
          {savedMsg && !error && <span className="text-xs text-ok">{savedMsg}</span>}
        </div>

        {plans.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">비중 결정 기록 ({plans.length})</summary>
            <ul className="mt-2 flex flex-col gap-2">
              {plans.map((pl) => (
                <li key={pl.id} className="rounded-md bg-surface-2 px-3 py-2 text-xs">
                  <div className="flex flex-wrap gap-2">
                    <span className="font-medium">{formatDateTime(pl.createdAt)}</span>
                    <span>확신도 {pl.conviction}</span>
                    <span>목표 {formatNumber(pl.targetPct, 1)}%</span>
                    <span className="text-muted">상한 {formatNumber(pl.capPct, 1)}%</span>
                    {pl.warnings.length > 0 && <Badge tone="danger">경고 {pl.warnings.length}</Badge>}
                  </div>
                  {pl.warnings.map((w) => (
                    <div key={w} className="text-danger">· {w}</div>
                  ))}
                  {pl.note && <div className="mt-1">{pl.note}</div>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: React.ReactNode; strong?: boolean }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className={cn("tabular-nums", strong ? "text-xl font-bold" : "text-lg font-semibold")}>{value}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function TradeForm({ stockId, currency, defaultPrice }: { stockId: number; currency: string; defaultPrice: number | null }) {
  const router = useRouter();
  const [date, setDate] = React.useState(today());
  const [side, setSide] = React.useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = React.useState<number | null>(null);
  const [price, setPrice] = React.useState<number | null>(defaultPrice);
  const [fee, setFee] = React.useState<number | null>(0);
  const [memo, setMemo] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity == null || price == null) return setError("수량과 가격을 입력하세요.");
    start(async () => {
      const r = await addTrade({ stockId, date, side, quantity, price, fee: fee ?? 0, memo: memo || null });
      if (!r.ok) return setError(r.error);
      setError(null);
      setQuantity(null);
      setMemo("");
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-b border-border px-4 py-3 text-sm">
      <Field label="날짜" className="w-40">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="구분" className="w-24">
        <Select value={side} onChange={(e) => setSide(e.target.value as "buy" | "sell")}>
          <option value="buy">매수</option>
          <option value="sell">매도</option>
        </Select>
      </Field>
      <Field label="수량" className="w-28">
        <NumberField value={quantity} decimals={4} onChange={setQuantity} aria-label="수량" />
      </Field>
      <Field label={`가격 (${currency})`} className="w-32">
        <NumberField value={price} decimals={4} onChange={setPrice} aria-label="가격" />
      </Field>
      <Field label={`수수료·세금 (${currency})`} className="w-32">
        <NumberField value={fee} decimals={4} onChange={setFee} aria-label="수수료" />
      </Field>
      <Field label="메모" className="min-w-40 flex-1">
        <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 1차 분할 매수" />
      </Field>
      <Button type="submit" variant="primary" disabled={pending}>
        기록
      </Button>
      {error && <div className="w-full text-xs text-danger">{error}</div>}
    </form>
  );
}

function TradeList({ trades, currency }: { trades: TradeRow[]; currency: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  if (!trades.length) return <p className="px-4 py-6 text-center text-sm text-muted">매매 기록이 없습니다.</p>;
  return (
    <Table>
      <thead>
        <tr>
          <th>날짜</th>
          <th>구분</th>
          <th className="text-right">수량</th>
          <th className="text-right">가격</th>
          <th className="text-right">금액</th>
          <th className="text-right">수수료</th>
          <th>메모</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {trades.map((t) => (
          <tr key={t.id}>
            <td className="whitespace-nowrap">{t.date}</td>
            <td>{t.side === "buy" ? <Badge tone="accent">매수</Badge> : <Badge tone="warn">매도</Badge>}</td>
            <td className="num">{formatNumber(t.quantity, 4)}</td>
            <td className="num">{formatPrice(t.price, currency)}</td>
            <td className="num">{formatAmount(t.price * t.quantity, currency)}</td>
            <td className="num">{formatNumber(t.fee, 2)}</td>
            <td className="max-w-xs truncate text-muted">{t.memo}</td>
            <td className="w-8">
              <button
                type="button"
                aria-label="매매 기록 삭제"
                className="text-muted hover:text-danger"
                disabled={pending}
                onClick={() => window.confirm("이 매매 기록을 삭제할까요?") && start(async () => { await deleteTrade(t.id); router.refresh(); })}
              >
                <Trash2 size={14} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
