import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { DynamicJson } from "@/lib/catalog-types";

// Demo-only endpoint: lets a presenter force a live price/stock change on a
// specific product between quoting and checkout, so the failure-handling
// flow (Stage 6) can be triggered reliably instead of waiting for real drift.
export async function POST(req: Request) {
  const { productId, mode } = (await req.json()) as {
    productId: string;
    mode: "price_spike" | "out_of_stock" | "reset";
  };

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const dynamic: DynamicJson = JSON.parse(product.dynamicJson);

  if (mode === "price_spike") {
    // Round to the nearest whole rupee (paise is x100) so displayed amounts
    // stay consistent with the rest of the demo data, which is whole-rupee.
    dynamic.price = Math.round((dynamic.price * 1.15) / 100) * 100;
  } else if (mode === "out_of_stock") {
    dynamic.stockCount = 0;
  } else if (mode === "reset") {
    // no-op placeholder; a real reset would restore from the original scrape
  }
  dynamic.lastVerifiedAt = new Date().toISOString();

  await prisma.product.update({
    where: { id: productId },
    data: {
      dynamicJson: JSON.stringify(dynamic),
      freshnessState: "STALE",
      lastCheckedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, dynamic });
}
