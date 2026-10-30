import { PageHeader } from "@/components/ui";
import { FilterItemsEditor } from "@/components/settings/filter-items-editor";
import { listFilterItems } from "@/db/queries";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="설정" description="체크리스트 항목, 템플릿, 실수 태그, 환율, 백업을 관리합니다." />
      <div className="flex max-w-4xl flex-col gap-5">
        <FilterItemsEditor items={listFilterItems()} />
      </div>
    </>
  );
}
