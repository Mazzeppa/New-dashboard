"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveStock, previewMove } from "@/app/actions/pipeline";
import { Alert, Button, Field, Textarea } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import {
  SELL_REASONS,
  STAGE_LABELS,
  type GateFailure,
  type SellReasonType,
  type Stage,
} from "@/domain/pipeline";

interface Target {
  stockId: number;
  label: string;
  from: Stage;
  to: Stage;
  gateFailures: GateFailure[];
  needsReject: boolean;
  needsSell: boolean;
}

/**
 * 단계 이동 요청. 추가 입력이 필요 없으면 바로 이동하고,
 * 탈락 사유·매도 사유·게이트 우회 사유가 필요하면 다이얼로그를 띄운다.
 */
export function useStageMove() {
  const router = useRouter();
  const [target, setTarget] = React.useState<Target | null>(null);
  const [soldNotice, setSoldNotice] = React.useState<{ stockId: number; label: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [rejectReason, setRejectReason] = React.useState("");
  const [sellType, setSellType] = React.useState<SellReasonType | "">("");
  const [sellText, setSellText] = React.useState("");
  const [bypass, setBypass] = React.useState("");

  const reset = () => {
    setTarget(null);
    setError(null);
    setRejectReason("");
    setSellType("");
    setSellText("");
    setBypass("");
  };

  const afterMove = (stockId: number, label: string, to: Stage) => {
    reset();
    if (to === "sold") setSoldNotice({ stockId, label });
    router.refresh();
  };

  const request = React.useCallback(
    (stock: { id: number; label: string }, to: Stage, opts: { rejectReason?: string } = {}) => {
      setError(null);
      startTransition(async () => {
        const pv = await previewMove(stock.id, to);
        if (!pv.ok) {
          window.alert(pv.error);
          return;
        }
        const ev = pv.data;
        const blocking = ev.errors.filter((e) => e.startsWith("이미"));
        if (blocking.length) return;
        if (!ev.requires.rejectReason && !ev.requires.sellReason && ev.gateFailures.length === 0) {
          const res = await moveStock({ stockId: stock.id, to });
          if (!res.ok) window.alert(res.error);
          else afterMove(stock.id, stock.label, to);
          return;
        }
        setRejectReason(opts.rejectReason ?? "");
        setTarget({
          stockId: stock.id,
          label: stock.label,
          from: ev.from,
          to,
          gateFailures: ev.gateFailures,
          needsReject: ev.requires.rejectReason,
          needsSell: ev.requires.sellReason,
        });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const submit = () => {
    if (!target) return;
    startTransition(async () => {
      const res = await moveStock({
        stockId: target.stockId,
        to: target.to,
        rejectReason: rejectReason || undefined,
        sellReasonType: sellType || undefined,
        sellReasonText: sellText || undefined,
        bypassReason: bypass || undefined,
      });
      if (res.ok) {
        afterMove(target.stockId, target.label, target.to);
      } else {
        setError(res.error);
        if ("gateFailures" in res) setTarget({ ...target, gateFailures: res.gateFailures });
      }
    });
  };

  const dialog = (
    <>
      <Dialog
        open={!!target}
        onClose={reset}
        title={target ? `${target.label}: ${STAGE_LABELS[target.from]} → ${STAGE_LABELS[target.to]}` : ""}
        footer={
          <>
            <Button onClick={reset} disabled={pending}>
              취소
            </Button>
            <Button
              variant={target?.to === "rejected" ? "danger" : "primary"}
              onClick={submit}
              disabled={pending || (!!target?.gateFailures.length && !bypass.trim())}
            >
              {target?.gateFailures.length ? "우회하고 이동" : "이동"}
            </Button>
          </>
        }
      >
        {target && (
          <div className="flex flex-col gap-4">
            {target.needsReject && (
              <Field label="탈락 사유" hint={`${STAGE_LABELS[target.from]} 단계에서 탈락한 것으로 기록됩니다.`}>
                <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} autoFocus />
              </Field>
            )}
            {target.needsSell && (
              <fieldset className="flex flex-col gap-2 text-sm">
                <legend className="mb-1 font-medium">매도 사유 (필수)</legend>
                {(Object.entries(SELL_REASONS) as [SellReasonType, string][]).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2">
                    <input type="radio" name="sellType" checked={sellType === k} onChange={() => setSellType(k)} />
                    {label}
                  </label>
                ))}
                <Textarea
                  placeholder={sellType === "other" ? "기타 사유를 서술하세요 (필수)" : "보충 설명 (선택)"}
                  value={sellText}
                  onChange={(e) => setSellText(e.target.value)}
                />
              </fieldset>
            )}
            {target.gateFailures.length > 0 && (
              <>
                <Alert tone="warn" title="게이트 조건을 충족하지 못했습니다">
                  <ul className="list-disc pl-5">
                    {target.gateFailures.map((f) => (
                      <li key={f.code}>{f.message}</li>
                    ))}
                  </ul>
                </Alert>
                <Field label="우회 사유" hint="우회 기록은 대시보드와 복기 화면에 표시됩니다.">
                  <Textarea value={bypass} onChange={(e) => setBypass(e.target.value)} />
                </Field>
              </>
            )}
            {error && <Alert tone="danger">{error}</Alert>}
          </div>
        )}
      </Dialog>
      <Dialog
        open={!!soldNotice}
        onClose={() => setSoldNotice(null)}
        title="매도 처리 완료"
        footer={
          <>
            <Button onClick={() => setSoldNotice(null)}>나중에</Button>
            {soldNotice && (
              <Link href={`/stocks/${soldNotice.stockId}?tab=retro`} onClick={() => setSoldNotice(null)}>
                <Button variant="primary">복기 작성하기</Button>
              </Link>
            )}
          </>
        }
      >
        <p className="text-sm">
          {soldNotice?.label}을(를) 매도 단계로 옮겼습니다. 기억이 생생할 때 복기를 작성해 두세요. 매수 당시 메모 스냅샷과
          실제 결과를 나란히 비교합니다.
        </p>
      </Dialog>
    </>
  );

  return { request, dialog, pending };
}
