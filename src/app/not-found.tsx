import Link from "next/link";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 flex max-w-lg flex-col gap-4">
      <h1 className="text-xl font-bold">찾을 수 없습니다</h1>
      <p className="text-sm text-muted">삭제된 종목이거나 잘못된 주소입니다.</p>
      <div className="flex gap-2">
        <Link href="/pipeline">
          <Button variant="primary">파이프라인</Button>
        </Link>
        <Link href="/">
          <Button>대시보드</Button>
        </Link>
      </div>
    </div>
  );
}
