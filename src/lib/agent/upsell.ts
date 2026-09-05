import type { Candidate } from "./candidates";
import type { ElectronicsFacet, GroceryFacet, FashionFacet } from "@/lib/catalog-types";

export interface CrossSellCard {
  productId: string;
  title: string;
  price: number;
  reasoning: string;
}

export interface StretchPickCard {
  productId: string;
  title: string;
  price: number;
  priceDeltaPaise: number;
  priceDeltaPct: number;
  reasoning: string;
}

function bySku(candidates: Candidate[]) {
  return new Map(candidates.map((c) => [c.sku, c]));
}

/**
 * Cross-sell: complementary items for whatever was just picked, resolved via
 * the pairsWithSkus relationship set up at onboarding. Deterministic and
 * route-level so it appears regardless of which agent backend served the
 * turn (Gemini / Claude / rule-based fallback all just return picks; this
 * layer is what guarantees the "you might also like" section).
 */
export function computeCrossSell(
  candidates: Candidate[],
  pickedProductIds: string[],
  limit = 3,
): CrossSellCard[] {
  const skuMap = bySku(candidates);
  const pickedSet = new Set(pickedProductIds);
  const seen = new Set<string>();
  const results: CrossSellCard[] = [];

  for (const pid of pickedProductIds) {
    const picked = candidates.find((c) => c.id === pid);
    if (!picked) continue;
    for (const sku of picked.pairsWithSkus) {
      const c = skuMap.get(sku);
      if (!c || pickedSet.has(c.id) || seen.has(c.id) || c.stockCount <= 0) continue;
      seen.add(c.id);
      results.push({
        productId: c.id,
        title: c.common.title,
        price: c.price,
        reasoning: `Frequently bought with ${picked.common.title}.`,
      });
      if (results.length >= limit) return results;
    }
  }
  return results;
}

function describeUpgrade(from: Candidate, to: Candidate): string {
  if (to.facet.kind === "ELECTRONICS" && from.facet.kind === "ELECTRONICS") {
    const a = from.facet as ElectronicsFacet;
    const b = to.facet as ElectronicsFacet;
    return `${b.ram} RAM / ${b.storage} storage vs. ${a.ram} / ${a.storage} — more headroom for the same use case.`;
  }
  if (to.facet.kind === "GROCERY" && from.facet.kind === "GROCERY") {
    const b = to.facet as GroceryFacet;
    return `${b.brandTier} tier — a step up in quality for daily use.`;
  }
  if (to.facet.kind === "FASHION" && from.facet.kind === "FASHION") {
    const b = to.facet as FashionFacet;
    return `${b.material}, ${b.color} — a premium material upgrade.`;
  }
  return "A step up from your current pick.";
}

/**
 * Stretch pick: exactly one above-budget "worth considering" option,
 * surfaced alongside every comparison/basket response per product decision.
 * Prefers the explicit upgradeSku relationship; falls back to the next
 * priciest in-stock candidate in the same subcategory, capped at ~30% above
 * the reference pick's price so it stays a plausible stretch, not a
 * different product entirely.
 */
export function computeStretchPick(candidates: Candidate[], pickedProductId: string): StretchPickCard | null {
  const picked = candidates.find((c) => c.id === pickedProductId);
  if (!picked) return null;

  const skuMap = bySku(candidates);
  let stretch: Candidate | undefined;

  if (picked.upgradeSku) {
    const upgrade = skuMap.get(picked.upgradeSku);
    if (upgrade && upgrade.stockCount > 0) stretch = upgrade;
  }

  if (!stretch) {
    const ceiling = picked.price * 1.3;
    stretch = candidates
      .filter(
        (c) =>
          c.id !== picked.id &&
          c.common.subcategory === picked.common.subcategory &&
          c.stockCount > 0 &&
          c.price > picked.price &&
          c.price <= ceiling,
      )
      .sort((a, b) => a.price - b.price)[0];
  }

  if (!stretch) return null;

  const priceDeltaPaise = stretch.price - picked.price;
  return {
    productId: stretch.id,
    title: stretch.common.title,
    price: stretch.price,
    priceDeltaPaise,
    priceDeltaPct: Math.round((priceDeltaPaise / picked.price) * 100),
    reasoning: describeUpgrade(picked, stretch),
  };
}
