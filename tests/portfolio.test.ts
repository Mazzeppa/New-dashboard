import { describe, expect, it } from "vitest";
import { buildPortfolio, computePosition, krwRate } from "@/domain/portfolio";

describe("computePosition (이동평균)", () => {
  it("분할 매수 평균단가에 수수료 포함", () => {
    const p = computePosition([
      { date: "2025-01-02", side: "buy", quantity: 10, price: 100, fee: 10 },
      { date: "2025-02-02", side: "buy", quantity: 10, price: 120, fee: 10 },
    ]);
    expect(p.quantity).toBe(20);
    expect(p.costBasis).toBe(2220);
    expect(p.avgCost).toBe(111);
    expect(p.firstBuyDate).toBe("2025-01-02");
  });

  it("일부 매도: 평균단가 유지, 실현손익 = 매도대금 − 수수료 − 평균원가", () => {
    const p = computePosition([
      { date: "2025-01-02", side: "buy", quantity: 10, price: 100, fee: 10 },
      { date: "2025-02-02", side: "buy", quantity: 10, price: 120, fee: 10 },
      { date: "2025-03-02", side: "sell", quantity: 5, price: 150, fee: 5 },
    ]);
    expect(p.quantity).toBe(15);
    expect(p.avgCost).toBeCloseTo(111);
    expect(p.realizedPnl).toBeCloseTo(5 * 150 - 5 - 5 * 111);
    expect(p.totalFees).toBe(25);
  });

  it("전량 매도 후 재매수", () => {
    const p = computePosition([
      { date: "2025-01-02", side: "buy", quantity: 10, price: 100, fee: 0 },
      { date: "2025-02-02", side: "sell", quantity: 10, price: 80, fee: 0 },
      { date: "2025-03-02", side: "buy", quantity: 5, price: 90, fee: 0 },
    ]);
    expect(p.quantity).toBe(5);
    expect(p.avgCost).toBe(90);
    expect(p.realizedPnl).toBe(-200);
  });

  it("날짜순으로 계산하고, 보유보다 많이 판 기록은 제외하고 알림", () => {
    const p = computePosition([
      { date: "2025-03-01", side: "sell", quantity: 5, price: 100, fee: 0 },
      { date: "2025-01-01", side: "buy", quantity: 3, price: 100, fee: 0 },
    ]);
    expect(p.quantity).toBe(3);
    expect(p.errors[0]).toContain("보유 수량(3)보다 많이 매도");
  });
});

describe("krwRate", () => {
  it("KRW는 1, 없으면 null", () => {
    expect(krwRate("KRW", {})).toBe(1);
    expect(krwRate("USD", { USD: 1380 })).toBe(1380);
    expect(krwRate("CHF", {})).toBeNull();
  });
});

describe("buildPortfolio", () => {
  const holdings = [
    { stockId: 1, name: "삼성전자", industry: "반도체", currency: "KRW", tags: ["메모리 사이클"], quantity: 100, avgCost: 80000, costBasis: 8_000_000, price: 100000 },
    { stockId: 2, name: "Apple", industry: "소비자 전자", currency: "USD", tags: ["미국 소비"], quantity: 10, avgCost: 150, costBasis: 1500, price: 200 },
    { stockId: 3, name: "SK하이닉스", industry: "반도체", currency: "KRW", tags: ["메모리 사이클"], quantity: 10, avgCost: 100000, costBasis: 1_000_000, price: 200000 },
    { stockId: 4, name: "Nestle", industry: "식품", currency: "CHF", tags: [], quantity: 10, avgCost: 90, costBasis: 900, price: 80 },
    { stockId: 5, name: "매도 완료", industry: "식품", currency: "KRW", tags: [], quantity: 0, avgCost: null, costBasis: 0, price: 1 },
  ];
  const p = buildPortfolio({
    holdings,
    cash: [{ currency: "KRW", amount: 5_000_000 }, { currency: "USD", amount: 1000 }],
    fx: { USD: 1400 },
    maxPositionPct: 40,
    maxIndustryPct: 50,
  });

  it("원화 환산 합계 (현금 포함, 환율 없는 종목 제외)", () => {
    // 삼성 1,000만 + Apple 2,000×1,400 = 280만 + 하이닉스 200만 = 1,480만, 현금 500만 + 140만
    expect(p.investedKrw).toBe(14_800_000);
    expect(p.cashKrw).toBe(6_400_000);
    expect(p.totalKrw).toBe(21_200_000);
    expect(p.rows).toHaveLength(4);
  });

  it("비중과 평가손익", () => {
    const ss = p.rows.find((r) => r.stockId === 1)!;
    expect(ss.weight).toBeCloseTo((10_000_000 / 21_200_000) * 100);
    expect(ss.unrealizedPnl).toBe(2_000_000);
    expect(ss.unrealizedPct).toBeCloseTo(0.25);
    const aapl = p.rows.find((r) => r.stockId === 2)!;
    expect(aapl.unrealizedPnlKrw).toBe(500 * 1400);
  });

  it("환율 없는 종목은 경고", () => {
    const nestle = p.rows.find((r) => r.stockId === 4)!;
    expect(nestle.missing).toEqual(["fx"]);
    expect(p.warnings.some((w) => w.kind === "missing" && w.message.includes("CHF 환율"))).toBe(true);
  });

  it("노출도: 산업·통화(현금 포함)·태그", () => {
    expect(p.byIndustry[0]).toMatchObject({ key: "반도체", valueKrw: 12_000_000 });
    expect(p.byCurrency.find((e) => e.key === "USD")!.valueKrw).toBe(2_800_000 + 1_400_000);
    expect(p.byTag[0]).toMatchObject({ key: "메모리 사이클", valueKrw: 12_000_000 });
  });

  it("종목·산업 한도 초과 경고", () => {
    expect(p.warnings.some((w) => w.kind === "position" && w.stockId === 1)).toBe(true);
    expect(p.warnings.some((w) => w.kind === "industry" && w.message.includes("반도체"))).toBe(true);
  });
});
