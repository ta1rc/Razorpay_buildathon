import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { appendTimeline } from "@/lib/timeline";

export async function POST(req: Request) {
  const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = (await req.json()) as {
    orderId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return NextResponse.json({ error: "Razorpay keys aren't configured." }, { status: 501 });
  }

  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  const signatureValid = expectedSignature === razorpay_signature;

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      razorpayPaymentId: razorpay_payment_id,
      status: signatureValid ? "PAID" : "FAILED",
      signatureVerified: signatureValid,
      timelineJson: appendTimeline(
        order.timelineJson,
        "signature_verification",
        signatureValid
          ? `HMAC signature verified server-side for payment ${razorpay_payment_id}.`
          : `Signature verification FAILED for payment ${razorpay_payment_id} — payment rejected.`,
      ),
    },
  });

  return NextResponse.json({ ok: signatureValid, order: { id: updated.id, status: updated.status } });
}
