import { prisma } from "@/lib/prisma";
import type { TimelineEntry } from "@/lib/timeline";

export interface AuditStage {
  stage: string;
  title: string;
  at: string | null;
  detail: string;
  status: "ok" | "warn" | "fail";
}

export async function buildAuditTrail(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;

  const quote = await prisma.quote.findUnique({ where: { id: order.quoteId } });
  const chatSession = quote
    ? await prisma.chatSession.findUnique({
        where: { id: quote.chatSessionId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
    : null;

  const items: { productId: string; title: string; qty: number; requestedPrice: number; verifiedPrice: number | null }[] =
    quote ? JSON.parse(quote.itemsJson) : [];

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
    include: { catalogVersion: { include: { merchant: true } } },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const catalogVersionsUsed = [
    ...new Map(
      products.map((p) => [
        p.catalogVersion.id,
        {
          merchantName: p.catalogVersion.merchant.name,
          catalogVersionId: p.catalogVersion.id,
          approvedAt: p.catalogVersion.approvedAt,
        },
      ]),
    ).values(),
  ];

  const agentDecisionMessage = chatSession?.messages
    .filter((m) => m.role === "AGENT" && m.structuredJson)
    .reverse()
    .find((m) => {
      const parsed = JSON.parse(m.structuredJson!);
      return parsed.responseType === "comparison" || parsed.responseType === "basket";
    });

  const timeline: TimelineEntry[] = JSON.parse(order.timelineJson || "[]");

  const stages: AuditStage[] = [
    {
      stage: "catalog_version",
      title: "Catalog version used",
      at: catalogVersionsUsed[0]?.approvedAt?.toISOString() ?? null,
      detail: catalogVersionsUsed.length
        ? catalogVersionsUsed.map((c) => `${c.merchantName}: catalog ${c.catalogVersionId}`).join("; ")
        : "No catalog version on record.",
      status: "ok",
    },
    {
      stage: "agent_decision",
      title: "Agent decision",
      at: agentDecisionMessage?.createdAt.toISOString() ?? null,
      detail: agentDecisionMessage
        ? agentDecisionMessage.content
        : "No structured agent decision recorded for this order.",
      status: "ok",
    },
    {
      stage: "quote",
      title: "Quote (requested vs. live-verified)",
      at: quote?.createdAt.toISOString() ?? null,
      detail: items
        .map((i) => {
          const requested = `₹${(i.requestedPrice / 100).toLocaleString("en-IN")}`;
          const verified = i.verifiedPrice !== null ? `₹${(i.verifiedPrice / 100).toLocaleString("en-IN")}` : "unavailable";
          return `${i.title} × ${i.qty}: requested ${requested}, verified ${verified}`;
        })
        .join(" | "),
      status: quote?.valid ? "ok" : "warn",
    },
    ...timeline.map((t) => ({
      stage: t.stage,
      title: t.stage.replace(/_/g, " "),
      at: t.at,
      detail: t.detail,
      status: (t.stage === "signature_verification" && !order.signatureVerified ? "fail" : "ok") as
        | "ok"
        | "warn"
        | "fail",
    })),
    {
      stage: "final_status",
      title: "Final status",
      at: order.updatedAt.toISOString(),
      detail: `Order ${order.id} — ${order.status}${order.razorpayPaymentId ? ` (payment ${order.razorpayPaymentId})` : ""}.`,
      status: order.status === "PAID" ? "ok" : order.status === "FAILED" ? "fail" : "warn",
    },
  ];

  return {
    order,
    quote,
    items: items.map((i) => ({ ...i, productTitle: productById.get(i.productId)?.staticJson })),
    stages,
  };
}
