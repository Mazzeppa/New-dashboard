import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { BackupPanel } from "@/components/settings/backup-panel";
import { FilterItemsEditor } from "@/components/settings/filter-items-editor";
import { MistakeTagsEditor } from "@/components/settings/mistake-tags-editor";
import { listFilterItems, listMistakeTagsWithUsage, listTemplates } from "@/db/queries";
import { countRows, schemaVersion } from "@/lib/server/backup";
import { PriceSettings } from "@/components/settings/price-settings";
import { autoRefreshEnabled } from "@/lib/server/price-refresh";

export const dynamic = "force-dynamic";
export const metadata = { title: "설정" };


export default function SettingsPage() {
  const templates = listTemplates();
  return (
    <>
      <PageHeader title="설정" description="체크리스트 항목, 템플릿, 실수 태그, 시세, 백업을 관리합니다. 환율과 현금은 포트폴리오 화면에서 입력합니다." />
      <div className="flex max-w-4xl flex-col gap-5">
        <FilterItemsEditor items={listFilterItems()} />
        <Link href="/settings/templates">
          <Card className="flex items-center justify-between p-4 hover:bg-surface-2">
            <div>
              <h2 className="text-sm font-semibold">체크리스트 템플릿</h2>
              <p className="mt-0.5 text-xs text-muted">
                {templates.map((t) => t.template.name).join(", ")} · 3단계 심층 분석에서 종목에 적용
              </p>
            </div>
            <ChevronRight size={16} className="text-muted" />
          </Card>
        </Link>
        <MistakeTagsEditor tags={listMistakeTagsWithUsage()} />
        <PriceSettings autoRefresh={autoRefreshEnabled()} />
        <BackupPanel schemaVersion={schemaVersion()} currentCounts={countRows()} />
      </div>
    </>
  );
}
