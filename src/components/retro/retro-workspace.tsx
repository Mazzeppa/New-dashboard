"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, ListChecks, Plus, Trash2 } from "lucide-react";
import { applyLesson, deleteRetrospective, saveRetrospective } from "@/app/actions/reviews";
import { useStageMove } from "@/components/pipeline/use-stage-move";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import { NumberField } from "@/components/valuation/number-field";
import type { HoldingReviewRow, RetrospectiveRow, StageTransition } from "@/db/schema";
import { daysBetween, formatAmount, formatDateTime, formatPrice, formatRatio } from "@/domain/format";
import { describeCondition, type MemoContent, type MemoSnapshot } from "@/domain/memo";
import { SELL_REASONS, type SellReasonType, type Stage } from "@/domain/pipeline";
import {
  DECISIONS,
  OUTCOMES,
  PROCESSES,
  QUADRANTS,
  quadrantOf,
  THESIS_STATUS,
  type Outcome,
  type Process,
  type RetrospectiveInput,
} from "@/domain/review";
import { METHOD_LABELS } from "@/domain/valuation";
import { today } from "@/lib/action";
import { cn } from "@/lib/cn";

interface Actual {
  firstBuyDate: string | null;
  lastTradeDate: string | null;
  lastSellPrice: number | null;
  avgBuyPrice: number | null;
  quantity: number;
  totalBought: number;
  realizedPnl: number;
  unrealizedPnl: number | null;
  suggestedReturn: number | null;
  sellReasons: { at: string; type: SellReasonType | null; text: string | null }[];
}

type Retro = RetrospectiveRow & { tags: string[] };

