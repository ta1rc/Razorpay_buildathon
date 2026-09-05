import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCatalogueHealth, getAmbiguityStats, getOrderStats, pickEffectiveCatalogVersion } from "@/lib/merchant-stats";
import { KpiCard } from "@/components/ui/kpi-card";
import { BarChart } from "@/components/ui/bar-chart";
import { StatusChip } from "@/components/ui/status-chip";

export const dynamic = "force-dynamic";

export default async function MerchantDashboard() {
  const [health, ambiguity, orders, merchants] = await Promise.all([
    getCatalogueHealth(),
    getAmbiguityStats(),
    getOrderStats(),
    prisma.merchant.findMany({
      orderBy: { name: "asc" },
      include: { catalogVersions: { orderBy: { createdAt: "desc" } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Overview</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Real metrics from this system&apos;s own data — nothing here is simulated for effect.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Revenue (paid orders)" value={`₹${(orders.totalRevenue / 100).toLocaleString("en-IN")}`} />
        <KpiCard label="Orders" value={String(orders.totalOrders)} sublabel={`${orders.paidCount} paid · ${orders.failedCount} failed`} />
        <KpiCard label="Avg. order value" value={`₹${(orders.avgOrderValue / 100).toLocaleString("en-IN")}`} />
        <KpiCard
          label="Catalogue health"
          value={`${health.healthPct}%`}
          sublabel={`${health.verified} verified of ${health.total}`}
          tone={health.healthPct >= 70 ? "success" : "neutral"}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-5 lg:col-span-2">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
            Paid orders — last 7 days
          </div>
          <div className="mt-4">
            <BarChart data={orders.days.map((d) => ({ label: d.label, value: d.count }))} />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-5">
          <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">Catalogue health</div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <StatusChip tone="success">Verified</StatusChip>
              <span className="tabular-nums text-[var(--text-secondary)]">{health.verified}</span>
            </div>
            <div className="flex items-center justify-between">
              <StatusChip tone="warning">Inferred</StatusChip>
              <span className="tabular-nums text-[var(--text-secondary)]">{health.inferred}</span>
            </div>
            <div className="flex items-center justify-between">
              <StatusChip tone="danger">Unverified</StatusChip>
              <span className="tabular-nums text-[var(--text-secondary)]">{health.unverified}</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[var(--surface-border)] pt-3">
              <span className="text-[var(--text-tertiary)]">Ambiguity flags</span>
              <span className="tabular-nums text-[var(--text-secondary)]">
                {ambiguity.resolved} resolved / {ambiguity.total}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--text-tertiary)]">Merchants</h2>
        <Link href="/merchant/onboard" className="text-sm font-medium text-[var(--accent-strong)] hover:underline">
          Onboard a catalogue →
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {merchants.map((m) => {
          const latest = pickEffectiveCatalogVersion(m.catalogVersions);
          const isLive = latest?.status === "LIVE";
          return (
            <Link
              key={m.id}
              href={isLive ? `/merchant/catalog/${m.slug}` : "/merchant/onboard"}
              className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-4 transition-colors hover:border-[var(--accent)]"
            >
              <div className="text-sm font-semibold text-[var(--text-primary)]">{m.name}</div>
              <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                {m.siteBasePath ? "Website sync" : "CSV upload"}
              </div>
              <div className="mt-3">
                <StatusChip tone={isLive ? "success" : "neutral"}>
                  {isLive ? "live" : latest ? latest.status.toLowerCase() : "not onboarded"}
                </StatusChip>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
