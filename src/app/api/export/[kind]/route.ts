import { NextResponse, type NextRequest } from "next/server";
import {
  getPrinciples,
  getStock,
  latestFxRates,
  listAllRetrospectives,
  listCashBalances,
  listFinancialValues,
  listPositions,
  listStocks,
  listTrades,
} from "@/db/queries";
import { gridToCsv, toCsv } from "@/domain/csv";
import { comparePeriods, METRICS, periodKey, type Period } from "@/domain/financials";
import { STAGE_LABELS } from "@/domain/pipeline";
import { buildPortfolio } from "@/domain/portfolio";
import { OUTCOMES, PROCESSES, QUADRANTS, quadrantOf } from "@/domain/review";
import { DISCOVERY_SOURCES, MARKETS, displayName } from "@/domain/stock";
import { today } from "@/lib/action";

function csv(body: string, name: string) {
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${name}-${today()}.csv`)}`,
    },
  });
}

/**
 * 표 데이터 CSV 내보내기.
 * stocks | trades | portfolio | retrospectives | financials (?stockId=&period=annual|quarter)
 * 금액은 원 단위(거래 통화) 그대로 내보낸다.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const sp = req.nextUrl.searchParams;

  switch (kind) {
    case "stocks": {
      const rows = listStocks({ includeRejected: true });
      return csv(
        toCsv(rows, [
          { header: "id", value: (s) => s.id },
          { header: "시장", value: (s) => MARKETS[s.market] },
          { header: "티커", value: (s) => s.ticker },
          { header: "종목명", value: (s) => s.name },
          { header: "통화", value: (s) => s.currency },
          { header: "산업", value: (s) => s.industry },
          { header: "단계", value: (s) => STAGE_LABELS[s.stage] },
          { header: "단계 변경일", value: (s) => s.stageChangedAt.slice(0, 10) },
          { header: "발굴 경로", value: (s) => DISCOVERY_SOURCES[s.discoverySource] },
          { header: "메모", value: (s) => s.note },
          { header: "현재가", value: (s) => s.price },
          { header: "가격일", value: (s) => s.priceDate },
          { header: "관심가 하한", value: (s) => s.watchLow },
          { header: "관심가 상한", value: (s) => s.watchHigh },
          { header: "탈락 사유", value: (s) => s.rejectReason },
        ]),
        "종목",
      );
    }
    case "trades": {
      const stockId = sp.get("stockId");
      const stocks = new Map(listStocks({ includeRejected: true }).map((s) => [s.id, s]));
      const ids = stockId ? [Number(stockId)] : [...stocks.keys()];
      const rows = ids.flatMap((id) => listTrades(id)).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
      return csv(
        toCsv(rows, [
          { header: "날짜", value: (t) => t.date },
          { header: "종목", value: (t) => (stocks.get(t.stockId) ? displayName(stocks.get(t.stockId)!) : t.stockId) },
          { header: "티커", value: (t) => stocks.get(t.stockId)?.ticker },
          { header: "구분", value: (t) => (t.side === "buy" ? "매수" : "매도") },
          { header: "수량", value: (t) => t.quantity },
          { header: "가격", value: (t) => t.price },
          { header: "통화", value: (t) => t.currency },
          { header: "수수료", value: (t) => t.fee },
          { header: "메모", value: (t) => t.memo },
        ]),
        "매매기록",
      );
    }
    case "portfolio": {
      const { data: principles } = getPrinciples();
      const fx = Object.fromEntries(Object.entries(latestFxRates()).map(([k, v]) => [k, v.rate]));
      const p = buildPortfolio({
        holdings: listPositions().map(({ stock: s, position: pos, tags }) => ({
          stockId: s.id, name: displayName(s), industry: s.industry, currency: s.currency, tags,
          quantity: pos.quantity, avgCost: pos.avgCost, costBasis: pos.costBasis, price: s.price,
        })),
        cash: listCashBalances(),
        fx,
        maxPositionPct: principles.maxPositionPct,
        maxIndustryPct: principles.maxIndustryPct,
      });
      return csv(
        toCsv(p.rows, [
          { header: "종목", value: (r) => r.name },
          { header: "산업", value: (r) => r.industry },
          { header: "통화", value: (r) => r.currency },
          { header: "수량", value: (r) => r.quantity },
          { header: "평균단가", value: (r) => r.avgCost },
          { header: "현재가", value: (r) => r.price },
          { header: "평가액(현지)", value: (r) => r.marketValue },
          { header: "평가액(원)", value: (r) => r.marketValueKrw },
          { header: "비중(%)", value: (r) => (r.weight == null ? null : Math.round(r.weight * 100) / 100) },
          { header: "평가손익(현지)", value: (r) => r.unrealizedPnl },
          { header: "수익률", value: (r) => (r.unrealizedPct == null ? null : Math.round(r.unrealizedPct * 10000) / 10000) },
          { header: "위험요인", value: (r) => r.tags.join("; ") },
        ]),
        "포트폴리오",
      );
    }
    case "retrospectives": {
      const rows = listAllRetrospectives();
      return csv(
        toCsv(rows, [
          { header: "날짜", value: (r) => r.date },
          { header: "종목", value: (r) => r.stockName },
          { header: "종류", value: (r) => (r.kind === "final" ? "매도 후" : "중간") },
          { header: "결과", value: (r) => OUTCOMES[r.outcome] },
          { header: "과정", value: (r) => PROCESSES[r.process] },
          { header: "분류", value: (r) => QUADRANTS[quadrantOf(r.outcome, r.process)].label },
          { header: "수익률", value: (r) => (r.returnPct == null ? null : Math.round(r.returnPct * 10000) / 10000) },
          { header: "실수 태그", value: (r) => r.tags.join("; ") },
          { header: "무슨 일이 있었나", value: (r) => r.whatHappened },
          { header: "교훈", value: (r) => r.lessons },
        ]),
        "복기",
      );
    }
    case "financials": {
      const stockId = Number(sp.get("stockId"));
      const stock = getStock(stockId);
      if (!stock) return NextResponse.json({ error: "종목을 찾을 수 없습니다." }, { status: 404 });
      const quarterly = sp.get("period") === "quarter";
      const values = listFinancialValues(stockId).filter((v) => (quarterly ? v.fiscalQuarter > 0 : v.fiscalQuarter === 0));
      const periods = [...new Map(values.map((v) => [periodKey({ year: v.fiscalYear, quarter: v.fiscalQuarter }), { year: v.fiscalYear, quarter: v.fiscalQuarter } as Period])).values()].sort(comparePeriods);
      const byKey = new Map(values.map((v) => [`${v.metric}|${periodKey({ year: v.fiscalYear, quarter: v.fiscalQuarter })}`, v.value]));
      // 붙여넣기 화면에 그대로 다시 넣을 수 있는 형식 (첫 열 계정명, 첫 행 기간, 원 단위)
      const grid = [
        [`계정 (${stock.currency}, 원 단위)`, ...periods.map(periodKey)],
        ...METRICS.map((m) => [m.label, ...periods.map((p) => byKey.get(`${m.key}|${periodKey(p)}`) ?? null)]),
      ];
      return csv(gridToCsv(grid), `${displayName(stock)}-재무-${quarterly ? "분기" : "연간"}`);
    }
    default:
      return NextResponse.json({ error: `알 수 없는 내보내기 종류: ${kind}` }, { status: 404 });
  }
}
