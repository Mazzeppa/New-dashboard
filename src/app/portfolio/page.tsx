import Link from "next/link";
import { Alert, Card, CardHeader, DownloadButton, EmptyState, PageHeader, Table } from "@/components/ui";
import { CashFxEditor } from "@/components/portfolio/cash-fx-editor";
import { ExposureBars } from "@/components/portfolio/exposure-bars";
import { getPrinciples, latestFxRates, listCashBalances, listFxRates, listPositions } from "@/db/queries";
import { formatAmount, formatNumber, formatPrice, formatRatio } from "@/domain/format";
import { STAGE_LABELS } from "@/domain/pipeline";
import { buildPortfolio, krwRate } from "@/domain/portfolio";
import { cn } from "@/lib/cn";
import { PriceRefreshBar } from "@/components/price-refresh-bar";
import { autoRefreshEnabled, lastRefresh, refreshDue } from "@/lib/server/price-refresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "포트폴리오" };


export default function PortfolioPage() {
  const { data: principles } = getPrinciples();
  const positions = listPositions();
  const fxLatest = latestFxRates();
  const fx = Object.fromEntries(Object.entries(fxLatest).map(([k, v]) => [k, v.rate]));
  const cash = listCashBalances();
  const p = buildPortfolio({
    holdings: positions.map(({ stock: s, position: pos, tags }) => ({
      stockId: s.id, name: s.name ?? s.ticker ?? "", industry: s.industry, currency: s.currency, tags,
      quantity: pos.quantity, avgCost: pos.avgCost, costBasis: pos.costBasis, price: s.price,
    })),
    cash,
    fx,
    maxPositionPct: principles.maxPositionPct,
    maxIndustryPct: principles.maxIndustryPct,
  });
  const stockById = new Map(positions.map((x) => [x.stock.id, x]));
  const closed = positions.filter((x) => x.position.quantity === 0 && x.position.realizedPnl !== 0);
  const realizedKrw = positions.reduce((s, x) => s + x.position.realizedPnl * (krwRate(x.stock.currency, fx) ?? 0), 0);
  const needed = [...new Set([...positions.map((x) => x.stock.currency), ...cash.map((c) => c.currency)])];

  return (
    <>
      <PageHeader
        title="포트폴리오"
        description="원화 기준 환산. 비중은 현금을 포함한 총액 대비입니다. 한도는 투자 원칙에서 가져옵니다."
        actions={
          <div className="flex flex-wrap items-start justify-end gap-3">
            <PriceRefreshBar last={lastRefresh()} autoDue={autoRefreshEnabled() && refreshDue()} />
            <DownloadButton href="/api/export/portfolio">보유 종목 CSV</DownloadButton>
            <DownloadButton href="/api/export/trades">매매 기록 CSV</DownloadButton>
          </div>
        }
      />
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5">
          {[
            ["총액", formatAmount(p.totalKrw, "KRW")],
            ["주식 평가액", formatAmount(p.investedKrw, "KRW")],
            ["현금", `${formatAmount(p.cashKrw, "KRW")} (${formatNumber(p.totalKrw ? (p.cashKrw / p.totalKrw) * 100 : 0, 1)}%)`],
            ["평가손익", formatAmount(p.unrealizedKrw, "KRW")],
            ["실현손익 누적", formatAmount(realizedKrw, "KRW")],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-4 py-3">
              <div className="text-xs text-muted">{k}</div>
              <div className="mt-0.5 text-lg font-semibold tabular-nums">{v}</div>
            </div>
          ))}
        </div>

        {p.warnings.length > 0 && (
          <Alert tone="danger" title="점검 필요">
            <ul className="list-disc pl-5">
              {p.warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          </Alert>
        )}

        <Card>
          <CardHeader title="보유 종목" description={`종목당 최대 ${principles.maxPositionPct}% · 산업당 최대 ${principles.maxIndustryPct}%`} />
          {p.rows.length === 0 ? (
            <EmptyState>{"보유 종목이 없습니다. 종목의 '매매·비중' 탭에서 매수를 기록하세요."}</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>종목</th>
                  <th>산업</th>
                  <th className="text-right">수량</th>
                  <th className="text-right">평균단가</th>
                  <th className="text-right">현재가</th>
                  <th className="text-right">평가액(원)</th>
                  <th className="text-right">비중</th>
                  <th className="text-right">평가손익</th>
                </tr>
              </thead>
              <tbody>
                {p.rows
                  .sort((a, b) => (b.marketValueKrw ?? 0) - (a.marketValueKrw ?? 0))
                  .map((r) => {
                    const stage = stockById.get(r.stockId)?.stock.stage;
                    return (
                      <tr key={r.stockId}>
                        <td>
                          <Link href={`/stocks/${r.stockId}?tab=trades`} className="font-medium hover:underline">
                            {r.name}
                          </Link>
                          <div className="text-xs text-muted">
                            {r.currency}
                            {stage && stage !== "holding" && <span className="ml-1 text-warn">· 단계 {STAGE_LABELS[stage]}</span>}
                            {r.tags.length > 0 && ` · ${r.tags.join(", ")}`}
                          </div>
                        </td>
                        <td>{r.industry ?? <span className="text-muted">미지정</span>}</td>
                        <td className="num">{formatNumber(r.quantity, 4)}</td>
                        <td className="num">{formatPrice(r.avgCost, r.currency)}</td>
                        <td className="num">{r.price == null ? <span className="text-danger">없음</span> : formatPrice(r.price, r.currency)}</td>
                        <td className="num">{r.marketValueKrw == null ? <span className="text-danger">-</span> : formatAmount(r.marketValueKrw, "KRW")}</td>
                        <td className={cn("num", r.weight != null && r.weight > principles.maxPositionPct && "font-semibold text-danger")}>
                          {r.weight == null ? "-" : `${formatNumber(r.weight, 1)}%`}
                        </td>
                        <td className={cn("num", r.unrealizedPnl != null && r.unrealizedPnl < 0 && "text-danger", r.unrealizedPnl != null && r.unrealizedPnl > 0 && "text-ok")}>
                          {r.unrealizedPnl == null ? "-" : `${formatAmount(r.unrealizedPnl, r.currency)} (${formatRatio(r.unrealizedPct)})`}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </Table>
          )}
        </Card>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card>
            <CardHeader title="산업별 노출" description={`점선: 산업당 최대 ${principles.maxIndustryPct}%`} />
            <div className="p-4">
              <ExposureBars items={p.byIndustry} limit={principles.maxIndustryPct} />
            </div>
          </Card>
          <Card>
            <CardHeader title="통화별 노출" description="현금 포함" />
            <div className="p-4">
              <ExposureBars items={p.byCurrency} />
            </div>
          </Card>
          <Card>
            <CardHeader title="위험요인별 노출" description="종목 개요에서 붙인 태그 기준" />
            <div className="p-4">
              <ExposureBars items={p.byTag} note="한 종목에 태그가 여럿이면 각각에 더해지므로 합계가 100%를 넘을 수 있습니다." />
            </div>
          </Card>
        </div>

        {closed.length > 0 && (
          <Card>
            <CardHeader title="정리한 종목 (실현손익)" />
            <Table>
              <thead>
                <tr>
                  <th>종목</th>
                  <th>마지막 매매</th>
                  <th className="text-right">실현손익</th>
                </tr>
              </thead>
              <tbody>
                {closed.map(({ stock, position }) => (
                  <tr key={stock.id}>
                    <td>
                      <Link href={`/stocks/${stock.id}?tab=trades`} className="hover:underline">
                        {stock.name ?? stock.ticker}
                      </Link>
                    </td>
                    <td>{position.lastTradeDate}</td>
                    <td className={cn("num", position.realizedPnl < 0 ? "text-danger" : "text-ok")}>{formatAmount(position.realizedPnl, stock.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}

        <CashFxEditor cash={cash} fxRates={listFxRates()} latest={fxLatest} neededCurrencies={needed} />
      </div>
    </>
  );
}
