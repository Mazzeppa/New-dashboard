import Link from "next/link";
import { Badge } from "@/components/ui";
import { getAnalysisSections, listFinancialValues } from "@/db/queries";
import { ANALYSIS_SECTIONS, completion, getSection } from "@/domain/analysis";
import { cn } from "@/lib/cn";
import { FinancialGrid } from "./financial-grid";
import { SectionEditor } from "./section-editor";

const SUBTABS = [
  { key: "business", label: "사업 이해" },
  { key: "moat", label: "경쟁우위" },
  { key: "financials", label: "재무" },
  { key: "governance", label: "경영진·지배구조" },
] as const;

export function AnalysisTab({ stock, sub }: { stock: { id: number; currency: string }; sub?: string }) {
  const current = SUBTABS.some((s) => s.key === sub) ? sub! : "business";
  const sections = getAnalysisSections(stock.id);

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-2">
        {SUBTABS.map((t) => {
          const def = getSection(t.key);
          const row = sections[t.key];
          const c = def ? completion(def, row?.answers) : null;
          return (
            <Link
              key={t.key}
              href={`/stocks/${stock.id}?tab=analysis&sub=${t.key}`}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
                current === t.key ? "border-accent bg-accent/10 font-semibold" : "border-border text-muted hover:bg-surface-2",
              )}
            >
              {t.label}
              {c && (
                <span className="text-xs text-muted">
                  {c.filled}/{c.total}
                </span>
              )}
              {row?.score != null && (
                <Badge tone={row.score >= 4 ? "ok" : row.score === 3 ? "warn" : "danger"}>{row.score}점</Badge>
              )}
            </Link>
          );
        })}
      </nav>

      {current === "financials" ? (
        <FinancialGrid stockId={stock.id} currency={stock.currency} values={listFinancialValues(stock.id)} />
      ) : (
        ANALYSIS_SECTIONS.filter((s) => s.key === current).map((def) => {
          const row = sections[def.key];
          return (
            <SectionEditor
              key={`${def.key}-${row?.updatedAt ?? "new"}`}
              stockId={stock.id}
              def={def}
              initial={row ? { answers: row.answers, score: row.score, updatedAt: row.updatedAt } : null}
            />
          );
        })
      )}
    </div>
  );
}