export function RetroWorkspace({
  stock,
  memos,
  actual,
  reviews,
  bypasses,
  retros,
  mistakeTags,
}: {
  stock: { id: number; name: string; stage: Stage; currency: string; price: number | null };
  memos: { id: number; version: number; confirmedAt: string | null; snapshot: MemoSnapshot; content: MemoContent }[];
  actual: Actual;
  reviews: HoldingReviewRow[];
  bypasses: StageTransition[];
  retros: Retro[];
  mistakeTags: string[];
}) {
  const { request, dialog } = useStageMove();
  const [memoId, setMemoId] = React.useState<number | null>(memos[0]?.id ?? null);
  const memo = memos.find((m) => m.id === memoId) ?? null;
  const [editing, setEditing] = React.useState<Retro | null>(null);
  const hasFinal = retros.some((r) => r.kind === "final");
  const cur = stock.currency;

  const exitPrice = actual.quantity > 0 ? stock.price : actual.lastSellPrice;
  const intrinsic = memo?.snapshot.valuation?.intrinsicValue ?? null;

  return (
    <div className="flex flex-col gap-5">
      {stock.stage === "sold" && hasFinal && (
        <Alert tone="ok" title="복기를 작성했습니다">
          <Button size="sm" className="mt-1" onClick={() => request({ id: stock.id, label: stock.name }, "reviewed")}>
            복기 완료로 이동
          </Button>
        </Alert>
      )}
      {dialog}

      <Card>
        <CardHeader
          title="매수 당시 vs 실제 결과"
          description="확정한 메모 스냅샷은 수정할 수 없습니다. 기억이 아니라 기록과 비교하세요."
          actions={
            memos.length > 0 && (
              <Select className="w-52" value={memoId ?? ""} onChange={(e) => setMemoId(Number(e.target.value))} aria-label="비교할 메모 버전">
                {memos.map((m, i) => (
                  <option key={m.id} value={m.id}>
                    v{m.version} {i === 0 ? "(원본) " : ""}· {m.confirmedAt?.slice(0, 10)}
                  </option>
                ))}
              </Select>
            )
          }
        />
        <div className="grid gap-px bg-border lg:grid-cols-2">
          <div className="flex flex-col gap-4 bg-surface p-4 text-sm">
            <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">매수 당시 (메모 스냅샷)</h3>
            {!memo ? (
              <p className="text-muted">
                확정된 투자 메모가 없습니다. 비교할 기록이 없다는 것 자체가 교훈일 수 있습니다. <Link className="underline" href={`/stocks/${stock.id}?tab=memo`}>투자 메모</Link>
              </p>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <dt className="text-muted">확정일</dt>
                  <dd className="text-right tabular-nums">{memo.confirmedAt?.slice(0, 10)}</dd>
                  <dt className="text-muted">당시 현재가</dt>
                  <dd className="text-right tabular-nums">{formatPrice(memo.snapshot.price, cur)}</dd>
                  <dt className="text-muted">내재가치(가중)</dt>
                  <dd className="text-right tabular-nums">{formatPrice(intrinsic, cur)}</dd>
                  <dt className="text-muted">안전마진</dt>
                  <dd className="text-right tabular-nums">{formatRatio(memo.snapshot.valuation?.marginOfSafety)}</dd>
                  <dt className="text-muted">대표 방법</dt>
                  <dd className="text-right">{memo.snapshot.valuation ? METHOD_LABELS[memo.snapshot.valuation.representative] : "-"}</dd>
                </dl>
                <Block title="핵심 논리">
                  <ol className="list-decimal pl-5">
                    {memo.content.theses.map((t, i) => {
                      const last = reviews.at(-1)?.theses.find((x) => x.thesis === t);
                      return (
                        <li key={i}>
                          {t}
                          {last && <Badge tone={last.status === "valid" ? "ok" : last.status === "weakened" ? "warn" : "danger"} className="ml-2">마지막 점검: {THESIS_STATUS[last.status]}</Badge>}
                        </li>
                      );
                    })}
                  </ol>
                </Block>
                <Block title="시장이 잘못 보고 있다고 본 점">{memo.content.mispricing}</Block>
                <Block title="촉매">
                  <ul className="list-disc pl-5">
                    {memo.content.catalysts.map((c, i) => {
                      const st = reviews.at(-1)?.catalysts.find((x) => x.description === c.description)?.status;
                      return (
                        <li key={i}>
                          <span className="text-muted tabular-nums">{c.expectedDate}</span> {c.description}
                          {st && st !== "pending" && <Badge tone={st === "happened" ? "ok" : "danger"} className="ml-2">{st === "happened" ? "발생" : "빗나감"}</Badge>}
                        </li>
                      );
                    })}
                  </ul>
                </Block>
                <Block title="프리모템 (예상했던 실패 이유)">{memo.content.premortem}</Block>
                <Block title="매도 조건">
                  <ul className="list-disc pl-5">
                    {memo.content.sellConditions.map((s, i) => (
                      <li key={i}>{describeCondition(s, cur)}</li>
                    ))}
                  </ul>
                </Block>
              </>
            )}
          </div>

          <div className="flex flex-col gap-4 bg-surface p-4 text-sm">
            <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">실제 결과</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
              <dt className="text-muted">보유 기간</dt>
              <dd className="text-right tabular-nums">
                {actual.firstBuyDate ? `${actual.firstBuyDate} ~ ${actual.quantity > 0 ? "보유 중" : actual.lastTradeDate} (${daysBetween(actual.firstBuyDate, actual.quantity > 0 ? new Date() : new Date(actual.lastTradeDate!))}일)` : "매매 기록 없음"}
              </dd>
              <dt className="text-muted">평균 매수가</dt>
              <dd className="text-right tabular-nums">{formatPrice(actual.avgBuyPrice, cur)}</dd>
              <dt className="text-muted">{actual.quantity > 0 ? "현재가" : "마지막 매도가"}</dt>
              <dd className="text-right tabular-nums">{formatPrice(exitPrice, cur)}</dd>
              <dt className="text-muted">당시 내재가치 대비</dt>
              <dd className="text-right tabular-nums">{exitPrice != null && intrinsic ? formatRatio(exitPrice / intrinsic - 1) : "-"}</dd>
              <dt className="text-muted">실현손익</dt>
              <dd className="text-right tabular-nums">{formatAmount(actual.realizedPnl, cur)}</dd>
              {actual.unrealizedPnl != null && (
                <>
                  <dt className="text-muted">평가손익 (보유분)</dt>
                  <dd className="text-right tabular-nums">{formatAmount(actual.unrealizedPnl, cur)}</dd>
                </>
              )}
              <dt className="text-muted">수익률</dt>
              <dd className={cn("text-right font-semibold tabular-nums", (actual.suggestedReturn ?? 0) < 0 ? "text-danger" : "text-ok")}>{formatRatio(actual.suggestedReturn)}</dd>
            </dl>
            {actual.sellReasons.length > 0 && (
              <Block title="매도 사유">
                {actual.sellReasons.map((s, i) => (
                  <p key={i}>
                    {s.type ? SELL_REASONS[s.type] : "-"}
                    {s.text && ` · ${s.text}`} <span className="text-xs text-muted">({s.at.slice(0, 10)})</span>
                  </p>
                ))}
              </Block>
            )}
            <Block title={`보유 점검 이력 (${reviews.length})`}>
              {reviews.length === 0 ? (
                <p className="text-muted">점검 기록이 없습니다.</p>
              ) : (
                <ol className="flex flex-col gap-1.5">
                  {reviews.map((r) => (
                    <li key={r.id}>
                      <span className="tabular-nums">{r.reviewDate}</span> <Badge>{DECISIONS[r.decision]}</Badge>{" "}
                      <span className="text-xs text-muted">{r.theses.map((t, i) => `논리${i + 1} ${THESIS_STATUS[t.status]}`).join(", ")}</span>
                      <div className="text-xs text-muted">{r.reason}</div>
                    </li>
                  ))}
                </ol>
              )}
            </Block>
            <Block title={`게이트 우회 기록 (${bypasses.length})`}>
              {bypasses.length === 0 ? (
                <p className="text-muted">프로세스를 건너뛴 기록이 없습니다.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {bypasses.map((b) => (
                    <li key={b.id} className="rounded-md bg-warn-bg px-2 py-1 text-xs">
                      <span className="font-medium">{b.createdAt.slice(0, 10)}</span> · 미충족: {b.gateFailures.map((f) => f.message).join(" / ")}
                      <div>우회 사유: {b.bypassReason}</div>
                    </li>
                  ))}
                </ul>
              )}
            </Block>
          </div>
        </div>
      </Card>

      <RetroForm
        key={editing ? `edit-${editing.id}` : `new-${retros.length}`}
        stock={stock}
        memoId={memoId}
        initial={editing}
        suggestedReturn={actual.suggestedReturn}
        mistakeTags={mistakeTags}
        onDone={() => setEditing(null)}
      />

      {retros.map((r) => (
        <SavedRetro key={r.id} retro={r} onEdit={() => setEditing(r)} />
      ))}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-1 text-xs font-semibold text-muted">{title}</h4>
      <div className="whitespace-pre-wrap">{children}</div>
    </section>
  );
}

