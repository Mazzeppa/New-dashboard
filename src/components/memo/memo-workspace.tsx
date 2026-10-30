"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, FilePlus2, Lock, Plus, Trash2 } from "lucide-react";
import { confirmMemo, createMemoRevision, discardMemoDraft, saveMemoDraft } from "@/app/actions/memos";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import type { MemoRow } from "@/db/schema";
import { formatDateTime, formatPrice, formatRatio } from "@/domain/format";
import { describeCondition, emptyMemo, memoMissing, type MemoContent, type MemoSnapshot } from "@/domain/memo";
import { METHOD_LABELS } from "@/domain/valuation";
import { cn } from "@/lib/cn";
import { SellConditionEditor } from "./sell-condition-editor";

export function MemoWorkspace({
  stockId,
  currency,
  memos,
  preview,
}: {
  stockId: number;
  currency: string;
  memos: MemoRow[];
  /** 지금 확정하면 고정될 값 미리보기 */
  preview: { price: number | null; priceDate: string | null; intrinsicValue: number | null; marginOfSafety: number | null; hasValuation: boolean };
}) {
  const router = useRouter();
  const latest = memos[0];
  const editing = !latest || latest.status === "draft";
  const [selectedId, setSelectedId] = React.useState<number | null>(latest?.id ?? null);
  const selected = memos.find((m) => m.id === selectedId) ?? latest;
  const [content, setContent] = React.useState<MemoContent>(latest?.status === "draft" ? latest.content : emptyMemo());
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [revisionOpen, setRevisionOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, start] = React.useTransition();

  React.useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const update = (fn: (c: MemoContent) => void) => {
    setContent((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };

  const missing = memoMissing(content);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "오류");
      setError(null);
      after?.();
      router.refresh();
    });

  const showingDraft = editing && (!selected || selected.status === "draft");

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-w-0 flex-col gap-5">
        {error && <Alert tone="danger">{error}</Alert>}
        {showingDraft ? (
          <>
            <Card>
              <CardHeader
                title={`투자 메모 v${latest?.version ?? 1} (작성 중)`}
                description={latest?.revisionReason ? `새 버전 사유: ${latest.revisionReason}` : "확정하면 그 시점의 가치평가·현재가·메모가 고정됩니다. 이후 수정은 새 버전으로만 합니다."}
                actions={
                  missing.length ? <Badge tone="warn">미작성 {missing.length}</Badge> : <Badge tone="ok">필수 항목 완료</Badge>
                }
              />
              <div className="flex flex-col gap-6 p-4">
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">핵심 논리 (최대 3개)</h3>
                  {content.theses.map((t, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="pt-2 text-sm text-muted">{i + 1}.</span>
                      <Textarea className="min-h-14" value={t} onChange={(e) => update((c) => void (c.theses[i] = e.target.value))} />
                      {content.theses.length > 1 && (
                        <button type="button" aria-label="논리 삭제" className="pt-2 text-muted hover:text-danger" onClick={() => update((c) => void c.theses.splice(i, 1))}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {content.theses.length < 3 && (
                    <Button size="sm" className="w-fit" onClick={() => update((c) => void c.theses.push(""))}>
                      <Plus size={12} /> 논리 추가
                    </Button>
                  )}
                </section>

                <Field label="시장이 잘못 보고 있는 점과 내가 다르게 보는 이유">
                  <Textarea className="min-h-24" value={content.mispricing} onChange={(e) => update((c) => void (c.mispricing = e.target.value))} />
                </Field>

                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">촉매와 예상 시점</h3>
                  {content.catalysts.map((x, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="date"
                        aria-label="예상 시점"
                        className="w-40 shrink-0"
                        value={x.expectedDate ?? ""}
                        onChange={(e) => update((c) => void (c.catalysts[i].expectedDate = e.target.value || null))}
                      />
                      <Input placeholder="무엇이 일어나면 시장이 가치를 알아보는가" value={x.description} onChange={(e) => update((c) => void (c.catalysts[i].description = e.target.value))} />
                      <button type="button" aria-label="촉매 삭제" className="text-muted hover:text-danger" onClick={() => update((c) => void c.catalysts.splice(i, 1))}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <Button size="sm" className="w-fit" onClick={() => update((c) => void c.catalysts.push({ description: "", expectedDate: null }))}>
                    <Plus size={12} /> 촉매 추가
                  </Button>
                </section>

                <Field label="프리모템: 3년 뒤 이 투자가 실패했다면 그 이유는?">
                  <Textarea className="min-h-24" value={content.premortem} onChange={(e) => update((c) => void (c.premortem = e.target.value))} />
                </Field>

                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">매도 조건</h3>
                  <p className="text-xs text-muted">구조화된 조건은 7단계 보유 점검에서 최신 재무 데이터로 자동 평가됩니다.</p>
                  <SellConditionEditor currency={currency} value={content.sellConditions} onChange={(v) => update((c) => void (c.sellConditions = v))} />
                </section>
              </div>
            </Card>

            <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface/95 p-3 shadow-lg backdrop-blur">
              <Button onClick={() => run(() => saveMemoDraft(stockId, content), () => setDirty(false))} disabled={pending || !dirty}>
                임시 저장
              </Button>
              <Button variant="primary" onClick={() => setConfirmOpen(true)} disabled={pending || missing.length > 0}>
                <Lock size={14} /> 확정 (스냅샷)
              </Button>
              {latest && memos.length > 1 && latest.status === "draft" && (
                <Button variant="ghost" className="text-danger" onClick={() => window.confirm("작성 중인 새 버전을 버릴까요?") && run(() => discardMemoDraft(stockId))}>
                  새 버전 버리기
                </Button>
              )}
              <span className="text-xs text-muted">
                {missing.length ? `확정하려면: ${missing.join(", ")}` : dirty ? "저장하지 않은 변경이 있습니다." : "확정할 수 있습니다."}
              </span>
            </div>
          </>
        ) : (
          selected && <ConfirmedView memo={selected} currency={currency} />
        )}
      </div>

      <aside className="flex flex-col gap-3">
        <Card>
          <CardHeader title="버전" />
          <ol className="divide-y divide-border">
            {memos.length === 0 && <li className="px-4 py-3 text-sm text-muted">아직 메모가 없습니다.</li>}
            {memos.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(m.id)}
                  className={cn("flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left text-sm hover:bg-surface-2", selected?.id === m.id && "bg-surface-2")}
                >
                  <span className="flex items-center gap-2 font-medium">
                    v{m.version}
                    {m.status === "confirmed" ? <Badge tone="ok">확정</Badge> : <Badge tone="warn">작성 중</Badge>}
                  </span>
                  <span className="text-xs text-muted">{m.confirmedAt ? formatDateTime(m.confirmedAt) : `수정 ${formatDateTime(m.updatedAt)}`}</span>
                  {m.revisionReason && <span className="text-xs text-muted">사유: {m.revisionReason}</span>}
                </button>
              </li>
            ))}
          </ol>
        </Card>
        {latest?.status === "confirmed" && (
          <Button variant="primary" onClick={() => setRevisionOpen(true)}>
            <FilePlus2 size={14} /> 새 버전으로 수정
          </Button>
        )}
        {selected && (
          <a href={`/api/memos/${selected.id}/markdown`} className="w-full">
            <Button className="w-full">
              <Download size={14} /> v{selected.version} 마크다운 내보내기
            </Button>
          </a>
        )}
      </aside>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="메모 확정"
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>취소</Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() =>
                run(() => confirmMemo(stockId, content), () => {
                  setConfirmOpen(false);
                  setDirty(false);
                })
              }
            >
              확정
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <p>지금 확정하면 아래 값과 메모 내용이 고정됩니다. 이후에는 새 버전으로만 고칠 수 있고, 이 원본은 복기 때 비교에 쓰입니다.</p>
          <dl className="grid grid-cols-2 gap-2 rounded-md bg-surface-2 p-3">
            <dt className="text-muted">현재가</dt>
            <dd className="text-right tabular-nums">{formatPrice(preview.price, currency)}{preview.priceDate && ` (${preview.priceDate})`}</dd>
            <dt className="text-muted">내재가치(가중)</dt>
            <dd className="text-right tabular-nums">{formatPrice(preview.intrinsicValue, currency)}</dd>
            <dt className="text-muted">안전마진</dt>
            <dd className="text-right tabular-nums">{formatRatio(preview.marginOfSafety)}</dd>
          </dl>
          {!preview.hasValuation && <Alert tone="warn">가치평가 결과가 없습니다. 그대로 확정하면 스냅샷에 가치평가가 빠집니다.</Alert>}
          {preview.price == null && <Alert tone="warn">현재가가 없습니다. 개요 탭에서 먼저 입력하는 것을 권합니다.</Alert>}
          {dirty && <p className="text-xs text-muted">저장하지 않은 변경도 함께 확정됩니다.</p>}
        </div>
      </Dialog>

      <Dialog
        open={revisionOpen}
        onClose={() => setRevisionOpen(false)}
        title="새 버전으로 수정"
        footer={
          <>
            <Button onClick={() => setRevisionOpen(false)}>취소</Button>
            <Button
              variant="primary"
              disabled={pending || !reason.trim()}
              onClick={() =>
                run(() => createMemoRevision(stockId, reason), () => {
                  setRevisionOpen(false);
                  setReason("");
                })
              }
            >
              새 버전 만들기
            </Button>
          </>
        }
      >
        <Field label="무엇이 바뀌어서 메모를 고치는가" hint="원본은 그대로 남습니다. 사후에 논리를 맞춰 고치는 것(사후확증편향)을 경계하세요.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
      </Dialog>
    </div>
  );
}

function ConfirmedView({ memo, currency }: { memo: MemoRow; currency: string }) {
  const c = memo.content;
  const snap: MemoSnapshot | null = memo.snapshot ?? null;
  return (
    <Card>
      <CardHeader
        title={`투자 메모 v${memo.version}`}
        description={memo.confirmedAt ? `확정 ${formatDateTime(memo.confirmedAt)} · 읽기 전용` : "작성 중"}
        actions={<CheckCircle2 size={18} className="text-ok" />}
      />
      <div className="flex flex-col gap-5 p-4 text-sm">
        {snap && (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
            {[
              ["확정 시점 현재가", formatPrice(snap.price, currency)],
              ["내재가치(가중)", formatPrice(snap.valuation?.intrinsicValue, currency)],
              ["안전마진", formatRatio(snap.valuation?.marginOfSafety)],
              ["대표 방법", snap.valuation ? METHOD_LABELS[snap.valuation.representative] : "-"],
            ].map(([k, v]) => (
              <div key={k} className="bg-surface px-3 py-2">
                <div className="text-xs text-muted">{k}</div>
                <div className="font-semibold tabular-nums">{v}</div>
              </div>
            ))}
          </div>
        )}
        <Section title="핵심 논리">
          <ol className="list-decimal pl-5">
            {c.theses.map((t, i) => (
              <li key={i} className="whitespace-pre-wrap">{t}</li>
            ))}
          </ol>
        </Section>
        <Section title="시장이 잘못 보고 있는 점">{c.mispricing}</Section>
        <Section title="촉매와 예상 시점">
          <ul className="list-disc pl-5">
            {c.catalysts.map((x, i) => (
              <li key={i}>
                <span className="tabular-nums text-muted">{x.expectedDate ?? "시점 미정"}</span> {x.description}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="프리모템">{c.premortem}</Section>
        <Section title="매도 조건">
          <ul className="list-disc pl-5">
            {c.sellConditions.map((s, i) => (
              <li key={i}>{describeCondition(s, currency)}</li>
            ))}
          </ul>
        </Section>
      </div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold text-muted">{title}</h3>
      <div className="whitespace-pre-wrap">{children}</div>
    </section>
  );
}
