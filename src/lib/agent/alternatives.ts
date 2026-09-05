import type { Candidate } from "./candidates";
import type { ElectronicsFacet } from "@/lib/catalog-types";

export interface AlternativeSuggestion {
  productId: string;
  title: string;
  price: number;
  reasoning: string;
}

/**
 * Deterministic (non-LLM) alternative finder — used whenever a quote fails
 * live verification. Correctness-critical, so it never depends on an LLM
 * call succeeding: same-category candidates, in stock, at or under the
 * price the buyer originally saw, ranked by the same value heuristic as the
 * initial recommendation.
 */
export function findAlternatives(
  candidates: Candidate[],
  invalidatedProductId: string,
  requestedPrice: number,
  limit = 2,
): AlternativeSuggestion[] {
  const invalidated = candidates.find((c) => c.id === invalidatedProductId);
  const pool = candidates.filter(
    (c) => c.id !== invalidatedProductId && c.stockCount > 0 && c.price <= requestedPrice,
  );

  const sameCategory = invalidated
    ? pool.filter((c) => c.common.subcategory === invalidated.common.subcategory)
    : pool;
  const finalPool = sameCategory.length > 0 ? sameCategory : pool;

  const ranked = finalPool
    .map((c) => {
      const facet = c.facet as ElectronicsFacet;
      const ramGb = parseInt(facet.ram ?? "", 10) || 0;
      const storageGb = parseInt(facet.storage ?? "", 10) || 0;
      const score = storageGb + ramGb * 0.5 - c.price / 100000;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return ranked.map(({ c }) => ({
    productId: c.id,
    title: c.common.title,
    price: c.price,
    reasoning: `${c.common.title} — ₹${(c.price / 100).toLocaleString("en-IN")}, in stock (${c.stockCount}), still within your original budget.`,
  }));
}
