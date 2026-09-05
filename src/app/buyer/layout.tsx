"use client";

import { Shell } from "@/components/ui/shell";
import { useRequireRole } from "@/lib/role-context";

const NAV = [
  { href: "/buyer", label: "Shopping agent", exact: true },
  { href: "/buyer/catalog", label: "Browse catalog" },
];

export default function BuyerLayout({ children }: { children: React.ReactNode }) {
  const { ready } = useRequireRole("buyer");
  if (!ready) return null;

  return (
    <Shell roleLabel="Buyer" navItems={NAV}>
      {children}
    </Shell>
  );
}
