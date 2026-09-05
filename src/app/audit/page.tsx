import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SlimHeader } from "@/components/ui/slim-header";
import { StatusChip, orderStatusTone } from "@/components/ui/status-chip";

export const dynamic = "force-dynamic";

export default async function AuditIndexPage() {
  const orders = await prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 20 });

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <SlimHeader backHref="/merchant/orders" backLabel="← Back to orders" />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Audit trail</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Every order this system has settled — catalog version → agent decision → quote → Razorpay
          order → payment signature → final status.
        </p>

        <div className="mt-8 space-y-2">
          {orders.length === 0 && (
            <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 text-sm text-[var(--text-tertiary)]">
              No orders yet — complete a checkout from the buyer chat to see one here.
            </div>
          )}
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/audit/${o.id}`}
              className="flex items-center justify-between rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-4 transition-colors hover:bg-[var(--surface-muted)]"
            >
              <div>
                <div className="font-mono text-sm text-[var(--text-primary)]">{o.id}</div>
                <div className="text-xs text-[var(--text-tertiary)]">
                  ₹{(o.amount / 100).toLocaleString("en-IN")} · {o.createdAt.toLocaleString()}
                </div>
              </div>
              <StatusChip tone={orderStatusTone(o.status)}>{o.status}</StatusChip>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
