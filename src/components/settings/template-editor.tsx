"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import {
  addTemplateItem,
  deleteTemplateItem,
  moveTemplateItem,
  setTemplateItemActive,
  updateTemplate,
  updateTemplateItem,
} from "@/app/actions/checklists";
import { Alert, Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import type { ChecklistTemplate, ChecklistTemplateItem } from "@/db/schema";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/cn";

export function TemplateEditor({
  template,
  items,
}: {
  template: ChecklistTemplate;
  items: (ChecklistTemplateItem & { used: number })[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState(template.name);
  const [description, setDescription] = React.useState(template.description ?? "");
  const [editing, setEditing] = React.useState<{ id: number | null; text: string; help: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [pending, start] = React.useTransition();

  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error);
      setError(null);
      after?.();
      router.refresh();
    });

  const headerDirty = name !== template.name || description !== (template.description ?? "");

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="이름">
            <Input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} />
          </Field>
          <Field label="설명">
            <Input value={description} onChange={(e) => { setDescription(e.target.value); setSaved(false); }} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => run(() => updateTemplate(template.id, { name, description }), () => setSaved(true))} disabled={!headerDirty || pending}>
            저장
          </Button>
          {saved && <span className="text-xs text-ok">저장했습니다.</span>}
        </div>
      </Card>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader
          title={`질문 (${items.filter((i) => i.active).length})`}
          description="점수는 1~5점이며 높을수록 투자에 유리합니다. '예'가 좋은 방향이 되도록 질문을 쓰세요. 평가에 쓰인 질문은 삭제 대신 비활성화합니다."
          actions={
            <Button size="sm" onClick={() => setEditing({ id: null, text: "", help: "" })}>
              <Plus size={14} /> 질문 추가
            </Button>
          }
        />
        <ol className="divide-y divide-border">
          {items.map((item, i) => (
            <li key={item.id} className={cn("flex items-center gap-3 px-4 py-2.5 text-sm", !item.active && "opacity-60")}>
              <div className="flex flex-col">
                <button type="button" aria-label="위로" disabled={i === 0 || pending} onClick={() => run(() => moveTemplateItem(item.id, "up"))} className="text-muted hover:text-fg disabled:opacity-30">
                  <ArrowUp size={12} />
                </button>
                <button type="button" aria-label="아래로" disabled={i === items.length - 1 || pending} onClick={() => run(() => moveTemplateItem(item.id, "down"))} className="text-muted hover:text-fg disabled:opacity-30">
                  <ArrowDown size={12} />
                </button>
              </div>
              <span className="w-6 text-right text-muted">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                {item.text}
                {item.used > 0 && <Badge className="ml-2">평가 {item.used}건</Badge>}
                {item.help && <p className="text-xs text-muted">{item.help}</p>}
              </div>
              <label className="flex items-center gap-1 text-xs text-muted">
                <input type="checkbox" checked={item.active} onChange={(e) => run(() => setTemplateItemActive(item.id, e.target.checked))} />
                사용
              </label>
              <button type="button" aria-label="편집" className="text-muted hover:text-fg" onClick={() => setEditing({ id: item.id, text: item.text, help: item.help ?? "" })}>
                <Pencil size={14} />
              </button>
              <button
                type="button"
                aria-label="삭제"
                className="text-muted hover:text-danger"
                onClick={() => window.confirm("이 질문을 삭제할까요?") && run(() => deleteTemplateItem(item.id))}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ol>
      </Card>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "질문 편집" : "질문 추가"}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>취소</Button>
            <Button
              variant="primary"
              disabled={pending || !editing?.text.trim()}
              onClick={() =>
                editing &&
                run(
                  () =>
                    editing.id
                      ? updateTemplateItem(editing.id, { text: editing.text, help: editing.help })
                      : addTemplateItem(template.id, { text: editing.text, help: editing.help }),
                  () => setEditing(null),
                )
              }
            >
              저장
            </Button>
          </>
        }
      >
        {editing && (
          <div className="flex flex-col gap-3">
            <Field label="질문">
              <Input value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} autoFocus />
            </Field>
            <Field label="도움말 (선택)">
              <Input value={editing.help} onChange={(e) => setEditing({ ...editing, help: e.target.value })} />
            </Field>
            {editing.id && items.find((i) => i.id === editing.id)?.used ? (
              <Alert tone="warn">이미 평가에 쓰인 질문입니다. 뜻이 바뀌면 과거 평가와 맞지 않게 됩니다. 뜻을 바꾸려면 새 질문을 추가하고 이 질문은 비활성화하세요.</Alert>
            ) : null}
          </div>
        )}
      </Dialog>
    </div>
  );
}
