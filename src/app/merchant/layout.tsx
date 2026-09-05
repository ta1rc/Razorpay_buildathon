"use client";

import { Shell } from "@/components/ui/shell";
import { useRequireRole } from "@/lib/role-context";

const NAV = [
  { href: "/merchant", label: "Overview", exact: true },
  { href: "/merchant/onboard", label: "Catalogue onboarding" },
  { href: "/merchant/catalog", label: "Product blocks" },
  { href: "/merchant/orders", label: "Orders" },
];

export default function MerchantLayout({ children }: { children: React.ReactNode }) {
  const { ready } = useRequireRole("merchant");
  if (!ready) return null;

  return (
    <Shell roleLabel="Merchant" navItems={NAV}>
      {children}
    </Shell>
  );
}
