import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLiveCandidates } from "@/lib/agent/candidates";
import { findAlternatives } from "@/lib/agent/alternatives";
import type { Vertical } from "@/lib/enums";

interface RequestedItem {
  productId: string;
  qty: number;
  requestedPrice: number; // paise, what the buyer saw in chat (for a bundle: the discounted line price)
  // Bundle-specific: the live full price the discount was computed against,
  // so a real price rise on the underlying item is still caught even though
  // requestedPrice is intentionally below the live price for a bundle.
  expectedFullPrice?: number;
  bundlePriced?: boolean;
}

export async function POST(req: Request) {
  const { chatSessionId, items } = (await req.json()) as {
    chatSessionId: string;
    items: RequestedItem[];
  };

  const session = await prisma.chatSession.findUnique({ where: { id: chatSessionId } });
  if (!session) return NextResponse.json({ error: "Chat session not found" }, { status: 404 });

  const candidates = await getLiveCandidates(session.vertical as Vertical);
  const candidateById = new Map(candidates.map((c) => [c.id, c]));

  const verifiedItems = items.map((item) => {
    const live = candidateById.get(item.productId);
    const verifiedPrice = live?.price ?? null;
    const verifiedStock = live?.stockCount ?? 0;
    const priceCeiling = item.expectedFullPrice ?? item.requestedPrice;
    const priceChanged = verifiedPrice !== null && verifiedPrice > priceCeiling;
    const outOfStock = verifiedStock < item.qty;
    const chargedPrice = item.bundlePriced ? item.requestedPrice : verifiedPrice ?? item.requestedPrice;
    return {
      productId: item.productId,
      title: live?.common.title ?? "unknown",
      qty: item.qty,
      requestedPrice: item.requestedPrice,
      verifiedPrice,
      verifiedStock,
      chargedPrice,
      bundlePriced: item.bundlePriced ?? false,
      valid: live !== undefined && !priceChanged && !outOfStock,
      priceChanged,
      outOfStock,
    };
  });

  const invalidItems = verifiedItems.filter((i) => !i.valid);
  const valid = invalidItems.length === 0;

  let invalidReason: string | null = null;
  let alternatives: ReturnType<typeof findAlternatives> = [];

  if (!valid) {
    const reasons = invalidItems.map((i) => {
      if (i.outOfStock) return `${i.title} only has ${i.verifiedStock} left (needed ${i.qty}).`;
      if (i.priceChanged)
        return `${i.title}'s price rose from ₹${(i.requestedPrice / 100).toLocaleString("en-IN")} to ₹${((i.verifiedPrice ?? 0) / 100).toLocaleString("en-IN")} since it was quoted.`;
      return `${i.title} is no longer available.`;
    });
    invalidReason = reasons.join(" ");

    const first = invalidItems[0];
    alternatives = findAlternatives(candidates, first.productId, first.requestedPrice);
  }

  const quote = await prisma.quote.create({
    data: {
      chatSessionId,
      itemsJson: JSON.stringify(verifiedItems),
      valid,
      invalidReason,
    },
  });

  return NextResponse.json({
    quote: {
      id: quote.id,
      valid,
      invalidReason,
      items: verifiedItems,
      alternatives,
      totalAmount: verifiedItems.reduce((sum, i) => sum + i.chargedPrice * i.qty, 0),
    },
  });
}
