"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { useStageMove } from "@/components/pipeline/use-stage-move";
import { STAGE_LABELS, type PipelineStage } from "@/domain/pipeline";

export function RestoreButton({ stock }: { stock: { id: number; label: string; to: PipelineStage } }) {
  const { request, dialog, pending } = useStageMove();
  return (
    <>
      <Button size="sm" onClick={() => request({ id: stock.id, label: stock.label }, stock.to)} disabled={pending}>
        <RotateCcw size={12} />
        {STAGE_LABELS[stock.to]}(으)로 복원
      </Button>
      {dialog}
    </>
  );
}
