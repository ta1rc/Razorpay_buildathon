import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StatusChip } from "@/components/ui/status-chip";
import { pickEffectiveCatalogVersion } from "@/lib/merchant-stats";

export const dynamic = "force-dynamic";

export default async function CatalogIndexPage() {
  const merchants = await prisma.merchant.findMany({
    orderBy: { name: "asc" },
    include: { catalogVersions: { orderBy: { createdAt: "desc" } } },
  });

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Product blocks</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
        The literal AI-agent-readable format this system produces: static attributes, dynamic
        price/stock, verification level and freshness, all in one block per product.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {merchants.map((m) => {
          const latest = pickEffectiveCatalogVersion(m.catalogVersions);
          const isLive = latest?.status === "LIVE";
          return (
            <Link
              key={m.id}
              href={isLive ? `/merchant/catalog/${m.slug}` : "/merchant/onboard"}
              className="flex flex-col items-start rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--accent)]"
            >
              <span className="text-base font-semibold text-[var(--text-primary)]">{m.name}</span>
              <span className="mt-1 text-xs text-[var(--text-tertiary)]">{m.siteDescription}</span>
              <div className="mt-4">
                <StatusChip tone={isLive ? "success" : "neutral"}>
                  {isLive ? "catalog live" : latest ? latest.status.toLowerCase() : "not onboarded yet"}
                </StatusChip>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
