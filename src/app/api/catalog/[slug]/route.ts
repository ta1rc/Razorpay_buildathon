import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const merchant = await prisma.merchant.findUnique({ where: { slug } });
  if (!merchant) return NextResponse.json({ error: "Merchant not found" }, { status: 404 });

  const catalogVersion = await prisma.catalogVersion.findFirst({
    where: { merchantId: merchant.id, status: "LIVE" },
    orderBy: { createdAt: "desc" },
    include: { products: { include: { ambiguityFlags: true } } },
  });

  if (!catalogVersion) {
    return NextResponse.json({ merchant, catalogVersion: null, products: [] });
  }

  return NextResponse.json({
    merchant,
    catalogVersion: {
      id: catalogVersion.id,
      createdAt: catalogVersion.createdAt,
      approvedAt: catalogVersion.approvedAt,
    },
    products: catalogVersion.products.map((p) => ({
      id: p.id,
      static: JSON.parse(p.staticJson),
      dynamic: JSON.parse(p.dynamicJson),
      provenance: JSON.parse(p.provenanceJson),
      verificationLevel: p.verificationLevel,
      confidenceScore: p.confidenceScore,
      freshnessState: p.freshnessState,
      lastCheckedAt: p.lastCheckedAt,
      flags: p.ambiguityFlags,
    })),
  });
}
