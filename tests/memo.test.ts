import { describe, expect, it } from "vitest";
import { buildSnapshot, cleanMemo, describeCondition, emptyMemo, memoContentSchema, memoMissing, memoToMarkdown, type MemoContent } from "@/domain/memo";
import { emptyValuation } from "@/domain/valuation";

const full: MemoContent = {
  theses: ["점유율 1위 유지", "", "설비투자 사이클 바닥"],
  mispricing: "시장은 단기 재고 조정을 구조적 하락으로 본다",
  catalysts: [{ description: "HBM 인증", expectedDate: "2026-12-01" }, { description: "", expectedDate: null }],
  premortem: "중국 경쟁사가 가격을 무너뜨림",
  sellConditions: [
    { type: "structured", metric: "operatingMargin", operator: "<", threshold: 0.1, periods: 2, periodType: "quarter", note: "" },
    { type: "text", text: "경영진 교체" },
  ],
};

describe("memoMissing", () => {
  it("빈 메모는 다섯 항목 모두 누락", () => {
    expect(memoMissing(emptyMemo())).toEqual(["핵심 논리", "시장이 잘못 보고 있는 점", "촉매", "프리모템", "매도 조건"]);
  });
  it("모두 채우면 누락 없음", () => {
    expect(memoMissing(full)).toEqual([]);
  });
  it("촉매에 예상 시점이 없으면 누락", () => {
    expect(memoMissing({ ...full, catalysts: [{ description: "인증", expectedDate: null }] })).toEqual(["촉매 예상 시점"]);
  });
  it("빈 서술형 매도 조건은 인정하지 않음", () => {
    expect(memoMissing({ ...full, sellConditions: [{ type: "text", text: "  " }] })).toEqual(["매도 조건"]);
  });
  it("핵심 논리는 최대 3개", () => {
    expect(memoContentSchema.safeParse({ ...full, theses: ["a", "b", "c", "d"] }).success).toBe(false);
  });
});

describe("cleanMemo", () => {
  it("빈 논리·촉매를 걷어 낸다", () => {
    const c = cleanMemo(full);
    expect(c.theses).toEqual(["점유율 1위 유지", "설비투자 사이클 바닥"]);
    expect(c.catalysts).toHaveLength(1);
  });
});

describe("describeCondition", () => {
  it("지표 + 조건 + 기준값 + 지속 기간", () => {
    expect(describeCondition(full.sellConditions[0], "KRW")).toBe("영업이익률 < 10.0%, 2분기 연속");
    expect(describeCondition({ type: "structured", metric: "fcf", operator: "<=", threshold: 0, periods: 2, periodType: "annual", note: "현금 소진" }, "USD")).toBe(
      "FCF ≤ $0, 2년 연속 (현금 소진)",
    );
    expect(describeCondition(full.sellConditions[1], "KRW")).toBe("경영진 교체");
  });
});

describe("buildSnapshot", () => {
  const v = emptyValuation();
  v.shares = 10;
  v.representative = "per";
  v.per.bear = { normalizedEarnings: 50, multiple: 20 };
  v.per.base = { normalizedEarnings: 75, multiple: 20 };
  v.per.bull = { normalizedEarnings: 110, multiple: 20 };

  it("확정 시점의 가치평가 결과·현재가·메모를 고정", () => {
    const snap = buildSnapshot({ takenAt: "2026-10-30T00:00:00Z", currency: "KRW", price: 124, priceDate: "2026-10-30", content: full, valuation: v });
    expect(snap.valuation?.intrinsicValue).toBeCloseTo(155);
    expect(snap.valuation?.grid.per).toEqual({ bear: 100, base: 150, bull: 220 });
    expect(snap.valuation?.grid.dcf.base).toBeNull();
    // 원본을 고쳐도 스냅샷은 그대로
    v.per.base.multiple = 99;
    full.theses[0] = "바뀜";
    expect(snap.valuation?.data.per.base.multiple).toBe(20);
    expect(snap.content.theses[0]).toBe("점유율 1위 유지");
    full.theses[0] = "점유율 1위 유지";
  });

  it("가치평가가 없으면 null", () => {
    expect(buildSnapshot({ takenAt: "x", currency: "KRW", price: null, priceDate: null, content: full, valuation: null }).valuation).toBeNull();
  });
});

describe("memoToMarkdown", () => {
  it("필수 항목과 확정 시점 가치평가를 포함", () => {
    const v = emptyValuation();
    v.shares = 10;
    v.representative = "per";
    for (const s of ["bear", "base", "bull"] as const) v.per[s] = { normalizedEarnings: 75, multiple: 20 };
    const snap = buildSnapshot({ takenAt: "2026-10-30T00:00:00Z", currency: "KRW", price: 124, priceDate: "2026-10-30", content: full, valuation: v });
    const md = memoToMarkdown({ stockName: "삼성전자", ticker: "005930", market: "KR", version: 2, status: "confirmed", confirmedAt: "2026-10-30T01:00:00Z", content: cleanMemo(full), snapshot: snap });
    expect(md).toContain("# 투자 메모: 삼성전자 (005930)");
    expect(md).toContain("v2 (확정 2026-10-30)");
    expect(md).toContain("1. 점유율 1위 유지");
    expect(md).toContain("2. 설비투자 사이클 바닥");
    expect(md).toContain("- 2026-12-01: HBM 인증");
    expect(md).toContain("- 영업이익률 < 10.0%, 2분기 연속");
    expect(md).toContain("| 정상화 이익 × PER (대표) | 150원 | 150원 | 150원 |");
    expect(md).not.toContain("소유주 이익 DCF |");
  });
});
