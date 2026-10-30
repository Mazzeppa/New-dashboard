"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2 } from "lucide-react";
import { createTemplate, deleteTemplate, duplicateTemplate } from "@/app/actions/checklists";
import { Alert, Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";

export function TemplatesList({
  templates,
}: {
  templates: { id: number; name: string; description: string | null; builtin: boolean; itemCount: number; usedBy: number }[];
}) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const create = () =>
    start(async () => {
      const r = await createTemplate({ name, description });
      if (!r.ok) return setError(r.error);
      router.push(`/settings/templates/${r.data.id}`);
    });

  const duplicate = (id: number) =>
    start(async () => {
      const r = await duplicateTemplate(id);
      if (!r.ok) return setError(r.error);
      router.push(`/settings/templates/${r.data.id}`);
    });

  const remove = (id: number, n: string) => {
    if (!window.confirm(`'${n}' 템플릿을 삭제할까요?`)) return;
    start(async () => {
      const r = await deleteTemplate(id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader
        title="체크리스트 템플릿"
        description="내가 쓰는 투자 프레임워크를 템플릿으로 만들어 종목의 '체크리스트' 탭에서 적용합니다."
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> 새 템플릿
          </Button>
        }
      />
      {error && (
        <div className="px-4 pt-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <ul className="divide-y divide-border">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/settings/templates/${t.id}`} className="font-medium hover:underline">
                  {t.name}
                </Link>
                {t.builtin && <Badge tone="accent">기본</Badge>}
                <Badge>{t.itemCount}개 질문</Badge>
                {t.usedBy > 0 && <Badge tone="ok">{t.usedBy}개 종목 적용</Badge>}
              </div>
              {t.description && <p className="mt-0.5 text-xs text-muted">{t.description}</p>}
            </div>
            <button type="button" onClick={() => duplicate(t.id)} disabled={pending} className="text-muted hover:text-fg" title="복제" aria-label="복제">
              <Copy size={14} />
            </button>
            <button type="button" onClick={() => remove(t.id, t.name)} disabled={pending} className="text-muted hover:text-danger" title="삭제" aria-label="삭제">
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="새 템플릿"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>취소</Button>
            <Button variant="primary" onClick={create} disabled={pending || !name.trim()}>
              만들기
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="이름">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="예: 나의 퀄리티 체크리스트" />
          </Field>
          <Field label="설명 (선택)">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      </Dialog>
    </Card>
  );
}
