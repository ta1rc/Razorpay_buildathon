import { normalizeElectronics } from "./normalizer";
import type { AmbiguityFlagDraft, NormalizedProduct } from "./normalizer";
import type { StaticJson, DynamicJson, ProvenanceJson, ElectronicsFacet } from "./catalog-types";

export interface CsvRow {
  [column: string]: string;
}

// Sentinel AmbiguityFlag.field value the review UI recognizes to render an
// "Exclude this row" action instead of a text-edit box.
export const CATEGORY_MISMATCH_FIELD = "category-mismatch";

const TITLE_COLUMNS = ["title", "Product Name", "prdct_name"];
const BRAND_COLUMNS = ["brand", "BRAND"];
const CATEGORY_COLUMNS = ["Category", "cat"];
const IMAGE_COLUMNS = ["Image Link"];

const UNSUPPORTED_KEYWORDS = [
  "chocolate",
  "milk",
  "led bulb",
  "bulb",
  "running shoes",
  "shoes",
  "footwear",
];

const CATEGORY_KEYWORD_MAP: { match: RegExp; category: string; subcategory: string }[] = [
  { match: /mobile|smartphone|5g|4g\b/i, category: "Mobiles & Accessories", subcategory: "Smartphones" },
  { match: /earbud|earphone|headphone|neckband|speaker|buds/i, category: "Mobiles & Accessories", subcategory: "Audio" },
  { match: /power ?bank|cable|charger/i, category: "Mobiles & Accessories", subcategory: "Accessories" },
  { match: /laptop/i, category: "Mobiles & Accessories", subcategory: "Computers" },
  { match: /smart ?watch/i, category: "Mobiles & Accessories", subcategory: "Wearables" },
];

function resolveField(row: CsvRow, columns: string[]): { value: string; conflict: boolean } {
  const values = columns.map((c) => (row[c] ?? "").trim()).filter(Boolean);
  if (values.length === 0) return { value: "", conflict: false };
  // Prefer the longest non-empty value — usually the most complete/original title.
  const best = values.reduce((a, b) => (b.length > a.length ? b : a));
  const distinct = new Set(values.map((v) => v.toLowerCase().replace(/[^a-z0-9]/g, "")));
  return { value: best, conflict: distinct.size > 1 };
}

