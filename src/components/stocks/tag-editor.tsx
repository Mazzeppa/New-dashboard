"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { addStockTag, removeStockTag } from "@/app/actions/portfolio";
import { Button, Card, CardHeader, Input } from "@/components/ui";

export function TagEditor({ stockId, tags, allTags }: { stockId: number; tags: string[]; allTags: string[] }) {
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
      <CardHeader title="위험요인 태그" description="예: 금리 상승, 중국 수요, 원화 강세. 포트폴리오 노출도에 쓰입니다." />
      <div className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs">
              {t}
              <button type="button" aria-label={`${t} 태그 제거`} className="text-muted hover:text-danger" onClick={() => run(() => removeStockTag(stockId, t))}>
                <X size={11} />
              </button>
            </span>
          ))}
          {!tags.length && <span className="text-xs text-muted">태그가 없습니다.</span>}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addStockTag(stockId, name), () => setName(""));
          }}
        >
          <Input className="h-8 text-sm" list="tag-list" value={name} onChange={(e) => setName(e.target.value)} placeholder="태그 추가" />
          <datalist id="tag-list">
            {allTags.filter((t) => !tags.includes(t)).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <Button size="sm" type="submit" disabled={pending || !name.trim()}>
            추가
          </Button>
        </form>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Card>
  );
}
