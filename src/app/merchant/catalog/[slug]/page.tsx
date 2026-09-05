import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CatalogClient } from "./catalog-client";

export const dynamic = "force-dynamic";

export default async function MerchantCatalogPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const merchant = await prisma.merchant.findUnique({ where: { slug } });
  if (!merchant) notFound();

  const catalogVersion = await prisma.catalogVersion.findFirst({
    where: { merchantId: merchant.id, status: "LIVE" },
    orderBy: { createdAt: "desc" },
    include: { products: { include: { ambiguityFlags: true } }, bundles: true },
  });

  const products = (catalogVersion?.products ?? []).map((p) => ({
    id: p.id,
    static: JSON.parse(p.staticJson),
    dynamic: JSON.parse(p.dynamicJson),
    provenance: JSON.parse(p.provenanceJson),
    verificationLevel: p.verificationLevel,
    confidenceScore: p.confidenceScore,
    freshnessState: p.freshnessState,
    lastCheckedAt: p.lastCheckedAt.toISOString(),
    flags: p.ambiguityFlags,
  }));

  const skuTitle = new Map(products.map((p) => [p.static.common.sku as string, p.static.common.title as string]));
  const bundles = (catalogVersion?.bundles ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
    bundlePrice: b.bundlePrice,
    discountPct: b.discountPct,
    itemTitles: (JSON.parse(b.productSkusJson) as string[]).map((sku) => skuTitle.get(sku) ?? sku),
  }));

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{merchant.name} — structured catalog</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        {catalogVersion
          ? `${products.length} products live · published ${catalogVersion.approvedAt?.toLocaleString() ?? ""}`
          : "No live catalog yet — run onboarding first."}
      </p>

      {bundles.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {bundles.map((b) => (
            <div key={b.id} className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--text-primary)]">📦 {b.name}</span>
                <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-[var(--accent-strong)]">
                  {b.discountPct}% off bundle
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">{b.description}</p>
              <p className="mt-2 text-xs text-[var(--text-tertiary)]">{b.itemTitles.join(" + ")}</p>
              <p className="mt-2 text-sm font-semibold text-[var(--success)]">
                ₹{(b.bundlePrice / 100).toLocaleString("en-IN")}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        {products.length > 0 ? (
          <CatalogClient products={products} />
        ) : (
          <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 text-sm text-[var(--text-tertiary)]">
            This merchant hasn&apos;t been onboarded yet.
          </div>
        )}
      </div>
    </div>
  );
}
