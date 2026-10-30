"use client";

import * as React from "react";
import Link from "next/link";
import Papa from "papaparse";
import { importCandidatesAction } from "@/app/actions/stocks";
import { Alert, Button, Card, CardHeader, Table, Textarea } from "@/components/ui";
import { mapCsvRow } from "@/domain/stock";
import type { ImportReport } from "@/lib/server/candidates";

const TEMPLATE =
  "market,ticker,name,currency,industry,source,source_note,note,watch_low,watch_high\n" +
  "KR,005930,삼성전자,KRW,반도체,52주 신저가,,메모리 업황 바닥 확인,60000,70000\n" +
  "US,BRK.B,Berkshire Hathaway,USD,보험,quant_screen,PBR<1.3,,,\n";

export function CsvImport() {
  const [text, setText] = React.useState("");
  const [rows, setRows] = React.useState<Record<string, unknown>[]>([]);
  const [parseError, setParseError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<ImportReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const parse = (csv: string) => {
    setText(csv);
    setReport(null);
    if (!csv.trim()) return setRows([]);
    const res = Papa.parse<Record<string, unknown>>(csv.trim(), { header: true, skipEmptyLines: true });
    setParseError(res.errors[0] ? `${res.errors[0].row != null ? `${res.errors[0].row + 1}행: ` : ""}${res.errors[0].message}` : null);
    setRows(res.data.map(mapCsvRow));
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) parse(await f.text());
  };

  const submit = () =>
    start(async () => {
      const r = await importCandidatesAction(rows);
      if (r.ok) {
        setReport(r.data);
        setError(null);
      } else setError(r.error);
    });

  const downloadTemplate = () => {
    const blob = new Blob(["﻿" + TEMPLATE], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "candidates-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cols = ["market", "ticker", "name", "currency", "industry", "source", "note", "watchLow", "watchHigh"];

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="CSV 가져오기"
          description="첫 행은 헤더입니다. 모든 종목은 '아이디어' 단계로 들어가고, 같은 시장·티커가 이미 있으면 건너뜁니다."
          actions={
            <Button size="sm" onClick={downloadTemplate}>
              양식 내려받기
            </Button>
          }
        />
        <div className="flex flex-col gap-3 p-4">
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
          <Textarea
            className="min-h-36 font-mono text-xs"
            placeholder={TEMPLATE}
            value={text}
            onChange={(e) => parse(e.target.value)}
          />
          <p className="text-xs text-muted">
            열: market(KR/US/EU/OTHER), ticker, name, currency, industry, source(정량 스크리닝·공시·52주 신저가·업황 바닥·업무 경험·기타 또는 영문 키),
            source_note, note, watch_low, watch_high. 한글 헤더(시장, 티커, 종목명 등)도 인식합니다.
          </p>
          {parseError && <Alert tone="warn">CSV 해석 경고: {parseError}</Alert>}
        </div>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader
            title={`미리보기 (${rows.length}행)`}
            actions={
              <Button variant="primary" onClick={submit} disabled={pending}>
                {rows.length}행 등록
              </Button>
            }
          />
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <thead>
                <tr>
                  <th>#</th>
                  {cols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={i}>
                    <td className="text-muted">{i + 1}</td>
                    {cols.map((c) => (
                      <td key={c}>{String(r[c] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
      {report && (
        <Card className="p-4 text-sm">
          <p className="font-semibold">
            등록 {report.created.length}건 · 건너뜀 {report.skipped.length}건 · 오류 {report.errors.length}건
          </p>
          {report.skipped.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-muted">
              {report.skipped.map((s) => (
                <li key={s.row}>
                  {s.row}행 {s.label}: {s.reason}
                </li>
              ))}
            </ul>
          )}
          {report.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-danger">
              {report.errors.map((e) => (
                <li key={e.row}>
                  {e.row}행: {e.messages.join(", ")}
                </li>
              ))}
            </ul>
          )}
          {report.created.length > 0 && (
            <Link href="/pipeline" className="mt-3 inline-block text-accent underline">
              파이프라인에서 보기
            </Link>
          )}
        </Card>
      )}
    </div>
  );
}
