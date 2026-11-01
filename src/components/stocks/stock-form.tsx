"use client";

import * as React from "react";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { CURRENCIES } from "@/domain/format";
import { DEFAULT_CURRENCY, DISCOVERY_SOURCES, MARKETS, type Market } from "@/domain/stock";
import type { ActionResult } from "@/lib/action";

export interface StockFormValues {
  market: Market;
  ticker: string | null;
  name: string | null;
  currency: string;
  industry: string | null;
  discoverySource: string;
  discoverySourceNote: string | null;
  note: string | null;
  watchLow: number | null;
  watchHigh: number | null;
}

export function StockForm({
  action,
  initial,
  industries,
  mode,
}: {
  action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  initial?: StockFormValues;
  industries: string[];
  mode: "create" | "edit";
}) {
  const [state, formAction, pending] = React.useActionState(action, null);
  const [market, setMarket] = React.useState<Market>(initial?.market ?? "KR");
  const [currency, setCurrency] = React.useState(initial?.currency ?? DEFAULT_CURRENCY.KR);
  const [industry, setIndustry] = React.useState(initial?.industry ?? "");
  const fe = (!state?.ok && state?.fieldErrors) || {};
  const outOfScope = industry.trim() !== "" && industries.length > 0 && !industries.includes(industry.trim());

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state && !state.ok && <Alert tone="danger">{state.error}</Alert>}
      {state?.ok && <Alert tone="ok">저장했습니다.</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="시장" error={fe.market}>
          <Select
            name="market"
            value={market}
            onChange={(e) => {
              const m = e.target.value as Market;
              setMarket(m);
              setCurrency(DEFAULT_CURRENCY[m]);
            }}
          >
            {Object.entries(MARKETS).map(([k, v]) => (
              <option key={k} value={k}>
                {v} ({k})
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="티커 / 종목코드"
          error={fe.ticker}
          hint={market === "KR" ? "6자리 종목코드" : market === "US" ? "미국 티커 (예: AAPL, BRK.B)" : "Yahoo 형식: 티커.거래소 (예: NESN.SW, ASML.AS, SHEL.L)"}
        >
          <Input name="ticker" defaultValue={initial?.ticker ?? ""} placeholder={market === "KR" ? "005930" : market === "US" ? "AAPL" : "NESN.SW"} />
        </Field>
        <Field label="종목명" error={fe.name}>
          <Input name="name" defaultValue={initial?.name ?? ""} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="거래 통화" error={fe.currency}>
          <Select name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field
          label="산업"
          className="sm:col-span-2"
          hint={industries.length ? "투자 원칙의 '능력의 범위'에서 고르거나 직접 입력" : "투자 원칙에서 능력의 범위를 정하면 목록이 생깁니다"}
          error={outOfScope ? "능력의 범위 밖 산업입니다. 신중히 판단하세요." : undefined}
        >
          <Input name="industry" list="industry-list" value={industry} onChange={(e) => setIndustry(e.target.value)} />
          <datalist id="industry-list">
            {industries.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="발굴 경로" error={fe.source}>
          <Select name="source" defaultValue={initial?.discoverySource ?? "quant_screen"}>
            {Object.entries(DISCOVERY_SOURCES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="발굴 경로 상세" className="sm:col-span-2" hint="예: 어떤 스크리닝 조건, 어떤 공시">
          <Input name="sourceNote" defaultValue={initial?.discoverySourceNote ?? ""} />
        </Field>
      </div>

      <Field label="한 줄 메모" error={fe.note}>
        <Textarea name="note" defaultValue={initial?.note ?? ""} className="min-h-14" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={`관심 가격 하한 (${currency})`} error={fe.watchLow}>
          <Input name="watchLow" inputMode="decimal" defaultValue={initial?.watchLow ?? ""} />
        </Field>
        <Field label={`관심 가격 상한 (${currency})`} error={fe.watchHigh}>
          <Input name="watchHigh" inputMode="decimal" defaultValue={initial?.watchHigh ?? ""} />
        </Field>
        {mode === "create" && (
          <Field label={`현재가 (${currency}, 선택)`}>
            <Input name="price" inputMode="decimal" />
          </Field>
        )}
      </div>

      {mode === "create" && (
        <Field label="시작 단계" hint="이미 보유 중인 종목은 '보유'로 바로 등록할 수 있습니다.">
          <Select name="initialStage" defaultValue="idea">
            <option value="idea">아이디어</option>
            <option value="holding">보유 (기존 보유 종목)</option>
          </Select>
        </Field>
      )}

      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {mode === "create" ? "등록" : "저장"}
        </Button>
      </div>
    </form>
  );
}
