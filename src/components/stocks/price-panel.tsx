"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { addPrice, deletePrice } from "@/app/actions/stocks";
import { Alert, Button, Card, CardHeader, Input, Table } from "@/components/ui";
import { formatPrice, parseNumberInput } from "@/domain/format";
import { today } from "@/lib/action";

export function PricePanel({
  stockId,
  currency,
  prices,
}: {
  stockId: number;
  currency: string;
  prices: { id: number; date: string; price: number; source: string }[];
}) {
  const router = useRouter();
  const [date, setDate] = React.useState(today());
  const [price, setPrice] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseNumberInput(price);
    if (p == null) return setError("가격을 입력하세요.");
    start(async () => {
      const r = await addPrice({ stockId, date, price: p });
      if (!r.ok) setError(r.error);
      else {
        setError(null);
        setPrice("");
        router.refresh();
      }
    });
  };

  return (
    <Card>
      <CardHeader title="현재가" description="수동 입력. 가장 최근 날짜의 가격을 현재가로 씁니다." />
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2 px-4 pt-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        <Input placeholder={`가격 (${currency})`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="w-36" />
        <Button type="submit" disabled={pending}>
          기록
        </Button>
      </form>
      {error && (
        <div className="px-4 pt-2">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <div className="mt-3 max-h-64 overflow-y-auto">
        <Table>
          <thead>
            <tr>
              <th>날짜</th>
              <th className="text-right">가격</th>
              <th>출처</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {prices.map((p) => (
              <tr key={p.id}>
                <td>{p.date}</td>
                <td className="num">{formatPrice(p.price, currency)}</td>
                <td className="text-muted">{p.source === "manual" ? "수동" : p.source}</td>
                <td className="w-8">
                  <button
                    type="button"
                    className="text-muted hover:text-danger"
                    aria-label="삭제"
                    onClick={() => start(async () => { await deletePrice(p.id); router.refresh(); })}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {prices.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted">
                  기록된 가격이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}
