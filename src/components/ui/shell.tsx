"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSwitchRole } from "@/lib/role-context";

export interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
}

export function Shell({
  roleLabel,
  navItems,
  children,
}: {
  roleLabel: string;
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const switchRole = useSwitchRole();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--sidebar-border)] bg-[var(--sidebar-bg)]">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-bold text-black">
            A
          </span>
          <div>
            <div className="text-sm font-semibold text-white">Agentic Commerce</div>
            <div className="text-[11px] text-[var(--sidebar-fg)]">{roleLabel}</div>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-0.5 px-3">
          {navItems.map((item) => {
            const active = item.exact ? pathname === item.href : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-white/10 font-medium text-[var(--sidebar-fg-active)]"
                    : "text-[var(--sidebar-fg)] hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--sidebar-border)] px-3 py-4">
          <button
            onClick={switchRole}
            className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-[var(--sidebar-fg)] hover:bg-white/5 hover:text-white"
          >
            Switch role →
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
