"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Alert, Button, Card, CardHeader, Input, DownloadButton } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { formatDateTime, formatNumber } from "@/domain/format";

interface Preview {
  file: File;
  data: unknown;
  exportedAt: string;
  schemaVersion: number;
  counts: Record<string, number>;
}

const LABELS: Record<string, string> = {
  stocks: "종목",
  trades: "매매 기록",
  memos: "투자 메모",
  valuations: "가치평가",
  financialValues: "재무 값",
  holdingReviews: "보유 점검",
  retrospectives: "복기",
  principleVersions: "원칙 버전",
};

export function BackupPanel({ schemaVersion, currentCounts }: { schemaVersion: number; currentCounts: Record<string, number> }) {
  const router = useRouter();
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [confirmText, setConfirmText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== "value-process") throw new Error("이 앱의 백업 파일이 아닙니다.");
      const counts = Object.fromEntries(Object.entries(data.tables ?? {}).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]));
      setPreview({ file, data, exportedAt: data.exportedAt, schemaVersion: data.schemaVersion, counts });
      setConfirmText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일을 읽을 수 없습니다.");
    }
  };

  const restore = () =>
    start(async () => {
      if (!preview) return;
      const res = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(preview.data) });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "복원에 실패했습니다.");
        setPreview(null);
        return;
      }
      setPreview(null);
      setResult(`복원했습니다. 복원 직전 데이터는 ${body.preImportCopy}에 저장해 두었습니다.`);
      router.refresh();
    });

  const versionMismatch = preview && preview.schemaVersion > schemaVersion;

  return (
    <Card id="backup">
      <CardHeader title="백업과 내보내기" description="모든 데이터는 이 컴퓨터의 SQLite 파일(data/app.db)에 있습니다. 정기적으로 JSON 백업을 받아 두세요." />
      <div className="flex flex-col gap-5 p-4 text-sm">
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">전체 백업 (JSON)</h3>
          <p className="text-xs text-muted">
            종목 {formatNumber(currentCounts.stocks ?? 0)}개, 매매 {formatNumber(currentCounts.trades ?? 0)}건, 메모 {formatNumber(currentCounts.memos ?? 0)}건, 재무 값{" "}
            {formatNumber(currentCounts.financialValues ?? 0)}개 등 모든 기록. DART·SEC 캐시는 빠집니다(다시 받을 수 있음).
          </p>
          <div className="flex flex-wrap gap-2">
            <DownloadButton variant="primary" href="/api/backup">
              <Download size={14} /> 백업 파일 받기
            </DownloadButton>
            <Button onClick={() => inputRef.current?.click()}>
              <Upload size={14} /> 백업에서 복원…
            </Button>
            <input ref={inputRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          {result && <Alert tone="ok">{result}</Alert>}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">표 데이터 (CSV, 엑셀용)</h3>
          <div className="flex flex-wrap gap-2">
            {[
              ["stocks", "종목 목록"],
              ["trades", "매매 기록"],
              ["portfolio", "포트폴리오"],
              ["retrospectives", "복기"],
            ].map(([k, label]) => (
              <DownloadButton key={k} size="sm" href={`/api/export/${k}`}>
                <FileSpreadsheet size={12} /> {label}
              </DownloadButton>
            ))}
          </div>
          <p className="text-xs text-muted">종목별 재무 데이터 CSV는 종목 → 심층 분석 → 재무 화면에서 받습니다.</p>
        </section>
      </div>

      <Dialog
        open={!!preview}
        onClose={() => setPreview(null)}
        title="백업에서 복원"
        footer={
          <>
            <Button onClick={() => setPreview(null)}>취소</Button>
            <Button variant="danger" onClick={restore} disabled={pending || confirmText !== "복원" || !!versionMismatch}>
              현재 데이터를 지우고 복원
            </Button>
          </>
        }
      >
        {preview && (
          <div className="flex flex-col gap-3 text-sm">
            <p>
              <b>{preview.file.name}</b> · 백업 시각 {formatDateTime(preview.exportedAt)}
            </p>
            <table className="text-xs">
              <thead>
                <tr className="text-muted">
                  <th className="text-left font-medium">항목</th>
                  <th className="text-right font-medium">현재</th>
                  <th className="text-right font-medium">백업</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(LABELS).map(([k, label]) => (
                  <tr key={k}>
                    <td>{label}</td>
                    <td className="num">{formatNumber(currentCounts[k] ?? 0)}</td>
                    <td className="num">{formatNumber(preview.counts[k] ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {versionMismatch ? (
              <Alert tone="danger">
                더 새 버전 앱의 백업입니다 (백업 {preview.schemaVersion}, 현재 앱 {schemaVersion}). 앱을 업데이트한 뒤 복원하세요.
              </Alert>
            ) : (
              <>
                <Alert tone="warn">현재 데이터가 모두 백업 내용으로 바뀝니다. 복원 직전 상태는 data/backups/ 폴더에 자동으로 저장됩니다.</Alert>
                <label className="flex flex-col gap-1">
                  <span>확인을 위해 <b>복원</b>이라고 입력하세요</span>
                  <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
                </label>
              </>
            )}
          </div>
        )}
      </Dialog>
    </Card>
  );
}
