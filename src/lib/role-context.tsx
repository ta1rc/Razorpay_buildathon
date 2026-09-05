"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

export type Role = "merchant" | "buyer";

const STORAGE_KEY = "acm.role";

export function getStoredRole(): Role | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "merchant" || v === "buyer" ? v : null;
}

export function setStoredRole(role: Role | null) {
  if (typeof window === "undefined") return;
  if (role) window.localStorage.setItem(STORAGE_KEY, role);
  else window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Guards a role-scoped shell: redirects to the role-selection splash if the
 * stored role doesn't match. Demo-only auth model — no server session, just
 * a persisted client-side choice, which is enough to keep the two
 * experiences honestly separated without building real accounts.
 */
function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getServerSnapshot(): Role | null {
  return null;
}

export function useRequireRole(expected: Role): { ready: boolean } {
  const router = useRouter();
  // useSyncExternalStore, not useState+effect, since this reads an external
  // store (localStorage) — avoids setState-in-effect entirely.
  const role = useSyncExternalStore(subscribeToStorage, getStoredRole, getServerSnapshot);

  useEffect(() => {
    if (role !== expected) router.replace("/");
  }, [role, expected, router]);

  return { ready: role === expected };
}

export function useSwitchRole() {
  const router = useRouter();
  return () => {
    setStoredRole(null);
    router.push("/");
  };
}
