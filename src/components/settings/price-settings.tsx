"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setPriceAutoRefresh } from "@/app/actions/prices";
import { Card, CardHeader } from "@/components/ui";

export function PriceSettings({ autoRefresh }: { autoRefresh: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [on, setOn] = React.useState(autoRefresh);
  return (
    <Card>
      <CardHeader
        title="시세"
        description="한국 종목은 네이버 증권, 미국·유럽 종목과 환율은 Yahoo Finance에서 가져옵니다. 둘 다 비공식 API라 형식이 바뀌면 갱신이 실패할 수 있으며, 그때는 직접 입력하면 됩니다."
      />
      <div className="flex flex-col gap-2 p-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={on}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked;
              setOn(next);
              start(async () => {
                await setPriceAutoRefresh(next);
                router.refresh();
              });
            }}
          />
          대시보드·포트폴리오를 열 때 하루 한 번 자동 갱신
        </label>
        <p className="text-xs text-muted">
          갱신 대상: 아이디어~보유 단계 종목, 보유·현금·관심 종목의 통화 환율. 매도·복기 완료·탈락 종목은 종목 화면의 &lsquo;지금 가져오기&rsquo;로만 갱신합니다.
          유럽·기타 시장 종목은 티커를 Yahoo 형식(NESN.SW, ASML.AS, SHEL.L)으로 입력해야 합니다.
        </p>
      </div>
    </Card>
  );
}
