import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CheckoutClient } from "./checkout-client";
import { SlimHeader } from "@/components/ui/slim-header";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await params;

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { chatSession: true },
  });
  if (!quote) notFound();

  const items = JSON.parse(quote.itemsJson);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <SlimHeader backHref="/buyer" backLabel="← Back to shopping agent" />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Checkout</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {quote.valid
            ? "This quote passed live re-verification — price and stock confirmed at checkout time."
            : "This quote is no longer valid — go back to chat for alternatives."}
        </p>

        {quote.valid ? (
          <CheckoutClient quoteId={quote.id} items={items} />
        ) : (
          <div className="mt-6 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-5 text-sm text-[var(--danger)]">
            {quote.invalidReason}
          </div>
        )}
      </main>
    </div>
  );
}
