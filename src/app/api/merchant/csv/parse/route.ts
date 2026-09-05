import { NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/prisma";
import { normalizeCsvRows, type CsvRow } from "@/lib/csv-normalizer";

export async function POST(req: Request) {
  const { merchantSlug, csvText, sourceLabel } = (await req.json()) as {
    merchantSlug: string;
    csvText: string;
    sourceLabel?: string;
  };

  const merchant = await prisma.merchant.findUnique({ where: { slug: merchantSlug } });
  if (!merchant) return NextResponse.json({ error: "Merchant not found" }, { status: 404 });

  const parsed = Papa.parse<CsvRow>(csvText, { header: true, skipEmptyLines: true });
  const rawRowCount = parsed.data.length;

  const normalized = normalizeCsvRows(parsed.data, sourceLabel ?? `csv-upload:${merchantSlug}`);

  const catalogVersion = await prisma.catalogVersion.create({
    data: { merchantId: merchant.id, status: "DRAFT" },
  });

  const results = [];
  for (const n of normalized) {
    const product = await prisma.product.create({
      data: {
        catalogVersionId: catalogVersion.id,
        staticJson: JSON.stringify(n.staticJson),
        dynamicJson: JSON.stringify(n.dynamicJson),
        provenanceJson: JSON.stringify(n.provenanceJson),
        verificationLevel: n.verificationLevel,
        confidenceScore: n.confidenceScore,
        freshnessState: "FRESH",
      },
    });

    const flags = await Promise.all(
      n.flags.map((f) =>
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
        static: n.staticJson,
        dynamic: n.dynamicJson,
        provenance: n.provenanceJson,
        verificationLevel: n.verificationLevel,
        confidenceScore: n.confidenceScore,
      },
      flags: flags.map((f) => ({ id: f.id, field: f.field, reason: f.reason, suggestedValue: f.suggestedValue })),
      excludeSuggested: n.excludeSuggested,
    });
  }

  await prisma.catalogVersion.update({ where: { id: catalogVersion.id }, data: { status: "PENDING_APPROVAL" } });

  return NextResponse.json({
    catalogVersionId: catalogVersion.id,
    merchant: { slug: merchant.slug, name: merchant.name, vertical: merchant.vertical },
    rawRowCount,
    products: results,
  });
}
