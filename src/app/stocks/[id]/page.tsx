import Link from "next/link";
import { notFound } from "next/navigation";
import { updateStock } from "@/app/actions/stocks";
import { DeleteStockButton } from "@/components/stocks/delete-stock-button";
import { AnalysisTab } from "@/components/analysis/analysis-tab";
import { StockChecklists } from "@/components/analysis/stock-checklists";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { FilterChecklist } from "@/components/stocks/filter-checklist";
import { PricePanel } from "@/components/stocks/price-panel";
import { StageControls } from "@/components/stocks/stage-controls";
import { StockForm } from "@/components/stocks/stock-form";
import { TransitionList } from "@/components/stocks/transition-list";
import {
  getPrinciples,
  getStock,
  getStockChecklists,
  listFilterItems,
  listFilterResults,
  listPrices,
  listTemplates,
  listTransitions,
} from "@/db/queries";
import { formatPrice } from "@/domain/format";
import { STAGE_LABELS } from "@/domain/pipeline";
import { DISCOVERY_SOURCES, MARKETS, displayName, isInWatchRange } from "@/domain/stock";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "개요" },
  { key: "filter", label: "1차 필터" },
  { key: "analysis", label: "심층 분석" },
  { key: "checklists", label: "체크리스트" },
  { key: "valuation", label: "가치평가", soon: 4 },
  { key: "memo", label: "투자 메모", soon: 5 },
  { key: "trades", label: "매매·비중", soon: 5 },
  { key: "reviews", label: "보유 점검", soon: 6 },
  { key: "retro", label: "복기", soon: 6 },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function StockPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; sub?: string }>;
}) {
  const { id: idParam } = await params;
  const { tab: tabParam, sub } = await searchParams;
  const id = Number(idParam);
  const stock = Number.isInteger(id) ? getStock(id) : null;
  if (!stock) notFound();

  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "overview";
  const label = displayName(stock);
  const inRange = isInWatchRange(stock.price, stock.watchLow, stock.watchHigh);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold">{label}</h1>
            <Badge tone={stock.stage === "rejected" ? "danger" : "accent"}>{STAGE_LABELS[stock.stage]}</Badge>
            {inRange && <Badge tone="ok">관심가 진입</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted">
            {MARKETS[stock.market]} · {stock.ticker ?? "티커 없음"} · {stock.industry ?? "산업 미지정"} · 현재가{" "}
            <span className="text-fg">{formatPrice(stock.price, stock.currency)}</span>
            {stock.priceDate && <> ({stock.priceDate})</>}
          </p>
          {stock.stage === "rejected" && stock.rejectReason && (
            <p className="mt-1 text-sm text-danger">
              {STAGE_LABELS[stock.rejectedFromStage ?? "idea"]} 단계에서 탈락: {stock.rejectReason}
            </p>
          )}
        </div>
        <StageControls
          stock={{ id: stock.id, label, stage: stock.stage, rejectedFromStage: stock.rejectedFromStage }}
        />
      </div>

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/stocks/${stock.id}?tab=${t.key}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              tab === t.key ? "border-accent font-semibold" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <Overview stockId={stock.id} />}
      {tab === "filter" && (
        <FilterChecklist
          stock={{ id: stock.id, label, market: stock.market, stage: stock.stage }}
          items={listFilterItems()}
          results={listFilterResults(stock.id)}
        />
      )}
      {tab === "analysis" && <AnalysisTab stock={stock} sub={sub} />}
      {tab === "checklists" && (
        <StockChecklists
          stockId={stock.id}
          applied={getStockChecklists(stock.id)}
          templates={listTemplates().map((t) => ({ id: t.template.id, name: t.template.name }))}
        />
      )}
      {TABS.map((t) =>
        "soon" in t && t.key === tab ? (
          <Card key={t.key}>
            <EmptyState>{t.label} 화면은 개발 {t.soon}단계에서 추가됩니다.</EmptyState>
          </Card>
        ) : null,
      )}
    </>
  );
}

function Overview({ stockId }: { stockId: number }) {
  const stock = getStock(stockId)!;
  const { data: principles } = getPrinciples();
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader
            title="기본 정보"
            description={`발굴 경로: ${DISCOVERY_SOURCES[stock.discoverySource]}${stock.discoverySourceNote ? ` · ${stock.discoverySourceNote}` : ""}`}
          />
          <div className="p-4">
            <StockForm
              mode="edit"
              action={updateStock.bind(null, stock.id)}
              industries={principles.industries}
              initial={stock}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="단계 이동 기록" />
          <TransitionList items={listTransitions(stock.id)} />
        </Card>
      </div>
      <div className="flex flex-col gap-5">
        <PricePanel stockId={stock.id} currency={stock.currency} prices={listPrices(stock.id)} />
        <Card className="p-4">
          <p className="mb-2 text-xs text-muted">
            종목과 모든 기록을 지웁니다. 판단 기록을 남기려면 삭제 대신 탈락 처리하세요.
          </p>
          <DeleteStockButton stockId={stock.id} label={displayName(stock)} />
        </Card>
      </div>
    </div>
  );
}
