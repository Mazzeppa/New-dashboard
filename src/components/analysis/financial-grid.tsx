"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { ClipboardPaste, Download, Plus, Trash2 } from "lucide-react";
import { deleteFinancialPeriod, saveFinancialValues } from "@/app/actions/analysis";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Textarea, DownloadButton } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import type { FinancialValue } from "@/db/schema";
import {
  comparePeriods,
  FINANCIAL_SOURCES,
  METRIC_GROUPS,
  METRICS,
  parseFinancialGrid,
  parseFinancialNumber,
  parsePeriod,
  periodKey,
  unitsFor,
  type GridParseResult,
  type MetricGroup,
  type Period,
} from "@/domain/financials";
import { formatDateTime } from "@/domain/format";
import { cn } from "@/lib/cn";

type Mode = "annual" | "quarter";

const SOURCE_STYLE: Record<string, string> = {
  dart: "border-l-accent",
  sec: "border-l-accent",
  report: "border-l-ok",
  manual: "border-l-warn",
};

const cellKey = (metric: string, p: Period) => `${metric}|${periodKey(p)}`;

function fmt(n: number, maxFrac: number) {
  return n.toLocaleString("ko-KR", { maximumFractionDigits: maxFrac });
}

export function FinancialGrid({ stockId, currency, values }: { stockId: number; currency: string; values: FinancialValue[] }) {
  const router = useRouter();
  const units = unitsFor(currency);
  const [mode, setMode] = React.useState<Mode>("annual");
  const [unitKey, setUnitKey] = React.useState(units[0].key);
  const unit = units.find((u) => u.key === unitKey) ?? units[0];
  const [extraPeriods, setExtraPeriods] = React.useState<Period[]>([]);
  const [newPeriod, setNewPeriod] = React.useState("");
  const [edits, setEdits] = React.useState<Map<string, string>>(new Map());
  const [error, setError] = React.useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [pending, start] = React.useTransition();

  const inMode = (q: number) => (mode === "annual" ? q === 0 : q > 0);

  const byCell = React.useMemo(() => {
    const m = new Map<string, FinancialValue>();
    for (const v of values) m.set(cellKey(v.metric, { year: v.fiscalYear, quarter: v.fiscalQuarter }), v);
    return m;
  }, [values]);

  const periods = React.useMemo(() => {
    const map = new Map<string, Period>();
    for (const v of values) if (inMode(v.fiscalQuarter)) map.set(periodKey({ year: v.fiscalYear, quarter: v.fiscalQuarter }), { year: v.fiscalYear, quarter: v.fiscalQuarter });
    for (const p of extraPeriods) if (inMode(p.quarter)) map.set(periodKey(p), p);
    // 연간 모드에서는 최근 5개 회계연도 칸을 항상 보여 준다 (입력할 자리)
    if (mode === "annual") {
      const y = new Date().getFullYear();
      for (let i = 5; i >= 1; i--) map.set(String(y - i), { year: y - i, quarter: 0 });
    }
    return [...map.values()].sort(comparePeriods);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, extraPeriods, mode]);

  const persisted = new Set(values.map((v) => periodKey({ year: v.fiscalYear, quarter: v.fiscalQuarter })));
  const invalid = [...edits.entries()].filter(([, s]) => s.trim() !== "" && parseFinancialNumber(s) === null).map(([k]) => k);

  const display = (metric: string, p: Period, kind: string) => {
    const k = cellKey(metric, p);
    if (edits.has(k)) return edits.get(k)!;
    const v = byCell.get(k);
    if (!v) return "";
    return kind === "shares" ? fmt(v.value, 0) : fmt(v.value / unit.multiplier, unit.multiplier >= 1e6 ? 2 : 0);
  };

  const setCell = (k: string, s: string) => setEdits((m) => new Map(m).set(k, s));

  const addPeriod = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parsePeriod(newPeriod, mode);
    if (!p || !inMode(p.quarter)) {
      setError(mode === "annual" ? "연도를 입력하세요 (예: 2024)." : "분기를 입력하세요 (예: 2024Q1).");
      return;
    }
    setError(null);
    setExtraPeriods((ps) => [...ps, p]);
    setNewPeriod("");
  };

  const save = () => {
    if (invalid.length) return setError("숫자가 아닌 칸이 있습니다.");
    const entries = [...edits.entries()].map(([k, s]) => {
      const [metric, pk] = k.split("|");
      const p = parsePeriod(pk, "quarter")!;
      const kind = METRICS.find((m) => m.key === metric)!.kind;
      const n = parseFinancialNumber(s);
      return { metric, year: p.year, quarter: p.quarter, value: n === null ? null : kind === "shares" ? n : n * unit.multiplier };
    });
    start(async () => {
      const r = await saveFinancialValues({ stockId, entries, source: "manual" });
      if (!r.ok) return setError(r.error);
      setError(null);
      setEdits(new Map());
      router.refresh();
    });
  };

  const removePeriod = (p: Period) => {
    if (!window.confirm(`${periodKey(p)} 기간의 모든 값을 삭제할까요?`)) return;
    start(async () => {
      await deleteFinancialPeriod(stockId, p.year, p.quarter);
      setExtraPeriods((ps) => ps.filter((x) => periodKey(x) !== periodKey(p)));
      router.refresh();
    });
  };

  const groups = Object.keys(METRIC_GROUPS) as MetricGroup[];

  return (
    <Card>
      <CardHeader
        title="재무 데이터"
        description="모든 숫자는 출처와 함께 저장됩니다. 칸 왼쪽 색: 파랑 API · 초록 보고서 · 주황 수동. 칸에 마우스를 올리면 출처를 봅니다."
        actions={
          <>
            <DownloadButton size="sm" href={`/api/export/financials?stockId=${stockId}&period=${mode}`}>
              <Download size={14} /> {mode === "annual" ? "연간" : "분기"} CSV
            </DownloadButton>
            <Button size="sm" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste size={14} /> CSV·엑셀 붙여넣기
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap items-end gap-3 px-4 pt-3">
        <div className="inline-flex rounded-md border border-border p-0.5 text-sm">
          {(["annual", "quarter"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn("rounded px-3 py-1", mode === m ? "bg-surface-2 font-semibold" : "text-muted")}
            >
              {m === "annual" ? "연간" : "분기"}
            </button>
          ))}
        </div>
        <Field label="표시·입력 단위" className="w-40">
          <Select value={unitKey} onChange={(e) => setUnitKey(e.target.value)} disabled={edits.size > 0}>
            {units.map((u) => (
              <option key={u.key} value={u.key}>
                {u.label}
              </option>
            ))}
          </Select>
        </Field>
        <form onSubmit={addPeriod} className="flex items-end gap-2">
          <Field label="기간 추가" className="w-32">
            <Input value={newPeriod} onChange={(e) => setNewPeriod(e.target.value)} placeholder={mode === "annual" ? "2025" : "2025Q2"} />
          </Field>
          <Button type="submit">
            <Plus size={14} />
          </Button>
        </form>
        <div className="ml-auto flex items-center gap-2">
          {edits.size > 0 && (
            <Button variant="ghost" onClick={() => setEdits(new Map())} disabled={pending}>
              변경 취소
            </Button>
          )}
          <Button variant="primary" onClick={save} disabled={pending || edits.size === 0}>
            저장{edits.size > 0 && ` (${edits.size})`}
          </Button>
        </div>
      </div>
      {error && (
        <div className="px-4 pt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <div className="mt-3 overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 min-w-44 bg-surface px-3 py-2 text-left text-xs font-medium text-muted">계정</th>
              {periods.map((p) => (
                <th key={periodKey(p)} className="w-32 min-w-32 px-2 py-2 text-right text-xs font-medium text-muted">
                  <span className="inline-flex items-center gap-1">
                    {periodKey(p)}
                    {persisted.has(periodKey(p)) && (
                      <button type="button" onClick={() => removePeriod(p)} className="text-muted hover:text-danger" aria-label={`${periodKey(p)} 삭제`}>
                        <Trash2 size={11} />
                      </button>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={g}>
                <tr>
                  <td colSpan={periods.length + 1} className="sticky left-0 bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">
                    {METRIC_GROUPS[g]}
                  </td>
                </tr>
                {METRICS.filter((m) => m.group === g).map((m) => (
                  <tr key={m.key} className="border-b border-border/60">
                    <td className="sticky left-0 z-10 bg-surface px-3 py-1" title={m.help}>
                      {m.label}
                      {m.kind === "shares" && <span className="ml-1 text-xs text-muted">(주)</span>}
                    </td>
                    {periods.map((p) => {
                      const k = cellKey(m.key, p);
                      const v = byCell.get(k);
                      const edited = edits.has(k);
                      return (
                        <td key={k} className="px-1 py-0.5">
                          <input
                            value={display(m.key, p, m.kind)}
                            onChange={(e) => setCell(k, e.target.value)}
                            inputMode="decimal"
                            title={v ? `${FINANCIAL_SOURCES[v.source]}${v.sourceRef ? ` · ${v.sourceRef}` : ""}${v.consolidated === false ? " · 별도" : v.consolidated ? " · 연결" : ""} · ${formatDateTime(v.updatedAt)}` : undefined}
                            className={cn(
                              "h-7 w-full rounded border border-transparent border-l-2 bg-transparent px-1.5 text-right tabular-nums outline-none focus:border-accent",
                              v && !edited ? SOURCE_STYLE[v.source] : "border-l-transparent",
                              edited && "bg-warn-bg",
                              invalid.includes(k) && "border-danger",
                            )}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-xs text-muted">
        음수는 -1,234 또는 (1,234)로 입력합니다. 칸을 비우고 저장하면 그 값이 삭제됩니다. CAPEX·배당·자사주 매입은 양수로 입력합니다.
      </p>

      <PasteDialog
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        stockId={stockId}
        currency={currency}
        existing={byCell}
        onDone={() => {
          setPasteOpen(false);
          router.refresh();
        }}
      />
    </Card>
  );
}

function PasteDialog({
  open,
  onClose,
  stockId,
  currency,
  existing,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  stockId: number;
  currency: string;
  existing: Map<string, FinancialValue>;
  onDone: () => void;
}) {
  const units = unitsFor(currency);
  const [text, setText] = React.useState("");
  const [unitKey, setUnitKey] = React.useState(units[0].key);
  const [monthMode, setMonthMode] = React.useState<"annual" | "quarter">("annual");
  const [source, setSource] = React.useState<"report" | "manual">("report");
  const [sourceRef, setSourceRef] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const multiplier = units.find((u) => u.key === unitKey)?.multiplier ?? 1;
  const parsed: GridParseResult | null = React.useMemo(() => {
    if (!text.trim()) return null;
    const rows = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true }).data;
    return parseFinancialGrid(rows, multiplier, monthMode);
  }, [text, multiplier, monthMode]);

  const overwrites = parsed
    ? parsed.values.filter((v) => {
        const e = existing.get(cellKey(v.metric, v));
        return e && e.value !== v.value;
      }).length
    : 0;

  const submit = () => {
    if (!parsed?.values.length) return;
    start(async () => {
      const r = await saveFinancialValues({ stockId, entries: parsed.values, source, sourceRef });
      if (!r.ok) return setError(r.error);
      setError(null);
      setText("");
      onDone();
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="재무 데이터 붙여넣기"
      width="max-w-3xl"
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={submit} disabled={pending || !parsed?.values.length}>
            {parsed?.values.length ? `${parsed.values.length}개 값 저장` : "저장"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          엑셀·HTS·사업보고서 표를 그대로 복사해 붙여넣으세요(탭 또는 쉼표 구분). 첫 행은 기간(2023, 2024Q1, 2023/12 등), 첫 열은 계정명(매출액,
          영업이익 등)입니다.
        </p>
        <Textarea
          className="min-h-40 font-mono text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"계정\t2022\t2023\t2024\n매출액\t1,200\t1,350\t1,480\n영업이익\t150\t(20)\t210"}
        />
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="원본 단위">
            <Select value={unitKey} onChange={(e) => setUnitKey(e.target.value)}>
              {units.map((u) => (
                <option key={u.key} value={u.key}>
                  {u.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="'2023/12' 형식 헤더" hint="연월만 있는 기간의 해석">
            <Select value={monthMode} onChange={(e) => setMonthMode(e.target.value as "annual" | "quarter")}>
              <option value="annual">연간 (결산월)</option>
              <option value="quarter">분기</option>
            </Select>
          </Field>
          <Field label="출처">
            <Select value={source} onChange={(e) => setSource(e.target.value as "report" | "manual")}>
              <option value="report">보고서</option>
              <option value="manual">수동</option>
            </Select>
          </Field>
          <Field label="출처 설명" hint="예: 2024 사업보고서">
            <Input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} />
          </Field>
        </div>
        {parsed && (
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge tone="ok">값 {parsed.values.length}개</Badge>
              <Badge>기간 {parsed.periods.map(periodKey).join(", ") || "없음"}</Badge>
              {overwrites > 0 && <Badge tone="warn">기존 값 {overwrites}개 덮어씀</Badge>}
            </div>
            {parsed.unknownRows.length > 0 && (
              <Alert tone="warn">인식하지 못한 계정(건너뜀): {parsed.unknownRows.join(", ")}</Alert>
            )}
            {parsed.badHeaders.length > 0 && <Alert tone="warn">인식하지 못한 기간 헤더: {parsed.badHeaders.join(", ")}</Alert>}
            {parsed.badCells > 0 && <Alert tone="warn">숫자로 읽을 수 없는 칸 {parsed.badCells}개를 건너뜁니다.</Alert>}
          </div>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Dialog>
  );
}
