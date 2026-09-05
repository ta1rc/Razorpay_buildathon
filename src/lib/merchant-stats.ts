import { prisma } from "@/lib/prisma";

/**
 * A merchant can end up with a LIVE catalog version plus a newer draft/
 * pending one sitting on top of it (e.g. a re-onboarding attempt that
 * wasn't approved). For "what's this merchant's status right now" displays,
 * a live catalog underneath should win over a merely-newer pending one —
 * otherwise a fully working merchant can misleadingly show as "pending".
 */
export function pickEffectiveCatalogVersion<T extends { status: string; createdAt: Date }>(
  versions: T[],
): T | undefined {
  return versions.find((v) => v.status === "LIVE") ?? versions[0];
}

export async function getCatalogueHealth() {
  const products = await prisma.product.findMany({
    where: { catalogVersion: { status: "LIVE" } },
    select: { verificationLevel: true },
  });
  const verified = products.filter((p) => p.verificationLevel === "VERIFIED").length;
  const inferred = products.filter((p) => p.verificationLevel === "INFERRED").length;
  const unverified = products.filter((p) => p.verificationLevel === "UNVERIFIED").length;
  const total = products.length;
  return {
    total,
    verified,
    inferred,
    unverified,
    healthPct: total > 0 ? Math.round((verified / total) * 100) : 0,
  };
}

export async function getAmbiguityStats() {
  const [pending, resolved] = await Promise.all([
    prisma.ambiguityFlag.count({ where: { resolved: false } }),
    prisma.ambiguityFlag.count({ where: { resolved: true } }),
  ]);
  return { pending, resolved, total: pending + resolved };
}

export async function getOrderStats() {
  const orders = await prisma.order.findMany({ orderBy: { createdAt: "desc" } });
  const paid = orders.filter((o) => o.status === "PAID");
  const failed = orders.filter((o) => o.status === "FAILED");
  const created = orders.filter((o) => o.status === "CREATED");
  const totalRevenue = paid.reduce((s, o) => s + o.amount, 0);
  const avgOrderValue = paid.length > 0 ? Math.round(totalRevenue / paid.length) : 0;

  // Orders per day, last 7 days, for a small real bar chart.
  const days: { label: string; count: number; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const dayOrders = paid.filter((o) => o.createdAt >= day && o.createdAt < next);
    days.push({
      label: day.toLocaleDateString("en-IN", { weekday: "short" }),
      count: dayOrders.length,
      revenue: dayOrders.reduce((s, o) => s + o.amount, 0),
    });
  }

  return {
    totalOrders: orders.length,
    paidCount: paid.length,
    failedCount: failed.length,
    createdCount: created.length,
    totalRevenue,
    avgOrderValue,
    days,
  };
}
