import { describe, expect, it } from "vitest";
import apple from "./fixtures/sec-apple-companyfacts.json";
import { fiscalYears, normalizeCompanyFacts, type CompanyFacts } from "@/integrations/sec/normalize";

const facts = apple as unknown as CompanyFacts;
const B = 1e9;

describe("SEC companyfacts — Apple (9월 결산)", () => {
  const { values } = normalizeCompanyFacts(facts);
  const get = (metric: string, year: number, quarter: number) => values.find((v) => v.metric === metric && v.year === year && v.quarter === quarter)?.value;

  it("회계연도: 10-K 연간 기간, 진행 중 연도는 직전 결산일 다음 날부터", () => {
    const fys = fiscalYears(facts);
    expect(fys.find((f) => f.label === 2025)).toEqual({ label: 2025, start: "2024-09-29", end: "2025-09-27", inProgress: false });
    const last = fys[fys.length - 1];
    expect(last).toMatchObject({ label: 2026, start: "2025-09-28", inProgress: true });
  });

  it("연간 값", () => {
    expect(get("revenue", 2025, 0)).toBe(416161000000);
    expect(get("operating_income", 2025, 0)).toBe(133050000000);
    expect(get("ocf", 2025, 0)).toBe(111482000000);
  });

  it("분기 손익: 3개월 값 사용", () => {
    expect(get("revenue", 2026, 1)).toBe(143756000000);
    expect(get("revenue", 2026, 2)).toBe(111184000000);
    expect(get("revenue", 2026, 3)).toBe(109417000000);
  });

  it("분기 현금흐름: 누적 차이로 계산, 4분기 = 연간 − 3분기 누적", () => {
    expect(get("ocf", 2026, 1)).toBe(53925000000);
    expect(get("ocf", 2026, 2)).toBe(82627000000 - 53925000000);
    expect(get("ocf", 2026, 3)).toBe(116996000000 - 82627000000);
    expect(get("ocf", 2025, 4)).toBe(111482000000 - 81754000000);
    expect(get("capex", 2026, 2)! / B).toBeCloseTo(1.971, 3); // 4.344 − 2.373
  });

  it("4개 분기 합 = 연간", () => {
    const sum = [1, 2, 3, 4].reduce((a, q) => a + get("revenue", 2025, q)!, 0);
    expect(sum).toBe(get("revenue", 2025, 0));
  });

  it("재무상태: 분기말 시점 값, 진행 중 연도에는 연간 값 없음", () => {
    expect(get("total_assets", 2026, 3)).toBe(383266000000);
    expect(get("total_assets", 2025, 0)).toBe(359241000000);
    expect(get("total_assets", 2026, 0)).toBeUndefined();
  });

  it("유통주식수: 표지 기준일 직전 기간에 붙인다", () => {
    expect(get("shares_outstanding", 2026, 3)).toBe(14594180000);
  });

  it("출처 태그를 남긴다", () => {
    expect(values.find((v) => v.metric === "revenue")?.ref).toBe("us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax");
  });

  it("최근 12개 분기로 제한", () => {
    const qs = new Set(values.filter((v) => v.quarter > 0 && v.metric !== "shares_outstanding").map((v) => `${v.year}Q${v.quarter}`));
    expect(qs.size).toBeLessThanOrEqual(12);
  });
});
