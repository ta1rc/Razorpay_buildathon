"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Vertical = "ELECTRONICS" | "GROCERY" | "FASHION";

interface Card {
  productId: string;
  merchantName: string;
  title: string;
  brand: string;
  imageEmoji: string;
  facet: Record<string, unknown>;
  price: number;
  stockCount: number;
  verificationLevel: string;
  freshnessState: string;
  qty: number;
  reasoning: string;
}

interface CrossSellCard {
  productId: string;
  title: string;
  price: number;
  reasoning: string;
}

interface StretchCard {
  productId: string;
  title: string;
  price: number;
  priceDeltaPaise: number;
  priceDeltaPct: number;
  reasoning: string;
}

interface Selection {
  mainProductId: string | null;
  useStretch: boolean;
  crossSellIds: Set<string>;
}

interface BundleRow {
  id: string;
  merchantName: string;
  name: string;
  description: string;
  bundlePrice: number;
  discountPct: number;
  items: { productId: string; title: string; price: number; qty: number }[];
}

interface Msg {
  role: "USER" | "AGENT";
  content: string;
  responseType?: "clarifying_questions" | "comparison" | "basket";
  cards?: Card[];
  crossSell?: CrossSellCard[];
  stretchPick?: StretchCard | null;
  clarifyingQuestions?: string[];
  assumptions?: string[];
  selection?: Selection;
}

interface BundleRow {
  id: string;
  merchantName: string;
  name: string;
  description: string;
  bundlePrice: number;
  discountPct: number;
  items: { productId: string; title: string; price: number; qty: number }[];
}

const VERTICALS: { id: Vertical; label: string; example: string }[] = [
  { id: "ELECTRONICS", label: "Electronics", example: "Best 256GB phone under ₹30,000" },
  { id: "GROCERY", label: "Grocery", example: "Groceries for the house in ₹10,000" },
  { id: "FASHION", label: "Fashion", example: "A t-shirt in size M, something relaxed fit" },
];

