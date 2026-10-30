import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table } from "@/components/ui";
import {
  activeCatalysts,
  holdingReviewStatus,
  listAllRetrospectives,
  listBypassRecords,
  listStocks,
  stageCounts,
  stocksAwaitingRetro,
} from "@/db/queries";
import { formatDateTime, formatPrice } from "@/domain/format";
import { PIPELINE_STAGES, STAGE_LABELS } from "@/domain/pipeline";
import { QUADRANTS, retroStats, reviewDue, upcomingCatalysts, type Quadrant } from "@/domain/review";
import { displayName, isInWatchRange } from "@/domain/stock";
import { today } from "@/lib/action";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";
export const metadata = { title: "대시보드" };


export default function DashboardPage() {
  const now = today();
  const counts = stageCounts();
  const stocks = listStocks();
  // 이미 매도했거나 복기를 마친 종목은 관심 가격 알림에서 뺀다
  const inRange = stocks.filter(
    (s) => s.stage !== "sold" && s.stage !== "reviewed" && isInWatchRange(s.price, s.watchLow, s.watchHigh),
  );
  const bypasses = listBypassRecords(8);

  const holding = holdingReviewStatus().map((h) => ({ ...h, ...reviewDue(h.lastReviewDate, h.holdingSince, now) }));
  const reviewsDue = holding.filter((h) => h.due).sort((a, b) => b.elapsed - a.elapsed);
  const interimDue = holding.filter((h) => reviewDue(h.lastRetroDate, h.holdingSince, now, 365).due);
  const awaitingRetro = stocksAwaitingRetro();
  const catalysts = upcomingCatalysts(activeCatalysts(), now);
  const finals = listAllRetrospectives().filter((r) => r.kind === "final");
  const stats = retroStats(finals);
  const maxTag = Math.max(1, ...stats.tags.map((t) => t.count));

  return (
    <>
      <PageHeader title="대시보드" description="프로세스를 지키고 있는지 한눈에 봅니다." />

      <Card className="mb-5">
        <CardHeader title="파이프라인" />
        <div className="grid grid-cols-3 gap-px bg-border sm:grid-cols-5 lg:grid-cols-10">
          {[...PIPELINE_STAGES, "rejected" as const].map((s) => (
            <Link key={s} href={s === "rejected" ? "/rejected" : "/pipeline"} className="flex flex-col bg-surface px-3 py-3 hover:bg-surface-2">
              <span className="text-xs text-muted">{STAGE_LABELS[s]}</span>
              <span className="mt-1 text-2xl font-semibold tabular-nums">{counts[s] ?? 0}</span>
            </Link>
          ))}
        </div>
      </Card>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="점검 필요" description="마지막 점검(없으면 보유 시작) 후 100일이 지난 보유 종목" actions={reviewsDue.length > 0 && <Badge tone="warn">{reviewsDue.length}</Badge>} />
          {reviewsDue.length === 0 ? (
            <EmptyState>{holding.length ? "모든 보유 종목이 제때 점검되었습니다." : "보유 종목이 없습니다."}</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {reviewsDue.map((h) => (
                <li key={h.stock.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <Link href={`/stocks/${h.stock.id}?tab=reviews`} className="font-medium hover:underline">
                    {displayName(h.stock)}
                  </Link>
                  <span className="text-xs text-warn">{h.neverReviewed ? `보유 후 ${h.elapsed}일, 점검 없음` : `${h.elapsed}일 경과`}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="복기 대기" description="매도했지만 복기가 없는 종목 · 1년 넘게 중간 복기가 없는 보유 종목" />
          {awaitingRetro.length === 0 && interimDue.length === 0 ? (
            <EmptyState>밀린 복기가 없습니다.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {awaitingRetro.map((s) => (
                <li key={`f${s.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <Link href={`/stocks/${s.id}?tab=retro`} className="font-medium hover:underline">
                    {displayName(s)}
                  </Link>
                  <Badge tone="danger">매도 후 복기</Badge>
                </li>
              ))}
              {interimDue.map((h) => (
                <li key={`i${h.stock.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <Link href={`/stocks/${h.stock.id}?tab=retro`} className="font-medium hover:underline">
                    {displayName(h.stock)}
                  </Link>
                  <Badge>중간 복기</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="다가오는 촉매" description="최신 투자 메모 기준 · 120일 이내 (지난 60일 포함)" />
          {catalysts.length === 0 ? (
            <EmptyState>예정된 촉매가 없습니다.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {catalysts.map((c, i) => (
                <li key={i} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-muted">{c.expectedDate}</span>
                    {c.daysUntil < 0 ? <Badge tone="warn">{-c.daysUntil}일 지남</Badge> : <Badge tone="accent">D-{c.daysUntil}</Badge>}
                    <Link href={`/stocks/${c.stockId}?tab=memo`} className="ml-auto text-xs font-medium hover:underline">
                      {c.stockName}
                    </Link>
                  </div>
                  <span>{c.description}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="결과 × 과정 (2×2)" description={`매도 후 복기 ${stats.total}건 기준. 결과만 보지 말고 과정을 보세요.`} />
          <div className="p-4">
            <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-sm">
              <div />
              <div className="text-center text-xs text-muted">논리 적중</div>
              <div className="text-center text-xs text-muted">논리 빗나감</div>
              {(["gain", "loss"] as const).map((o) => (
                <QuadrantRow key={o} outcome={o} counts={stats.quadrants} total={stats.total} />
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="실수 유형 누적" description="매도 후 복기에 붙인 실수 태그" />
          {stats.tags.length === 0 ? (
            <EmptyState>아직 실수 태그가 없습니다.</EmptyState>
          ) : (
            <div className="flex flex-col gap-2 p-4">
              {stats.tags.map((t) => (
                <div key={t.tag} className="grid grid-cols-[9rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-sm">
                  <span className="truncate">{t.tag}</span>
                  <div className="h-4 rounded bg-surface-2">
                    <div className="h-4 rounded bg-series-2" style={{ width: `${(t.count / maxTag) * 100}%` }} />
                  </div>
                  <span className="text-right tabular-nums">{t.count}회</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="관심 가격 구간에 들어온 종목" description="현재가가 설정한 하한~상한 안에 있습니다." />
          {inRange.length === 0 ? (
            <EmptyState>해당 종목이 없습니다.</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>종목</th>
                  <th>단계</th>
                  <th className="text-right">현재가</th>
                  <th className="text-right">관심 구간</th>
                </tr>
              </thead>
              <tbody>
                {inRange.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/stocks/${s.id}`} className="font-medium hover:underline">
                        {displayName(s)}
                      </Link>
                    </td>
                    <td>
                      <Badge>{STAGE_LABELS[s.stage]}</Badge>
                    </td>
                    <td className="num">{formatPrice(s.price, s.currency)}</td>
                    <td className="num text-muted">
                      {formatPrice(s.watchLow, s.currency)} ~ {formatPrice(s.watchHigh, s.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="게이트 우회 기록" description="조건을 못 채운 채 진행한 이동. 복기 때 다시 봅니다." />
          {bypasses.length === 0 ? (
            <EmptyState>우회 기록이 없습니다.</EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {bypasses.map(({ t, name, ticker }) => (
                <li key={t.id} className="px-4 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/stocks/${t.stockId}`} className="font-medium hover:underline">
                      {name ?? ticker}
                    </Link>
                    <span className="text-muted">
                      {t.fromStage ? STAGE_LABELS[t.fromStage] : "등록"} → {STAGE_LABELS[t.toStage]}
                    </span>
                    <span className="ml-auto text-xs text-muted">{formatDateTime(t.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">미충족: {t.gateFailures.map((f) => f.message).join(" / ")}</p>
                  <p className="mt-0.5 text-xs">우회 사유: {t.bypassReason}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function QuadrantRow({ outcome, counts, total }: { outcome: "gain" | "loss"; counts: Record<Quadrant, number>; total: number }) {
  const cells: Quadrant[] = outcome === "gain" ? ["skill", "luck"] : ["bad_luck", "mistake"];
  return (
    <>
      <div className="self-center pr-1 text-right text-xs text-muted">{outcome === "gain" ? "수익" : "손실"}</div>
      {cells.map((q) => {
        const n = counts[q];
        return (
          <div
            key={q}
            className={cn("flex flex-col items-center justify-center rounded-md border border-border py-4", n > 0 && (q === "mistake" ? "bg-danger-bg" : q === "skill" ? "bg-ok-bg" : "bg-surface-2"))}
            title={QUADRANTS[q].help}
          >
            <span className="text-xs text-muted">{QUADRANTS[q].label}</span>
            <span className="text-2xl font-semibold tabular-nums">{n}</span>
            <span className="text-[11px] text-muted">{total ? `${Math.round((n / total) * 100)}%` : "-"}</span>
          </div>
        );
      })}
    </>
  );
}
