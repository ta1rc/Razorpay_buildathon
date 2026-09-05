// SQLite has no native enum support in Prisma, so these fields are plain
// String columns in schema.prisma. These unions are the source of truth for
// allowed values everywhere else in the app.

export const VERTICALS = ["ELECTRONICS", "GROCERY", "FASHION"] as const;
export type Vertical = (typeof VERTICALS)[number];

export const CATALOG_STATUSES = ["DRAFT", "PENDING_APPROVAL", "LIVE", "SUPERSEDED"] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export const VERIFICATION_LEVELS = ["VERIFIED", "INFERRED", "UNVERIFIED"] as const;
export type VerificationLevel = (typeof VERIFICATION_LEVELS)[number];

export const FRESHNESS_STATES = ["FRESH", "STALE", "EXPIRED"] as const;
export type FreshnessState = (typeof FRESHNESS_STATES)[number];

export const CHAT_ROLES = ["USER", "AGENT"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export const ORDER_STATUSES = ["CREATED", "PAID", "FAILED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
