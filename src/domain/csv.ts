/**
 * CSV 내보내기 (순수 함수). 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 붙인다.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

function escape(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[], opts: { bom?: boolean } = {}): string {
  const lines = [columns.map((c) => escape(c.header)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => escape(c.value(r))).join(","));
  return (opts.bom === false ? "" : "﻿") + lines.join("\r\n") + "\r\n";
}

/** 2차원 배열(첫 행 = 헤더) → CSV */
export function gridToCsv(grid: (string | number | null)[][], opts: { bom?: boolean } = {}): string {
  return (opts.bom === false ? "" : "﻿") + grid.map((row) => row.map(escape).join(",")).join("\r\n") + "\r\n";
}
