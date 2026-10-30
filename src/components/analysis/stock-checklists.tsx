"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, X } from "lucide-react";
import { applyTemplate, removeStockChecklist, saveChecklistAnswer } from "@/app/actions/checklists";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Select, Textarea } from "@/components/ui";
import { ScorePicker } from "@/components/ui/score-picker";
import type { ChecklistAnswer, ChecklistTemplate, ChecklistTemplateItem } from "@/db/schema";
import { summarizeScores } from "@/domain/checklist";
import { formatNumber } from "@/domain/format";

export interface AppliedChecklist {
  id: number;
  template: ChecklistTemplate;
  items: ChecklistTemplateItem[];
  answers: ChecklistAnswer[];
}

export function StockChecklists({
  stockId,
  applied,
  templates,
}: {
  stockId: number;
  applied: AppliedChecklist[];
  templates: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [pick, setPick] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const appliedIds = new Set(applied.map((a) => a.template.id));
  const available = templates.filter((t) => !appliedIds.has(t.id));

  const apply = () =>
    start(async () => {
      const r = await applyTemplate(stockId, Number(pick));
      if (!r.ok) return setError(r.error);
      setError(null);
      setPick("");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">템플릿 적용</span>
          <Select value={pick} onChange={(e) => setPick(e.target.value)} className="w-72">
            <option value="">템플릿 선택</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="primary" onClick={apply} disabled={!pick || pending}>
          적용
        </Button>
        <Link href="/settings/templates" className="ml-auto text-xs text-muted underline">
          템플릿 관리
        </Link>
        {error && (
          <div className="w-full">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
      </Card>

      {applied.length === 0 && (
        <Card>
          <EmptyState>적용한 체크리스트가 없습니다. 위에서 템플릿을 고르세요.</EmptyState>
        </Card>
      )}
      {applied.map((a) => (
        <ChecklistCard key={a.id} checklist={a} onChanged={() => router.refresh()} />
      ))}
    </div>
  );
}

function ChecklistCard({ checklist, onChanged }: { checklist: AppliedChecklist; onChanged: () => void }) {
  const byItem = new Map(checklist.answers.map((a) => [a.itemId, a]));
  const summary = summarizeScores(checklist.items.map((i) => byItem.get(i.id)?.score));
  const [pending, start] = React.useTransition();

  const remove = () => {
    if (!window.confirm(`'${checklist.template.name}' 평가를 이 종목에서 제거할까요? 입력한 점수와 메모가 삭제됩니다.`)) return;
    start(async () => {
      await removeStockChecklist(checklist.id);
      onChanged();
    });
  };

  return (
    <Card>
      <CardHeader
        title={checklist.template.name}
        description={checklist.template.description}
        actions={
          <>
            <Badge tone={summary.average == null ? "neutral" : summary.average >= 4 ? "ok" : summary.average >= 3 ? "warn" : "danger"}>
              평균 {summary.average == null ? "-" : formatNumber(summary.average, 2)}
            </Badge>
            <Badge>
              {summary.answered}/{summary.total} 평가
            </Badge>
            {summary.weak > 0 && <Badge tone="danger">2점 이하 {summary.weak}</Badge>}
            <button type="button" onClick={remove} disabled={pending} className="text-muted hover:text-danger" aria-label="체크리스트 제거">
              <X size={16} />
            </button>
          </>
        }
      />
      <ol className="divide-y divide-border">
        {checklist.items.map((item, idx) => (
          <AnswerRow key={item.id} index={idx + 1} checklistId={checklist.id} item={item} answer={byItem.get(item.id)} onSaved={onChanged} />
        ))}
      </ol>
    </Card>
  );
}

function AnswerRow({
  index,
  checklistId,
  item,
  answer,
  onSaved,
}: {
  index: number;
  checklistId: number;
  item: ChecklistTemplateItem;
  answer?: ChecklistAnswer;
  onSaved: () => void;
}) {
  const [score, setScore] = React.useState<number | null>(answer?.score ?? null);
  const [memo, setMemo] = React.useState(answer?.memo ?? "");
  const [showMemo, setShowMemo] = React.useState(!!answer?.memo);
  const [pending, start] = React.useTransition();
  const memoDirty = memo !== (answer?.memo ?? "");

  const save = (s: number | null, m: string) =>
    start(async () => {
      await saveChecklistAnswer({ stockChecklistId: checklistId, itemId: item.id, score: s, memo: m });
      onSaved();
    });

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 text-sm">
          <span className="mr-1 text-muted">{index}.</span>
          {item.text}
          {!item.active && <Badge className="ml-2">비활성 항목</Badge>}
          {item.help && <p className="mt-0.5 text-xs text-muted">{item.help}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ScorePicker
            size="sm"
            value={score}
            disabled={pending}
            onChange={(v) => {
              setScore(v);
              save(v, memo);
            }}
          />
          <button
            type="button"
            onClick={() => setShowMemo((s) => !s)}
            className={memo ? "text-accent" : "text-muted hover:text-fg"}
            aria-label="메모"
            title="메모"
          >
            <MessageSquare size={16} />
          </button>
        </div>
      </div>
      {showMemo && (
        <div className="flex flex-col gap-1">
          <Textarea className="min-h-14" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="근거, 확인한 자료, 의문점" />
          {memoDirty && (
            <div>
              <Button size="sm" onClick={() => save(score, memo)} disabled={pending}>
                메모 저장
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
