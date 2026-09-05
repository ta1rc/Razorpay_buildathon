import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scrapeStorefront } from "@/lib/scraper";
import { normalizeRawProduct } from "@/lib/normalizer";
import type { Vertical } from "@/lib/enums";

export async function POST(req: Request) {
  const { merchantSlug } = (await req.json()) as { merchantSlug: string };

  const merchant = await prisma.merchant.findUnique({ where: { slug: merchantSlug } });
  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }
  if (!merchant.siteBasePath) {
    return NextResponse.json({ error: "This merchant has no storefront to scrape — use CSV upload instead." }, { status: 400 });
  }

  const baseUrl = new URL(req.url).origin;
  const rawProducts = await scrapeStorefront(merchant.siteBasePath, baseUrl);

  const catalogVersion = await prisma.catalogVersion.create({
    data: { merchantId: merchant.id, status: "DRAFT" },
  });

  const results = [];
  for (const raw of rawProducts) {
    const normalized = normalizeRawProduct(raw, merchant.vertical as Vertical);

    const product = await prisma.product.create({
      data: {
        catalogVersionId: catalogVersion.id,
        staticJson: JSON.stringify(normalized.staticJson),
        dynamicJson: JSON.stringify(normalized.dynamicJson),
        provenanceJson: JSON.stringify(normalized.provenanceJson),
        verificationLevel: normalized.verificationLevel,
        confidenceScore: normalized.confidenceScore,
        freshnessState: "FRESH",
      },
    });

    const flags = await Promise.all(
      normalized.flags.map((f) =>
        prisma.ambiguityFlag.create({
          data: {
            productId: product.id,
            field: f.field,
            reason: f.reason,
            suggestedValue: f.suggestedValue,
          },
        }),
      ),
    );

    results.push({
      product: {
        id: product.id,
        static: normalized.staticJson,
        dynamic: normalized.dynamicJson,
        provenance: normalized.provenanceJson,
        verificationLevel: normalized.verificationLevel,
        confidenceScore: normalized.confidenceScore,
      },
      flags: flags.map((f) => ({
        id: f.id,
        field: f.field,
        reason: f.reason,
        suggestedValue: f.suggestedValue,
      })),
    });
  }

  await prisma.catalogVersion.update({
    where: { id: catalogVersion.id },
    data: { status: "PENDING_APPROVAL" },
  });

  return NextResponse.json({
    catalogVersionId: catalogVersion.id,
    merchant: { slug: merchant.slug, name: merchant.name, vertical: merchant.vertical },
    products: results,
  });
}
