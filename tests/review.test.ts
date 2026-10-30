import { describe, expect, it } from "vitest";
import { evaluateSellCondition } from "@/domain/sell-conditions";
import { quadrantOf, retroStats, reviewAlerts, reviewDue, suggestReturn, upcomingCatalysts } from "@/domain/review";
import type { SellCondition } from "@/domain/memo";

const v = (metric: string, year: number, quarter: number, value: number) => ({ metric, year, quarter, value });

// 분기 영업이익률: 2025Q3 12%, 2025Q4 9%, 2026Q1 8%
const quarterly = [
  v("revenue", 2025, 3, 100), v("operating_income", 2025, 3, 12),
  v("revenue", 2025, 4, 100), v("operating_income", 2025, 4, 9),
  v("revenue", 2026, 1, 100), v("operating_income", 2026, 1, 8),
];
const omBelow10 = (periods: number): SellCondition => ({ type: "structured", metric: "operatingMargin", operator: "<", threshold: 0.1, periods, periodType: "quarter", note: "" });

describe("evaluateSellCondition", () => {
  it("최근 2분기 연속 충족", () => {
    const r = evaluateSellCondition(omBelow10(2), quarterly, "KRW");
    expect(r.status).toBe("triggered");
    expect(r.observations.map((o) => o.period)).toEqual(["2025Q4", "2026Q1"]);
    expect(r.detail).toContain("2025Q4 9.0%");
  });

  it("3분기 중 2분기만 충족이면 미충족", () => {
    const r = evaluateSellCondition(omBelow10(3), quarterly, "KRW");
    expect(r.status).toBe("clear");
    expect(r.detail).toContain("3기 중 2기");
  });

  it("연속 기간에 빈 분기가 있으면 수동 확인", () => {
    const r = evaluateSellCondition(omBelow10(4), quarterly, "KRW");
    expect(r.status).toBe("manual");
    expect(r.detail).toContain("2025Q2");
  });

  it("분기 데이터가 아예 없으면 수동 확인 필요", () => {
    const r = evaluateSellCondition(omBelow10(2), [v("revenue", 2025, 0, 100), v("operating_income", 2025, 0, 5)], "KRW");
    expect(r.status).toBe("manual");
    expect(r.detail).toContain("분기 재무 데이터가 없어");
  });

  it("연간 매출 성장률 (전년 대비)", () => {
    const annual = [v("revenue", 2023, 0, 100), v("revenue", 2024, 0, 95), v("revenue", 2025, 0, 90)];
    const c: SellCondition = { type: "structured", metric: "revenueGrowth", operator: "<", threshold: 0, periods: 2, periodType: "annual", note: "" };
    const r = evaluateSellCondition(c, annual, "KRW");
    expect(r.status).toBe("triggered");
    expect(r.observations[0].value).toBeCloseTo(-0.05);
  });

  it("연간 데이터 부족은 데이터 부족", () => {
    const c: SellCondition = { type: "structured", metric: "revenueGrowth", operator: "<", threshold: 0, periods: 2, periodType: "annual", note: "" };
    expect(evaluateSellCondition(c, [v("revenue", 2025, 0, 90)], "KRW").status).toBe("insufficient");
  });

  it("금액 지표", () => {
    const c: SellCondition = { type: "structured", metric: "fcf", operator: "<=", threshold: 0, periods: 1, periodType: "annual", note: "" };
    const r = evaluateSellCondition(c, [v("ocf", 2025, 0, 10), v("capex", 2025, 0, 30)], "USD");
    expect(r.status).toBe("triggered");
    expect(r.detail).toContain("-$20");
  });

  it("서술형은 수동 확인", () => {
    expect(evaluateSellCondition({ type: "text", text: "경영진 교체" }, quarterly, "KRW").status).toBe("manual");
  });
});

describe("reviewDue", () => {
  it("마지막 점검 후 100일", () => {
    expect(reviewDue("2026-07-01", "2026-01-01", "2026-10-09")).toMatchObject({ due: true, elapsed: 100, neverReviewed: false });
    expect(reviewDue("2026-07-01", "2026-01-01", "2026-10-08").due).toBe(false);
  });
  it("점검 기록이 없으면 보유 시작일 기준", () => {
    expect(reviewDue(null, "2026-06-01T09:00:00.000Z", "2026-10-30")).toMatchObject({ due: true, neverReviewed: true, elapsed: 151 });
  });
});

describe("reviewAlerts", () => {
  it("훼손·약화 논리, 충족 조건 (사용자 판단 우선)", () => {
    const a = reviewAlerts({
      theses: [{ thesis: "a", status: "broken", note: "" }, { thesis: "b", status: "weakened", note: "" }, { thesis: "c", status: "valid", note: "" }],
      conditions: [
        { description: "x", status: "triggered", detail: "", userJudgement: "clear" },
        { description: "y", status: "manual", detail: "", userJudgement: "triggered" },
      ],
    });
    expect(a).toEqual(["훼손된 핵심 논리 1개", "약화된 핵심 논리 1개", "충족된 매도 조건 1개"]);
  });
});

describe("복기", () => {
  it("2×2 분류", () => {
    expect(quadrantOf("gain", "hit")).toBe("skill");
    expect(quadrantOf("gain", "miss")).toBe("luck");
    expect(quadrantOf("loss", "hit")).toBe("bad_luck");
    expect(quadrantOf("loss", "miss")).toBe("mistake");
  });

  it("수익률 제안", () => {
    expect(suggestReturn({ totalBought: 1000, realizedPnl: 150, unrealizedPnl: 50 })).toBeCloseTo(0.2);
    expect(suggestReturn({ totalBought: 0, realizedPnl: 0, unrealizedPnl: null })).toBeNull();
  });

  it("통계: 사분면과 실수 태그 누적", () => {
    const s = retroStats([
      { outcome: "loss", process: "miss", tags: ["가정 과낙관", "사이클 정점 매수"] },
      { outcome: "loss", process: "miss", tags: ["가정 과낙관"] },
      { outcome: "gain", process: "hit", tags: [] },
    ]);
    expect(s.quadrants).toEqual({ skill: 1, luck: 0, bad_luck: 0, mistake: 2 });
    expect(s.tags[0]).toEqual({ tag: "가정 과낙관", count: 2 });
  });
});

describe("upcomingCatalysts", () => {
  it("120일 이내 예정 + 60일 이내 지난 것, 날짜순", () => {
    const items = [
      { stockId: 1, stockName: "A", description: "먼 미래", expectedDate: "2027-06-01" },
      { stockId: 1, stockName: "A", description: "곧", expectedDate: "2026-11-15" },
      { stockId: 2, stockName: "B", description: "지남", expectedDate: "2026-10-01" },
      { stockId: 2, stockName: "B", description: "오래 지남", expectedDate: "2026-01-01" },
    ];
    const r = upcomingCatalysts(items, "2026-10-30");
    expect(r.map((x) => x.description)).toEqual(["지남", "곧"]);
    expect(r[0].daysUntil).toBe(-29);
  });
});
