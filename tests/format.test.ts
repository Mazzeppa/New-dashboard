import { describe, expect, it } from "vitest";
import { formatAmount, formatPct, formatPrice, formatRatio, parseNumberInput } from "@/domain/format";

describe("formatAmount", () => {
  it("원화는 억원/조원", () => {
    expect(formatAmount(1_234_500_000_000, "KRW")).toBe("1.23조원");
    expect(formatAmount(98_765_000_000, "KRW")).toBe("988억원");
    expect(formatAmount(523_400_000_000, "KRW")).toBe("5,234억원");
    expect(formatAmount(-300_000_000, "KRW")).toBe("-3억원");
    expect(formatAmount(12_345, "KRW")).toBe("12,345원");
  });

  it("달러는 $M/$B", () => {
    expect(formatAmount(2_345_000_000, "USD")).toBe("$2.35B");
    expect(formatAmount(12_300_000, "USD")).toBe("$12.3M");
    expect(formatAmount(-1_500_000_000, "USD")).toBe("-$1.5B");
    expect(formatAmount(950, "USD")).toBe("$950");
  });

  it("기타 통화와 빈 값", () => {
    expect(formatAmount(5_000_000, "EUR")).toBe("€5M");
    expect(formatAmount(5_000_000, "CHF")).toBe("CHF 5M");
    expect(formatAmount(null, "KRW")).toBe("-");
    expect(formatAmount(NaN, "USD")).toBe("-");
  });
});

describe("formatPrice", () => {
  it("주가 표기", () => {
    expect(formatPrice(71_500, "KRW")).toBe("71,500원");
    expect(formatPrice(1234.5, "USD")).toBe("$1,234.50");
    expect(formatPrice(88.1, "CHF")).toBe("CHF 88.10");
  });
});

describe("퍼센트와 입력 파싱", () => {
  it("formatRatio / formatPct", () => {
    expect(formatRatio(0.1234)).toBe("12.3%");
    expect(formatPct(15)).toBe("15%");
  });
  it("parseNumberInput", () => {
    expect(parseNumberInput("1,234.5")).toBe(1234.5);
    expect(parseNumberInput("")).toBeNull();
    expect(parseNumberInput("abc")).toBeNull();
    expect(parseNumberInput(42)).toBe(42);
  });
});
