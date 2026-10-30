"use client";

import Link from "next/link";
import { Alert, Button } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 flex max-w-lg flex-col gap-4">
      <h1 className="text-xl font-bold">문제가 생겼습니다</h1>
      <Alert tone="danger">{error.message || "알 수 없는 오류"}</Alert>
      <p className="text-sm text-muted">입력한 데이터는 이미 저장된 상태일 수 있습니다. 다시 시도하거나 대시보드로 돌아가세요.</p>
      <div className="flex gap-2">
        <Button variant="primary" onClick={reset}>
          다시 시도
        </Button>
        <Link href="/">
          <Button>대시보드</Button>
        </Link>
      </div>
    </div>
  );
}
