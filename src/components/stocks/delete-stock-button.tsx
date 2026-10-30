"use client";

import { deleteStock } from "@/app/actions/stocks";
import { Button } from "@/components/ui";

export function DeleteStockButton({ stockId, label }: { stockId: number; label: string }) {
  return (
    <Button
      variant="ghost"
      className="text-danger"
      onClick={() => {
        if (window.confirm(`${label}과(와) 관련된 모든 기록을 삭제할까요? 되돌릴 수 없습니다.`)) deleteStock(stockId);
      }}
    >
      종목 삭제
    </Button>
  );
}
