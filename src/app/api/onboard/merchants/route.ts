import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pickEffectiveCatalogVersion } from "@/lib/merchant-stats";

export async function GET() {
  const merchants = await prisma.merchant.findMany({
    orderBy: { name: "asc" },
    include: {
      catalogVersions: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return NextResponse.json({
    merchants: merchants.map((m) => {
      const effective = pickEffectiveCatalogVersion(m.catalogVersions);
      return {
        id: m.id,
        slug: m.slug,
        name: m.name,
        vertical: m.vertical,
        siteBasePath: m.siteBasePath,
        siteDescription: m.siteDescription,
        latestCatalogStatus: effective?.status ?? null,
        latestCatalogVersionId: effective?.id ?? null,
      };
    }),
  });
}
