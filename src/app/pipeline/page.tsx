import Link from "next/link";
import { Button, PageHeader, DownloadButton } from "@/components/ui";
import { KanbanBoard } from "@/components/pipeline/kanban";
import { listStocks } from "@/db/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "파이프라인" };


export default function PipelinePage() {
  const stocks = listStocks();
  return (
    <>
      <PageHeader
        title="파이프라인"
        description="종목이 아이디어에서 복기까지 단계를 차례로 통과합니다."
        actions={
          <>
            <DownloadButton href="/api/export/stocks">CSV 내보내기</DownloadButton>
            <Link href="/stocks/new">
              <Button variant="primary">종목 추가</Button>
            </Link>
          </>
        }
      />
      <KanbanBoard stocks={stocks} />
    </>
  );
}
