"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { addFxRate, deleteFxRate, setCashBalance } from "@/app/actions/portfolio";
import { Button, Card, CardHeader, Input, Select, Table } from "@/components/ui";
import { NumberField } from "@/components/valuation/number-field";
import type { FxRateRow } from "@/db/schema";
import { CURRENCIES, formatNumber } from "@/domain/format";
import { today } from "@/lib/action";

export function CashFxEditor({
  cash,
  fxRates,
  latest,
  neededCurrencies,
}: {
  cash: { currency: string; amount: number }[];
  fxRates: FxRateRow[];
  latest: Record<string, { rate: number; date: string; source: string }>;
  neededCurrencies: string[];
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "오류");
      else {
        setError(null);
        router.refresh();
      }
    });

  const [fxCur, setFxCur] = React.useState(neededCurrencies.find((c) => c !== "KRW" && !latest[c]) ?? "USD");
  const [fxDate, setFxDate] = React.useState(today());
  const [fxRate, setFxRate] = React.useState<number | null>(null);
  const [cashCur, setCashCur] = React.useState("KRW");
  const [cashAmt, setCashAmt] = React.useState<number | null>(null);

  const missingFx = neededCurrencies.filter((c) => c !== "KRW" && !latest[c]);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="환율" description="통화 1단위당 원. '가격 갱신'이 Yahoo에서 가져오고, 직접 입력도 됩니다. 통화별 가장 최근 날짜의 값을 쓰며, 같은 날짜면 직접 입력이 우선합니다." />
        <div className="flex flex-col gap-3 p-4">
          {missingFx.length > 0 && <p className="text-xs text-danger">환율이 필요한 통화: {missingFx.join(", ")}</p>}
          <div className="flex flex-wrap items-end gap-2">
            <Select className="w-24" value={fxCur} onChange={(e) => setFxCur(e.target.value)} aria-label="통화">
              {CURRENCIES.filter((c) => c !== "KRW").map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <Input type="date" className="w-40" value={fxDate} onChange={(e) => setFxDate(e.target.value)} aria-label="날짜" />
            <NumberField className="w-32" value={fxRate} decimals={4} suffix="원" onChange={setFxRate} aria-label="환율" />
            <Button disabled={pending || fxRate == null} onClick={() => fxRate != null && run(() => addFxRate({ currency: fxCur, date: fxDate, rateToKrw: fxRate }))}>
              기록
            </Button>
          </div>
          <Table>
            <thead>
              <tr>
                <th>통화</th>
                <th>날짜</th>
                <th>출처</th>
                <th className="text-right">원</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fxRates.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.currency}
                    {latest[r.currency]?.date === r.date && latest[r.currency]?.source === r.source && <span className="ml-1 text-xs text-ok">사용 중</span>}
                  </td>
                  <td>{r.date}</td>
                  <td className="text-muted">{r.source === "manual" ? "수동" : "Yahoo"}</td>
                  <td className="num">{formatNumber(r.rateToKrw, 4)}</td>
                  <td className="w-8">
                    <button type="button" aria-label="환율 삭제" className="text-muted hover:text-danger" onClick={() => run(() => deleteFxRate(r.id))}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>
      <Card>
        <CardHeader title="현금" description="통화별 현금 잔고. 비중의 분모(포트폴리오 총액)에 포함됩니다. 0으로 저장하면 지웁니다." />
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-end gap-2">
            <Select className="w-24" value={cashCur} onChange={(e) => setCashCur(e.target.value)} aria-label="현금 통화">
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
            <NumberField className="w-44" value={cashAmt} decimals={2} onChange={setCashAmt} aria-label="현금 잔고" />
            <Button disabled={pending} onClick={() => run(() => setCashBalance({ currency: cashCur, amount: cashAmt }))}>
              저장
            </Button>
          </div>
          <Table>
            <thead>
              <tr>
                <th>통화</th>
                <th className="text-right">잔고</th>
              </tr>
            </thead>
            <tbody>
              {cash.map((c) => (
                <tr key={c.currency} className="cursor-pointer hover:bg-surface-2" onClick={() => { setCashCur(c.currency); setCashAmt(c.amount); }}>
                  <td>{c.currency}</td>
                  <td className="num">{formatNumber(c.amount, 2)}</td>
                </tr>
              ))}
              {!cash.length && (
                <tr>
                  <td colSpan={2} className="text-center text-muted">현금 기록이 없습니다.</td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      </Card>
      {error && <p className="text-sm text-danger lg:col-span-2">{error}</p>}
    </div>
  );
}
