import Stripe from "stripe";

/** Individual-photo paywall configuration (Stripe hosted Checkout). */

export function paymentsConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function personalPhotoPriceCents() {
  const raw = Number.parseInt(process.env.PERSONAL_PHOTOS_PRICE_CENTS || "1500", 10);
  if (!Number.isFinite(raw) || raw < 50) return 1500;
  return raw;
}

export function personalPhotoCurrency() {
  return (process.env.PERSONAL_PHOTOS_CURRENCY || "usd").toLowerCase();
}

export function priceLabel() {
  const cents = personalPhotoPriceCents();
  const currency = personalPhotoCurrency();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}
