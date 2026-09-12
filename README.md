# Agentic Commerce Middleware

**A middle layer that turns any merchant's catalog — scraped from a live site or uploaded as a messy CSV — into an AI-agent-readable format, so a buyer can shop by talking to an agent and check out through a real Razorpay Test Mode payment, with every step audited.**

Built for Razorpay's Buildathon, **Track 01 — AI Growth & Agentic Commerce**: *"Build an agent that grows revenue for a merchant on Razorpay test-mode APIs, or that makes a merchant transactable by an AI buyer end to end."*

---

## What this actually does

Most "agentic commerce" demos either fake the catalog or fake the payment. This one doesn't:

- **Real ingestion, two ways.** A `cheerio`-based scraper crawls three live demo storefronts (no clean internal API — it parses rendered HTML, the way it would have to against a real merchant site), and a separate CSV pipeline ingests a genuinely messy spreadsheet export (redundant columns, duplicate rows, mixed price formats, wrong units, off-category items) for a fourth merchant.
- **A real ambiguity-review step.** Anything the extractor isn't confident about — a missing category, a price in the wrong unit, two rows that look like duplicates — becomes a flag the merchant has to confirm or edit before the catalog goes live. Nothing gets published silently.
- **A real structured, agent-readable catalog.** Every product is a block of static attributes (spec, brand, category) + dynamic fields (price, stock, freshness) + provenance (where it came from, how confident the system is) + verification level — the literal "block system" the problem statement asks for.
- **A real shopping agent**, not a scripted flow. It reasons over the live catalog (Gemini, with Claude and a deterministic rule-based agent as fallbacks so the app never breaks without an API key), asks clarifying questions when a request is underspecified (e.g. "groceries for the house in ₹10,000" — for whom, what diet, what to skip), and always surfaces cross-sell, merchant-curated bundles, and one above-budget "worth considering" upgrade — never just the cheapest match.
- **Real failure handling.** If a product's price or stock changes between the agent's recommendation and checkout, a live re-verification catches it and the agent proposes a valid alternative — before payment, not after.
- **A real Razorpay Test Mode payment.** Real order creation, the real Checkout.js widget, real HMAC signature verification server-side.
- **A real audit trail.** Catalog version → agent decision → quote (requested vs. live-verified) → Razorpay order → signature verification → final status, all in one chain per order.

## Two separate experiences

The app opens on a role splash — **Merchant** and **Buyer** are deliberately separate surfaces, each seeing only what that role should:

| | Merchant | Buyer |
|---|---|---|
| Sees | Onboarding, ambiguity review, structured catalog, real order/revenue dashboard | Chat agent, live comparison/cross-sell/bundle panel, product browse |
| Never sees | — | CSV upload, catalogue cleaning internals, merchant analytics |

## The pipeline, end to end

```
Merchant onboarding                Structured catalog             Buyer chat
┌─────────────────────┐            ┌──────────────────┐           ┌─────────────────────┐
│ Sync website (scrape)│           │ static + dynamic  │           │ "best phone under    │
│      or              │──────────▶│ + provenance      │──────────▶│  ₹30,000?"           │
│ Upload CSV catalogue │  ambiguity│ + verification    │  agent    │ → comparison,        │
│                       │  flags → │ + freshness       │  reads    │   cross-sell, one    │
│                       │  merchant│                   │  only     │   upgrade option     │
│                       │  review  │                   │  LIVE     │                       │
└─────────────────────┘            └──────────────────┘  catalog  └──────────┬──────────┘
                                                                              │ confirm
                                                                              ▼
                                                                  ┌───────────────────────┐
                                                                  │ Live requote           │
                                                                  │ (price/stock changed?  │
                                                                  │  → alternatives)       │
                                                                  └───────────┬───────────┘
                                                                              │ valid
                                                                              ▼
                                                                  ┌───────────────────────┐
                                                                  │ Razorpay Test Mode     │
                                                                  │ order → Checkout.js →  │
                                                                  │ signature verification │
                                                                  └───────────┬───────────┘
                                                                              ▼
                                                                  ┌───────────────────────┐
                                                                  │ Audit trail: catalog → │
                                                                  │ decision → quote →     │
                                                                  │ order → status         │
                                                                  └───────────────────────┘
```

## Demo verticals

| Merchant | Vertical | Ingestion | What it demonstrates |
|---|---|---|---|
| **TechBazaar** | Electronics | Scraped storefront | Cross-brand spec comparison ("best 256GB phone under ₹30,000"), upsell to a pricier model, cross-sell to cases/earbuds |
| **FreshMart** | Grocery | Scraped storefront | Multi-turn clarifying questions ("groceries for the house in ₹10,000" → household size, diet, priorities) before a multi-item basket |
| **StyleHub** | Fashion | Scraped storefront | Ambiguity flags on free-text sizing ("Fits like M-L, runs slightly large") |
| **Urban Needs Store** | Electronics | CSV upload | The full distorted-catalogue story: redundant columns, duplicate rows merged, mixed price formats, a TB→GB unit conversion, off-category rows flagged for exclusion |

