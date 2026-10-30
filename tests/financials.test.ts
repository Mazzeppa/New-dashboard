import { describe, expect, it } from "vitest";
import {
  matchMetric,
  parseFinancialGrid,
  parseFinancialNumber,
  parsePeriod,
  periodKey,
} from "@/domain/financials";

describe("parsePeriod", () => {
  it.each([
    ["2023", { year: 2023, quarter: 0 }],
    ["FY2023", { year: 2023, quarter: 0 }],
    ["2023년", { year: 2023, quarter: 0 }],
    ["2023(A)", { year: 2023, quarter: 0 }],
    ["2023Q1", { year: 2023, quarter: 1 }],
    ["2023 3Q", { year: 2023, quarter: 3 }],
    ["2023.2Q", { year: 2023, quarter: 2 }],
    ["2023-Q4", { year: 2023, quarter: 4 }],
    ["1Q24", { year: 2024, quarter: 1 }],
    ["Q2 2024", { year: 2024, quarter: 2 }],
  ])("%s", (raw, expected) => {
    expect(parsePeriod(raw)).toEqual(expected);
  });

  it("연월 헤더는 모드에 따라 연간 또는 분기", () => {
    expect(parsePeriod("2023/12")).toEqual({ year: 2023, quarter: 0 });
    expect(parsePeriod("2023/12", "quarter")).toEqual({ year: 2023, quarter: 4 });
    expect(parsePeriod("2024/03", "quarter")).toEqual({ year: 2024, quarter: 1 });
    expect(parsePeriod("2024/05", "quarter")).toBeNull();
  });

  it("해석할 수 없는 값", () => {
    expect(parsePeriod("매출")).toBeNull();
    expect(parsePeriod("1800")).toBeNull();
    expect(parsePeriod("2023Q5")).toBeNull();
  });

  it("periodKey", () => {
    expect(periodKey({ year: 2023, quarter: 0 })).toBe("2023");
    expect(periodKey({ year: 2023, quarter: 2 })).toBe("2023Q2");
  });
});

describe("parseFinancialNumber", () => {
  it.each([
    ["1,234", 1234],
    ["-1,234.5", -1234.5],
    ["(1,234)", -1234],
    ["△500", -500],
    ["▲500", -500],
    ["1 234", 1234],
    [42, 42],
  ])("%s → %s", (raw, expected) => {
    expect(parseFinancialNumber(raw)).toBe(expected);
  });

  it.each(["", "-", "—", "N/A", "abc", null, undefined])("%s → null", (raw) => {
    expect(parseFinancialNumber(raw)).toBeNull();
  });
});

describe("matchMetric", () => {
  it("키, 라벨, 별칭, 공백·괄호 차이를 인식", () => {
    expect(matchMetric("revenue")).toBe("revenue");
    expect(matchMetric("매출액")).toBe("revenue");
    expect(matchMetric("영업이익(손실)")).toBe("operating_income");
    expect(matchMetric("영업활동으로 인한 현금흐름")).toBe("ocf");
    expect(matchMetric("현금및현금성자산")).toBe("cash");
    expect(matchMetric("기타포괄손익")).toBeNull();
  });
});

describe("parseFinancialGrid", () => {
  it("표를 값 목록으로 바꾸고 금액에만 단위를 곱한다", () => {
    const rows = [
      ["계정", "2022", "2023", "비고"],
      ["매출액", "1,200", "1,350", ""],
      ["영업이익", "150", "(20)", ""],
      ["유통주식수", "1,000,000", "1,000,000", ""],
      ["기타포괄손익", "1", "2", ""],
      ["순이익", "-", "abc", ""],
    ];
    const r = parseFinancialGrid(rows, 1e8);
    expect(r.periods.map(periodKey)).toEqual(["2022", "2023"]);
    expect(r.badHeaders).toEqual(["비고"]);
    expect(r.unknownRows).toEqual(["기타포괄손익"]);
    expect(r.badCells).toBe(1);
    expect(r.values).toContainEqual({ metric: "revenue", year: 2022, quarter: 0, value: 1200e8 });
    expect(r.values).toContainEqual({ metric: "operating_income", year: 2023, quarter: 0, value: -20e8 });
    expect(r.values).toContainEqual({ metric: "shares_outstanding", year: 2023, quarter: 0, value: 1_000_000 });
    expect(r.values).toHaveLength(6);
  });

  it("분기 헤더", () => {
    const r = parseFinancialGrid([["", "2024/03", "2024/06"], ["매출액", "10", "11"]], 1e6, "quarter");
    expect(r.values).toEqual([
      { metric: "revenue", year: 2024, quarter: 1, value: 10e6 },
      { metric: "revenue", year: 2024, quarter: 2, value: 11e6 },
    ]);
  });

  it("빈 입력", () => {
    expect(parseFinancialGrid([], 1).values).toEqual([]);
  });
});
