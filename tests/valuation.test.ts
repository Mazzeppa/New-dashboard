import { describe, expect, it } from "vitest";
import {
  dcf,
  dcfSensitivity,
  emptyValuation,
  evEbitValue,
  hasValuationResult,
  navValue,
  perValue,
  reverseDcf,
  suggestInputs,
  summarize,
  valuationDataSchema,
  type DcfInput,
  type ValuationData,
} from "@/domain/valuation";

// 손으로 계산한 예: OE₀=100, g=10%, 2년, r=10%, g_t=2%
//   1년 110/1.1 = 100, 2년 121/1.21 = 100 → 예측 기간 PV 200
//   잔존가치 121×1.02/0.08 = 1542.75 → PV 1542.75/1.21 = 1275
//   기업가치 1475 + 순현금 50 = 1525 → 주당 152.5 (주식 10주)
const base: DcfInput = { ownerEarnings: 100, growth: 0.1, years: 2, discountRate: 0.1, terminalGrowth: 0.02 };

describe("dcf", () => {
  it("손 계산과 일치", () => {
    const r = dcf(base, 10, 50);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pvForecast).toBeCloseTo(200, 9);
    expect(r.value.terminalValue).toBeCloseTo(1542.75, 9);
    expect(r.value.pvTerminal).toBeCloseTo(1275, 9);
    expect(r.value.enterpriseValue).toBeCloseTo(1475, 9);
    expect(r.value.equityValue).toBeCloseTo(1525, 9);
    expect(r.value.perShare).toBeCloseTo(152.5, 9);
    expect(r.value.terminalShare).toBeCloseTo(1275 / 1475, 9);
  });

  it("순부채는 주주가치에서 뺀다", () => {
    const r = dcf(base, 10, -475);
    expect(r.ok && r.value.perShare).toBeCloseTo(100, 9);
  });

  it("순현금 미입력은 0으로 본다", () => {
    const r = dcf(base, 10, null);
    expect(r.ok && r.value.perShare).toBeCloseTo(147.5, 9);
  });

  it("할인율 ≤ 영구성장률이면 계산하지 않는다", () => {
    const r = dcf({ ...base, discountRate: 0.02 }, 10, 0);
    expect(r).toEqual({ ok: false, reason: "할인율이 영구성장률보다 커야 합니다." });
  });

  it("빠진 입력을 알려 준다", () => {
    const r = dcf({ ...base, ownerEarnings: null, discountRate: null }, null, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("입력 필요: 소유주 이익, 할인율, 주식 수");
  });

  it("성장률 0, 영구성장 0이면 OE / r (영구연금)", () => {
    const r = dcf({ ownerEarnings: 100, growth: 0, years: 5, discountRate: 0.1, terminalGrowth: 0 }, 1, 0);
    expect(r.ok && r.value.perShare).toBeCloseTo(1000, 6);
  });
});

describe("멀티플·자산가치", () => {
  it("PER: 정상화 순이익 × PER", () => {
    expect(perValue({ normalizedEarnings: 50, multiple: 12 }, 10)).toEqual({ ok: true, value: { equityValue: 600, perShare: 60 } });
  });

  it("EV/EBIT: 기업가치 + 순현금", () => {
    expect(evEbitValue({ normalizedEbit: 80, multiple: 8 }, 10, 50)).toEqual({ ok: true, value: { enterpriseValue: 640, equityValue: 690, perShare: 69 } });
  });

  it("자산가치: 순자산 + 조정 항목", () => {
    const r = navValue({ bookValue: 1000, adjustments: [{ label: "부동산 재평가", amount: 200 }, { label: "재고 할인", amount: -50 }] }, 10);
    expect(r).toEqual({ ok: true, value: { equityValue: 1150, perShare: 115, bookPerShare: 100, adjustmentTotal: 150 } });
  });

  it("주식 수가 0 이하면 오류", () => {
    expect(perValue({ normalizedEarnings: 50, multiple: 12 }, 0).ok).toBe(false);
  });
});

function perScenarios(): ValuationData {
  const d = emptyValuation();
  d.shares = 10;
  d.representative = "per";
  d.per.bear = { normalizedEarnings: 50, multiple: 20 }; // 100
  d.per.base = { normalizedEarnings: 75, multiple: 20 }; // 150
  d.per.bull = { normalizedEarnings: 110, multiple: 20 }; // 220
  return d;
}

describe("summarize: 시나리오 가중", () => {
  it("대표 방법의 시나리오 확률 가중 평균, 안전마진, 상승여력, 비관 하락률", () => {
    const s = summarize(perScenarios(), 124);
    // 0.25×100 + 0.5×150 + 0.25×220 = 155
    expect(s.intrinsicValue).toBeCloseTo(155, 9);
    expect(s.marginOfSafety).toBeCloseTo(1 - 124 / 155, 9);
    expect(s.upside).toBeCloseTo(155 / 124 - 1, 9);
    expect(s.bearDownside).toBeCloseTo(1 - 100 / 124, 9);
    expect(s.reason).toBeNull();
  });

  it("확률 0인 시나리오는 비어 있어도 된다", () => {
    const d = perScenarios();
    d.per.bull = { normalizedEarnings: null, multiple: null };
    d.probabilities = { bear: 0.4, base: 0.6, bull: 0 };
    expect(summarize(d, 100).intrinsicValue).toBeCloseTo(130, 9);
  });

  it("확률이 있는 시나리오가 비면 내재가치 없음 + 이유", () => {
    const d = perScenarios();
    d.per.bear = { normalizedEarnings: null, multiple: 20 };
    const s = summarize(d, 100);
    expect(s.intrinsicValue).toBeNull();
    expect(s.reason).toContain("비관");
    expect(s.reason).toContain("정상화 순이익");
  });

  it("현재가가 없으면 안전마진 없음", () => {
    const s = summarize(perScenarios(), null);
    expect(s.intrinsicValue).toBeCloseTo(155);
    expect(s.marginOfSafety).toBeNull();
  });

  it("다른 방법도 격자로 계산", () => {
    const d = perScenarios();
    d.nav.base = { bookValue: 900, adjustments: [] };
    const s = summarize(d, 100);
    expect(s.grid.nav.base).toEqual({ ok: true, value: 90 });
    expect(s.grid.dcf.base.ok).toBe(false);
  });

  it("게이트: 대표 방법 기본 시나리오가 계산되면 결과 있음", () => {
    expect(hasValuationResult(perScenarios())).toBe(true);
    expect(hasValuationResult(emptyValuation())).toBe(false);
  });

  it("스키마: 확률 합계 100% 검증", () => {
    const d = perScenarios();
    expect(valuationDataSchema.safeParse(d).success).toBe(true);
    d.probabilities.bull = 0.3;
    expect(valuationDataSchema.safeParse(d).success).toBe(false);
  });
});

