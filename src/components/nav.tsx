"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Columns3, LayoutDashboard, Plus, Settings, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import { ThemeToggle } from "./theme";

const NAV = [
  { href: "/", label: "대시보드", icon: LayoutDashboard },
  { href: "/pipeline", label: "파이프라인", icon: Columns3 },
  { href: "/rejected", label: "탈락 목록", icon: Trash2 },
  { href: "/principles", label: "투자 원칙", icon: BookOpen },
  { href: "/stocks/import", label: "후보 가져오기", icon: Upload },
  { href: "/settings", label: "설정", icon: Settings },
];

export function Nav() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <aside className="sticky top-0 z-20 flex shrink-0 items-center gap-1 border-b border-border bg-surface px-3 py-2 md:h-screen md:w-14 md:flex-col md:items-stretch md:border-r md:border-b-0 md:py-4 lg:w-52">
      <Link href="/" className="mr-2 px-2 text-sm font-bold md:mb-4 md:mr-0">
        <span className="lg:hidden">VP</span>
        <span className="hidden lg:inline">가치투자 프로세스</span>
      </Link>
      <Link
        href="/stocks/new"
        className="mb-0 inline-flex items-center gap-2 rounded-md bg-accent px-2 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 md:mb-3"
        title="종목 추가"
      >
        <Plus size={16} />
        <span className="hidden lg:inline">종목 추가</span>
      </Link>
      <nav className="flex gap-1 overflow-x-auto md:flex-col">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={label}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-sm whitespace-nowrap",
              active(href) ? "bg-surface-2 font-semibold text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon size={16} className="shrink-0" />
            <span className="md:hidden lg:inline">{label}</span>
          </Link>
        ))}
      </nav>
      <div className="ml-auto md:mt-auto md:ml-0">
        <ThemeToggle />
      </div>
    </aside>
  );
}
