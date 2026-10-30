import { describe, expect, it } from "vitest";
import { gridToCsv, toCsv } from "@/domain/csv";

describe("toCsv", () => {
  const rows = [
    { name: "삼성전자", note: '메모, "따옴표"', qty: 10, x: null },
    { name: "Apple", note: "줄\n바꿈", qty: 1.5, x: undefined },
  ];
  const cols = [
    { header: "종목", value: (r: (typeof rows)[number]) => r.name },
    { header: "메모", value: (r: (typeof rows)[number]) => r.note },
    { header: "수량", value: (r: (typeof rows)[number]) => r.qty },
    { header: "빈칸", value: (r: (typeof rows)[number]) => r.x },
  ];

  it("엑셀용 BOM과 CRLF, 쉼표·따옴표·줄바꿈 이스케이프", () => {
    const out = toCsv(rows, cols);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toBe('﻿종목,메모,수량,빈칸\r\n삼성전자,"메모, ""따옴표""",10,\r\nApple,"줄\n바꿈",1.5,\r\n');
  });

  it("BOM 생략 옵션, 무한대는 빈칸", () => {
    expect(toCsv([{ v: Infinity }], [{ header: "v", value: (r) => r.v }], { bom: false })).toBe("v\r\n\r\n");
  });
});

describe("gridToCsv", () => {
  it("2차원 배열", () => {
    expect(gridToCsv([["계정", "2024"], ["매출액", 100], ["영업이익", null]], { bom: false })).toBe("계정,2024\r\n매출액,100\r\n영업이익,\r\n");
  });
});