describe("reverseDcf", () => {
  it("DCF 결과 가격을 넣으면 원래 성장률이 나온다", () => {
    const r = reverseDcf(base, 10, 50, 152.5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.impliedGrowth).toBeCloseTo(0.1, 6);
  });

  it("더 비싼 주가에는 더 높은 성장률이 내재", () => {
    const a = reverseDcf(base, 10, 50, 152.5);
    const b = reverseDcf(base, 10, 50, 200);
    expect(a.ok && b.ok && b.value.impliedGrowth > a.value.impliedGrowth).toBe(true);
  });

  it("역산 결과를 다시 넣으면 현재가와 일치", () => {
    const price = 333;
    const r = reverseDcf(base, 10, 50, price);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const check = dcf({ ...base, growth: r.value.impliedGrowth }, 10, 50);
    expect(check.ok && check.value.perShare).toBeCloseTo(price, 3);
  });

  it("범위 밖이면 이유를 알려 준다", () => {
    expect(reverseDcf(base, 10, 50, 1e9).ok).toBe(false);
    const cheap = reverseDcf(base, 10, 50, 0.01);
    expect(cheap.ok).toBe(false);
    if (!cheap.ok) expect(cheap.reason).toContain("역성장");
  });

  it("입력이 부족하면 DCF 이유를 그대로", () => {
    const r = reverseDcf({ ...base, discountRate: null }, 10, 50, 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("할인율");
  });
});

describe("dcfSensitivity", () => {
  it("할인율이 높을수록, 성장률이 낮을수록 가치가 낮다", () => {
    const grid = dcfSensitivity(base, 10, 50, [0.08, 0.1, 0.12], [0.05, 0.1]);
    expect(grid[1][1]).toBeCloseTo(152.5, 9);
    expect(grid[0][1]!).toBeGreaterThan(grid[1][1]!);
    expect(grid[1][0]!).toBeLessThan(grid[1][1]!);
    // 할인율 ≤ 영구성장률인 칸은 null
    expect(dcfSensitivity(base, 10, 50, [0.01], [0.1])[0][0]).toBeNull();
  });
});

describe("suggestInputs", () => {
  const v = (metric: string, year: number, value: number, quarter = 0) => ({ metric, year, quarter, value });
  const values = [
    v("net_income_parent", 2024, 100), v("depreciation", 2024, 40), v("capex", 2024, 50), v("ocf", 2024, 130),
    v("net_income_parent", 2023, 80), v("operating_income", 2024, 150), v("operating_income", 2023, 110),
    v("cash", 2024, 300), v("short_term_debt", 2024, 50), v("long_term_debt", 2024, 100),
    v("cash", 2025, 400, 2), v("short_term_debt", 2025, 20, 2), // 최근 분기 재무상태가 우선
    v("shares_outstanding", 2024, 1000), v("shares_outstanding", 2025, 990, 2),
    v("equity_parent", 2024, 2000),
  ];

  it("유지 CAPEX 비율이 있으면 순이익 + 감가상각 − 유지 CAPEX", () => {
    const s = suggestInputs(values, 60);
    expect(s.ownerEarnings).toBe(100 + 40 - 30);
    expect(s.ownerEarningsNote).toContain("60%");
  });

  it("유지 CAPEX 비율이 없으면 CAPEX 전액", () => {
    expect(suggestInputs(values, null).ownerEarnings).toBe(90);
  });

  it("감가상각비가 없으면 영업현금흐름 − 유지 CAPEX", () => {
    const s = suggestInputs(values.filter((x) => x.metric !== "depreciation"), 60);
    expect(s.ownerEarnings).toBe(130 - 30);
    expect(s.ownerEarningsNote).toContain("대체");
  });

  it("가장 최근 기간의 순현금·주식 수, 5년 평균 정상화 이익", () => {
    const s = suggestInputs(values, null);
    // 2025Q2 한 기간만 사용: 현금 400 − 단기 20 (장기는 이 기간에 없음 → 0, 안내)
    expect(s.netCash).toBe(400 - 20);
    expect(s.netCashNote).toContain("2025Q2");
    expect(s.netCashNote).toContain("장기차입부채는 이 기간에 없어");
    expect(s.shares).toBe(990);
    expect(s.normalizedEarnings).toBe(90);
    expect(s.normalizedEbit).toBe(130);
    expect(s.bookValue).toBe(2000);
  });

  it("데이터가 없으면 null과 안내", () => {
    const s = suggestInputs([], null);
    expect(s.ownerEarnings).toBeNull();
    expect(s.ownerEarningsNote).toContain("없습니다");
  });
});