function parsePriceToPaise(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim();
  s = s.replace(/₹|rs\.?|inr/gi, "");
  s = s.replace(/\/-\s*$/, "");
  s = s.replace(/,/g, "");
  s = s.trim();
  const m = s.match(/[\d.]+/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function normalizeBrandKey(brand: string): string {
  return brand.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function digitTokens(text: string, minLen = 2): Set<string> {
  const matches = text.match(/\d+/g) ?? [];
  return new Set(matches.filter((d) => d.length >= minLen));
}

function isSubset(small: Set<string>, big: Set<string>): boolean {
  for (const v of small) if (!big.has(v)) return false;
  return true;
}

interface ParsedRow {
  raw: CsvRow;
  rowId: string;
  title: string;
  titleConflict: boolean;
  brand: string;
  category: string;
  price: number | null;
  mrp: number | null;
  imageUrl: string;
  description: string;
}

function parseRow(row: CsvRow): ParsedRow {
  const title = resolveField(row, TITLE_COLUMNS);
  const brand = resolveField(row, BRAND_COLUMNS);
  const category = resolveField(row, CATEGORY_COLUMNS);
  const priceRaw = (row["Price"] ?? "").trim();
  const mrpRaw = (row["MRP (Rs)"] ?? "").trim();
  const image = resolveField(row, IMAGE_COLUMNS);

  return {
    raw: row,
    rowId: row["row_id"] ?? "",
    title: title.value,
    titleConflict: title.conflict,
    brand: brand.value,
    category: category.value,
    price: parsePriceToPaise(priceRaw),
    mrp: parsePriceToPaise(mrpRaw),
    imageUrl: image.value,
    description: (row["description"] ?? "").trim(),
  };
}

export interface CsvNormalizedProduct extends NormalizedProduct {
  rowId: string;
  excludeSuggested: boolean;
}

/**
 * Distorted-CSV ingestion for a single-vertical (ELECTRONICS) merchant.
 * Reuses the same NormalizedProduct shape the scrape pipeline produces
 * (src/lib/normalizer.ts) so every downstream consumer — Product/AmbiguityFlag
 * models, the review/approve UI, getLiveCandidates, buyer chat, checkout,
 * audit — works identically regardless of ingestion method.
 */
export function normalizeCsvRows(rows: CsvRow[], sourceLabel: string): CsvNormalizedProduct[] {
  const parsed = rows.map(parseRow).filter((r) => r.title || r.brand);

  // Duplicate detection: same normalized brand + one row's distinctive digit
  // tokens is a subset of the other's. Later duplicates are dropped; a flag
  // records the merge on the kept (first) row.
  const duplicateOf = new Map<number, number>(); // later index -> canonical index
  for (let i = 0; i < parsed.length; i++) {
    if (duplicateOf.has(i)) continue;
    for (let j = i + 1; j < parsed.length; j++) {
      if (duplicateOf.has(j)) continue;
      const a = parsed[i];
      const b = parsed[j];
      if (!a.brand || !b.brand) continue;
      if (normalizeBrandKey(a.brand) !== normalizeBrandKey(b.brand)) continue;
      const da = digitTokens(a.title);
      const db = digitTokens(b.title);
      const [small, big] = da.size <= db.size ? [da, db] : [db, da];
      if (isSubset(small, big)) duplicateOf.set(j, i);
    }
  }

  const mergedNotes = new Map<number, string[]>();
  for (const [dupIdx, canonicalIdx] of duplicateOf) {
    const list = mergedNotes.get(canonicalIdx) ?? [];
    list.push(parsed[dupIdx].rowId);
    mergedNotes.set(canonicalIdx, list);
  }

  const results: CsvNormalizedProduct[] = [];

  parsed.forEach((row, idx) => {
    if (duplicateOf.has(idx)) return; // dropped — merged into its canonical row

    const flags: AmbiguityFlagDraft[] = [];
    let confidence = 1;

    if (row.titleConflict) {
      flags.push({
        field: "common.title",
        reason: `Source spreadsheet listed conflicting product names across redundant columns for this row — used the most complete one.`,
        suggestedValue: row.title,
      });
      confidence = Math.min(confidence, 0.85);
    }

    const dupes = mergedNotes.get(idx);
    if (dupes && dupes.length > 0) {
      flags.push({
        field: "duplicate-rows",
        reason: `${dupes.length} duplicate listing${dupes.length > 1 ? "s" : ""} of this product were found in the upload (row${dupes.length > 1 ? "s" : ""} ${dupes.join(", ")}) and merged into this one.`,
        suggestedValue: "merged",
      });
    }

    const titleLower = `${row.title} ${row.category} ${row.description}`.toLowerCase();
    const isUnsupported = UNSUPPORTED_KEYWORDS.some((kw) => titleLower.includes(kw));

    let category = row.category;
    let subcategory = row.category || "General";
    if (!category) {
      const inferred = CATEGORY_KEYWORD_MAP.find((c) => c.match.test(titleLower));
      if (inferred) {
        category = inferred.category;
        subcategory = inferred.subcategory;
        flags.push({
          field: "common.category",
          reason: "Category was blank in the source spreadsheet — inferred from the product title.",
          suggestedValue: category,
        });
        confidence = Math.min(confidence, 0.8);
      } else {
        category = "Mobiles & Accessories";
        subcategory = "Uncategorized";
        flags.push({
          field: "common.category",
          reason: "Category was blank in the source spreadsheet and couldn't be inferred — defaulted, needs merchant input.",
          suggestedValue: category,
        });
        confidence = Math.min(confidence, 0.6);
      }
    }

    if (isUnsupported) {
      flags.push({
        field: CATEGORY_MISMATCH_FIELD,
        reason: `"${row.category || subcategory}" doesn't match this store's electronics & accessories catalog — likely doesn't belong here.`,
        suggestedValue: "EXCLUDE",
      });
      confidence = Math.min(confidence, 0.4);
    }

    const priceCandidates = [row.price, row.mrp].filter((p): p is number => p !== null);
    const price = row.price ?? row.mrp ?? 0;
    if (row.price === null && row.mrp !== null) {
      flags.push({
        field: "dynamic.price",
        reason: "No selling price column had a parseable value — fell back to MRP.",
        suggestedValue: String(row.mrp / 100),
      });
      confidence = Math.min(confidence, 0.75);
    }
    if (priceCandidates.length === 0) confidence = Math.min(confidence, 0.3);

    const { facet, flags: facetFlags, confidence: facetConfidence } = normalizeElectronics(row.description);
    flags.push(...facetFlags);

    // Storage sometimes arrives in TB in this distorted export — normalize to GB.
    const tbMatch = facet.storage.match(/^([\d.]+)\s*tb$/i);
    if (tbMatch) {
      const gb = Math.round(parseFloat(tbMatch[1]) * 1024);
      flags.push({
        field: "facet.storage",
        reason: `Storage was listed in TB ("${facet.storage}") instead of GB — converted for consistency with the rest of the catalog.`,
        suggestedValue: `${gb} GB`,
      });
      (facet as ElectronicsFacet).storage = `${gb} GB`;
      confidence = Math.min(confidence, 0.85);
    }

    confidence = Math.min(confidence, facetConfidence);

    const verificationLevel = flags.length === 0 ? "VERIFIED" : confidence >= 0.75 ? "INFERRED" : "UNVERIFIED";

    const staticJson: StaticJson = {
      common: {
        sku: `CSV-${row.rowId || idx}`,
        title: row.title || "Untitled product",
        brand: row.brand || "Unbranded",
        category,
        subcategory,
        imageEmoji: "📦",
        shortDescription: row.description.slice(0, 140),
        unitOfSale: "piece",
        pairsWithSkus: [],
      },
      facet,
    };

    const dynamicJson: DynamicJson = {
      price,
      currency: "INR",
      discountPct: row.mrp && row.price && row.mrp > row.price ? Math.round(((row.mrp - row.price) / row.mrp) * 100) : 0,
      stockCount: isUnsupported ? 0 : 25,
      lastVerifiedAt: new Date().toISOString(),
    };

    const provenanceJson: ProvenanceJson = {
      sourceUrl: sourceLabel,
      rawSnippet: JSON.stringify(row.raw),
      extractionMethod: "csv-import",
    };

    results.push({
      rowId: row.rowId,
      staticJson,
      dynamicJson,
      provenanceJson,
      verificationLevel,
      confidenceScore: confidence,
      flags,
      excludeSuggested: isUnsupported,
    });
  });

  return results;
}
