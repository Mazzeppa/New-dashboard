import { getValuation, listMemos, type StockWithPrice } from "@/db/queries";
import { hasValuationResult, summarize } from "@/domain/valuation";
import { MemoWorkspace } from "./memo-workspace";

export function MemoTab({ stock }: { stock: StockWithPrice }) {
  const memos = listMemos(stock.id);
  const valuation = getValuation(stock.id);
  const summary = valuation ? summarize(valuation.data, stock.price) : null;
  return (
    <MemoWorkspace
      key={memos.map((m) => `${m.id}:${m.status}:${m.updatedAt}`).join("|")}
      stockId={stock.id}
      currency={stock.currency}
      memos={memos}
      preview={{
        price: stock.price,
        priceDate: stock.priceDate,
        intrinsicValue: summary?.intrinsicValue ?? null,
        marginOfSafety: summary?.marginOfSafety ?? null,
        hasValuation: !!valuation && hasValuationResult(valuation.data),
      }}
    />
  );
}
