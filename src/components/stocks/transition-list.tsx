import { Badge } from "@/components/ui";
import { formatDateTime } from "@/domain/format";
import { SELL_REASONS, STAGE_LABELS } from "@/domain/pipeline";
import type { StageTransition } from "@/db/schema";

export function TransitionList({ items }: { items: StageTransition[] }) {
  return (
    <ol className="flex flex-col divide-y divide-border">
      {items.map((t) => (
        <li key={t.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {t.fromStage ? `${STAGE_LABELS[t.fromStage]} → ${STAGE_LABELS[t.toStage]}` : `등록 (${STAGE_LABELS[t.toStage]})`}
            </span>
            {t.bypassReason && <Badge tone="warn">게이트 우회</Badge>}
            <span className="ml-auto text-xs text-muted">{formatDateTime(t.createdAt)}</span>
          </div>
          {t.bypassReason && (
            <div className="text-xs text-muted">
              미충족: {t.gateFailures.map((f) => f.message).join(" / ")}
              <br />
              우회 사유: <span className="text-fg">{t.bypassReason}</span>
            </div>
          )}
          {t.rejectReason && <div className="text-xs text-muted">탈락 사유: <span className="text-fg">{t.rejectReason}</span></div>}
          {t.sellReasonType && (
            <div className="text-xs text-muted">
              매도 사유: <span className="text-fg">{SELL_REASONS[t.sellReasonType]}{t.sellReasonText ? ` (${t.sellReasonText})` : ""}</span>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
