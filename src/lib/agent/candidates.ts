import { prisma } from "@/lib/prisma";
import type { Vertical } from "@/lib/enums";
import type { StaticJson, DynamicJson } from "@/lib/catalog-types";

export interface Candidate {
  id: string;
  sku: string;
  merchantName: string;
  common: StaticJson["common"];
  facet: StaticJson["facet"];
  price: number; // paise
  stockCount: number;
  discountPct: number;
  verificationLevel: string;
  freshnessState: string;
  upgradeSku?: string;
  pairsWithSkus: string[];
}

/** Live, agent-readable candidates for a vertical — the only products the buyer-chat agent may recommend. */
export async function getLiveCandidates(vertical: Vertical): Promise<Candidate[]> {
  const merchants = await prisma.merchant.findMany({
    where: { vertical },
    include: {
      catalogVersions: {
        where: { status: "LIVE" },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { products: true },
      },
    },
  });

  const candidates: Candidate[] = [];
  for (const m of merchants) {
    const liveVersion = m.catalogVersions[0];
    if (!liveVersion) continue;
    for (const p of liveVersion.products) {
      const staticJson: StaticJson = JSON.parse(p.staticJson);
      const dynamicJson: DynamicJson = JSON.parse(p.dynamicJson);
      candidates.push({
        id: p.id,
        sku: staticJson.common.sku,
        merchantName: m.name,
        common: staticJson.common,
        facet: staticJson.facet,
        price: dynamicJson.price,
        stockCount: dynamicJson.stockCount,
        discountPct: dynamicJson.discountPct,
        verificationLevel: p.verificationLevel,
        freshnessState: p.freshnessState,
        upgradeSku: staticJson.common.upgradeSku,
        pairsWithSkus: staticJson.common.pairsWithSkus ?? [],
      });
    }
  }
  return candidates;
}

export interface LiveBundle {
  id: string;
  merchantName: string;
  name: string;
  description: string;
  bundlePrice: number;
  discountPct: number;
  items: Candidate[];
}

/** Live merchant-curated bundles for a vertical, with their SKUs resolved to live candidates. */
export async function getLiveBundles(vertical: Vertical): Promise<LiveBundle[]> {
  const merchants = await prisma.merchant.findMany({
    where: { vertical },
    include: {
      catalogVersions: {
        where: { status: "LIVE" },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { products: true, bundles: true },
      },
    },
  });

  const bundles: LiveBundle[] = [];
  for (const m of merchants) {
    const liveVersion = m.catalogVersions[0];
    if (!liveVersion) continue;

    const skuToCandidate = new Map<string, Candidate>();
    for (const p of liveVersion.products) {
      const staticJson: StaticJson = JSON.parse(p.staticJson);
      const dynamicJson: DynamicJson = JSON.parse(p.dynamicJson);
      skuToCandidate.set(staticJson.common.sku, {
        id: p.id,
        sku: staticJson.common.sku,
        merchantName: m.name,
        common: staticJson.common,
        facet: staticJson.facet,
        price: dynamicJson.price,
        stockCount: dynamicJson.stockCount,
        discountPct: dynamicJson.discountPct,
        verificationLevel: p.verificationLevel,
        freshnessState: p.freshnessState,
        upgradeSku: staticJson.common.upgradeSku,
        pairsWithSkus: staticJson.common.pairsWithSkus ?? [],
      });
    }

    for (const b of liveVersion.bundles) {
      const skus: string[] = JSON.parse(b.productSkusJson);
      const items = skus.map((sku) => skuToCandidate.get(sku)).filter((c): c is Candidate => c !== undefined);
      if (items.length === 0) continue;
      bundles.push({
        id: b.id,
        merchantName: m.name,
        name: b.name,
        description: b.description,
        bundlePrice: b.bundlePrice,
        discountPct: b.discountPct,
        items,
      });
    }
  }
  return bundles;
}
