import type { ScrapedRawProduct } from "./scraper";
import type {
  StaticJson,
  DynamicJson,
  ProvenanceJson,
  ElectronicsFacet,
  GroceryFacet,
  FashionFacet,
} from "./catalog-types";
import type { Vertical, VerificationLevel } from "./enums";

export interface AmbiguityFlagDraft {
  field: string;
  reason: string;
  suggestedValue: string;
}

export interface NormalizedProduct {
  staticJson: StaticJson;
  dynamicJson: DynamicJson;
  provenanceJson: ProvenanceJson;
  verificationLevel: VerificationLevel;
  confidenceScore: number;
  flags: AmbiguityFlagDraft[];
}

// ---------- shared parsing helpers ----------

function parsePricePaise(priceText: string): number {
  const digits = priceText.replace(/[^\d]/g, "");
  const rupees = Number(digits || "0");
  return Math.round(rupees * 100);
}

function parseStockCount(stockText: string): { count: number; confident: boolean } {
  const numMatch = stockText.match(/(\d+)/);
  if (numMatch) {
    return { count: Number(numMatch[1]), confident: true };
  }
  if (/out of stock|sold out/i.test(stockText)) return { count: 0, confident: true };
  if (/in stock/i.test(stockText)) return { count: 10, confident: false }; // no explicit count given
  return { count: 0, confident: false };
}

// Captures the value after "Label:" up to whichever comes first — a "|"
// delimiter, the start of one of the *other* known labels for this vertical
// (so a sentence-style separator like ". Colour:" or ", Battery:" stops the
// match), or end of string. Critically, this does NOT stop on every period
// or comma — otherwise decimal values like "6.1 inch" get truncated to "6".
function extractLabeled(text: string, aliases: string[], otherLabelsInVertical: string[]): string | null {
  const stopAlts = otherLabelsInVertical.filter((l) => !aliases.includes(l));
  const stopLookahead = stopAlts.length
    ? `|(?:[,.;]?\\s*(?:${stopAlts.join("|")})\\s*[:=])`
    : "";
  for (const alias of aliases) {
    const re = new RegExp(`${alias}\\s*[:=]\\s*([^|]+?)(?=\\s*\\|${stopLookahead}|$)`, "i");
    const m = text.match(re);
    if (!m) continue;
    const cleaned = m[1].replace(/[.,;]\s*$/, "").trim();
    // Safety net: a field's value never legitimately contains a comma in our
    // spec syntax (commas are always separators) — if no *known* label
    // followed, an unlabeled trailing fragment (e.g. "128GB, 6000mAh
    // battery, 50MP camera") can otherwise get swallowed whole.
    return cleaned.split(/[,;]/)[0].trim();
  }
  return null;
}

const ELECTRONICS_LABELS = ["ram", "storage", "display", "battery", "processor", "colou?r"];
const GROCERY_LABELS = ["pack size", "diet", "brand tier", "perishable"];
const FASHION_LABELS = ["sizes?", "colou?r", "material", "fabric"];

// ---------- electronics ----------

export function normalizeElectronics(
  specText: string,
): { facet: ElectronicsFacet; flags: AmbiguityFlagDraft[]; confidence: number } {
  const flags: AmbiguityFlagDraft[] = [];

  const ram = extractLabeled(specText, ["ram"], ELECTRONICS_LABELS);
  const storage = extractLabeled(specText, ["storage"], ELECTRONICS_LABELS);
  const displaySize = extractLabeled(specText, ["display"], ELECTRONICS_LABELS);
  const batteryCapacity = extractLabeled(specText, ["battery"], ELECTRONICS_LABELS);
  const processor = extractLabeled(specText, ["processor"], ELECTRONICS_LABELS);
  const color = extractLabeled(specText, ["colou?r"], ELECTRONICS_LABELS);

  let ramFinal = ram;
  let storageFinal = storage;
  let confidence = 1;

  if (!ram || !storage) {
    // Fallback: unlabeled "8gb/256gb" style shorthand — convention is
    // smaller number = RAM, larger = storage, but that's a guess.
    const shorthand = specText.match(/(\d+)\s*gb\s*\/\s*(\d+)\s*gb/i);
    if (shorthand) {
      const a = Number(shorthand[1]);
      const b = Number(shorthand[2]);
      const [ramGuess, storageGuess] = a <= b ? [a, b] : [b, a];
      ramFinal = ramFinal ?? `${ramGuess} GB`;
      storageFinal = storageFinal ?? `${storageGuess} GB`;
      flags.push({
        field: "facet.ram / facet.storage",
        reason: `Source listed RAM/storage as unlabeled shorthand "${shorthand[0]}" instead of separate labeled fields — assumed smaller number is RAM, larger is storage.`,
        suggestedValue: `RAM: ${ramFinal}, Storage: ${storageFinal}`,
      });
      confidence = 0.65;
    }
  }

  const facet: ElectronicsFacet = {
    kind: "ELECTRONICS",
    ram: ramFinal ?? "unknown",
    storage: storageFinal ?? "unknown",
    displaySize: displaySize ?? "unknown",
    batteryCapacity: batteryCapacity ?? "unknown",
    processor: processor ?? "unknown",
    color: color ?? "unknown",
  };

  if (!displaySize || !batteryCapacity || !processor || !color) confidence = Math.min(confidence, 0.8);

  return { facet, flags, confidence };
}

