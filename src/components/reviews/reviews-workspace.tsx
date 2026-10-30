"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteHoldingReview, saveHoldingReview } from "@/app/actions/reviews";
import { useStageMove } from "@/components/pipeline/use-stage-move";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Textarea } from "@/components/ui";
import type { HoldingReviewRow } from "@/db/schema";
import { formatPrice } from "@/domain/format";
import type { Stage } from "@/domain/pipeline";
import {
  CATALYST_STATUS,
  DECISIONS,
  reviewAlerts,
  THESIS_STATUS,
  type CatalystStatus,
  type Decision,
  type HoldingReviewInput,
  type ThesisStatus,
} from "@/domain/review";
import { CONDITION_STATUS_LABELS, type ConditionEvaluation, type ConditionStatus } from "@/domain/sell-conditions";
import { today } from "@/lib/action";
import { cn } from "@/lib/cn";

const STATUS_TONE: Record<ConditionStatus, "danger" | "ok" | "warn" | "neutral"> = { triggered: "danger", clear: "ok", manual: "warn", insufficient: "neutral" };
const THESIS_TONE: Record<ThesisStatus, string> = { valid: "border-ok bg-ok-bg text-ok", weakened: "border-warn bg-warn-bg text-warn", broken: "border-danger bg-danger-bg text-danger" };

