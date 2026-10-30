"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { saveAnalysisSection } from "@/app/actions/analysis";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { ScorePicker } from "@/components/ui/score-picker";
import { SCORE_LABELS, type AnalysisAnswers, type FieldDef, type SectionDef } from "@/domain/analysis";
import { formatDateTime } from "@/domain/format";
import { cn } from "@/lib/cn";

export function SectionEditor({
  stockId,
  def,
  initial,
}: {
  stockId: number;
  def: SectionDef;
  initial: { answers: AnalysisAnswers; score: number | null; updatedAt: string } | null;
}) {
  const router = useRouter();
  const [answers, setAnswers] = React.useState<AnalysisAnswers>(initial?.answers ?? {});
  const [score, setScore] = React.useState<number | null>(initial?.score ?? null);
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  // 저장하지 않은 변경이 있으면 페이지를 떠날 때 경고
  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const set = (key: string, v: AnalysisAnswers[string]) => {
    setAnswers((a) => ({ ...a, [key]: v }));
    setDirty(true);
  };

  const save = () =>
    start(async () => {
      const r = await saveAnalysisSection({ stockId, section: def.key, answers, score });
      if (!r.ok) return setError(r.error);
      setError(null);
      setDirty(false);
      router.refresh();
    });

  return (
    <Card>
      <CardHeader
        title={def.label}
        description={def.description}
        actions={initial && <span className="text-xs text-muted">마지막 저장 {formatDateTime(initial.updatedAt)}</span>}
      />
      <div className="flex flex-col gap-5 p-4">
        {def.fields.map((f) => (
          <FieldInput key={f.key} def={f} value={answers[f.key] ?? null} onChange={(v) => set(f.key, v)} />
        ))}

        <div className="flex flex-col gap-2 rounded-md bg-surface-2 p-3">
          <span className="text-sm font-medium">{def.scoreLabel} 평가</span>
          <div className="flex items-center gap-3">
            <ScorePicker
              value={score}
              onChange={(v) => {
                setScore(v);
                setDirty(true);
              }}
            />
            <span className="text-sm text-muted">{score ? SCORE_LABELS[score] : "미평가"}</span>
          </div>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex items-center gap-3">
          <Button variant="primary" onClick={save} disabled={pending || !dirty}>
            저장
          </Button>
          {dirty && <span className="text-xs text-warn">저장하지 않은 변경이 있습니다.</span>}
        </div>
      </div>
    </Card>
  );
}

function FieldInput({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: AnalysisAnswers[string];
  onChange: (v: AnalysisAnswers[string]) => void;
}) {
  switch (def.type) {
    case "text":
      return (
        <Field label={def.label} hint={def.help}>
          <Textarea
            rows={def.rows ?? 4}
            className="min-h-0"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );
    case "select":
      return (
        <Field label={def.label} hint={def.help} className="max-w-xs">
          <Select value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">선택하세요</option>
            {Object.entries(def.options).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      );
    case "percent":
      return (
        <Field label={def.label} hint={def.help} className="max-w-xs">
          <Input
            inputMode="decimal"
            value={typeof value === "number" ? value : typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );
    case "multiselect": {
      const selected = Array.isArray(value) ? value : [];
      return (
        <fieldset className="flex flex-col gap-1.5 text-sm">
          <legend className="mb-1 font-medium">{def.label}</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(def.options).map(([k, v]) => {
              const on = selected.includes(k);
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange(on ? selected.filter((x) => x !== k) : [...selected, k])}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm transition",
                    on ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:bg-surface-2",
                  )}
                >
                  {v}
                </button>
              );
            })}
          </div>
          {def.help && <span className="text-xs text-muted">{def.help}</span>}
        </fieldset>
      );
    }
  }
}
