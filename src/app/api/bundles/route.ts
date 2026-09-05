import { NextResponse } from "next/server";
import { getLiveBundles } from "@/lib/agent";
import type { Vertical } from "@/lib/enums";

export async function GET(req: Request) {
  const vertical = new URL(req.url).searchParams.get("vertical") as Vertical | null;
  if (!vertical) return NextResponse.json({ error: "vertical is required" }, { status: 400 });

  const bundles = await getLiveBundles(vertical);
  return NextResponse.json({
    bundles: bundles.map((b) => ({
      id: b.id,
      merchantName: b.merchantName,
      name: b.name,
      description: b.description,
      bundlePrice: b.bundlePrice,
      discountPct: b.discountPct,
      items: b.items.map((c) => ({ productId: c.id, title: c.common.title, price: c.price, qty: 1 })),
    })),
  });
}
