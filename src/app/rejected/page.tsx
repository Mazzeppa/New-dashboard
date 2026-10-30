import Link from "next/link";
import { Card, EmptyState, PageHeader, Table } from "@/components/ui";
import { RestoreButton } from "@/components/stocks/restore-button";
import { listRejected } from "@/db/queries";
import { STAGE_LABELS } from "@/domain/pipeline";
import { displayName } from "@/domain/stock";

export const dynamic = "force-dynamic";
export const metadata = { title: "탈락 목록" };


export default function RejectedPage() {
  const rows = listRejected();
  return (
    <>
      <PageHeader title="탈락 목록" description="어느 단계에서 왜 탈락했는지 보관합니다. 탈락 이후 주가를 보면 필터가 잘 작동하는지 확인할 수 있습니다." />
      <Card>
        {rows.length === 0 ? (
          <EmptyState>탈락한 종목이 없습니다.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>종목</th>
                <th>시장</th>
                <th>탈락 단계</th>
                <th>사유</th>
                <th>탈락일</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/stocks/${s.id}`} className="font-medium hover:underline">
                      {displayName(s)}
                    </Link>
                    <div className="text-xs text-muted">{s.ticker}</div>
                  </td>
                  <td>{s.market}</td>
                  <td>{s.rejectedFromStage ? STAGE_LABELS[s.rejectedFromStage] : "-"}</td>
                  <td className="max-w-md whitespace-pre-wrap">{s.rejectReason}</td>
                  <td className="whitespace-nowrap">{s.stageChangedAt.slice(0, 10)}</td>
                  <td>
                    <RestoreButton stock={{ id: s.id, label: displayName(s), to: s.rejectedFromStage ?? "idea" }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
