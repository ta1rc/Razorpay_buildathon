"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { StatusChip, verificationTone } from "@/components/ui/status-chip";
import { CATEGORY_MISMATCH_FIELD } from "@/lib/csv-normalizer";

interface MerchantRow {
  id: string;
  slug: string;
  name: string;
  vertical: string;
  siteBasePath: string | null;
  siteDescription: string;
  latestCatalogStatus: string | null;
}

interface ScannedFlag {
  id: string;
  field: string;
  reason: string;
  suggestedValue: string;
}

interface ScannedProduct {
  product: {
    id: string;
    static: { common: Record<string, unknown>; facet: Record<string, unknown> };
    dynamic: Record<string, unknown>;
    verificationLevel: string;
    confidenceScore: number;
  };
  flags: ScannedFlag[];
  excludeSuggested?: boolean;
}

type Phase = "pick" | "method" | "csv_source" | "csv_preview" | "processing" | "reviewing" | "done";

const VERTICAL_LABEL: Record<string, string> = {
  ELECTRONICS: "Electronics",
  GROCERY: "Grocery",
  FASHION: "Fashion",
};

const SAMPLE_CSV_URL = "/demo/urban-needs-distorted-catalogue.csv";

export default function MerchantOnboardPage() {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [selected, setSelected] = useState<MerchantRow | null>(null);
  const [phase, setPhase] = useState<Phase>("pick");
  const [log, setLog] = useState<string[]>([]);
  const [revealed, setRevealed] = useState<ScannedProduct[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [catalogVersionId, setCatalogVersionId] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [csvText, setCsvText] = useState<string | null>(null);
  const [csvPreviewRows, setCsvPreviewRows] = useState<string[][]>([]);
  const [rawRowCount, setRawRowCount] = useState(0);
  const [approveError, setApproveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/onboard/merchants")
      .then((r) => r.json())
      .then((d) => setMerchants(d.merchants));
  }, []);

  function reset() {
    setSelected(null);
    setPhase("pick");
    setLog([]);
    setRevealed([]);
    setExcluded(new Set());
    setCatalogVersionId(null);
    setResolutions({});
    setCsvText(null);
    setCsvPreviewRows([]);
  }

  function pickMerchant(m: MerchantRow) {
    setSelected(m);
    setPhase("method");
  }

  function previewCsv(text: string) {
    const lines = text.trim().split("\n").slice(0, 8);
    setCsvPreviewRows(lines.map((l) => l.split(",")));
    setRawRowCount(text.trim().split("\n").length - 1);
    setCsvText(text);
    setPhase("csv_preview");
  }

  async function loadSample() {
    const text = await fetch(SAMPLE_CSV_URL).then((r) => r.text());
    previewCsv(text);
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => previewCsv(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function startScrapeScan() {
    if (!selected) return;
    setPhase("processing");
    setLog([`Connecting to ${selected.siteBasePath} ...`]);
    setRevealed([]);

    const res = await fetch("/api/onboard/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantSlug: selected.slug }),
    });
    const data = await res.json();
    await revealResults(data, `Fetched storefront HTML.`);
  }

  async function startCsvParse() {
    if (!selected || !csvText) return;
    setPhase("processing");
    setLog([`Parsing uploaded catalogue (${rawRowCount} raw rows)…`]);
    setRevealed([]);

    const res = await fetch("/api/merchant/csv/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantSlug: selected.slug, csvText }),
    });
    const data = await res.json();
    await revealResults(
      data,
      `Detected ${data.rawRowCount} raw rows → resolving redundant columns, deduping, normalizing into blocks…`,
    );
  }

  async function revealResults(data: { catalogVersionId: string; products: ScannedProduct[] }, firstLine: string) {
    setCatalogVersionId(data.catalogVersionId);
    setLog((l) => [...l, firstLine, `Found ${data.products.length} product blocks. Extracting fields...`]);

    const items: ScannedProduct[] = data.products;
    for (let i = 0; i < items.length; i++) {
      await new Promise((r) => setTimeout(r, 260));
      setRevealed((prev) => [...prev, items[i]]);
      setLog((l) => [
        ...l,
        `[${i + 1}/${items.length}] ${items[i].product.static.common.title} → ${items[i].product.verificationLevel.toLowerCase()}${
          items[i].flags.length ? ` (${items[i].flags.length} flag${items[i].flags.length > 1 ? "s" : ""})` : ""
        }`,
      ]);
    }

    const initialResolutions: Record<string, string> = {};
    const initialExcluded = new Set<string>();
    for (const p of items) {
      for (const f of p.flags) {
        if (f.field === CATEGORY_MISMATCH_FIELD) {
          initialExcluded.add(p.product.id);
        } else {
          initialResolutions[f.id] = f.suggestedValue;
        }
      }
    }
    setResolutions(initialResolutions);
    setExcluded(initialExcluded);

    await new Promise((r) => setTimeout(r, 250));
    setPhase("reviewing");
  }

  async function confirmExclusions() {
    for (const productId of excluded) {
      await fetch("/api/merchant/csv/exclude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
    }
    setRevealed((prev) => prev.filter((p) => !excluded.has(p.product.id)));
  }

  async function approve() {
    if (!catalogVersionId) return;
    setApproveError(null);
    if (excluded.size > 0) await confirmExclusions();

    // Only send resolutions for flags still on a live (non-excluded) product
    // — excluding a product deletes its flags, so a stale resolution here
    // would reference a row that no longer exists.
    const stillValidFlagIds = new Set(editableFlags.map((f) => f.id));
    const payload = Object.entries(resolutions)
      .filter(([flagId]) => stillValidFlagIds.has(flagId))
      .map(([flagId, resolution]) => ({ flagId, resolution }));

    const res = await fetch("/api/onboard/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalogVersionId, resolutions: payload }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setApproveError(data.error ?? "Failed to publish the catalog — please try again.");
      return;
    }
    setPhase("done");
  }

  const editableFlags = revealed
    .filter((p) => !excluded.has(p.product.id))
    .flatMap((p) => p.flags.filter((f) => f.field !== CATEGORY_MISMATCH_FIELD).map((f) => ({ ...f, title: p.product.static.common.title as string })));
  const exclusionFlags = revealed
    .flatMap((p) => p.flags.map((f) => ({ ...f, productId: p.product.id, title: p.product.static.common.title as string })))
    .filter((f) => f.field === CATEGORY_MISMATCH_FIELD);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Catalogue onboarding</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
        Sync a live storefront or upload a CSV export, review anything the extractor flagged, then
        publish the structured, agent-readable catalog.
      </p>

      {phase === "pick" && (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {merchants.map((m) => (
            <button
              key={m.id}
              onClick={() => pickMerchant(m)}
              className="flex flex-col items-start rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-5 text-left transition-colors hover:border-[var(--accent)]"
            >
              <span className="rounded-md bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                {VERTICAL_LABEL[m.vertical]}
              </span>
              <span className="mt-3 text-base font-semibold text-[var(--text-primary)]">{m.name}</span>
              <span className="mt-1 text-xs text-[var(--text-tertiary)]">{m.siteDescription}</span>
              <span className="mt-4 text-xs text-[var(--text-tertiary)]">
                Latest catalog: {m.latestCatalogStatus ?? "none yet"}
              </span>
              <span className="mt-3 text-sm font-medium text-[var(--accent-strong)]">Onboard →</span>
            </button>
          ))}
        </div>
      )}

      {phase === "method" && selected && (
        <div className="mt-8 max-w-xl">
          <button onClick={reset} className="mb-4 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
            ← Choose a different merchant
          </button>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            How should {selected.name}&apos;s catalog be ingested?
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {selected.siteBasePath && (
              <button
                onClick={() => {
                  startScrapeScan();
                }}
                className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-5 text-left hover:border-[var(--accent)]"
              >
                <div className="text-sm font-semibold text-[var(--text-primary)]">Sync from website</div>
                <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Crawl {selected.siteBasePath} directly — no manual export needed.
                </div>
              </button>
            )}
            <button
              onClick={() => {
                setPhase("csv_source");
              }}
              className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-5 text-left hover:border-[var(--accent)]"
            >
              <div className="text-sm font-semibold text-[var(--text-primary)]">Upload CSV catalogue</div>
              <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                Import a spreadsheet export — messy columns, duplicates, and all.
              </div>
            </button>
          </div>
        </div>
      )}

      {phase === "csv_source" && selected && (
        <div className="mt-8 max-w-xl">
          <button onClick={() => setPhase("method")} className="mb-4 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
            ← Back
          </button>
          <div
            className="rounded-xl border-2 border-dashed border-[var(--surface-border)] bg-[var(--surface)] p-8 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => previewCsv(String(reader.result ?? ""));
              reader.readAsText(file);
            }}
          >
            <div className="text-sm font-medium text-[var(--text-primary)]">Drag and drop your CSV file here</div>
            <div className="mt-1 text-xs text-[var(--text-tertiary)]">or</div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 rounded-lg border border-[var(--surface-border)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"
            >
              browse files
            </button>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={onFileChosen} />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--surface-border)]" />
            <span className="text-xs text-[var(--text-tertiary)]">or</span>
            <div className="h-px flex-1 bg-[var(--surface-border)]" />
          </div>
          <button
            onClick={loadSample}
            className="mt-4 w-full rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-4 text-left hover:border-[var(--accent)]"
          >
            <div className="text-sm font-semibold text-[var(--text-primary)]">Use sample distorted catalogue</div>
            <div className="mt-1 text-xs text-[var(--text-tertiary)]">
              24 rows of realistic messy data — inconsistent columns, duplicates, mixed price formats,
              missing categories, and a few off-catalogue items to see how it&apos;s cleaned up.
            </div>
          </button>
        </div>
      )}

      {phase === "csv_preview" && selected && (
        <div className="mt-8">
          <button onClick={() => setPhase("csv_source")} className="mb-4 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
            ← Choose a different file
          </button>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Raw catalogue preview <span className="font-normal text-[var(--text-tertiary)]">· {rawRowCount} rows detected</span>
          </h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--surface-border)] bg-[var(--surface)]">
            <table className="w-full text-xs">
              <tbody>
                {csvPreviewRows.map((row, i) => (
                  <tr key={i} className={i === 0 ? "border-b border-[var(--surface-border)] font-medium text-[var(--text-secondary)]" : "border-b border-[var(--surface-border)] last:border-0 text-[var(--text-tertiary)]"}>
                    {row.map((cell, j) => (
                      <td key={j} className="whitespace-nowrap px-3 py-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={startCsvParse}
            className="mt-5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
          >
            Process catalogue →
          </button>
        </div>
      )}

      {(phase === "processing" || phase === "reviewing" || phase === "done") && selected && (
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
          <div className="h-fit rounded-xl border border-[var(--surface-border)] bg-[var(--sidebar-bg)] p-4 font-mono text-[11px] text-[var(--success)]">
            <div className="mb-2 text-white/40">{selected.name} — ingestion log</div>
            <div className="space-y-1">
              {log.map((line, i) => (
                <div key={i}>▸ {line}</div>
              ))}
              {phase === "processing" && <div className="animate-pulse text-white/40">▸ processing…</div>}
            </div>
          </div>

          <div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {revealed.map((p) => {
                const isExcluded = excluded.has(p.product.id);
                return (
                  <div
                    key={p.product.id}
                    className={`rounded-xl border p-4 ${
                      isExcluded ? "border-[var(--danger)]/30 bg-[var(--danger-soft)] opacity-60" : "border-[var(--surface-border)] bg-[var(--surface)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-[var(--text-primary)]">{p.product.static.common.title as string}</div>
                        <div className="text-xs text-[var(--text-tertiary)]">{p.product.static.common.brand as string}</div>
                      </div>
                      <StatusChip tone={verificationTone(p.product.verificationLevel)}>
                        {p.product.verificationLevel.toLowerCase()} · {Math.round(p.product.confidenceScore * 100)}%
                      </StatusChip>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="font-medium text-[var(--text-tertiary)]">static</div>
                      <div className="font-medium text-[var(--text-tertiary)]">dynamic</div>
                      <div className="text-[var(--text-secondary)]">
                        {Object.entries(p.product.static.facet)
                          .filter(([k]) => k !== "kind")
                          .slice(0, 3)
                          .map(([k, v]) => (
                            <div key={k}>
                              {k}: {String(v)}
                            </div>
                          ))}
                      </div>
                      <div className="text-[var(--text-secondary)]">
                        <div>price: ₹{(Number(p.product.dynamic.price) / 100).toLocaleString("en-IN")}</div>
                        <div>stock: {String(p.product.dynamic.stockCount)}</div>
                      </div>
                    </div>
                    {isExcluded && (
                      <div className="mt-3 text-[11px] font-medium text-[var(--danger)]">Marked for exclusion</div>
                    )}
                    {!isExcluded && p.flags.length > 0 && (
                      <div className="mt-3 rounded-md bg-[var(--warning-soft)] px-2 py-1 text-[11px] text-[var(--warning)]">
                        {p.flags.length} field{p.flags.length > 1 ? "s" : ""} need review
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {phase === "reviewing" && (
              <div className="mt-8 space-y-6">
                {exclusionFlags.length > 0 && (
                  <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-5">
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">Category mismatches</h2>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {exclusionFlags.length} item{exclusionFlags.length > 1 ? "s" : ""} in the upload don&apos;t match this
                      store&apos;s catalog category — pre-selected for exclusion, uncheck to keep.
                    </p>
                    <div className="mt-4 space-y-2">
                      {exclusionFlags.map((f) => (
                        <label key={f.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--surface-border)] p-3 text-sm">
                          <input
                            type="checkbox"
                            checked={excluded.has(f.productId)}
                            onChange={() =>
                              setExcluded((prev) => {
                                const next = new Set(prev);
                                if (next.has(f.productId)) next.delete(f.productId);
                                else next.add(f.productId);
                                return next;
                              })
                            }
                            className="mt-0.5 accent-[var(--accent)]"
                          />
                          <span>
                            <span className="font-medium text-[var(--text-primary)]">{f.title}</span>
                            <span className="block text-xs text-[var(--text-tertiary)]">{f.reason}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-5">
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">Ambiguity flags — merchant review</h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {editableFlags.length === 0
                      ? "No ambiguous fields found — everything extracted cleanly."
                      : `${editableFlags.length} field${editableFlags.length > 1 ? "s" : ""} the extractor wasn't fully confident about. Confirm or edit before publishing.`}
                  </p>
                  <div className="mt-4 space-y-3">
                    {editableFlags.map((f) => (
                      <div key={f.id} className="rounded-lg border border-[var(--surface-border)] bg-[var(--surface-muted)] p-3">
                        <div className="text-sm font-medium text-[var(--text-primary)]">
                          {f.title} <span className="text-[var(--text-tertiary)]">· {f.field}</span>
                        </div>
                        <div className="mt-1 text-xs text-[var(--text-secondary)]">{f.reason}</div>
                        <input
                          className="mt-2 w-full rounded-lg border border-[var(--surface-border)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                          value={resolutions[f.id] ?? ""}
                          onChange={(e) => setResolutions((r) => ({ ...r, [f.id]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={approve}
                    className="mt-5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
                  >
                    Approve &amp; publish catalog
                  </button>
                  {approveError && (
                    <div className="mt-3 rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
                      {approveError}
                    </div>
                  )}
                </div>
              </div>
            )}

            {phase === "done" && (
              <div className="mt-8 rounded-xl border border-[var(--success)]/30 bg-[var(--success-soft)] p-5">
                <h2 className="text-base font-semibold text-[var(--success)]">Catalog is now live</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  {selected.name}&apos;s catalog is published and agent-readable.
                </p>
                <div className="mt-4 flex gap-3">
                  <Link
                    href={`/merchant/catalog/${selected.slug}`}
                    className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)]"
                  >
                    View structured catalog →
                  </Link>
                  <button onClick={reset} className="rounded-lg border border-[var(--surface-border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]">
                    Onboard another merchant
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
