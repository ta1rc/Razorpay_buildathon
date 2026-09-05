import type { Candidate } from "./candidates";
import type { AgentTurnResult, ChatHistoryItem } from "./types";
import type { ElectronicsFacet, GroceryFacet, FashionFacet } from "@/lib/catalog-types";
import type { Vertical } from "@/lib/enums";

// Deterministic, no-LLM-required fallback so the app still functions before
// ANTHROPIC_API_KEY is configured. Used automatically when the key is unset,
// and always used for correctness-critical numeric decisions even when the
// key IS set (see runAgentTurn) — only phrasing/reasoning is LLM-authored.

function parseBudgetPaise(text: string): number | null {
  // Prefer a number explicitly following a budget-context keyword (avoids
  // e.g. matching the "256" in "256GB" as a budget).
  const contextMatch = text.match(
    /(?:under|below|within|budget(?:\s*(?:of|is))?)\s*(?:₹|rs\.?|inr)?\s*([\d,]{3,})/i,
  );
  if (contextMatch) {
    const n = Number(contextMatch[1].replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n * 100 : null;
  }

  // Otherwise take the largest number in the text that isn't a unit size (GB/MB/TB).
  const candidates = [...text.matchAll(/([\d][\d,]{2,})\s*(gb|mb|tb)?/gi)]
    .filter((m) => !m[2])
    .map((m) => Number(m[1].replace(/,/g, "")))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (candidates.length === 0) return null;
  return Math.max(...candidates) * 100;
}

function parseStorageGb(text: string): number | null {
  const m = text.match(/(\d{2,4})\s*gb/i);
  return m ? Number(m[1]) : null;
}

export function fallbackElectronics(candidates: Candidate[], message: string): AgentTurnResult {
  const budget = parseBudgetPaise(message);
  const storage = parseStorageGb(message);

  if (!budget && !storage) {
    return {
      responseType: "clarifying_questions",
      message: "Happy to compare phones — what's your budget, and any storage size you need?",
      clarifyingQuestions: ["What's your budget?", "Any storage size preference (e.g. 128GB, 256GB)?"],
    };
  }

  const filtered = candidates.filter((c) => {
    const facet = c.facet as ElectronicsFacet;
    const storageGb = parseInt(facet.storage, 10);
    if (budget && c.price > budget) return false;
    if (storage && storageGb < storage) return false;
    if (c.stockCount <= 0) return false;
    return true;
  });

  const ranked = filtered
    .map((c) => {
      const facet = c.facet as ElectronicsFacet;
      const ramGb = parseInt(facet.ram, 10) || 0;
      const storageGb = parseInt(facet.storage, 10) || 0;
      const score = storageGb + ramGb * 0.5 - c.price / 100000;
      return { c, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (ranked.length === 0) {
    return {
      responseType: "comparison",
      message: `No in-stock phone matched${budget ? ` a ₹${(budget / 100).toLocaleString("en-IN")} budget` : ""}${
        storage ? ` with ${storage}GB+ storage` : ""
      }. Try relaxing the budget or storage requirement.`,
      picks: [],
    };
  }

  return {
    responseType: "comparison",
    message: `Here are the best matches${budget ? ` under ₹${(budget / 100).toLocaleString("en-IN")}` : ""}${
      storage ? ` with ${storage}GB+ storage` : ""
    }, ranked by spec value for money.`,
    picks: ranked.map(({ c }) => ({
      productId: c.id,
      qty: 1,
      reasoning: `${c.common.title}: ${(c.facet as ElectronicsFacet).ram} RAM, ${(c.facet as ElectronicsFacet).storage} storage at ₹${(c.price / 100).toLocaleString("en-IN")}.`,
    })),
  };
}

export function fallbackFashion(candidates: Candidate[], message: string): AgentTurnResult {
  const sizeMatch = message.match(/\bsize\s*([a-z0-9]{1,3})\b/i) || message.match(/\b(xs|s|m|l|xl|xxl|\d{2})\b/i);
  const size = sizeMatch ? sizeMatch[1].toUpperCase() : null;

  if (!size) {
    return {
      responseType: "clarifying_questions",
      message: "What size are you looking for, and any color or material preference?",
      clarifyingQuestions: ["What size?", "Any color or material preference?"],
    };
  }

  const matches = candidates.filter((c) => {
    const facet = c.facet as FashionFacet;
    return facet.availableSizes.some((s) => s.toUpperCase() === size) && c.stockCount > 0;
  });

  if (matches.length === 0) {
    return {
      responseType: "comparison",
      message: `No in-stock item matched size ${size}. Here's what's available in other sizes instead.`,
      picks: candidates.slice(0, 3).map((c) => ({ productId: c.id, qty: 1, reasoning: `${c.common.title} — check available sizes.` })),
    };
  }

  return {
    responseType: "comparison",
    message: `Found ${matches.length} item(s) in size ${size}.`,
    picks: matches.slice(0, 3).map((c) => ({
      productId: c.id,
      qty: 1,
      reasoning: `${c.common.title} in ${(c.facet as FashionFacet).color}, ${(c.facet as FashionFacet).material}.`,
    })),
  };
}

const GROCERY_CATEGORY_PRIORITY = ["Staples", "Dairy", "Produce", "Cooking essentials", "Snacks"];

export function fallbackGrocery(
  candidates: Candidate[],
  message: string,
  history: ChatHistoryItem[],
): AgentTurnResult {
  const budget = parseBudgetPaise(message) ?? parseBudgetPaise(history.map((h) => h.content).join(" "));
  const householdMatch = message.match(/(\d+)\s*(?:people|person|member|family)/i);
  const household = householdMatch ? Number(householdMatch[1]) : null;
  const vegOnly = /\bveg(?:etarian)?\b/i.test(message) && !/non[- ]?veg/i.test(message);
  const askedAlready = history.some((h) => h.role === "AGENT" && h.content.includes("household"));

  if (!askedAlready && household === null) {
    return {
      responseType: "clarifying_questions",
      message:
        "To put together a sensible ₹" +
        (budget ? (budget / 100).toLocaleString("en-IN") : "10,000") +
        " basket — how many people is this for, any dietary restrictions, and any category to prioritize or skip?",
      clarifyingQuestions: [
        "How many people is this for?",
        "Any dietary restrictions (e.g. vegetarian)?",
        "Anything to prioritize or skip (e.g. skip snacks)?",
      ],
    };
  }

  const assumptions: string[] = [];
  const effectiveBudget = budget ?? 1000000; // ₹10,000 default
  if (!budget) assumptions.push("assuming a ₹10,000 budget since none was restated");
  const effectiveHousehold = household ?? 4;
  if (household === null) assumptions.push("assuming a household of 4");
  if (!/veg|non-veg/i.test(message)) assumptions.push("assuming no dietary restrictions");

  let pool = candidates.filter((c) => c.stockCount > 0);
  if (vegOnly) {
    pool = pool.filter((c) => (c.facet as GroceryFacet).dietTags.includes("veg") || (c.facet as GroceryFacet).dietTags.length === 0);
  }

  const skipSnacks = /skip snacks|no snacks/i.test(message);
  if (skipSnacks) pool = pool.filter((c) => c.common.subcategory !== "Snacks");

  const byCategory = new Map<string, Candidate[]>();
  for (const c of pool) {
    const list = byCategory.get(c.common.subcategory) ?? [];
    list.push(c);
    byCategory.set(c.common.subcategory, list);
  }

  const picks: { productId: string; qty: number; reasoning: string }[] = [];
  let runningTotal = 0;
  const qtyScale = Math.max(1, Math.round(effectiveHousehold / 2));

  // First pass: one round of staples across every category, within budget.
  for (const category of GROCERY_CATEGORY_PRIORITY) {
    const options = (byCategory.get(category) ?? []).sort((a, b) => a.price - b.price);
    for (const c of options.slice(0, 2)) {
      const qty = c.common.subcategory === "Snacks" ? 1 : qtyScale;
      const lineTotal = c.price * qty;
      if (runningTotal + lineTotal > effectiveBudget) continue;
      runningTotal += lineTotal;
      picks.push({
        productId: c.id,
        qty,
        reasoning: `${c.common.title} × ${qty} — ₹${(lineTotal / 100).toLocaleString("en-IN")} (${category.toLowerCase()}).`,
      });
    }
  }

  // Second pass: top up remaining budget by round-robin bumping quantities
  // on non-perishable basket items (cheapest first), capped per item, rather
  // than leaving most of the stated budget unspent.
  const toppable = picks
    .map((p) => ({ pick: p, candidate: pool.find((c) => c.id === p.productId)! }))
    .filter(({ candidate }) => candidate.common.subcategory !== "Snacks" && !(candidate.facet as GroceryFacet).perishable)
    .sort((a, b) => a.candidate.price - b.candidate.price);
  const MAX_EXTRA_PER_ITEM = 5;
  const extraAdded = new Map<string, number>();
  let progress = true;
  while (progress && toppable.length > 0) {
    progress = false;
    for (const { pick, candidate } of toppable) {
      const extra = extraAdded.get(pick.productId) ?? 0;
      if (extra >= MAX_EXTRA_PER_ITEM) continue;
      if (runningTotal + candidate.price > effectiveBudget) continue;
      pick.qty += 1;
      runningTotal += candidate.price;
      extraAdded.set(pick.productId, extra + 1);
      pick.reasoning = `${candidate.common.title} × ${pick.qty} — topped up to use more of the budget.`;
      progress = true;
    }
  }

  return {
    responseType: "basket",
    message: `Built a basket for ${effectiveHousehold} people, ₹${(runningTotal / 100).toLocaleString("en-IN")} of your ₹${(effectiveBudget / 100).toLocaleString("en-IN")} budget.`,
    assumptions,
    picks,
  };
}

export function runFallbackAgent(
  vertical: Vertical,
  candidates: Candidate[],
  message: string,
  history: ChatHistoryItem[],
): AgentTurnResult {
  if (vertical === "ELECTRONICS") return fallbackElectronics(candidates, message);
  if (vertical === "FASHION") return fallbackFashion(candidates, message);
  return fallbackGrocery(candidates, message, history);
}
