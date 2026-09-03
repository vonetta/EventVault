import { requireProductionAppUrl } from "@/lib/env";
import { normalizeTicketCode } from "@/lib/tickets";

export function vaultBaseUrl() {
  if (process.env.NODE_ENV === "production") {
    return requireProductionAppUrl();
  }
  return process.env.APP_URL?.trim() || "http://localhost:3000";
}

/**
 * Login URL for email/QR. The ticket goes in the hash so servers, CDNs, and
 * access logs never see the credential.
 */
export function vaultLoginUrl(ticketCode?: string) {
  const base = vaultBaseUrl();
  if (!ticketCode?.trim()) return base;
  const url = new URL(base);
  url.hash = `t=${encodeURIComponent(normalizeTicketCode(ticketCode))}`;
  return url.toString();
}
