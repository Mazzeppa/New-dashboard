import { describe, expect, it } from "vitest";
import { candidateSchema, isInWatchRange, mapCsvRow } from "@/domain/stock";

describe("candidateSchema", () => {
  it("기본값과 정규화", () => {
    const c = candidateSchema.parse({ market: "kr", ticker: "005930", name: "삼성전자", source: "52주 신저가" });
    expect(c.market).toBe("KR");
    expect(c.currency).toBe("KRW");
    expect(c.source).toBe("low_52w");
    expect(c.watchLow).toBeNull();
  });

  it("한글 시장명, 소문자 티커, 콤마 숫자", () => {
    const c = candidateSchema.parse({ market: "미국", ticker: "brk.b", watchLow: "1,200", watchHigh: "1,500" });
    expect(c).toMatchObject({ market: "US", ticker: "BRK.B", currency: "USD", watchLow: 1200, watchHigh: 1500, source: "other" });
  });

  it("숫자로 들어온 한국 종목코드는 6자리로 복구", () => {
    expect(candidateSchema.parse({ market: "KR", ticker: 5930 }).ticker).toBe("005930");
    expect(candidateSchema.parse({ market: "KR", ticker: "660" }).ticker).toBe("000660");
  });

  it("티커와 종목명이 모두 없으면 오류", () => {
    expect(candidateSchema.safeParse({ market: "US" }).success).toBe(false);
  });

  it("관심 가격 하한 > 상한이면 오류", () => {
    expect(candidateSchema.safeParse({ market: "US", ticker: "X", watchLow: 10, watchHigh: 5 }).success).toBe(false);
  });

  it("숫자가 아닌 관심 가격은 오류", () => {
    expect(candidateSchema.safeParse({ market: "US", ticker: "X", watchLow: "abc" }).success).toBe(false);
  });

  it("알 수 없는 발굴 경로는 오류", () => {
    expect(candidateSchema.safeParse({ market: "US", ticker: "X", source: "뉴스" }).success).toBe(false);
  });
});

describe("mapCsvRow", () => {
  it("영문·한글 헤더를 필드로 매핑", () => {
    expect(mapCsvRow({ 시장: "KR", 티커: "000660", watch_low: "100", 무시: "x" })).toEqual({
      market: "KR",
      ticker: "000660",
      watchLow: "100",
    });
  });
});

describe("isInWatchRange", () => {
  it("구간 판정", () => {
    expect(isInWatchRange(100, 90, 110)).toBe(true);
    expect(isInWatchRange(120, 90, 110)).toBe(false);
    expect(isInWatchRange(100, null, 110)).toBe(true);
    expect(isInWatchRange(100, null, null)).toBe(false);
    expect(isInWatchRange(null, 90, 110)).toBe(false);
  });
});
