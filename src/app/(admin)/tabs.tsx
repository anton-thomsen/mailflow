"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "../_components/ui";

const TABS = [
  { href: "/workflows", label: "Workflows" },
  { href: "/templates", label: "Templates" },
  { href: "/brand", label: "Brand" },
  { href: "/activity", label: "Activity" },
] as const;

export function Tabs() {
  const pathname = usePathname();
  return (
    <nav className="-mb-px mt-3 flex gap-1">
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium",
              active ? "border-(--accent) text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