export function ReviewsWorkspace({
  stock,
  memo,
  evaluations,
  reviews,
  due,
}: {
  stock: { id: number; name: string; stage: Stage; currency: string; price: number | null };
  memo: { id: number; version: number; status: string; theses: string[]; catalysts: { description: string; expectedDate: string | null }[] } | null;
  evaluations: ConditionEvaluation[];
  reviews: HoldingReviewRow[];
  due: { due: boolean; elapsed: number; neverReviewed: boolean } | null;
}) {
  const router = useRouter();
  const { request, dialog } = useStageMove();
  const prev = reviews[0];
  const [form, setForm] = React.useState<HoldingReviewInput>(() => ({
    reviewDate: today(),
    memoId: memo?.id ?? null,
    theses: (memo?.theses ?? []).map((t) => ({ thesis: t, status: (prev?.theses.find((x) => x.thesis === t)?.status ?? "valid") as ThesisStatus, note: "" })),
    conditions: evaluations.map((e) => ({ description: e.description, status: e.status, detail: e.detail, userJudgement: e.status === "triggered" || e.status === "clear" ? e.status : null })),
    catalysts: (memo?.catalysts ?? []).map((c) => ({
      description: c.description,
      expectedDate: c.expectedDate,
      status: (prev?.catalysts.find((x) => x.description === c.description)?.status ?? "pending") as CatalystStatus,
    })),
    decision: "hold",
    reason: "",
  }));
  const [error, setError] = React.useState<string | null>(null);
  const [savedExit, setSavedExit] = React.useState(false);
  const [pending, start] = React.useTransition();
  const set = (fn: (f: HoldingReviewInput) => void) =>
    setForm((p) => {
      const n = structuredClone(p);
      fn(n);
      return n;
    });

  const alerts = reviewAlerts(form);

  const save = () =>
    start(async () => {
      const r = await saveHoldingReview(stock.id, form);
      if (!r.ok) return setError(r.error);
      setError(null);
      if (form.decision === "exit") setSavedExit(true);
      router.refresh();
    });

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        {due?.due && (
          <Alert tone="warn" title={due.neverReviewed ? `보유 후 ${due.elapsed}일째 점검 기록이 없습니다` : `마지막 점검 후 ${due.elapsed}일이 지났습니다`}>
            분기마다 핵심 논리와 매도 조건을 점검하세요 (기준 100일).
          </Alert>
        )}
        {stock.stage !== "holding" && <Alert tone="warn">이 종목은 보유 단계가 아닙니다. 점검은 기록할 수 있습니다.</Alert>}
        {!memo && (
          <Alert tone="warn">
            투자 메모가 없어 점검할 논리와 매도 조건이 없습니다. <Link className="underline" href={`/stocks/${stock.id}?tab=memo`}>투자 메모</Link>를 먼저 작성하세요.
          </Alert>
        )}
        {savedExit && stock.stage === "holding" && (
          <Alert tone="danger" title="전량 매도로 결정했습니다">
            매매 기록을 남기고 매도 단계로 옮기세요.
            <Button size="sm" className="ml-2" onClick={() => request({ id: stock.id, label: stock.name }, "sold")}>
              매도 단계로 이동
            </Button>
          </Alert>
        )}
        {dialog}

        <Card>
          <CardHeader
            title="분기 점검"
            description={memo ? `기준: 투자 메모 v${memo.version}${memo.status === "confirmed" ? " (확정)" : " (작성 중)"} · 현재가 ${formatPrice(stock.price, stock.currency)}` : undefined}
            actions={<Input type="date" className="w-40" value={form.reviewDate} onChange={(e) => set((f) => void (f.reviewDate = e.target.value))} aria-label="점검일" />}
          />
          <div className="flex flex-col gap-6 p-4">
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold">핵심 논리 상태</h3>
              {form.theses.map((t, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <div className="text-sm">
                    <span className="text-muted">{i + 1}.</span> {t.thesis}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(Object.entries(THESIS_STATUS) as [ThesisStatus, string][]).map(([k, label]) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={t.status === k}
                        onClick={() => set((f) => void (f.theses[i].status = k))}
                        className={cn("rounded-md border px-3 py-1 text-xs font-medium", t.status === k ? THESIS_TONE[k] : "border-border text-muted hover:bg-surface-2")}
                      >
                        {label}
                      </button>
                    ))}
                    <Input className="h-8 min-w-48 flex-1 text-xs" placeholder="근거 (무엇을 보고 판단했나)" value={t.note} onChange={(e) => set((f) => void (f.theses[i].note = e.target.value))} />
                  </div>
                </div>
              ))}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">매도 조건 점검</h3>
              <p className="text-xs text-muted">구조화된 조건은 저장된 최신 재무 데이터로 자동 평가합니다. 최종 판단은 직접 정합니다.</p>
              {form.conditions.length === 0 && <p className="text-sm text-muted">매도 조건이 없습니다.</p>}
              {form.conditions.map((c, i) => (
                <div key={i} className="flex flex-col gap-1.5 rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.description}</span>
                    <Badge tone={STATUS_TONE[c.status]}>자동: {CONDITION_STATUS_LABELS[c.status]}</Badge>
                  </div>
                  <p className="text-xs text-muted">{c.detail}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted">내 판단:</span>
                    {(["clear", "triggered"] as const).map((j) => (
                      <button
                        key={j}
                        type="button"
                        aria-pressed={c.userJudgement === j}
                        onClick={() => set((f) => void (f.conditions[i].userJudgement = j))}
                        className={cn(
                          "rounded-md border px-2.5 py-0.5",
                          c.userJudgement === j ? (j === "triggered" ? "border-danger bg-danger-bg text-danger" : "border-ok bg-ok-bg text-ok") : "border-border text-muted",
                        )}
                      >
                        {j === "triggered" ? "충족 (매도 검토)" : "미충족"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            {form.catalysts.length > 0 && (
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">촉매</h3>
                {form.catalysts.map((c, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-24 text-xs text-muted tabular-nums">{c.expectedDate ?? "시점 미정"}</span>
                    <span className="min-w-0 flex-1">{c.description}</span>
                    <Select className="h-8 w-28 text-xs" value={c.status} onChange={(e) => set((f) => void (f.catalysts[i].status = e.target.value as CatalystStatus))} aria-label="촉매 상태">
                      {Object.entries(CATALYST_STATUS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </section>
            )}

            {alerts.length > 0 && (
              <Alert tone="danger" title="주의">
                {alerts.join(" · ")}. 결정 이유에 이를 어떻게 판단했는지 적으세요.
              </Alert>
            )}

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">결정</h3>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(DECISIONS) as [Decision, string][]).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={form.decision === k}
                    onClick={() => set((f) => void (f.decision = k))}
                    className={cn("rounded-md border px-3 py-1.5 text-sm", form.decision === k ? "border-accent bg-accent/15 font-semibold text-accent" : "border-border text-muted hover:bg-surface-2")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Field label="이유 (필수)">
                <Textarea className="min-h-20" value={form.reason} onChange={(e) => set((f) => void (f.reason = e.target.value))} />
              </Field>
            </section>

            {error && <Alert tone="danger">{error}</Alert>}
            <div>
              <Button variant="primary" onClick={save} disabled={pending || !form.reason.trim()}>
                점검 기록
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <aside>
        <Card>
          <CardHeader title={`점검 기록 (${reviews.length})`} />
          <ol className="divide-y divide-border">
            {reviews.length === 0 && <li className="px-4 py-3 text-sm text-muted">아직 점검 기록이 없습니다.</li>}
            {reviews.map((r) => (
              <ReviewItem key={r.id} review={r} currency={stock.currency} onDeleted={() => router.refresh()} />
            ))}
          </ol>
        </Card>
      </aside>
    </div>
  );
}

function ReviewItem({ review: r, currency, onDeleted }: { review: HoldingReviewRow; currency: string; onDeleted: () => void }) {
  const [pending, start] = React.useTransition();
  const alerts = reviewAlerts(r);
  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium tabular-nums">{r.reviewDate}</span>
        <Badge tone={r.decision === "exit" || r.decision === "trim" ? "warn" : "accent"}>{DECISIONS[r.decision]}</Badge>
        <span className="ml-auto text-xs text-muted">{formatPrice(r.price, currency)}</span>
        <button
          type="button"
          aria-label="점검 기록 삭제"
          className="text-muted hover:text-danger"
          disabled={pending}
          onClick={() => window.confirm("이 점검 기록을 삭제할까요?") && start(async () => { await deleteHoldingReview(r.id); onDeleted(); })}
        >
          <Trash2 size={13} />
        </button>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {r.theses.map((t, i) => (
          <span key={i} className={cn("rounded border px-1.5 text-[11px]", THESIS_TONE[t.status])} title={t.thesis}>
            논리{i + 1} {THESIS_STATUS[t.status]}
          </span>
        ))}
      </div>
      {alerts.length > 0 && <p className="mt-1 text-xs text-danger">{alerts.join(" · ")}</p>}
      <p className="mt-1 text-xs whitespace-pre-wrap text-muted">{r.reason}</p>
    </li>
  );
}
