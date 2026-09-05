"use client";

import { useRouter } from "next/navigation";
import { setStoredRole, type Role } from "@/lib/role-context";

const ROLES: { role: Role; title: string; description: string; points: string[] }[] = [
  {
    role: "merchant",
    title: "Merchant",
    description: "Onboard your catalog, review what the system flagged, and track orders.",
    points: [
      "Sync a storefront or upload a CSV catalog",
      "Review ambiguous fields before publishing",
      "Real order and catalogue-health metrics",
    ],
  },
  {
    role: "buyer",
    title: "Buyer",
    description: "Shop by talking to an agent that reasons over the live, structured catalog.",
    points: [
      "Conversational shopping across three categories",
      "Cross-sell, bundles, and one upgrade option, always",
      "Real Razorpay Test Mode checkout",
    ],
  },
];

export default function RoleSplash() {
  const router = useRouter();

  function choose(role: Role) {
    setStoredRole(role);
    router.push(role === "merchant" ? "/merchant" : "/buyer");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--background)] px-6">
      <div className="mb-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-[var(--surface-border)] bg-[var(--surface)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
          Agentic Commerce Middleware
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Continue as
        </h1>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">Two separate experiences, one live catalog underneath.</p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-5 sm:grid-cols-2">
        {ROLES.map((r) => (
          <button
            key={r.role}
            onClick={() => choose(r.role)}
            className="group flex flex-col items-start rounded-2xl border border-[var(--surface-border)] bg-[var(--surface)] p-6 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-[0_8px_24px_rgba(15,157,120,0.12)]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--sidebar-bg)] text-sm font-bold text-white">
              {r.title[0]}
            </span>
            <span className="mt-4 text-lg font-semibold text-[var(--text-primary)]">{r.title}</span>
            <span className="mt-1 text-sm text-[var(--text-secondary)]">{r.description}</span>
            <ul className="mt-4 space-y-1.5">
              {r.points.map((p) => (
                <li key={p} className="flex items-start gap-2 text-xs text-[var(--text-tertiary)]">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--accent)]" />
                  {p}
                </li>
              ))}
            </ul>
            <span className="mt-5 text-sm font-medium text-[var(--accent-strong)] group-hover:underline">
              Continue as {r.title} →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