// ---------- grocery ----------

function parsePackSize(raw: string): { qty: number; unit: "kg" | "g" | "litre" | "ml" | "piece"; label: string } {
  const m = raw.match(/([\d.]+)\s*(kg|g|litre|liter|l|ml|pieces?|pcs?)/i);
  if (!m) return { qty: 1, unit: "piece", label: raw };
  const qty = Number(m[1]);
  const unitRaw = m[2].toLowerCase();
  let unit: "kg" | "g" | "litre" | "ml" | "piece" = "piece";
  if (unitRaw.startsWith("kg")) unit = "kg";
  else if (unitRaw === "g") unit = "g";
  else if (unitRaw.startsWith("l")) unit = "litre";
  else if (unitRaw === "ml") unit = "ml";
  else unit = "piece";
  return { qty, unit, label: raw };
}

function normalizeGrocery(
  specText: string,
  priceRupees: number,
): { facet: GroceryFacet; flags: AmbiguityFlagDraft[]; confidence: number } {
  const flags: AmbiguityFlagDraft[] = [];

  const packSizeRaw = extractLabeled(specText, ["pack size"], GROCERY_LABELS) ?? "1 piece";
  const dietRaw = extractLabeled(specText, ["diet"], GROCERY_LABELS) ?? "";
  const brandTierRaw = (extractLabeled(specText, ["brand tier"], GROCERY_LABELS) ?? "standard").toLowerCase();
  const perishableRaw = extractLabeled(specText, ["perishable"], GROCERY_LABELS);

  const { qty, unit } = parsePackSize(packSizeRaw);
  let unitPrice = priceRupees;
  let unitPriceBasis = "per piece";
  if (unit === "kg" && qty > 0) {
    unitPrice = priceRupees / qty;
    unitPriceBasis = "per kg";
  } else if (unit === "g" && qty > 0) {
    unitPrice = (priceRupees / qty) * 1000;
    unitPriceBasis = "per kg";
  } else if (unit === "litre" && qty > 0) {
    unitPrice = priceRupees / qty;
    unitPriceBasis = "per litre";
  } else if (unit === "ml" && qty > 0) {
    unitPrice = (priceRupees / qty) * 1000;
    unitPriceBasis = "per litre";
  }

  const brandTier: GroceryFacet["brandTier"] =
    brandTierRaw === "value" || brandTierRaw === "premium" ? brandTierRaw : "standard";
  if (!["value", "standard", "premium"].includes(brandTierRaw)) {
    flags.push({
      field: "facet.brandTier",
      reason: `Source brand tier text "${brandTierRaw}" didn't match a known tier — defaulted to "standard".`,
      suggestedValue: "standard",
    });
  }

  const facet: GroceryFacet = {
    kind: "GROCERY",
    packSize: packSizeRaw,
    unitPrice: Math.round(unitPrice * 100),
    unitPriceBasis,
    dietTags: dietRaw ? dietRaw.split(/[,/]/).map((t) => t.trim().toLowerCase()) : [],
    brandTier,
    perishable: /yes|true/i.test(perishableRaw ?? ""),
  };

  const confidence = dietRaw ? 0.95 : 0.85;
  if (!dietRaw) {
    flags.push({
      field: "facet.dietTags",
      reason: "No diet tag found on the source listing — left empty pending merchant confirmation.",
      suggestedValue: "veg",
    });
  }

  return { facet, flags, confidence };
}

// ---------- fashion ----------

const CLEAN_SIZE_TOKEN = /^[A-Z]{1,3}$|^\d{2}$/i;
const FIT_NOTE_RE =
  /(true to size|runs? (small|large)|fits? (like|slightly)[^.|]*|relaxed fit|one[- ]size)/i;

