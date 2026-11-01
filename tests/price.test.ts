import { describe, expect, it } from "vitest";
import naver from "./fixtures/naver-005930.json";
import yahoo from "./fixtures/yahoo-quotes.json";
import { dateInZone, fxSymbol, parseNaverBasic, parseYahooChart, QuoteError, yahooSymbol } from "@/integrations/price/normalize";

describe("parseNaverBasic", () => {
  it("종가와 한국 거래일", () => {
    expect(parseNaverBasic(naver, "005930")).toEqual({ price: 220500, date: "2026-10-30", currency: "KRW", symbol: "005930" });
  });
  it("없는 종목코드", () => {
    expect(() => parseNaverBasic({ code: "StockConflict" }, "999999")).toThrow(QuoteError);
    expect(() => parseNaverBasic({ code: "StockConflict" }, "999999")).toThrow("999999");
  });
});

describe("parseYahooChart", () => {
  it("미국 종목: 뉴욕 기준 날짜", () => {
    expect(parseYahooChart(yahoo["yahoo-aapl"], "AAPL")).toEqual({ price: 344.63, date: "2026-10-30", currency: "USD", symbol: "AAPL" });
  });
  it("런던 펜스(GBp)는 파운드로 환산", () => {
    const q = parseYahooChart(yahoo["yahoo-shel"], "SHEL.L");
    expect(q.currency).toBe("GBP");
    expect(q.price).toBeCloseTo(40.365);
  });
  it("환율", () => {
    expect(parseYahooChart(yahoo["yahoo-usdkrw"], "USDKRW=X")).toMatchObject({ price: 1335.1, currency: "KRW" });
  });
  it("없는 심볼은 설명과 함께 오류", () => {
    expect(() => parseYahooChart(yahoo["yahoo-bad"], "NOPE")).toThrow("delisted");
  });
});

describe("심볼·날짜", () => {
  it("Yahoo 심볼", () => {
    expect(yahooSymbol("US", "brk.b")).toBe("BRK-B");
    expect(yahooSymbol("KR", "005930")).toBe("005930.KS");
    expect(yahooSymbol("EU", "nesn.sw")).toBe("NESN.SW");
    expect(fxSymbol("usd")).toBe("USDKRW=X");
  });
  it("시간대별 날짜 (같은 순간이 서울과 뉴욕에서 다른 날)", () => {
    const t = Date.parse("2026-10-30T02:00:00Z") / 1000;
    expect(dateInZone(t, "Asia/Seoul")).toBe("2026-10-30");
    expect(dateInZone(t, "America/New_York")).toBe("2026-10-29");
  });
});
