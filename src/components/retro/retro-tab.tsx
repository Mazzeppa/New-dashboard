import {
  listHoldingReviews,
  listMemos,
  listMistakeTags,
  listRetrospectives,
  listStockBypasses,
  listTrades,
  listTransitions,
  type StockWithPrice,
} from "@/db/queries";
import { computePosition } from "@/domain/portfolio";
import { suggestReturn } from "@/domain/review";
import { RetroWorkspace } from "./retro-workspace";

export function RetroTab({ stock }: { stock: StockWithPrice }) {
  const confirmed = listMemos(stock.id).filter((m) => m.status === "confirmed").reverse(); // 오래된 것부터
  const trades = listTrades(stock.id);
  const position = computePosition(trades);
  const buys = trades.filter((t) => t.side === "buy");
  const sells = trades.filter((t) => t.side === "sell").sort((a, b) => a.date.localeCompare(b.date));
  const totalBought = buys.reduce((s, t) => s + t.quantity * t.price + t.fee, 0);
  const unrealized = position.quantity > 0 && stock.price != null ? stock.price * position.quantity - position.costBasis : null;
  const sellTransitions = listTransitions(stock.id).filter((t) => t.toStage === "sold");

  return (
    <RetroWorkspace
      stock={{ id: stock.id, name: stock.name ?? stock.ticker ?? "", stage: stock.stage, currency: stock.currency, price: stock.price }}
      memos={confirmed.map((m) => ({ id: m.id, version: m.version, confirmedAt: m.confirmedAt, snapshot: m.snapshot!, content: m.content }))}
      actual={{
        firstBuyDate: position.firstBuyDate,
        lastTradeDate: position.lastTradeDate,
        lastSellPrice: sells.at(-1)?.price ?? null,
        avgBuyPrice: buys.length ? buys.reduce((s, t) => s + t.quantity * t.price, 0) / buys.reduce((s, t) => s + t.quantity, 0) : null,
        quantity: position.quantity,
        totalBought,
        realizedPnl: position.realizedPnl,
        unrealizedPnl: unrealized,
        suggestedReturn: suggestReturn({ totalBought, realizedPnl: position.realizedPnl, unrealizedPnl: unrealized }),
        sellReasons: sellTransitions.map((t) => ({ at: t.createdAt, type: t.sellReasonType, text: t.sellReasonText })),
      }}
      reviews={listHoldingReviews(stock.id).reverse()}
      bypasses={listStockBypasses(stock.id)}
      retros={listRetrospectives(stock.id)}
      mistakeTags={listMistakeTags().map((t) => t.name)}
    />
  );
}
