import { describe, expect, it } from "vitest";
import { DEFAULT_CONVICTION_BANDS } from "@/domain/principles";
import { positionCap, recommendedRange, sizingWarnings } from "@/domain/sizing";

describe("positionCap", () => {
  it("최대 손실 ÷ 비관 하락률", () => {
    const c = positionCap(2, 15, 0.25);
    expect(c.lossCap).toBeCloseTo(8);
    expect(c.cap).toBeCloseTo(8);
    expect(c.basis).toContain("2% ÷ 비관 하락률 25%");
  });
  it("손실 기준이 종목 한도보다 크면 종목 한도", () => {
    const c = positionCap(2, 15, 0.1);
    expect(c.lossCap).toBeCloseTo(20);
    expect(c.cap).toBe(15);
  });
  it("하락률이 0 이하이거나 모르면 종목 한도", () => {
    expect(positionCap(2, 15, -0.1)).toMatchObject({ lossCap: null, cap: 15 });
    expect(positionCap(2, 15, 0)).toMatchObject({ lossCap: null, cap: 15 });
    expect(positionCap(2, 15, null)).toMatchObject({ lossCap: null, cap: 15 });
  });
});

describe("recommendedRange", () => {
  it("확신도 밴드 × 상한", () => {
    expect(recommendedRange(10, 3, DEFAULT_CONVICTION_BANDS)).toEqual({ min: 4, max: 6 });
    expect(recommendedRange(10, 5, DEFAULT_CONVICTION_BANDS)).toEqual({ min: 8, max: 10 });
    expect(recommendedRange(10, null, DEFAULT_CONVICTION_BANDS)).toBeNull();
  });
});

describe("sizingWarnings", () => {
  const base = {
    cap: positionCap(2, 15, 0.25),
    maxPositionPct: 15,
    range: { min: 4, max: 6 },
    maxIndustryPct: 30,
    industry: "반도체",
    circleOfCompetence: ["반도체"],
  };
  it("한도 안이면 경고 없음", () => {
    expect(sizingWarnings({ ...base, targetPct: 5, industryPctAfter: 20 })).toEqual([]);
  });
  it("손실 기준·권장 범위·산업 한도 초과", () => {
    const w = sizingWarnings({ ...base, targetPct: 9, industryPctAfter: 35 });
    expect(w).toHaveLength(3);
    expect(w[0]).toContain("허용 한도");
    expect(w[1]).toContain("권장 범위");
    expect(w[2]).toContain("산업(반도체) 합계 35%");
  });
  it("종목 한도 초과와 능력의 범위 밖", () => {
    const w = sizingWarnings({ ...base, cap: positionCap(2, 15, null), targetPct: 16, range: null, industryPctAfter: 16, industry: "바이오" });
    expect(w).toEqual(["종목당 최대 비중 15%를 넘습니다 (16%).", "'바이오'은(는) 능력의 범위 밖입니다."]);
  });
});
