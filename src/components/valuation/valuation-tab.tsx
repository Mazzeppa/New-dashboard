import { getValuation, listFinancialValues, type StockWithPrice } from "@/db/queries";
import { emptyValuation, suggestInputs } from "@/domain/valuation";
import { ValuationWorkspace } from "./workspace";

export function ValuationTab({ stock }: { stock: StockWithPrice }) {
  const saved = getValuation(stock.id);
  const values = listFinancialValues(stock.id).map((v) => ({ metric: v.metric, year: v.fiscalYear, quarter: v.fiscalQuarter, value: v.value }));
  return (
    <ValuationWorkspace
      key={saved?.updatedAt ?? "new"}
      stockId={stock.id}
      currency={stock.currency}
      price={stock.price}
      priceDate={stock.priceDate}
      initial={saved ? { ...emptyValuation(), ...saved.data } : emptyValuation()}
      updatedAt={saved?.updatedAt ?? null}
      suggestions={suggestInputs(values, stock.maintenanceCapexPct)}
    />
  );
}
