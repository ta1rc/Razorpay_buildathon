"use client";

import { useEffect, useMemo, useState } from "react";
import { StatusChip, verificationTone } from "@/components/ui/status-chip";

type Vertical = "ELECTRONICS" | "GROCERY" | "FASHION";

interface Product {
  productId: string;
  merchantName: string;
  title: string;
  brand: string;
  category: string;
  subcategory: string;
  imageEmoji: string;
  facet: Record<string, unknown>;
  price: number;
  stockCount: number;
  discountPct: number;
  verificationLevel: string;
  freshnessState: string;
}

const VERTICALS: { id: Vertical; label: string }[] = [
  { id: "ELECTRONICS", label: "Electronics" },
  { id: "GROCERY", label: "Grocery" },
  { id: "FASHION", label: "Fashion" },
];

function money(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function BuyerCatalogPage() {
  const [vertical, setVertical] = useState<Vertical>("ELECTRONICS");
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [subcategory, setSubcategory] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/buyer/catalog?vertical=${vertical}`)
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []));
  }, [vertical]);

  const subcategories = useMemo(
    () => Array.from(new Set(products.map((p) => p.subcategory))).sort(),
    [products],
  );

  // Reset to "All" implicitly once the selected subcategory no longer exists
  // for the current vertical, rather than resetting state from an effect.
  const activeSubcategory = subcategory && subcategories.includes(subcategory) ? subcategory : null;

  const filtered = products.filter((p) => {
    if (activeSubcategory && p.subcategory !== activeSubcategory) return false;
    if (query && !`${p.title} ${p.brand}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Browse catalog</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Every live, verified product across all merchants — search, filter, or ask the shopping agent instead.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-2">
          {VERTICALS.map((v) => (
            <button
              key={v.id}
              onClick={() => setVertical(v.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                vertical === v.id ? "bg-[var(--accent)] text-white" : "border border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or brand…"
          className="min-w-[220px] flex-1 rounded-lg border border-[var(--surface-border)] bg-[var(--surface)] px-3.5 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
      </div>

      {subcategories.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => setSubcategory(null)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              activeSubcategory === null ? "bg-[var(--surface-muted)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            }`}
          >
            All
          </button>
          {subcategories.map((s) => (
            <button
              key={s}
              onClick={() => setSubcategory(s)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                activeSubcategory === s ? "bg-[var(--surface-muted)] text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <div key={p.productId} className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">{p.title}</div>
                <div className="text-xs text-[var(--text-tertiary)]">{p.brand} · {p.merchantName}</div>
              </div>
              <StatusChip tone={verificationTone(p.verificationLevel)}>{p.verificationLevel.toLowerCase()}</StatusChip>
            </div>
            <div className="mt-3 space-y-0.5 text-xs text-[var(--text-secondary)]">
              {Object.entries(p.facet)
                .filter(([k]) => k !== "kind")
                .slice(0, 3)
                .map(([k, v]) => (
                  <div key={k}>
                    {k}: {Array.isArray(v) ? v.join(", ") : String(v)}
                  </div>
                ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-base font-semibold text-[var(--text-primary)]">{money(p.price)}</span>
              <span className="text-xs text-[var(--text-tertiary)]">{p.stockCount > 0 ? `${p.stockCount} in stock` : "out of stock"}</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-tertiary)]">
            No products match — try a different search or category.
          </div>
        )}
      </div>
    </div>
  );
}
