"use client";

import * as React from "react";
import Link from "next/link";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, Search, X } from "lucide-react";
import { Badge, Input } from "@/components/ui";
import { daysBetween, formatPrice } from "@/domain/format";
import { nextStage, PIPELINE_STAGES, STAGE_LABELS, type PipelineStage, type Stage } from "@/domain/pipeline";
import { displayName, isInWatchRange } from "@/domain/stock";
import { cn } from "@/lib/cn";
import { useStageMove } from "./use-stage-move";

export interface KanbanStock {
  id: number;
  market: string;
  ticker: string | null;
  name: string | null;
  currency: string;
  stage: Stage;
  stageChangedAt: string;
  price: number | null;
  watchLow: number | null;
  watchHigh: number | null;
  industry: string | null;
}

export function KanbanBoard({ stocks }: { stocks: KanbanStock[] }) {
  const { request, dialog, pending } = useStageMove();
  const [query, setQuery] = React.useState("");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const q = query.trim().toLowerCase();
  const visible = q
    ? stocks.filter((s) => [s.name, s.ticker, s.industry].some((v) => v?.toLowerCase().includes(q)))
    : stocks;

  const byStage = new Map<PipelineStage, KanbanStock[]>(PIPELINE_STAGES.map((s) => [s, []]));
  for (const s of visible) byStage.get(s.stage as PipelineStage)?.push(s);

  const onDragEnd = (e: DragEndEvent) => {
    const stock = stocks.find((s) => s.id === Number(e.active.id));
    const to = e.over?.id as Stage | undefined;
    if (!stock || !to || to === stock.stage) return;
    request({ id: stock.id, label: displayName(stock) }, to);
  };

  return (
    <div className={cn(pending && "cursor-progress")}>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative w-64">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
          <Input className="pl-8" placeholder="종목명·티커·산업 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <span className="text-xs text-muted">카드를 끌어 단계를 옮기거나 → 버튼으로 다음 단계로 보냅니다. 탈락 영역에 놓으면 탈락 처리합니다.</span>
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {PIPELINE_STAGES.map((stage) => (
            <Column key={stage} stage={stage} stocks={byStage.get(stage)!} onNext={request} />
          ))}
          <RejectDrop />
        </div>
      </DndContext>
      {dialog}
    </div>
  );
}

function Column({
  stage,
  stocks,
  onNext,
}: {
  stage: PipelineStage;
  stocks: KanbanStock[];
  onNext: ReturnType<typeof useStageMove>["request"];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex w-60 shrink-0 flex-col rounded-lg border border-border bg-surface-2/60 transition",
        isOver && "border-accent bg-accent/10",
      )}
    >
      <header className="flex items-center justify-between px-3 py-2">
        <h2 className="text-sm font-semibold">{STAGE_LABELS[stage]}</h2>
        <span className="text-xs text-muted">{stocks.length}</span>
      </header>
      <div className="flex min-h-24 flex-col gap-2 px-2 pb-2">
        {stocks.map((s) => (
          <Card key={s.id} stock={s} onNext={onNext} />
        ))}
      </div>
    </section>
  );
}

function RejectDrop() {
  const { setNodeRef, isOver } = useDroppable({ id: "rejected" });
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex w-36 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center text-sm text-muted",
        isOver && "border-danger bg-danger-bg text-danger",
      )}
    >
      <X size={18} />
      <span className="mt-1">탈락</span>
      <Link href="/rejected" className="mt-1 text-xs underline">
        목록 보기
      </Link>
    </section>
  );
}

function Card({ stock, onNext }: { stock: KanbanStock; onNext: ReturnType<typeof useStageMove>["request"] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: String(stock.id) });
  const next = nextStage(stock.stage);
  const inRange = isInWatchRange(stock.price, stock.watchLow, stock.watchHigh);
  const days = daysBetween(stock.stageChangedAt);
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "cursor-grab touch-none rounded-md border border-border bg-surface p-2.5 shadow-sm active:cursor-grabbing",
        isDragging && "z-10 opacity-80 shadow-lg",
      )}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between gap-1">
        <Link href={`/stocks/${stock.id}`} className="min-w-0 text-sm leading-tight font-semibold hover:underline">
          {displayName(stock)}
        </Link>
        <Badge>{stock.market}</Badge>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-muted">
        <span>{stock.ticker ?? "-"}</span>
        <span className="num">{formatPrice(stock.price, stock.currency)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-1">
        <div className="flex flex-wrap gap-1">
          {inRange && <Badge tone="ok">관심가 진입</Badge>}
          <span className="text-xs text-muted" title="현재 단계에 머문 기간">
            {days}일
          </span>
        </div>
        {next && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onNext({ id: stock.id, label: displayName(stock) }, next)}
            className="inline-flex items-center rounded px-1 py-0.5 text-xs text-accent hover:bg-accent/10"
            title={`${STAGE_LABELS[next]}(으)로 이동`}
          >
            {STAGE_LABELS[next]}
            <ChevronRight size={12} />
          </button>
        )}
      </div>
    </article>
  );
}