function RetroForm({
  stock,
  memoId,
  initial,
  suggestedReturn,
  mistakeTags,
  onDone,
}: {
  stock: { id: number; stage: Stage };
  memoId: number | null;
  initial: Retro | null;
  suggestedReturn: number | null;
  mistakeTags: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [f, setF] = React.useState<RetrospectiveInput>(() => ({
    kind: initial?.kind ?? (stock.stage === "holding" ? "interim" : "final"),
    date: initial?.date ?? today(),
    memoId: initial?.memoId ?? memoId,
    outcome: initial?.outcome ?? (suggestedReturn != null && suggestedReturn < 0 ? "loss" : "gain"),
    process: initial?.process ?? "hit",
    returnPct: initial?.returnPct ?? suggestedReturn,
    whatHappened: initial?.whatHappened ?? "",
    thesisReview: initial?.thesisReview ?? "",
    lessons: initial?.lessons ?? "",
    tags: initial?.tags ?? [],
  }));
  const [newTag, setNewTag] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const set = <K extends keyof RetrospectiveInput>(k: K, v: RetrospectiveInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const q = QUADRANTS[quadrantOf(f.outcome, f.process)];
  const allTags = [...new Set([...mistakeTags, ...f.tags])];

  const save = () =>
    start(async () => {
      const r = await saveRetrospective(stock.id, { ...f, memoId: f.memoId ?? memoId }, initial?.id);
      if (!r.ok) return setError(r.error);
      setError(null);
      onDone();
      router.refresh();
    });

  return (
    <Card>
      <CardHeader title={initial ? "복기 수정" : "복기 작성"} description="결과(수익/손실)와 과정(논리 적중/빗나감)을 따로 판단합니다. 좋은 결과가 좋은 판단을 뜻하지는 않습니다." />
      <div className="flex flex-col gap-5 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="종류" className="w-44">
            <Select value={f.kind} onChange={(e) => set("kind", e.target.value as "final" | "interim")}>
              <option value="final">매도 후 복기</option>
              <option value="interim">중간 복기 (보유 중, 연 1회)</option>
            </Select>
          </Field>
          <Field label="날짜" className="w-40">
            <Input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
          <Field label="수익률" className="w-32" hint={suggestedReturn != null ? `매매 기록 기준 ${formatRatio(suggestedReturn)}` : undefined}>
            <NumberField value={f.returnPct} scale={0.01} decimals={2} suffix="%" onChange={(v) => set("returnPct", v)} aria-label="수익률" />
          </Field>
        </div>

        <div className="grid gap-4 md:grid-cols-[auto_1fr]">
          <div className="grid grid-cols-[auto_auto_auto] gap-1 text-sm">
            <div />
            {(Object.entries(PROCESSES) as [Process, string][]).map(([k, label]) => (
              <button key={k} type="button" onClick={() => set("process", k)} className={cn("rounded px-2 py-1 text-xs", f.process === k ? "font-semibold text-fg" : "text-muted")}>
                {label}
              </button>
            ))}
            {(Object.entries(OUTCOMES) as [Outcome, string][]).map(([o, olabel]) => (
              <React.Fragment key={o}>
                <button type="button" onClick={() => set("outcome", o)} className={cn("rounded px-2 py-1 text-right text-xs", f.outcome === o ? "font-semibold text-fg" : "text-muted")}>
                  {olabel}
                </button>
                {(Object.keys(PROCESSES) as Process[]).map((p) => {
                  const quad = QUADRANTS[quadrantOf(o, p)];
                  const active = f.outcome === o && f.process === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setF((prev) => ({ ...prev, outcome: o, process: p }))}
                      className={cn("h-16 w-28 rounded-md border text-sm font-semibold", active ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:bg-surface-2")}
                    >
                      {quad.label}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div className="self-center rounded-md bg-surface-2 p-3 text-sm">
            <div className="font-semibold">{q.label}</div>
            <div className="text-muted">{q.help}</div>
          </div>
        </div>

        <Field label="실제로 무슨 일이 있었나 (필수)">
          <Textarea className="min-h-24" value={f.whatHappened} onChange={(e) => set("whatHappened", e.target.value)} />
        </Field>
        <Field label="핵심 논리는 맞았나, 틀렸나 (메모 스냅샷과 비교)">
          <Textarea className="min-h-20" value={f.thesisReview} onChange={(e) => set("thesisReview", e.target.value)} />
        </Field>

        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium">실수 유형 태그</span>
          <div className="flex flex-wrap gap-1.5">
            {allTags.map((t) => {
              const on = f.tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("tags", on ? f.tags.filter((x) => x !== t) : [...f.tags, t])}
                  className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-danger bg-danger-bg text-danger" : "border-border text-muted hover:bg-surface-2")}
                >
                  {t}
                </button>
              );
            })}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const t = newTag.trim();
              if (t && !f.tags.includes(t)) set("tags", [...f.tags, t]);
              setNewTag("");
            }}
          >
            <Input className="h-8 w-56 text-xs" placeholder="새 실수 태그" value={newTag} onChange={(e) => setNewTag(e.target.value)} />
            <Button size="sm" type="submit">
              <Plus size={12} /> 태그 추가
            </Button>
          </form>
        </div>

        <Field label="교훈" hint="저장한 뒤 원칙이나 1차 필터 체크리스트에 바로 반영할 수 있습니다.">
          <Textarea className="min-h-20" value={f.lessons} onChange={(e) => set("lessons", e.target.value)} />
        </Field>

        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex gap-2">
          <Button variant="primary" onClick={save} disabled={pending || !f.whatHappened.trim()}>
            {initial ? "수정 저장" : "복기 저장"}
          </Button>
          {initial && <Button onClick={onDone}>취소</Button>}
        </div>
      </div>
    </Card>
  );
}

function SavedRetro({ retro: r, onEdit }: { retro: Retro; onEdit: () => void }) {
  const router = useRouter();
  const q = QUADRANTS[quadrantOf(r.outcome, r.process)];
  const [lesson, setLesson] = React.useState(r.lessons.split("\n").find((l) => l.trim())?.trim() ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const apply = (target: "principle" | "filter") =>
    start(async () => {
      const res = await applyLesson(r.id, target, lesson);
      if (!res.ok) return setError(res.error);
      setError(null);
      router.refresh();
    });

  return (
    <Card>
      <CardHeader
        title={`${r.kind === "final" ? "매도 후 복기" : "중간 복기"} · ${r.date}`}
        description={`${q.label} (${OUTCOMES[r.outcome]} · ${PROCESSES[r.process]}) · 수익률 ${formatRatio(r.returnPct)}`}
        actions={
          <>
            <Button size="sm" onClick={onEdit}>
              수정
            </Button>
            <button
              type="button"
              aria-label="복기 삭제"
              className="text-muted hover:text-danger"
              onClick={() => window.confirm("이 복기를 삭제할까요?") && start(async () => { await deleteRetrospective(r.id); router.refresh(); })}
            >
              <Trash2 size={14} />
            </button>
          </>
        }
      />
      <div className="flex flex-col gap-3 p-4 text-sm">
        {r.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {r.tags.map((t) => (
              <Badge key={t} tone="danger">{t}</Badge>
            ))}
          </div>
        )}
        <Block title="무슨 일이 있었나">{r.whatHappened}</Block>
        {r.thesisReview && <Block title="논리 검증">{r.thesisReview}</Block>}
        {r.lessons && <Block title="교훈">{r.lessons}</Block>}

        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
          <span className="text-xs font-semibold text-muted">교훈을 프로세스에 반영 (프로세스가 순환합니다)</span>
          <div className="flex flex-wrap gap-2">
            <Input className="h-8 min-w-64 flex-1 text-sm" value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="반영할 문장" />
            <Button size="sm" onClick={() => apply("principle")} disabled={pending || !lesson.trim()}>
              <BookOpen size={12} /> 투자 원칙에 추가
            </Button>
            <Button size="sm" onClick={() => apply("filter")} disabled={pending || !lesson.trim()}>
              <ListChecks size={12} /> 1차 필터 체크리스트에 추가
            </Button>
          </div>
          <p className="text-xs text-muted">{"체크리스트 항목은 '예'가 좋은 답이 되도록 질문형으로 쓰세요 (예: \"경영진 발언이 숫자로 뒷받침되는가?\")."}</p>
          {error && <p className="text-xs text-danger">{error}</p>}
          {r.appliedLessons.length > 0 && (
            <ul className="text-xs text-muted">
              {r.appliedLessons.map((a, i) => (
                <li key={i}>
                  ✓ {a.target === "principle" ? "원칙" : "1차 필터"}에 반영: {a.text} ({formatDateTime(a.at)})
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
