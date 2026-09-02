import { requireProductionAppUrl } from "@/lib/env";

export function vaultBaseUrl() {
  if (process.env.NODE_ENV === "production") {
    return requireProductionAppUrl();
  }
  return process.env.APP_URL?.trim() || "http://localhost:3000";
}

/** Public login URL; optional ticket pre-fills the home page form (and QR deep link). */
export function vaultLoginUrl(ticketCode?: string) {
  const base = vaultBaseUrl();
  if (!ticketCode?.trim()) return base;
  const url = new URL(base);
  url.searchParams.set("ticket", ticketCode.trim());
  return url.toString();
}
