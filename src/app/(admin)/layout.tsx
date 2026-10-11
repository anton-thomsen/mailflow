import type { CSSProperties, ReactNode } from "react";
import { requireAdmin } from "~/server/auth";
import { config } from "~/server/config";
import { getBrand } from "~/server/settings";
import { Tabs } from "./tabs";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdmin();
  const brand = await getBrand();
  const back = config().HOST_ADMIN_URL;
  return (
    <div className="min-h-screen" style={{ "--accent": brand.colors.primary } as CSSProperties}>
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 pt-4">
          <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <span className="size-2.5 rounded-full bg-(--accent)" />
            mailflow
          </span>
          <div className="ml-auto flex items-center gap-4 text-sm text-stone-500">
            <span>{admin.email}</span>
            {back ? (
              <a href={back} className="font-medium text-stone-700 hover:text-stone-900">
                Back to app
              </a>
            ) : null}
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-6">
          <Tabs />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
