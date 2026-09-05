// Concrete shapes for Product.staticJson / dynamicJson / provenanceJson.
// Every product has a shared "common" envelope so the buyer-chat agent can
// reason generically across merchants, plus one vertical-specific "facet" so
// comparisons within a vertical are spec-for-spec meaningful.

export interface CommonStatic {
  sku: string; // stable across catalog versions — used to resolve upgrade/pairsWith relationships
  title: string;
  brand: string;
  category: string;
  subcategory: string;
  imageEmoji: string; // demo assets are emoji, not real photos
  shortDescription: string;
  unitOfSale: string; // "piece" | "kg" | "pack of 6" | ...
  upgradeSku?: string; // a pricier alternative with more of what the buyer wants
  pairsWithSkus: string[]; // complementary items for cross-sell / bundle-building
}

export interface ElectronicsFacet {
  kind: "ELECTRONICS";
  ram: string; // "8 GB"
  storage: string; // "256 GB"
  displaySize: string; // "6.5 inch"
  batteryCapacity: string; // "5000 mAh"
  processor: string;
  color: string;
}

export interface GroceryFacet {
  kind: "GROCERY";
  packSize: string; // "1 kg", "500 ml"
  unitPrice: number; // price per base unit, paise, for value comparison
  unitPriceBasis: string; // "per kg", "per litre", "per piece"
  dietTags: string[]; // ["veg","gluten-free",...]
  brandTier: "value" | "standard" | "premium";
  perishable: boolean;
}

export interface FashionFacet {
  kind: "FASHION";
  sizeChartRaw: string; // deliberately messy free text, source of ambiguity flags
  availableSizes: string[];
  color: string;
  material: string;
  fitType: string;
}

export type Facet = ElectronicsFacet | GroceryFacet | FashionFacet;

export interface StaticJson {
  common: CommonStatic;
  facet: Facet;
}

export interface DynamicJson {
  price: number; // paise
  currency: "INR";
  discountPct: number;
  stockCount: number;
  lastVerifiedAt: string; // ISO timestamp
}

export interface ProvenanceJson {
  sourceUrl: string;
  rawSnippet: string;
  extractionMethod: "html-scrape" | "csv-import" | "manual";
}

export function parseStatic(json: string): StaticJson {
  return JSON.parse(json);
}

export function parseDynamic(json: string): DynamicJson {
  return JSON.parse(json);
}

export function parseProvenance(json: string): ProvenanceJson {
  return JSON.parse(json);
}