function normalizeFashion(
  specText: string,
): { facet: FashionFacet; flags: AmbiguityFlagDraft[]; confidence: number } {
  const flags: AmbiguityFlagDraft[] = [];

  const sizesRaw = extractLabeled(specText, ["sizes?"], FASHION_LABELS);
  const color = extractLabeled(specText, ["colou?r"], FASHION_LABELS) ?? "unknown";
  const material = extractLabeled(specText, ["material", "fabric"], FASHION_LABELS) ?? "unknown";
  const fitMatch = specText.match(FIT_NOTE_RE);
  const fitType = fitMatch ? fitMatch[0] : "unspecified";

  let availableSizes: string[] = [];
  let confidence = 1;

  if (sizesRaw) {
    const tokens = sizesRaw.split(/[,/]/).map((t) => t.trim()).filter(Boolean);
    const allClean = tokens.length > 0 && tokens.every((t) => CLEAN_SIZE_TOKEN.test(t));
    if (allClean) {
      availableSizes = tokens;
    } else {
      // e.g. "Fits like M-L, runs slightly large" or "M/L one-size"
      const rangeMatch = sizesRaw.match(/\b([SMLX]{1,3})[\s-]+([SMLX]{1,3})\b/i);
      availableSizes = rangeMatch ? [rangeMatch[1].toUpperCase(), rangeMatch[2].toUpperCase()] : tokens;
      confidence = 0.6;
      flags.push({
        field: "facet.availableSizes",
        reason: `Source sizing text "${sizesRaw}" is free-form rather than a clean size list — best-effort extraction shown, needs merchant confirmation.`,
        suggestedValue: availableSizes.join(", "),
      });
    }
  } else {
    confidence = 0.5;
    flags.push({
      field: "facet.availableSizes",
      reason: "No parseable size list found on the source listing.",
      suggestedValue: "",
    });
  }

  if (fitType === "unspecified") confidence = Math.min(confidence, 0.8);

  const facet: FashionFacet = {
    kind: "FASHION",
    sizeChartRaw: sizesRaw ?? specText,
    availableSizes,
    color,
    material,
    fitType,
  };

  return { facet, flags, confidence };
}

// ---------- entry point ----------

export function normalizeRawProduct(raw: ScrapedRawProduct, vertical: Vertical): NormalizedProduct {
  const priceRupees = parsePricePaise(raw.priceText) / 100;
  const { count: stockCount, confident: stockConfident } = parseStockCount(raw.stockText);

  let facetResult: { facet: ElectronicsFacet | GroceryFacet | FashionFacet; flags: AmbiguityFlagDraft[]; confidence: number };

  if (vertical === "ELECTRONICS") {
    facetResult = normalizeElectronics(raw.specText);
  } else if (vertical === "GROCERY") {
    facetResult = normalizeGrocery(raw.specText, priceRupees);
  } else {
    facetResult = normalizeFashion(raw.specText);
  }

  const flags = [...facetResult.flags];
  if (!stockConfident) {
    flags.push({
      field: "dynamic.stockCount",
      reason: `Source stock text "${raw.stockText}" had no explicit count — defaulted to an estimate of ${stockCount}.`,
      suggestedValue: String(stockCount),
    });
  }

  const confidence = Math.min(facetResult.confidence, stockConfident ? 1 : 0.85);
  const verificationLevel: VerificationLevel =
    flags.length === 0 ? "VERIFIED" : confidence >= 0.75 ? "INFERRED" : "UNVERIFIED";

  const staticJson: StaticJson = {
    common: {
      sku: raw.sku,
      title: raw.title,
      brand: raw.brand,
      category: raw.category,
      subcategory: raw.subcategory,
      imageEmoji: raw.imageEmoji,
      shortDescription: raw.description,
      unitOfSale: vertical === "GROCERY" ? (facetResult.facet as GroceryFacet).packSize : "piece",
      upgradeSku: raw.upgradeSku,
      pairsWithSkus: raw.pairsWithSkus,
    },
    facet: facetResult.facet,
  };

  const dynamicJson: DynamicJson = {
    price: parsePricePaise(raw.priceText),
    currency: "INR",
    discountPct: raw.discountPct,
    stockCount,
    lastVerifiedAt: new Date().toISOString(),
  };

  const provenanceJson: ProvenanceJson = {
    sourceUrl: raw.sourceUrl,
    rawSnippet: raw.rawSnippet,
    extractionMethod: "html-scrape",
  };

  return {
    staticJson,
    dynamicJson,
    provenanceJson,
    verificationLevel,
    confidenceScore: confidence,
    flags,
  };
}
