import * as cheerio from "cheerio";

export interface ScrapedRawProduct {
  sku: string;
  title: string;
  brand: string;
  category: string;
  subcategory: string;
  imageEmoji: string;
  description: string;
  specText: string;
  priceText: string;
  stockText: string;
  discountPct: number;
  upgradeSku?: string;
  pairsWithSkus: string[];
  sourceUrl: string;
  rawSnippet: string;
}

/**
 * Crawls a demo storefront's listing page and parses each product card out of
 * the rendered HTML with cheerio — no internal JSON API is used, mirroring
 * how onboarding would work against a real merchant's site.
 *
 * `baseUrl` is derived from the incoming request's own origin (see the /api
 * route handlers) rather than a hardcoded env var, since the dev server's
 * port can shift (e.g. when 3000 is already taken).
 */
export async function scrapeStorefront(siteBasePath: string, baseUrl: string): Promise<ScrapedRawProduct[]> {
  const url = `${baseUrl}${siteBasePath}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch storefront ${url}: ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const products: ScrapedRawProduct[] = [];

  $("[data-product-sku]").each((_, el) => {
    const card = $(el);
    const sku = card.attr("data-product-sku") ?? "";
    const title = card.find(".product-title").first().text().trim();
    const brand = card.find(".product-brand").first().text().trim();
    const description = card.find(".product-description").first().text().trim();
    const specText = card.find(".product-spec").first().text().trim();
    const priceText = card.find(".product-price").first().text().trim();
    const stockText = card.find(".product-stock").first().text().trim();
    const category = card.attr("data-category") ?? "";
    const subcategory = card.attr("data-subcategory") ?? "";
    const imageEmoji = card.attr("data-emoji") ?? "";
    const discountPct = Number(card.attr("data-discount-pct") ?? "0");
    const upgradeSkuRaw = card.attr("data-upgrade-sku") ?? "";
    const pairsWithRaw = card.attr("data-pairs-with") ?? "";

    products.push({
      sku,
      title,
      brand,
      category,
      subcategory,
      imageEmoji,
      description,
      specText,
      priceText,
      stockText,
      discountPct,
      upgradeSku: upgradeSkuRaw || undefined,
      pairsWithSkus: pairsWithRaw ? pairsWithRaw.split(",").filter(Boolean) : [],
      sourceUrl: url,
      rawSnippet: ($.html(card) ?? "").trim().slice(0, 2000),
    });
  });

  return products;
}
