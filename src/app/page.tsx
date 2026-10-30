import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table } from "@/components/ui";
import { listBypassRecords, listStocks, stageCounts } from "@/db/queries";
import { formatDateTime, formatPrice } from "@/domain/format";
import { PIPELINE_STAGES, STAGE_LABELS } from "@/domain/pipeline";
import { displayName, isInWatchRange } from "@/domain/stock";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const counts = stageCounts();
  const stocks = listStocks();
  // 이미 매도했거나 복기를 마친 종목은 관심 가격 알림에서 뺀다
  const inRange = stocks.filter(
    (s) => s.stage !== "sold" && s.stage !== "reviewed" && isInWatchRange(s.price, s.watchLow, s.watchHigh),
  );
  const bypasses = listBypassRecords(10);

  return (
    <>
      <PageHeader title="대시보드" description="프로세스를 지키고 있는지 한눈에 봅니다." />

      <Card className="mb-5">
        <CardHeader title="파이프라인" />
        <div className="grid grid-cols-3 gap-px bg-border sm:grid-cols-5 lg:grid-cols-10">
          {[...PIPELINE_STAGES, "rejected" as const].map((s) => (
            <Link
              key={s}
              href={s === "rejected" ? "/rejected" : "/pipeline"}
              className="flex flex-col bg-surface px-3 py-3 hover:bg-surface-2"
            >
              <span className="text-xs text-muted">{STAGE_LABELS[s]}</span>
              <span className="mt-1 text-2xl font-semibold tabular-nums">{counts[s] ?? 0}</span>
            </Link>
          ))}
        </div>
      </Card>

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
