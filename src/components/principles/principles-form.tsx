"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { savePrinciples } from "@/app/actions/principles";
import { Alert, Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { parseNumberInput } from "@/domain/format";
import { INVESTMENT_STYLES, type InvestmentStyle, type Principles } from "@/domain/principles";

type Draft = Omit<Principles, "maxPositionPct" | "maxIndustryPct" | "maxLossPerPositionPct"> & {
  maxPositionPct: string;
  maxIndustryPct: string;
  maxLossPerPositionPct: string;
};

export function PrinciplesForm({ initial, version }: { initial: Principles; version: number }) {
  const router = useRouter();
  const toDraft = (p: Principles): Draft => ({
    ...p,
    maxPositionPct: String(p.maxPositionPct),
    maxIndustryPct: String(p.maxIndustryPct),
    maxLossPerPositionPct: String(p.maxLossPerPositionPct),
  });
  const [d, setD] = React.useState<Draft>(() => toDraft(initial));
  const [reason, setReason] = React.useState("");
  const [newIndustry, setNewIndustry] = React.useState("");
  const [newRule, setNewRule] = React.useState("");
  const [result, setResult] = React.useState<{ ok: boolean; msg: string; fe?: Record<string, string> } | null>(null);
  const [pending, start] = React.useTransition();

  React.useEffect(() => setD(toDraft(initial)), [initial]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const styleWeight = (s: InvestmentStyle) => d.styles.find((x) => x.style === s);
  const weightSum = d.styles.reduce((a, s) => a + s.weight, 0);

  const toggleStyle = (s: InvestmentStyle) => {
    if (styleWeight(s)) set("styles", d.styles.filter((x) => x.style !== s));
    else set("styles", [...d.styles, { style: s, weight: d.styles.length ? 0 : 100 }]);
  };

  const submit = () => {
    const payload: Principles = {
      ...d,
      maxPositionPct: parseNumberInput(d.maxPositionPct) ?? NaN,
      maxIndustryPct: parseNumberInput(d.maxIndustryPct) ?? NaN,
      maxLossPerPositionPct: parseNumberInput(d.maxLossPerPositionPct) ?? NaN,
    };
    start(async () => {
      const r = await savePrinciples(payload, reason);
      if (r.ok) {
        setResult({ ok: true, msg: `버전 ${r.data.version}으로 저장했습니다.` });
        setReason("");
        router.refresh();
      } else setResult({ ok: false, msg: r.error, fe: r.fieldErrors });
    });
  };
  const fe = result?.fe ?? {};

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="투자 스타일" description="복수 선택 가능. 비중 합계는 100%여야 합니다." />
        <div className="flex flex-col gap-3 p-4">
          {(Object.entries(INVESTMENT_STYLES) as [InvestmentStyle, string][]).map(([k, label]) => {
            const w = styleWeight(k);
            return (
              <div key={k} className="flex items-center gap-3 text-sm">
                <label className="flex w-32 items-center gap-2">
                  <input type="checkbox" checked={!!w} onChange={() => toggleStyle(k)} />
                  {label}
                </label>
                {w && (
                  <div className="flex items-center gap-1">
                    <Input
                      className="w-20 text-right"
                      inputMode="decimal"
                      value={w.weight}
                      onChange={(e) =>
                        set(
                          "styles",
                          d.styles.map((x) => (x.style === k ? { ...x, weight: parseNumberInput(e.target.value) ?? 0 } : x)),
                        )
                      }
                    />
                    %
                  </div>
                )}
              </div>
            );
          })}
          <p className={weightSum === 100 ? "text-xs text-muted" : "text-xs text-danger"}>합계 {weightSum}%</p>
          {fe.styles && <p className="text-xs text-danger">{fe.styles}</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title="능력의 범위" description="이해하고 다룰 수 있는 산업. 종목의 산업 선택지로 쓰이고, 범위 밖이면 경고합니다." />
        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap gap-2">
            {d.industries.map((ind) => (
              <span key={ind} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-sm">
                {ind}
                <button
                  type="button"
                  aria-label={`${ind} 삭제`}
                  className="text-muted hover:text-danger"
                  onClick={() => set("industries", d.industries.filter((x) => x !== ind))}
                >
                  ×
                </button>
              </span>
            ))}
            {d.industries.length === 0 && <span className="text-sm text-muted">아직 없습니다.</span>}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = newIndustry.trim();
              if (v && !d.industries.includes(v)) set("industries", [...d.industries, v]);
              setNewIndustry("");
            }}
          >
            <Input className="max-w-xs" placeholder="예: 반도체 장비, 소비재, 보험" value={newIndustry} onChange={(e) => setNewIndustry(e.target.value)} />
            <Button type="submit">
              <Plus size={14} /> 추가
            </Button>
          </form>
        </div>
      </Card>

      <Card>
        <CardHeader title="위험 한도" description="6단계 비중 결정과 포트폴리오 화면에서 자동 점검에 쓰입니다." />
        <div className="grid gap-4 p-4 sm:grid-cols-3">
          <Field label="종목당 최대 비중 (%)" error={fe.maxPositionPct}>
            <Input inputMode="decimal" value={d.maxPositionPct} onChange={(e) => set("maxPositionPct", e.target.value)} />
          </Field>
          <Field label="산업당 최대 비중 (%)" error={fe.maxIndustryPct}>
            <Input inputMode="decimal" value={d.maxIndustryPct} onChange={(e) => set("maxIndustryPct", e.target.value)} />
          </Field>
          <Field label="종목당 허용 최대 손실 (포트폴리오 대비 %)" error={fe.maxLossPerPositionPct} hint="비중 상한 = 이 값 ÷ 비관 시나리오 하락률">
            <Input inputMode="decimal" value={d.maxLossPerPositionPct} onChange={(e) => set("maxLossPerPositionPct", e.target.value)} />
          </Field>
          <Field label="레버리지 정책" className="sm:col-span-3">
            <Textarea value={d.leveragePolicy} onChange={(e) => set("leveragePolicy", e.target.value)} className="min-h-14" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="확신도별 권장 범위" description="비중 상한 대비 비율(%). 6단계 비중 도우미가 사용합니다." />
        <div className="grid gap-2 p-4 sm:grid-cols-5">
          {d.convictionBands.map((b, i) => (
            <div key={b.level} className="flex flex-col gap-1 text-sm">
              <span className="font-medium">확신도 {b.level}</span>
              <div className="flex items-center gap-1">
                {(["minPct", "maxPct"] as const).map((k, j) => (
                  <React.Fragment key={k}>
                    {j === 1 && "~"}
                    <Input
                      className="w-16 text-right"
                      inputMode="decimal"
                      value={b[k]}
                      onChange={(e) =>
                        set(
                          "convictionBands",
                          d.convictionBands.map((x, xi) => (xi === i ? { ...x, [k]: parseNumberInput(e.target.value) ?? 0 } : x)),
                        )
                      }
                    />
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
          {fe.convictionBands && <p className="text-xs text-danger sm:col-span-5">{fe.convictionBands}</p>}
        </div>
      </Card>

      <Card>
        <CardHeader title="원칙 조항" description="서술형 원칙. 8단계 복기에서 얻은 교훈이 여기에 추가됩니다." />
        <div className="flex flex-col gap-2 p-4">
          <ol className="flex flex-col gap-2">
            {d.rules.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="w-6 pt-2 text-right text-muted">{i + 1}.</span>
                <Textarea
                  className="min-h-10"
                  value={r}
                  onChange={(e) => set("rules", d.rules.map((x, xi) => (xi === i ? e.target.value : x)))}
                />
                <button
                  type="button"
                  className="pt-2 text-muted hover:text-danger"
                  aria-label="조항 삭제"
                  onClick={() => set("rules", d.rules.filter((_, xi) => xi !== i))}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ol>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newRule.trim()) set("rules", [...d.rules, newRule.trim()]);
              setNewRule("");
            }}
          >
            <Input placeholder="새 원칙 조항" value={newRule} onChange={(e) => setNewRule(e.target.value)} />
            <Button type="submit">
              <Plus size={14} /> 추가
            </Button>
          </form>
        </div>
      </Card>

      <Card className="sticky bottom-0 z-10 p-4 shadow-lg">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label={`변경 사유 (현재 버전 ${version})`} className="flex-1" error={fe.reason}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="무엇을 왜 바꾸는지 적어 두세요" />
          </Field>
          <Button variant="primary" onClick={submit} disabled={pending}>
            새 버전으로 저장
          </Button>
        </div>
        {result && (
          <div className="mt-3">
            <Alert tone={result.ok ? "ok" : "danger"}>{result.msg}</Alert>
          </div>
        )}
      </Card>
    </div>
  );
}
