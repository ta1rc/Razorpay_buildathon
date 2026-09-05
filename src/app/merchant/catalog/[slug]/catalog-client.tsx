"use client";

import { useState } from "react";
import { StatusChip, verificationTone, freshnessTone } from "@/components/ui/status-chip";

interface ProductRow {
  id: string;
  static: { common: Record<string, unknown>; facet: Record<string, unknown> };
  dynamic: Record<string, unknown>;
  provenance: { sourceUrl: string; rawSnippet: string; extractionMethod: string };
  verificationLevel: string;
  confidenceScore: number;
  freshnessState: string;
  lastCheckedAt: string;
  flags: { id: string; field: string; reason: string; resolved: boolean; resolution: string | null }[];
}

export function CatalogClient({ products }: { products: ProductRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {products.map((p) => {
        const isOpen = expanded === p.id;
        return (
          <div key={p.id} className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">{p.static.common.title as string}</div>
                <div className="text-xs text-[var(--text-tertiary)]">
                  {p.static.common.brand as string} · {p.static.common.category as string}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusChip tone={verificationTone(p.verificationLevel)}>
                  {p.verificationLevel.toLowerCase()} · {Math.round(p.confidenceScore * 100)}%
                </StatusChip>
                <StatusChip tone={freshnessTone(p.freshnessState)}>{p.freshnessState.toLowerCase()}</StatusChip>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="font-medium text-[var(--text-tertiary)]">static</div>
              <div className="font-medium text-[var(--text-tertiary)]">dynamic</div>
              <div className="space-y-0.5 text-[var(--text-secondary)]">
                {Object.entries(p.static.facet)
                  .filter(([k]) => k !== "kind")
                  .map(([k, v]) => (
                    <div key={k}>
                      {k}: {Array.isArray(v) ? v.join(", ") : String(v)}
                    </div>
                  ))}
              </div>
              <div className="space-y-0.5 text-[var(--text-secondary)]">
                <div>price: ₹{(Number(p.dynamic.price) / 100).toLocaleString("en-IN")}</div>
                <div>stock: {String(p.dynamic.stockCount)}</div>
                <div>discount: {String(p.dynamic.discountPct)}%</div>
                <div className="text-[var(--text-tertiary)]">verified {new Date(p.lastCheckedAt).toLocaleTimeString()}</div>
              </div>
            </div>

            {p.flags.length > 0 && (
              <div className="mt-3 text-[11px] text-[var(--warning)]">
                {p.flags.length} field{p.flags.length > 1 ? "s" : ""} were flagged at onboarding
                {p.flags.every((f) => f.resolved) ? " (resolved)" : ""}
              </div>
            )}

            <button
              onClick={() => setExpanded(isOpen ? null : p.id)}
              className="mt-3 text-xs font-medium text-[var(--accent-strong)] hover:underline"
            >
              {isOpen ? "Hide provenance ▲" : "Show provenance & source ▼"}
            </button>

            {isOpen && (
              <div className="mt-3 rounded-lg bg-[var(--surface-muted)] p-3 text-[11px]">
                <div className="text-[var(--text-tertiary)]">source: {p.provenance.sourceUrl}</div>
                <div className="mt-1 text-[var(--text-tertiary)]">extraction: {p.provenance.extractionMethod}</div>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[var(--text-tertiary)]">
                  {p.provenance.rawSnippet}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