function money(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function BuyerChatPage() {
  const router = useRouter();
  const [vertical, setVertical] = useState<Vertical>("ELECTRONICS");
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [bundles, setBundles] = useState<BundleRow[]>([]);
  const [bundleLoading, setBundleLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/bundles?vertical=${vertical}`)
      .then((r) => r.json())
      .then((d) => setBundles(d.bundles ?? []));
  }, [vertical]);

  function switchVertical(v: Vertical) {
    setVertical(v);
    setChatSessionId(null);
    setMessages([]);
    setQuoteError(null);
  }

  function selectionTotal(m: Msg): number {
    if (!m.cards) return 0;
    if (m.responseType === "comparison") {
      const main = m.selection?.useStretch ? m.stretchPick : m.cards.find((c) => c.productId === m.selection?.mainProductId);
      const mainPrice = main?.price ?? 0;
      const crossTotal = (m.crossSell ?? []).filter((c) => m.selection?.crossSellIds.has(c.productId)).reduce((s, c) => s + c.price, 0);
      return mainPrice + crossTotal;
    }
    const basketTotal = m.cards.reduce((s, c) => s + c.price * c.qty, 0);
    const stretchTotal = m.selection?.useStretch ? m.stretchPick?.price ?? 0 : 0;
    const crossTotal = (m.crossSell ?? []).filter((c) => m.selection?.crossSellIds.has(c.productId)).reduce((s, c) => s + c.price, 0);
    return basketTotal + stretchTotal + crossTotal;
  }

  function updateSelection(index: number, updater: (sel: Selection) => Selection) {
    setMessages((msgs) => {
      const next = [...msgs];
      const m = next[index];
      if (!m.selection) return msgs;
      next[index] = { ...m, selection: updater(m.selection) };
      return next;
    });
  }

  async function send(text: string) {
    if (!text.trim()) return;
    setLoading(true);
    setQuoteError(null);
    setMessages((m) => [...m, { role: "USER", content: text }]);
    setInput("");

    const res = await fetch("/api/chat/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatSessionId, vertical, message: text }),
    });
    const data = await res.json();
    setChatSessionId(data.chatSessionId);

    const agent = data.agent;
    const isActionable = agent.responseType === "comparison" || agent.responseType === "basket";
    const newMsg: Msg = {
      role: "AGENT",
      content: agent.message,
      responseType: agent.responseType,
      cards: agent.cards,
      crossSell: agent.crossSell ?? [],
      stretchPick: agent.stretchPick ?? null,
      clarifyingQuestions: agent.clarifyingQuestions,
      assumptions: agent.assumptions,
      selection: isActionable
        ? { mainProductId: agent.cards?.[0]?.productId ?? null, useStretch: false, crossSellIds: new Set() }
        : undefined,
    };
    setMessages((m) => [...m, newMsg]);
    setLoading(false);
  }

  async function confirmSelection(m: Msg) {
    setLoading(true);
    setQuoteError(null);

    const items: { productId: string; qty: number; requestedPrice: number }[] = [];
    if (m.responseType === "comparison") {
      if (m.selection?.useStretch && m.stretchPick) {
        items.push({ productId: m.stretchPick.productId, qty: 1, requestedPrice: m.stretchPick.price });
      } else {
        const main = m.cards?.find((c) => c.productId === m.selection?.mainProductId) ?? m.cards?.[0];
        if (main) items.push({ productId: main.productId, qty: main.qty, requestedPrice: main.price });
      }
    } else if (m.responseType === "basket") {
      for (const c of m.cards ?? []) items.push({ productId: c.productId, qty: c.qty, requestedPrice: c.price });
      if (m.selection?.useStretch && m.stretchPick) {
        items.push({ productId: m.stretchPick.productId, qty: 1, requestedPrice: m.stretchPick.price });
      }
    }
    for (const cs of m.crossSell ?? []) {
      if (m.selection?.crossSellIds.has(cs.productId)) items.push({ productId: cs.productId, qty: 1, requestedPrice: cs.price });
    }

    const res = await fetch("/api/quote/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatSessionId, items }),
    });
    const data = await res.json();
    await handleQuoteResult(data.quote);
    setLoading(false);
  }

  async function handleQuoteResult(quote: {
    id: string;
    valid: boolean;
    invalidReason?: string;
    alternatives?: { productId: string; title: string; price: number; reasoning: string }[];
  }) {
    if (quote.valid) {
      router.push(`/checkout/${quote.id}`);
      return;
    }
    setQuoteError(quote.invalidReason ?? "This quote is no longer valid.");
    setMessages((m) => [
      ...m,
      {
        role: "AGENT",
        content: (quote.invalidReason ?? "That pick is no longer available.") + (quote.alternatives?.length ? " Here are valid alternatives instead:" : ""),
        responseType: "comparison",
        cards: (quote.alternatives ?? []).map((a) => ({
          productId: a.productId,
          merchantName: "",
          title: a.title,
          brand: "",
          imageEmoji: "",
          facet: {},
          price: a.price,
          stockCount: 1,
          verificationLevel: "VERIFIED",
          freshnessState: "FRESH",
          qty: 1,
          reasoning: a.reasoning,
        })),
        selection: { mainProductId: quote.alternatives?.[0]?.productId ?? null, useStretch: false, crossSellIds: new Set() },
      },
    ]);
  }

  async function simulateDrift(productId: string, mode: "price_spike" | "out_of_stock") {
    await fetch("/api/demo/drift", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, mode }),
    });
    setMessages((m) => [
      ...m,
      { role: "AGENT", content: `[demo] Simulated a live ${mode === "price_spike" ? "price increase" : "stock-out"} on that product. Try confirming it now to see failure handling.` },
    ]);
  }

  async function buyBundle(b: BundleRow) {
    setBundleLoading(b.id);
    setQuoteError(null);

    const fullTotal = b.items.reduce((s, i) => s + i.price, 0);
    const items = b.items.map((i) => ({
      productId: i.productId,
      qty: 1,
      requestedPrice: Math.round((i.price * b.bundlePrice) / fullTotal / 100) * 100,
      expectedFullPrice: i.price,
      bundlePriced: true,
    }));

    let sessionId = chatSessionId;
    if (!sessionId) {
      const chatRes = await fetch("/api/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vertical, message: `I'll take the ${b.name} bundle.` }),
      });
      const chatData = await chatRes.json();
      sessionId = chatData.chatSessionId;
      setChatSessionId(sessionId);
    }

    const res = await fetch("/api/quote/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatSessionId: sessionId, items }),
    });
    const data = await res.json();
    await handleQuoteResult(data.quote);
    setBundleLoading(null);
  }

  const latestActionable = [...messages].reverse().find((m) => m.selection);
  const latestIndex = latestActionable ? messages.lastIndexOf(latestActionable) : -1;

  return (
    <div className="mx-auto flex h-screen max-w-7xl flex-col px-8 py-8">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Shopping agent</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Talk to the agent like a real shopper — it always shows in-budget picks, cross-sell, and one
          upgrade option worth considering.
        </p>
        <div className="mt-4 flex gap-2">
          {VERTICALS.map((v) => (
            <button
              key={v.id}
              onClick={() => switchVertical(v.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                vertical === v.id ? "bg-[var(--accent)] text-white" : "border border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent)]"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex min-h-0 flex-1 gap-6">
        {/* Chat transcript */}
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-[var(--surface-border)] bg-[var(--surface)]">
          <div className="flex-1 overflow-y-auto p-5">
            {messages.length === 0 && (
              <div className="rounded-lg bg-[var(--surface-muted)] p-3 text-sm text-[var(--text-tertiary)]">
                Try: <span className="text-[var(--text-secondary)]">&quot;{VERTICALS.find((v) => v.id === vertical)?.example}&quot;</span>
              </div>
            )}
            <div className="space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={m.role === "USER" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                      m.role === "USER" ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-muted)] text-[var(--text-primary)]"
                    }`}
                  >
                    {m.content}
                    {m.clarifyingQuestions && m.clarifyingQuestions.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        {m.clarifyingQuestions.map((q, qi) => (
                          <li key={qi}>{q}</li>
                        ))}
                      </ul>
                    )}
                    {m.assumptions && m.assumptions.length > 0 && (
                      <div className="mt-2 text-xs italic opacity-70">
                        {m.assumptions.map((a, ai) => (
                          <div key={ai}>({a})</div>
                        ))}
                      </div>
                    )}
                    {i === latestIndex && (
                      <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wide opacity-60">See side panel →</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 border-t border-[var(--surface-border)] p-4"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your request…"
              className="flex-1 rounded-lg border border-[var(--surface-border)] bg-[var(--background)] px-3.5 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-50"
            >
              {loading ? "…" : "Send"}
            </button>
          </form>
        </div>

        {/* Side panel */}
        <div className="w-96 shrink-0 overflow-y-auto rounded-xl border border-[var(--surface-border)] bg-[var(--surface)] p-5">
          {!latestActionable && (
            <div>
              <div className="text-sm text-[var(--text-tertiary)]">
                Picks and comparisons will appear here once the agent responds.
              </div>
              {bundles.length > 0 && (
                <div className="mt-5">
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">Bundles</div>
                  <div className="mt-2 space-y-3">
                    {bundles.map((b) => (
                      <div key={b.id} className="rounded-lg border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">{b.name}</span>
                          <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-strong)]">
                            {b.discountPct}% off
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-[var(--text-secondary)]">{b.description}</div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-sm font-semibold text-[var(--success)]">{money(b.bundlePrice)}</span>
                          <button
                            onClick={() => buyBundle(b)}
                            disabled={bundleLoading === b.id}
                            className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-muted)] disabled:opacity-50"
                          >
                            {bundleLoading === b.id ? "…" : "Get this bundle →"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {latestActionable && (
            <div className="space-y-5">
              {latestActionable.responseType === "comparison" && latestActionable.cards && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
                    {latestActionable.cards.length > 1 ? "Compare" : "Pick"}
                  </div>
                  <div className="mt-2 space-y-2">
                    {latestActionable.cards.map((c) => {
                      const isSelected = !latestActionable.selection?.useStretch && latestActionable.selection?.mainProductId === c.productId;
                      return (
                        <button
                          key={c.productId}
                          onClick={() => updateSelection(latestIndex, (sel) => ({ ...sel, mainProductId: c.productId, useStretch: false }))}
                          className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                            isSelected ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--surface-border)] hover:bg-[var(--surface-muted)]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-[var(--text-primary)]">{c.title}</span>
                            {isSelected && <span className="text-xs font-medium text-[var(--accent-strong)]">selected</span>}
                          </div>
                          <div className="mt-1 text-xs text-[var(--text-tertiary)]">{c.merchantName}</div>
                          <div className="mt-1 text-xs text-[var(--text-secondary)]">{c.reasoning}</div>
                          <div className="mt-2 font-semibold text-[var(--text-primary)]">{money(c.price)}</div>
                          {vertical === "ELECTRONICS" && (
                            <div className="mt-2 flex gap-2 text-[10px] text-[var(--text-tertiary)]">
                              <span role="button" onClick={(e) => { e.stopPropagation(); simulateDrift(c.productId, "price_spike"); }} className="underline hover:text-[var(--warning)]">
                                simulate price spike
                              </span>
                              <span role="button" onClick={(e) => { e.stopPropagation(); simulateDrift(c.productId, "out_of_stock"); }} className="underline hover:text-[var(--warning)]">
                                simulate out of stock
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {latestActionable.responseType === "basket" && latestActionable.cards && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">Basket</div>
                  <div className="mt-2 space-y-1.5 text-sm">
                    {latestActionable.cards.map((c) => (
                      <div key={c.productId} className="flex justify-between text-[var(--text-secondary)]">
                        <span>{c.title} × {c.qty}</span>
                        <span className="tabular-nums">{money(c.price * c.qty)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {latestActionable.stretchPick && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">Worth considering</div>
                  <div
                    className={`mt-2 rounded-lg border p-3 text-sm ${
                      latestActionable.selection?.useStretch ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-dashed border-[var(--surface-border)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[var(--text-primary)]">{latestActionable.stretchPick.title}</span>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        +{money(latestActionable.stretchPick.priceDeltaPaise)} ({latestActionable.stretchPick.priceDeltaPct}%)
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">{latestActionable.stretchPick.reasoning}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-semibold text-[var(--text-primary)]">{money(latestActionable.stretchPick.price)}</span>
                      <button
                        onClick={() => updateSelection(latestIndex, (sel) => ({ ...sel, useStretch: !sel.useStretch }))}
                        className="rounded-md bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--accent-soft)]"
                      >
                        {latestActionable.selection?.useStretch ? "using this" : latestActionable.responseType === "comparison" ? "upgrade" : "add to basket"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {latestActionable.crossSell && latestActionable.crossSell.length > 0 && (
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">You might also like</div>
                  <div className="mt-2 space-y-2">
                    {latestActionable.crossSell.map((cs) => {
                      const checked = latestActionable.selection?.crossSellIds.has(cs.productId) ?? false;
                      return (
                        <label key={cs.productId} className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                updateSelection(latestIndex, (sel) => {
                                  const next = new Set(sel.crossSellIds);
                                  if (next.has(cs.productId)) next.delete(cs.productId);
                                  else next.add(cs.productId);
                                  return { ...sel, crossSellIds: next };
                                })
                              }
                              className="accent-[var(--accent)]"
                            />
                            <span className="text-[var(--text-secondary)]">{cs.title}</span>
                          </span>
                          <span className="tabular-nums text-[var(--text-primary)]">{money(cs.price)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="border-t border-[var(--surface-border)] pt-4">
                <div className="flex items-center justify-between text-sm font-semibold text-[var(--text-primary)]">
                  <span>Total</span>
                  <span className="tabular-nums">{money(selectionTotal(latestActionable))}</span>
                </div>
                <button
                  onClick={() => confirmSelection(latestActionable)}
                  disabled={loading}
                  className="mt-3 w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-strong)] disabled:opacity-50"
                >
                  Confirm &amp; continue →
                </button>
                {quoteError && <div className="mt-2 rounded-md bg-[var(--danger-soft)] px-2 py-1.5 text-xs text-[var(--danger)]">{quoteError}</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
