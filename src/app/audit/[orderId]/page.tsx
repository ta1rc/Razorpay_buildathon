import { notFound } from "next/navigation";
import { buildAuditTrail } from "@/lib/audit";
import { SlimHeader } from "@/components/ui/slim-header";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  ok: "border-[var(--success)]/25 bg-[var(--success-soft)] text-[var(--success)]",
  warn: "border-[var(--warning)]/25 bg-[var(--warning-soft)] text-[var(--warning)]",
  fail: "border-[var(--danger)]/25 bg-[var(--danger-soft)] text-[var(--danger)]",
};

export default async function AuditPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const trail = await buildAuditTrail(orderId);
  if (!trail) notFound();

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <SlimHeader backHref="/merchant/orders" backLabel="← Back to orders" />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Audit trail</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Order <span className="font-mono">{trail.order.id}</span> — every stage from catalog to
          payment, explainable end to end.
        </p>

        <div className="mt-8 space-y-3">
          {trail.stages.map((s, i) => (
            <div key={i} className={`rounded-xl border p-4 ${STATUS_STYLE[s.status]}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold capitalize">{s.title}</span>
                {s.at && <span className="text-xs opacity-70">{new Date(s.at).toLocaleString()}</span>}
              </div>
              <p className="mt-1 text-sm opacity-90">{s.detail}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
