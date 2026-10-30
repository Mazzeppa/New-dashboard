"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import {
  addFilterItem,
  deleteFilterItem,
  moveFilterItem,
  setFilterItemActive,
  updateFilterItem,
} from "@/app/actions/filter";
import { Alert, Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import type { FilterItem } from "@/db/schema";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/cn";

interface Draft {
  text: string;
  description: string;
  requiresText: boolean;
  textPrompt: string;
}
const empty: Draft = { text: "", description: "", requiresText: false, textPrompt: "" };

const ORIGIN: Record<string, string> = { default: "기본", user: "사용자", lesson: "복기 교훈" };

export function FilterItemsEditor({ items }: { items: FilterItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<{ id: number | null; draft: Draft } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        after?.();
        router.refresh();
      }
    });

  const save = () => {
    if (!editing) return;
    const d = editing.draft;
    const input = { ...d, description: d.description || null, textPrompt: d.textPrompt || null };
    run(() => (editing.id ? updateFilterItem(editing.id, input) : addFilterItem(input)), () => setEditing(null));
  };

  return (
    <Card id="filter">
      <CardHeader
        title="1차 필터 체크리스트 항목"
        description="모든 종목의 2단계에 적용됩니다. 기록이 있는 항목은 삭제 대신 비활성화하세요."
        actions={
          <Button size="sm" onClick={() => setEditing({ id: null, draft: empty })}>
            <Plus size={14} /> 항목 추가
          </Button>
        }
      />
      {error && (
        <div className="px-4 pt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <ul className="divide-y divide-border">
        {items.map((item, i) => (
          <li key={item.id} className={cn("flex items-center gap-3 px-4 py-2.5 text-sm", !item.active && "opacity-60")}>
            <div className="flex flex-col">
              <button type="button" aria-label="위로" disabled={i === 0 || pending} onClick={() => run(() => moveFilterItem(item.id, "up"))} className="text-muted hover:text-fg disabled:opacity-30">
                <ArrowUp size={12} />
              </button>
              <button type="button" aria-label="아래로" disabled={i === items.length - 1 || pending} onClick={() => run(() => moveFilterItem(item.id, "down"))} className="text-muted hover:text-fg disabled:opacity-30">
                <ArrowDown size={12} />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span>{item.text}</span>
                <Badge tone={item.origin === "lesson" ? "accent" : "neutral"}>{ORIGIN[item.origin] ?? item.origin}</Badge>
                {item.requiresText && <Badge>서술 입력</Badge>}
                {item.autoKey && <Badge tone="ok">DART 자동</Badge>}
              </div>
              {item.description && <p className="text-xs text-muted">{item.description}</p>}
            </div>
            <label className="flex items-center gap-1 text-xs text-muted">
              <input type="checkbox" checked={item.active} onChange={(e) => run(() => setFilterItemActive(item.id, e.target.checked))} />
              사용
            </label>
            <button
              type="button"
              aria-label="편집"
              className="text-muted hover:text-fg"
              onClick={() =>
                setEditing({
                  id: item.id,
                  draft: { text: item.text, description: item.description ?? "", requiresText: item.requiresText, textPrompt: item.textPrompt ?? "" },
                })
              }
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              aria-label="삭제"
              className="text-muted hover:text-danger"
              onClick={() => window.confirm("이 항목을 삭제할까요?") && run(() => deleteFilterItem(item.id))}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "항목 편집" : "항목 추가"}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>취소</Button>
            <Button variant="primary" onClick={save} disabled={pending || !editing?.draft.text.trim()}>
              저장
            </Button>
          </>
        }
      >
        {editing && (
          <div className="flex flex-col gap-3">
            <Field label="질문 (예/아니오로 답할 수 있게)">
              <Input value={editing.draft.text} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, text: e.target.value } })} autoFocus />
            </Field>
            <Field label="설명 (선택)">
              <Input value={editing.draft.description} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, description: e.target.value } })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.draft.requiresText}
                onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, requiresText: e.target.checked } })}
              />
              답과 함께 서술을 입력하게 한다
            </label>
            {editing.draft.requiresText && (
              <Field label="서술 입력 안내 문구">
                <Input value={editing.draft.textPrompt} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, textPrompt: e.target.value } })} />
              </Field>
            )}
          </div>
        )}
      </Dialog>
    </Card>
  );
}
