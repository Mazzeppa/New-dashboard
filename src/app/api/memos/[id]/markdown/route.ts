import { NextResponse } from "next/server";
import { getMemo, getStock } from "@/db/queries";
import { memoToMarkdown } from "@/domain/memo";
import { displayName } from "@/domain/stock";

/** 투자 메모 마크다운 내보내기 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const memo = getMemo(Number(id));
  if (!memo) return NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 });
  const stock = getStock(memo.stockId);
  if (!stock) return NextResponse.json({ error: "종목을 찾을 수 없습니다." }, { status: 404 });
  const name = displayName(stock);
  const md = memoToMarkdown({
    stockName: name,
    ticker: stock.ticker,
    market: stock.market,
    version: memo.version,
    status: memo.status,
    confirmedAt: memo.confirmedAt,
    content: memo.content,
    snapshot: memo.snapshot ?? null,
  });
  const filename = `${name}-메모-v${memo.version}.md`;
  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
