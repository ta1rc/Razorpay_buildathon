import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DataTable } from "@/components/ui/data-table";
import { StatusChip, orderStatusTone } from "@/components/ui/status-chip";

export const dynamic = "force-dynamic";

export default async function MerchantOrdersPage() {
  const orders = await prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 50 });

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Orders</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Every order this system has settled, with a link into its full audit trail.
      </p>

      <div className="mt-8">
        <DataTable
          rows={orders}
          keyFor={(o) => o.id}
          emptyMessage="No orders yet — a buyer needs to complete checkout first."
          columns={[
            { header: "Order", render: (o) => <span className="font-mono text-xs">{o.id}</span> },
            {
              header: "Amount",
              align: "right",
              render: (o) => <span className="tabular-nums">₹{(o.amount / 100).toLocaleString("en-IN")}</span>,
            },
            { header: "Status", render: (o) => <StatusChip tone={orderStatusTone(o.status)}>{o.status}</StatusChip> },
            { header: "Placed", render: (o) => <span className="text-[var(--text-tertiary)]">{o.createdAt.toLocaleString()}</span> },
            {
              header: "",
              align: "right",
              render: (o) => (
                <Link href={`/audit/${o.id}`} className="font-medium text-[var(--accent-strong)] hover:underline">
                  View audit →
                </Link>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
