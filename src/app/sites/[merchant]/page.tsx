import { notFound } from "next/navigation";
import { MERCHANTS } from "@/lib/demo-products";

const THEME: Record<string, { bg: string; accent: string; accentText: string; chip: string }> = {
  techbazaar: {
    bg: "bg-slate-950",
    accent: "bg-sky-500",
    accentText: "text-sky-400",
    chip: "bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30",
  },
  freshmart: {
    bg: "bg-emerald-950",
    accent: "bg-lime-500",
    accentText: "text-lime-400",
    chip: "bg-lime-500/10 text-lime-300 ring-1 ring-lime-500/30",
  },
  stylehub: {
    bg: "bg-rose-950",
    accent: "bg-rose-500",
    accentText: "text-rose-400",
    chip: "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/30",
  },
};

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ merchant: string }>;
}) {
  const { merchant: slug } = await params;
  const merchant = MERCHANTS.find((m) => m.slug === slug);
  if (!merchant) notFound();

  const theme = THEME[slug];

  return (
    <div className={`min-h-screen ${theme.bg} text-white`}>
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${theme.accent} text-lg font-bold text-black`}>
              {merchant.name[0]}
            </span>
            <div>
              <div className="text-lg font-semibold">{merchant.name}</div>
              <div className="text-xs text-white/50">{merchant.siteDescription}</div>
            </div>
          </div>
          <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/50">
            demo storefront · not a real store
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold">All products</h1>
        <p className="mb-8 text-sm text-white/50">
          {merchant.products.length} products · rendered server-side, no clean API — this is what
          the onboarding scraper crawls.
        </p>

        <div
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="product-grid"
        >
          {merchant.products.map((p) => (
            <article
              key={p.sku}
              data-product-sku={p.sku}
              data-category={p.category}
              data-subcategory={p.subcategory}
              data-emoji={p.imageEmoji}
              data-discount-pct={p.discountPct}
              data-upgrade-sku={p.upgradeSku ?? ""}
              data-pairs-with={(p.pairsWithSkus ?? []).join(",")}
              className="product-card flex flex-col rounded-xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:bg-white/[0.06]"
            >
              <div className="mb-3 flex items-start justify-between">
                <span className="text-3xl">{p.imageEmoji}</span>
                {p.discountPct > 0 && (
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${theme.chip}`}>
                    {p.discountPct}% off
                  </span>
                )}
              </div>
              <h3 className="product-title text-base font-semibold">{p.title}</h3>
              <p className="product-brand text-xs text-white/50">{p.brand}</p>
              <p className="product-description mt-2 text-xs text-white/40">{p.description}</p>
              <p className="product-spec mt-3 rounded-md bg-black/20 p-2 font-mono text-[11px] leading-relaxed text-white/60">
                {p.specText}
              </p>
              <div className="mt-4 flex items-end justify-between">
                <span className={`product-price text-lg font-semibold ${theme.accentText}`}>
                  {p.priceText}
                </span>
                <span className="product-stock text-xs text-white/50">{p.stockText}</span>
              </div>
            </article>
          ))}
        </div>
      </main>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-white/30">
        {merchant.name} — a fictional demo storefront built for this hackathon project.
      </footer>
    </div>
  );
}
