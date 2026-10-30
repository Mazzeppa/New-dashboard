import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { TemplateEditor } from "@/components/settings/template-editor";
import { getTemplateWithItems } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = getTemplateWithItems(Number(id));
  if (!data) notFound();
  return (
    <>
      <PageHeader
        title={data.template.name}
        description={
          <>
            <Link href="/settings" className="underline">설정</Link> /{" "}
            <Link href="/settings/templates" className="underline">템플릿</Link>
          </>
        }
      />
      <div className="max-w-4xl">
        <TemplateEditor key={data.template.id} template={data.template} items={data.items} />
      </div>
    </>
  );
}
