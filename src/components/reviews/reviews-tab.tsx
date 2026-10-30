import { listFinancialValues, listHoldingReviews, listMemos, type StockWithPrice } from "@/db/queries";
import { evaluateSellCondition } from "@/domain/sell-conditions";
import { reviewDue } from "@/domain/review";
import { today } from "@/lib/action";
import { ReviewsWorkspace } from "./reviews-workspace";

export function ReviewsTab({ stock }: { stock: StockWithPrice }) {
  const memos = listMemos(stock.id);
  // 최신 확정본을 기준으로 점검한다 (확정본이 없으면 작성 중인 메모). memos는 최신 버전이 앞
  const basis = memos.find((m) => m.status === "confirmed") ?? memos[0] ?? null;
  const values = listFinancialValues(stock.id).map((v) => ({ metric: v.metric, year: v.fiscalYear, quarter: v.fiscalQuarter, value: v.value }));
  const evaluations = (basis?.content.sellConditions ?? []).map((c) => evaluateSellCondition(c, values, stock.currency, { maintenanceCapexPct: stock.maintenanceCapexPct }));
  const reviews = listHoldingReviews(stock.id);
  const due = stock.stage === "holding" ? reviewDue(reviews[0]?.reviewDate ?? null, stock.stageChangedAt, today()) : null;

  return (
    <ReviewsWorkspace
      key={reviews.length}
      stock={{ id: stock.id, name: stock.name ?? stock.ticker ?? "", stage: stock.stage, currency: stock.currency, price: stock.price }}
      memo={basis ? { id: basis.id, version: basis.version, status: basis.status, theses: basis.content.theses, catalysts: basis.content.catalysts } : null}
      evaluations={evaluations}
      reviews={reviews}
      due={due}
    />
  );
}
