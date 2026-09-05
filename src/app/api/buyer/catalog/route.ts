import { NextResponse } from "next/server";
import { getLiveCandidates } from "@/lib/agent";
import type { Vertical } from "@/lib/enums";

export async function GET(req: Request) {
  const vertical = new URL(req.url).searchParams.get("vertical") as Vertical | null;
  if (!vertical) return NextResponse.json({ error: "vertical is required" }, { status: 400 });

  const candidates = await getLiveCandidates(vertical);
  return NextResponse.json({
    products: candidates.map((c) => ({
      productId: c.id,
      merchantName: c.merchantName,
      title: c.common.title,
      brand: c.common.brand,
      category: c.common.category,
      subcategory: c.common.subcategory,
      imageEmoji: c.common.imageEmoji,
      facet: c.facet,
      price: c.price,
      stockCount: c.stockCount,
      discountPct: c.discountPct,
      verificationLevel: c.verificationLevel,
      freshnessState: c.freshnessState,
    })),
  });
}
