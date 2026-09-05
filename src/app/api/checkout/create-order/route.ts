import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { prisma } from "@/lib/prisma";
import { appendTimeline } from "@/lib/timeline";

export async function POST(req: Request) {
  const { quoteId } = (await req.json()) as { quoteId: string };

  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  if (!quote.valid) {
    return NextResponse.json({ error: "This quote is no longer valid — re-quote before checkout." }, { status: 409 });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return NextResponse.json(
      { error: "Razorpay Test Mode keys aren't configured yet (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)." },
      { status: 501 },
    );
  }

  const items: { productId: string; qty: number; verifiedPrice: number | null; chargedPrice?: number }[] = JSON.parse(
    quote.itemsJson,
  );
  const amount = items.reduce((sum, i) => sum + (i.chargedPrice ?? i.verifiedPrice ?? 0) * i.qty, 0);

  const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const rzpOrder = await razorpay.orders.create({
    amount,
    currency: "INR",
    receipt: `quote_${quote.id}`,
    notes: { quoteId: quote.id },
  });

  const order = await prisma.order.create({
    data: {
      quoteId: quote.id,
      razorpayOrderId: rzpOrder.id,
      amount,
      status: "CREATED",
      timelineJson: appendTimeline(
        appendTimeline("[]", "quote", `Quote ${quote.id} verified live at checkout time — ${items.length} item(s), total ₹${(amount / 100).toLocaleString("en-IN")}.`),
        "razorpay_order_created",
        `Razorpay Test Mode order ${rzpOrder.id} created for ₹${(amount / 100).toLocaleString("en-IN")}.`,
      ),
    },
  });

  return NextResponse.json({
    orderId: order.id,
    razorpayOrderId: rzpOrder.id,
    amount,
    currency: "INR",
    keyId,
  });
}
