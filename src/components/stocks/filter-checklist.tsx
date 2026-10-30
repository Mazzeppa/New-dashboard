"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Wand2, X } from "lucide-react";
import { applyAutoAnswer, runFilterAutoChecks } from "@/app/actions/data";
import { saveFilterResult } from "@/app/actions/filter";
import { useStageMove } from "@/components/pipeline/use-stage-move";
import { Alert, Badge, Button, Card, CardHeader, Textarea } from "@/components/ui";
import type { FilterAnswer, FilterItem, FilterResult } from "@/db/schema";
import { formatDateTime } from "@/domain/format";
import { cn } from "@/lib/cn";

export function FilterChecklist({
  stock,
  items,
  results,
}: {
  stock: { id: number; label: string; market: string; stage: string };
  items: FilterItem[];
  results: FilterResult[];
}) {
  const router = useRouter();
  const { request, dialog } = useStageMove();
  const byItem = new Map(results.map((r) => [r.itemId, r]));
  const shown = items.filter((i) => i.active || byItem.get(i.id)?.answer);

  const failed = shown.filter((i) => byItem.get(i.id)?.answer === "no");
  const passed = shown.filter((i) => byItem.get(i.id)?.answer === "yes");
  const unanswered = shown.length - failed.length - passed.length;

  const rejectReason = `1차 필터 실패: ${failed.map((i) => i.text).join("; ")}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="ok">통과 {passed.length}</Badge>
        <Badge tone="danger">실패 {failed.length}</Badge>
        <Badge>미답 {unanswered}</Badge>
        <Link href="/settings#filter" className="ml-auto text-xs text-muted underline">
          체크리스트 항목 편집
        </Link>
      </div>

      {failed.length > 0 && stock.stage !== "rejected" && (
        <Alert tone="danger" title="실패한 항목이 있습니다. 탈락 처리를 권합니다.">
          <ul className="list-disc pl-5">
            {failed.map((i) => (
              <li key={i.id}>{i.text}</li>
            ))}
          </ul>
          <Button
            variant="danger"
            size="sm"
            className="mt-2"
            onClick={() => request({ id: stock.id, label: stock.label }, "rejected", { rejectReason })}
          >
            탈락 처리
          </Button>
        </Alert>
      )}

      <AutoCheckBar stockId={stock.id} market={stock.market} onDone={() => router.refresh()} />

      <Card>
        <CardHeader title="1차 필터 체크리스트" description="빠른 탈락이 목적입니다. 하나라도 '아니오'면 탈락을 검토하세요." />
        <ul className="divide-y divide-border">
          {shown.map((item) => (
            <FilterRow key={item.id} stockId={stock.id} item={item} result={byItem.get(item.id)} onSaved={() => router.refresh()} />
          ))}
        </ul>
      </Card>
      {dialog}
    </div>
  );
}

function FilterRow({
  stockId,
  item,
  result,
  onSaved,
}: {
  stockId: number;
  item: FilterItem;
  result?: FilterResult;
  onSaved: () => void;
}) {
  const [answer, setAnswer] = React.useState<FilterAnswer | null>(result?.answer ?? null);
  const [text, setText] = React.useState(result?.text ?? "");
  const [pending, start] = React.useTransition();
  const dirtyText = text !== (result?.text ?? "");

  const save = (a: FilterAnswer | null, t: string) =>
    start(async () => {
      await saveFilterResult({ stockId, itemId: item.id, answer: a, text: t || null });
      onSaved();
    });

  const choose = (a: FilterAnswer) => {
    const next = answer === a ? null : a;
    setAnswer(next);
    save(next, text);
  };

  const needsText = item.requiresText && answer === "yes" && !text.trim();

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 gap-1">
          <AnswerButton active={answer === "yes"} tone="ok" onClick={() => choose("yes")} disabled={pending}>
            <Check size={14} /> 예
          </AnswerButton>
          <AnswerButton active={answer === "no"} tone="danger" onClick={() => choose("no")} disabled={pending}>
            <X size={14} /> 아니오
          </AnswerButton>
        </div>
        <div className="min-w-0 flex-1 pt-1 text-sm">
          <span className={cn(!item.active && "text-muted line-through")}>{item.text}</span>
          {!item.active && <Badge className="ml-2">비활성 항목</Badge>}
          {item.origin === "lesson" && <Badge tone="accent" className="ml-2">복기 교훈</Badge>}
          {item.description && <p className="mt-0.5 text-xs text-muted">{item.description}</p>}
          {result?.autoCheckedAt && (
            <AutoResult
              result={result}
              differs={!!result.autoAnswer && answer !== null && answer !== result.autoAnswer}
              onApply={() =>
                start(async () => {
                  await applyAutoAnswer(stockId, item.id);
                  setAnswer(result.autoAnswer);
                  onSaved();
                })
              }
              applied={answer === result.autoAnswer}
              pending={pending}
            />
          )}
        </div>
      </div>
      {item.requiresText && (
        <div className="flex flex-col gap-1 sm:pl-[9.5rem]">
          <Textarea
            className="min-h-12"
            placeholder={item.textPrompt ?? ""}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex items-center gap-2">
            {dirtyText && (
              <Button size="sm" onClick={() => save(answer, text)} disabled={pending}>
                문장 저장
              </Button>
            )}
            {needsText && <span className="text-xs text-warn">{"'예'라면 그 문장을 실제로 적어 보세요."}</span>}
          </div>
        </div>
      )}
    </li>
  );
}

function AnswerButton({
  active,
  tone,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active: boolean; tone: "ok" | "danger" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition",
        active
          ? tone === "ok"
            ? "border-ok bg-ok-bg text-ok"
            : "border-danger bg-danger-bg text-danger"
          : "border-border text-muted hover:bg-surface-2",
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function AutoCheckBar({ stockId, market, onDone }: { stockId: number; market: string; onDone: () => void }) {
  const [notes, setNotes] = React.useState<string[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const run = () =>
    start(async () => {
      const r = await runFilterAutoChecks(stockId);
      if (!r.ok) return setError(r.error);
      setError(null);
      setNotes(r.data.notes);
      onDone();
    });
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={pending}>
          <Wand2 size={14} />
          {pending ? "자동 체크 중…" : "자동 체크 실행"}
        </Button>
        <span className="text-xs text-muted">
          {market === "KR"
            ? "DART로 감사의견·증자/CB·BW·최대주주 변동을, 저장된 재무 데이터로 영업현금흐름을 확인합니다."
            : "저장된 재무 데이터로 영업현금흐름을 확인합니다. 감사의견·증자·최대주주는 한국 종목만 자동 체크합니다."}{" "}
          결과는 확인 후 항목별로 적용하세요.
        </span>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {notes?.map((n) => (
        <Alert key={n} tone="warn">
          {n}
        </Alert>
      ))}
    </Card>
  );
}

function AutoResult({
  result,
  differs,
  applied,
  onApply,
  pending,
}: {
  result: FilterResult;
  differs: boolean;
  applied: boolean;
  onApply: () => void;
  pending: boolean;
}) {
  const label = result.autoAnswer === "yes" ? "통과" : result.autoAnswer === "no" ? "실패" : "판정 불가";
  return (
    <div className={cn("mt-1.5 rounded-md border px-2.5 py-1.5 text-xs", differs ? "border-warn bg-warn-bg" : "border-border bg-surface-2")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">자동 체크</span>
        <Badge tone={result.autoAnswer === "yes" ? "ok" : result.autoAnswer === "no" ? "danger" : "neutral"}>{label}</Badge>
        {differs && <span className="text-warn">내 답과 다릅니다</span>}
        <span className="text-muted">{formatDateTime(result.autoCheckedAt!)}</span>
        {result.autoAnswer && !applied && (
          <Button size="sm" className="ml-auto" onClick={onApply} disabled={pending}>
            확인하고 적용
          </Button>
        )}
      </div>
      <p className="mt-1 whitespace-pre-wrap text-muted">{result.autoEvidence}</p>
    </div>
  );
}
