import { describe, expect, it } from "vitest";
import { computeMetrics, quarterlyFromCumulative, summarizeMetrics, type ValueInput } from "@/domain/metrics";

const v = (metric: string, year: number, value: number, quarter = 0): ValueInput => ({ metric, year, quarter, value });

describe("quarterlyFromCumulative", () => {
  it("누적 차이", () => {
    expect(quarterlyFromCumulative({ 1: 10, 2: 25, 3: 45, 4: 70 })).toEqual({ 1: 10, 2: 15, 3: 20, 4: 25 });
  });
  it("중간 누적이 없으면 그 분기와 다음 분기를 비운다", () => {
    expect(quarterlyFromCumulative({ 1: 10, 3: 45, 4: 70 })).toEqual({ 1: 10, 4: 25 });
  });
  it("3개월 단독 값을 우선하고, 누적이 없으면 단독 값으로 누적을 잇는다", () => {
    expect(quarterlyFromCumulative({ 4: 70 }, { 1: 10, 2: 15, 3: 20 })).toEqual({ 1: 10, 2: 15, 3: 20, 4: 25 });
  });
});

describe("computeMetrics", () => {
  const values: ValueInput[] = [
    v("revenue", 2023, 1000), v("operating_income", 2023, 100), v("net_income", 2023, 80),
    v("total_equity", 2023, 500), v("short_term_debt", 2023, 50), v("long_term_debt", 2023, 150), v("cash", 2023, 100),
    v("current_assets", 2023, 400), v("current_liabilities", 2023, 250), v("total_liabilities", 2023, 300),

    v("revenue", 2024, 1200), v("operating_income", 2024, 180), v("net_income", 2024, 120), v("net_income_parent", 2024, 110),
    v("pretax_income", 2024, 150), v("income_tax", 2024, 30),
    v("total_equity", 2024, 600), v("equity_parent", 2024, 550), v("short_term_debt", 2024, 50), v("long_term_debt", 2024, 150),
    v("cash", 2024, 200), v("current_assets", 2024, 500), v("current_liabilities", 2024, 260), v("total_liabilities", 2024, 330),
    v("ocf", 2024, 150), v("capex", 2024, 60),
    v("revenue", 2024, 300, 1), // 분기 값은 연간 계산에서 제외
  ];
  const rows = computeMetrics(values, "annual", { maintenanceCapexPct: 50 });
  const r24 = rows.find((r) => r.key === "2024")!;
  const r23 = rows.find((r) => r.key === "2023")!;

  it("연간 기간만", () => {
    expect(rows.map((r) => r.key)).toEqual(["2023", "2024"]);
  });

  it("이익률, FCF, OCF/순이익", () => {
    expect(r24.operatingMargin).toBeCloseTo(0.15);
    expect(r24.netMargin).toBeCloseTo(0.1);
    expect(r24.fcf).toBe(90);
    expect(r24.ocfToNetIncome).toBeCloseTo(1.25);
  });

  it("유지/성장 CAPEX와 소유주 FCF", () => {
    expect(r24.maintenanceCapex).toBe(30);
    expect(r24.growthCapex).toBe(30);
    expect(r24.ownerFcf).toBe(120);
  });

  it("ROE = 지배주주순이익 / 평균 지배주주지분 (직전 연도는 자본총계로 대체)", () => {
    expect(r24.roe).toBeCloseTo(110 / ((550 + 500) / 2));
  });

  it("ROIC = 영업이익 × (1 − 실효세율) / 평균 투하자본", () => {
    // 실효세율 30/150 = 20%. 투하자본 2023: 500+200−100 = 600, 2024: 600+200−200 = 600
    expect(r24.taxRate).toBeCloseTo(0.2);
    expect(r24.roic).toBeCloseTo((180 * 0.8) / 600);
    // 2023은 세율 정보가 없어 기본 25%
    expect(r23.taxRate).toBe(0.25);
  });

  it("부채비율, 순부채, 순운전자본 변화", () => {
    expect(r24.debtRatio).toBeCloseTo(330 / 600);
    expect(r24.netDebt).toBe(0);
    // NWC 2023: (400−100) − (250−50) = 100, 2024: (500−200) − (260−50) = 90
    expect(r23.nwc).toBe(100);
    expect(r24.nwc).toBe(90);
    expect(r24.nwcChange).toBe(-10);
    expect(r23.nwcChange).toBeNull();
  });

  it("순이익이 0 이하이면 OCF/순이익은 null", () => {
    const [r] = computeMetrics([v("net_income", 2024, -10), v("ocf", 2024, 5)], "annual");
    expect(r.ocfToNetIncome).toBeNull();
  });

  it("분기 ROE는 연환산", () => {
    const q = computeMetrics([v("net_income", 2024, 10, 2), v("total_equity", 2024, 400, 2)], "quarter");
    expect(q[0].roe).toBeCloseTo(0.1);
  });

  it("유지 CAPEX 비율이 없으면 구분하지 않는다", () => {
    const [r] = computeMetrics([v("ocf", 2024, 100), v("capex", 2024, 40)], "annual");
    expect(r.maintenanceCapex).toBeNull();
    expect(r.ownerFcf).toBeNull();
    expect(r.fcf).toBe(60);
  });
});

describe("summarizeMetrics", () => {
  it("매출 CAGR, 평균, 누적 OCF/순이익", () => {
    const rows = computeMetrics(
      [
        v("revenue", 2020, 100), v("revenue", 2022, 121),
        v("net_income", 2020, 10), v("ocf", 2020, 12), v("capex", 2020, 20),
        v("net_income", 2022, 20), v("ocf", 2022, 18), v("capex", 2022, 5),
      ],
      "annual",
    );
    const s = summarizeMetrics(rows, 10);
    expect(s.revenueCagr).toBeCloseTo(0.1);
    expect(s.cumulativeOcfToNetIncome).toBeCloseTo(30 / 30);
    expect(s.positiveFcfYears).toBe(1);
    expect(s.fcfYears).toBe(2);
  });
});
