import Link from "next/link";

export function SlimHeader({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <header className="border-b border-[var(--surface-border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--sidebar-bg)] text-xs font-bold text-white">
            A
          </span>
          <span className="text-sm font-semibold text-[var(--text-primary)]">Agentic Commerce</span>
        </Link>
        <Link href={backHref} className="text-sm font-medium text-[var(--accent-strong)] hover:underline">
          {backLabel}
        </Link>
      </div>
    </header>
  );
}
