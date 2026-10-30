"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { addMistakeTag, deleteMistakeTag } from "@/app/actions/reviews";
import { Badge, Button, Card, CardHeader, Input } from "@/components/ui";

export function MistakeTagsEditor({ tags }: { tags: { id: number; name: string; builtin: boolean; used: number }[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "오류");
      setError(null);
      after?.();
      router.refresh();
    });
  return (
    <Card>
      <CardHeader title="실수 유형 태그" description="8단계 복기에서 붙입니다. 쓰인 태그는 지울 수 없습니다." />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs">
              {t.name}
              {t.used > 0 && <Badge className="px-1 py-0 text-[10px]">{t.used}</Badge>}
              {t.used === 0 && (
                <button type="button" aria-label={`${t.name} 삭제`} className="text-muted hover:text-danger" onClick={() => run(() => deleteMistakeTag(t.id))}>
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addMistakeTag(name), () => setName(""));
          }}
        >
          <Input className="h-8 max-w-xs text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="새 실수 유형" />
          <Button size="sm" type="submit" disabled={pending || !name.trim()}>
            추가
          </Button>
        </form>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Card>
  );
}