A ready-to-use messy sample file for the CSV path ships at [`public/demo/urban-needs-distorted-catalogue.csv`](public/demo/urban-needs-distorted-catalogue.csv).

## Tech stack

- **Next.js 16 (App Router) + TypeScript** — one process serves storefronts, both dashboards, chat, checkout, and audit views.
- **Prisma + SQLite** — zero external setup; the whole data model (merchants, catalog versions, products, ambiguity flags, chat sessions, quotes, orders, bundles) lives in one file.
- **cheerio** — server-side HTML parsing for the scrape-based onboarding path.
- **papaparse** — robust CSV parsing for the upload-based onboarding path.
- **Gemini / Claude (Anthropic SDK)** — the buyer-chat agent's reasoning, with a deterministic rule-based agent as an automatic fallback if no key is configured or a call fails, so the app is always demoable.
- **razorpay (npm SDK) + Checkout.js** — real Test Mode order creation and payment, HMAC signature verification via Node's `crypto`.

## Getting started

```bash
git clone https://github.com/ta1rc/Razorpay_buildathon.git
cd Razorpay_buildathon
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), pick a role, and go.

### Environment variables

Create a `.env` and a `.env.local`:

```bash
# .env — Prisma reads this
DATABASE_URL="file:./dev.db"
```

```bash
# .env.local — all optional; the app degrades gracefully without any of them
GEMINI_API_KEY=""        # free tier — get one at aistudio.google.com/apikey
ANTHROPIC_API_KEY=""     # optional second LLM option, tried if Gemini is absent/fails
RAZORPAY_KEY_ID=""       # Test Mode key from the Razorpay dashboard
RAZORPAY_KEY_SECRET=""   # Test Mode secret — required together for real checkout
```

Without an LLM key, buyer chat runs on a deterministic rule-based agent (still fully functional — parses budget/size/diet from the message, ranks candidates, builds baskets). Without Razorpay keys, checkout fails with a clear, explicit error instead of crashing.

### Trying the full loop

1. **As Merchant** → *Catalogue onboarding* → pick a merchant → **Sync from website** (the 3 scraped ones) or **Upload CSV** → **Use sample distorted catalogue** for Urban Needs Store → review flags → **Approve & publish catalog**.
2. **Switch role → Buyer** → *Shopping agent* → try a vertical's example prompt → confirm a pick (toggle cross-sell, or take the upgrade) → **Confirm & continue**.
3. Complete the Razorpay Test Mode payment (`4111 1111 1111 1111`, any future expiry/CVV/OTP).
4. Land on the **audit trail** — the full chain for that order.
5. Back on the Merchant side, check **Orders** and the **Overview** dashboard — real numbers, computed from what you just did.

## Project structure

```
src/
  app/
    merchant/            # merchant dashboard, onboarding, product-block catalog viewer, orders
    buyer/                # shopping agent chat + browse/search catalog
    checkout/[quoteId]/   # Razorpay Test Mode checkout
    audit/[orderId]/      # per-order audit trail
    sites/[merchant]/     # the 3 scraped demo storefronts (independent of the app's own UI)
    api/                  # onboarding (scrape + CSV), chat, quote, checkout, bundles, audit
  lib/
    scraper.ts            # cheerio-based storefront crawler
    csv-normalizer.ts      # CSV parsing + distortion detection/cleanup
    normalizer.ts          # shared per-vertical facet extraction (electronics/grocery/fashion)
    agent/                 # Gemini/Claude/rule-based chat agents, candidates, cross-sell, upsell
    audit.ts, merchant-stats.ts, catalog-types.ts, enums.ts
prisma/
  schema.prisma           # Merchant, CatalogVersion, Product, AmbiguityFlag, ChatSession,
                           # ChatMessage, Quote, Order, Bundle
  seed.ts
public/demo/
  urban-needs-distorted-catalogue.csv
```

## Design decisions worth knowing

- **Correctness-critical logic is never left to the LLM.** Price parsing, duplicate detection, live requote validity, and alternative-suggestion ranking are all deterministic code — the LLM is only ever responsible for picking among real candidates and phrasing the explanation. This is what makes the "failure handling" and "audit trail" stages trustworthy rather than just plausible-looking.
- **One LIVE catalog version per merchant, enforced server-side.** Re-onboarding a merchant demotes the previous live version rather than leaving two "live-ish" versions around — otherwise a buyer's chat pick and the checkout-time requote could silently read from different snapshots.
- **SQLite is a deliberate choice for a hackathon demo**, not a production recommendation — it means anyone can clone this and run it with zero external services.

---


