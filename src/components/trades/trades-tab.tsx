import {
  getPrinciples,
  getValuation,
  latestFxRates,
  listCashBalances,
  listPositionPlans,
  listPositions,
  listTrades,
  type StockWithPrice,
} from "@/db/queries";
import { buildPortfolio, computePosition, krwRate } from "@/domain/portfolio";
import { summarize } from "@/domain/valuation";
import { TradesWorkspace } from "./trades-workspace";

export function TradesTab({ stock }: { stock: StockWithPrice }) {
  const trades = listTrades(stock.id);
  const position = computePosition(trades);
  const { data: principles } = getPrinciples();
  const fxLatest = latestFxRates();
  const fx = Object.fromEntries(Object.entries(fxLatest).map(([k, v]) => [k, v.rate]));
  const portfolio = buildPortfolio({
    holdings: listPositions().map(({ stock: s, position: p, tags }) => ({
      stockId: s.id, name: s.name ?? s.ticker ?? "", industry: s.industry, currency: s.currency, tags,
      quantity: p.quantity, avgCost: p.avgCost, costBasis: p.costBasis, price: s.price,
    })),
    cash: listCashBalances(),
    fx,
    maxPositionPct: principles.maxPositionPct,
    maxIndustryPct: principles.maxIndustryPct,
  });
  const mine = portfolio.rows.find((r) => r.stockId === stock.id);
  const industryOthers = stock.industry
    ? portfolio.rows.filter((r) => r.industry === stock.industry && r.stockId !== stock.id).reduce((s, r) => s + (r.weight ?? 0), 0)
    : null;
  const valuation = getValuation(stock.id);
  const summary = valuation ? summarize(valuation.data, stock.price) : null;

  return (
    <TradesWorkspace
      stock={{ id: stock.id, name: stock.name ?? stock.ticker ?? "", stage: stock.stage, currency: stock.currency, industry: stock.industry, price: stock.price }}
      trades={trades}
      position={position}
      plans={listPositionPlans(stock.id)}
      sizing={{
        principles: {
          maxLossPerPositionPct: principles.maxLossPerPositionPct,
          maxPositionPct: principles.maxPositionPct,
          maxIndustryPct: principles.maxIndustryPct,
          convictionBands: principles.convictionBands,
          industries: principles.industries,
        },
        bearDownside: summary?.bearDownside ?? null,
        bearValue: summary?.representativeValues.bear ?? null,
        portfolioTotalKrw: portfolio.totalKrw,
        currentWeight: mine?.weight ?? 0,
        industryOthersPct: industryOthers,
        fxRate: krwRate(stock.currency, fx),
        fxDate: fxLatest[stock.currency]?.date ?? null,
      }}
    />
  );
}
