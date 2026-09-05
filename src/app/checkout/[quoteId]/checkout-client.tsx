"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";

interface QuoteItem {
  productId: string;
  title: string;
  qty: number;
  verifiedPrice: number | null;
  chargedPrice?: number;
}

export function CheckoutClient({ quoteId, items }: { quoteId: string; items: QuoteItem[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "creating" | "awaiting_payment" | "verifying" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  const total = items.reduce((s, i) => s + (i.chargedPrice ?? i.verifiedPrice ?? 0) * i.qty, 0);

  async function payNow() {
    setStatus("creating");
    setError(null);

    const res = await fetch("/api/checkout/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quoteId }),
    });
    const data = await res.json();

    if (!res.ok) {
      setStatus("error");
      setError(data.error ?? "Failed to create Razorpay order.");
      return;
    }

    if (!scriptReady || typeof window === "undefined" || !("Razorpay" in window)) {
      setStatus("error");
      setError("Razorpay checkout script hasn't loaded yet — try again in a moment.");
      return;
    }

    setStatus("awaiting_payment");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const RazorpayCtor = (window as any).Razorpay;
    const rzp = new RazorpayCtor({
      key: data.keyId,
      amount: data.amount,
      currency: data.currency,
      name: "Agentic Commerce Middleware",
      description: `Order for ${items.length} item(s)`,
      order_id: data.razorpayOrderId,
      handler: async (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        setStatus("verifying");
        const verifyRes = await fetch("/api/checkout/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: data.orderId, ...response }),
        });
        const verifyData = await verifyRes.json();
        if (verifyData.ok) {
          router.push(`/audit/${data.orderId}`);
        } else {
          setStatus("error");
          setError("Payment signature verification failed.");
        }
      },
      modal: {
        ondismiss: () => setStatus("idle"),
      },
      theme: { color: "#10b981" },
    });
    rzp.open();
  }

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onReady={() => setScriptReady(true)}
        onLoad={() => setScriptReady(true)}
      />
      <div className="mt-8 rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-6">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Confirm exact amount</h2>
        <div className="mt-3 space-y-1.5 text-sm">
          {items.map((i) => (
            <div key={i.productId} className="flex justify-between text-[var(--text-secondary)]">
              <span>
                {i.title} × {i.qty}
              </span>
              <span className="tabular-nums">₹{(((i.chargedPrice ?? i.verifiedPrice ?? 0) * i.qty) / 100).toLocaleString("en-IN")}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between border-t border-[var(--surface-border)] pt-3 text-base font-semibold text-[var(--text-primary)]">
          <span>Total</span>
          <span className="tabular-nums">₹{(total / 100).toLocaleString("en-IN")}</span>
        </div>

        <button
          onClick={payNow}
          disabled={status === "creating" || status === "awaiting_payment" || status === "verifying"}
          className="mt-5 w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-50"
        >
          {status === "creating"
            ? "Creating Razorpay order…"
            : status === "verifying"
            ? "Verifying payment…"
            : `Pay ₹${(total / 100).toLocaleString("en-IN")} with Razorpay (Test Mode)`}
        </button>

        {error && <div className="mt-3 rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">{error}</div>}
      </div>
    </>
  );
}
