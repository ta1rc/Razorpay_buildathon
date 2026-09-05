import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BUNDLES } from "@/lib/demo-products";
import type { StaticJson, DynamicJson } from "@/lib/catalog-types";

export async function POST(req: Request) {
  const { catalogVersionId, resolutions } = (await req.json()) as {
    catalogVersionId: string;
    resolutions: { flagId: string; resolution: string }[];
  };

  // updateMany (not update) — a resolution can reference a flag whose
  // product was since excluded (and its flags deleted) by the CSV review
  // step; updateMany simply no-ops for a missing id instead of throwing,
  // so one stale resolution can't abort the whole approval.
  for (const r of resolutions) {
    await prisma.ambiguityFlag.updateMany({
      where: { id: r.flagId },
      data: { resolved: true, resolution: r.resolution },
    });
  }

  const pending = await prisma.catalogVersion.findUniqueOrThrow({ where: { id: catalogVersionId } });

  // Exactly one LIVE catalog version per merchant — otherwise getLiveCandidates
  // (which always takes the most-recently-created LIVE version) can drift out
  // of sync between when a buyer-chat turn picked a product and when the
  // quote is confirmed, since re-onboarding creates a new version each time.
  await prisma.catalogVersion.updateMany({
    where: { merchantId: pending.merchantId, status: "LIVE" },
    data: { status: "SUPERSEDED" },
  });

  const catalogVersion = await prisma.catalogVersion.update({
    where: { id: catalogVersionId },
    data: { status: "LIVE", approvedAt: new Date() },
    include: { merchant: true, products: true },
  });

  // Merchant-curated bundles are a merchant feature, not scraped — sourced
  // from the BUNDLES config and priced off the just-approved live prices.
  const bundleConfigs = BUNDLES[catalogVersion.merchant.slug] ?? [];
  const skuToProduct = new Map(
    catalogVersion.products.map((p) => {
      const staticJson: StaticJson = JSON.parse(p.staticJson);
      return [staticJson.common.sku, p];
    }),
  );

  for (const config of bundleConfigs) {
    const matched = config.skus
      .map((sku) => skuToProduct.get(sku))
      .filter((p): p is (typeof catalogVersion.products)[number] => p !== undefined);

    if (matched.length !== config.skus.length) continue; // skip if a SKU wasn't found this scan

    const fullPrice = matched.reduce((sum, p) => {
      const dynamicJson: DynamicJson = JSON.parse(p.dynamicJson);
      return sum + dynamicJson.price;
    }, 0);
    const bundlePrice = Math.round((fullPrice * (100 - config.discountPct)) / 100 / 100) * 100;

    await prisma.bundle.create({
      data: {
        catalogVersionId: catalogVersion.id,
        name: config.name,
        description: config.description,
        productSkusJson: JSON.stringify(config.skus),
        bundlePrice,
        discountPct: config.discountPct,
      },
    });
  }

  return NextResponse.json({ catalogVersion });
}
