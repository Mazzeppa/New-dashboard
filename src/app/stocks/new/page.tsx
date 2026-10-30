import { createStock } from "@/app/actions/stocks";
import { Card, PageHeader } from "@/components/ui";
import { StockForm } from "@/components/stocks/stock-form";
import { getPrinciples } from "@/db/queries";

export const dynamic = "force-dynamic";

export default function NewStockPage() {
  const { data } = getPrinciples();
  return (
    <>
      <PageHeader title="종목 추가" description="아이디어 단계로 등록합니다. 여러 종목은 '후보 가져오기'에서 CSV로 한 번에 등록하세요." />
      <Card className="max-w-3xl p-5">
        <StockForm action={createStock} industries={data.industries} mode="create" />
      </Card>
    </>
  );
}
