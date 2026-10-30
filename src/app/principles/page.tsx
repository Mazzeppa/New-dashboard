import { Card, CardHeader, PageHeader } from "@/components/ui";
import { PrinciplesForm } from "@/components/principles/principles-form";
import { formatDateTime } from "@/domain/format";
import { getPrinciples, listPrincipleVersions } from "@/db/queries";
import { diffPrinciples } from "@/domain/principles";

export const dynamic = "force-dynamic";
export const metadata = { title: "투자 원칙" };


export default function PrinciplesPage() {
  const current = getPrinciples();
  const versions = listPrincipleVersions();
  return (
    <>
      <PageHeader title="투자 원칙" description="0단계. 모든 판단의 기준입니다. 바꿀 때마다 언제, 왜 바꿨는지 버전으로 남깁니다." />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <PrinciplesForm initial={current.data} version={current.version} />
        <Card className="self-start">
          <CardHeader title="버전 이력" />
          <ol className="divide-y divide-border">
            {versions.map((v, i) => {
              const prev = versions[i + 1];
              const changed = prev ? diffPrinciples(prev.data, v.data) : [];
              return (
                <li key={v.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">v{v.version}</span>
                    <span className="text-xs text-muted">{formatDateTime(v.createdAt)}</span>
                  </div>
                  <p className="mt-1">{v.reason}</p>
                  {changed.length > 0 && <p className="mt-1 text-xs text-muted">변경: {changed.join(", ")}</p>}
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-muted">당시 수치</summary>
                    <p className="mt-1 text-muted">
                      종목 {v.data.maxPositionPct}% · 산업 {v.data.maxIndustryPct}% · 최대손실 {v.data.maxLossPerPositionPct}%
                      <br />
                      능력 범위: {v.data.industries.join(", ") || "-"}
                    </p>
                  </details>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    </>
  );
}
