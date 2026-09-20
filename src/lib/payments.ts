/** Individual-photo unlock via Zelle (no card processor fees). */

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

/** Zelle handle: email or US phone number the guest should send to. */
export function zelleRecipient() {
  return (process.env.ZELLE_RECIPIENT || "").trim();
}

export function zelleRecipientName() {
  return (process.env.ZELLE_RECIPIENT_NAME || "").trim();
}

export function zelleConfigured() {
  return Boolean(zelleRecipient());
}

/** @deprecated use zelleConfigured — kept so older imports keep compiling during the switch. */
export function paymentsConfigured() {
  return zelleConfigured();
}

export type ZellePaymentInfo = {
  enabled: boolean;
  priceLabel: string;
  priceCents: number;
  recipient: string;
  recipientName: string;
  /** Memo guests should include so you can match the Zelle to their ticket. */
  memoHint: string;
};

export function zellePaymentInfo(memoHint = ""): ZellePaymentInfo {
  return {
    enabled: zelleConfigured(),
    priceLabel: priceLabel(),
    priceCents: personalPhotoPriceCents(),
    recipient: zelleRecipient(),
    recipientName: zelleRecipientName(),
    memoHint,
  };
}
