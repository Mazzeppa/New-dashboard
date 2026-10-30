import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { TemplatesList } from "@/components/settings/templates-list";
import { listTemplates } from "@/db/queries";

export const dynamic = "force-dynamic";

export default function TemplatesPage() {
  const rows = listTemplates();
  return (
    <>
      <PageHeader
        title="체크리스트 템플릿"
        description={
          <>
            <Link href="/settings" className="underline">설정</Link> / 템플릿
          </>
        }
      />
      <div className="max-w-4xl">
        <TemplatesList templates={rows.map((r) => ({ ...r.template, itemCount: r.itemCount, usedBy: r.usedBy }))} />
      </div>
    </>
  );
}
