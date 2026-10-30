"use client";

import * as React from "react";
import { ChevronRight, RotateCcw, X } from "lucide-react";
import { Button, Select } from "@/components/ui";
import { useStageMove } from "@/components/pipeline/use-stage-move";
import { nextStage, PIPELINE_STAGES, STAGE_LABELS, type PipelineStage, type Stage } from "@/domain/pipeline";

export function StageControls({
  stock,
}: {
  stock: { id: number; label: string; stage: Stage; rejectedFromStage: PipelineStage | null };
}) {
  const { request, dialog, pending } = useStageMove();
  const next = nextStage(stock.stage);
  const s = { id: stock.id, label: stock.label };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {stock.stage === "rejected" ? (
        <Button onClick={() => request(s, stock.rejectedFromStage ?? "idea")} disabled={pending}>
          <RotateCcw size={14} />
          {STAGE_LABELS[stock.rejectedFromStage ?? "idea"]}(으)로 복원
        </Button>
      ) : (
        <>
          {next && (
            <Button variant="primary" onClick={() => request(s, next)} disabled={pending}>
              {STAGE_LABELS[next]}(으)로
              <ChevronRight size={14} />
            </Button>
          )}
          <Select
            aria-label="다른 단계로 이동"
            className="w-auto"
            value=""
            onChange={(e) => e.target.value && request(s, e.target.value as Stage)}
            disabled={pending}
          >
            <option value="">다른 단계로…</option>
            {PIPELINE_STAGES.filter((st) => st !== stock.stage).map((st) => (
              <option key={st} value={st}>
                {STAGE_LABELS[st]}
              </option>
            ))}
          </Select>
          <Button variant="ghost" className="text-danger" onClick={() => request(s, "rejected")} disabled={pending}>
            <X size={14} />
            탈락
          </Button>
        </>
      )}
      {dialog}
    </div>
  );
}
