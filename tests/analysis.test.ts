import { describe, expect, it } from "vitest";
import { completion, getSection, sanitizeAnswers } from "@/domain/analysis";
import { FISHER_15, summarizeScores } from "@/domain/checklist";

describe("sanitizeAnswers", () => {
  const moat = getSection("moat")!;

  it("정의에 없는 키와 잘못된 선택지를 버린다", () => {
    const a = sanitizeAnswers(moat, {
      moat_types: ["network", "bogus", 3],
      moat_direction: "sideways",
      moat_evidence: "  점유율 10년 연속 상승  ",
      hacker: "x",
    });
    expect(a.moat_types).toEqual(["network"]);
    expect(a.moat_direction).toBeNull();
    expect(a.moat_evidence).toBe("  점유율 10년 연속 상승  ");
    expect("hacker" in a).toBe(false);
  });

  it("퍼센트는 0~100 숫자로", () => {
    const biz = getSection("business")!;
    expect(sanitizeAnswers(biz, { fixed_cost_pct: "35" }).fixed_cost_pct).toBe(35);
    expect(sanitizeAnswers(biz, { fixed_cost_pct: 150 }).fixed_cost_pct).toBe(100);
    expect(sanitizeAnswers(biz, { fixed_cost_pct: "abc" }).fixed_cost_pct).toBeNull();
    expect(sanitizeAnswers(biz, { fixed_cost_pct: "" }).fixed_cost_pct).toBeNull();
  });

  it("빈 문자열 서술은 null", () => {
    expect(sanitizeAnswers(moat, { moat_evidence: "   " }).moat_evidence).toBeNull();
  });
});

describe("completion", () => {
  it("채워진 필드 수", () => {
    const moat = getSection("moat")!;
    expect(completion(moat, null)).toEqual({ filled: 0, total: 4 });
    expect(completion(moat, { moat_types: [], moat_direction: "stable", moat_evidence: "근거" })).toEqual({ filled: 2, total: 4 });
  });
});

describe("summarizeScores", () => {
  it("평균과 약점 수", () => {
    expect(summarizeScores([5, 4, null, 2, 1])).toEqual({ answered: 4, total: 5, average: 3, weak: 2 });
    expect(summarizeScores([null, undefined])).toEqual({ answered: 0, total: 2, average: null, weak: 0 });
  });

  it("범위 밖 점수는 무시", () => {
    expect(summarizeScores([0, 6, 3]).answered).toBe(1);
  });
});

describe("FISHER_15", () => {
  it("15개 질문", () => {
    expect(FISHER_15.items).toHaveLength(15);
  });
});
