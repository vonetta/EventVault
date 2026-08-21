import { Resend } from "resend";

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendTicketEmail(opts: {
  to: string;
  guestName: string;
  eventName: string;
  ticketCode: string;
  tier: "vip" | "standard";
  vaultUrl?: string;
}) {
  if (!emailConfigured()) {
    return { sent: false as const, reason: "Email is not configured (RESEND_API_KEY / EMAIL_FROM)" };
  }

  const resend = new Resend(process.env.RESEND_API_KEY!);
  const vaultUrl = opts.vaultUrl || process.env.APP_URL || "https://your-eventvault.vercel.app";
  const access =
    opts.tier === "vip"
      ? "VIP access: personal photos, speaker sessions, and the group gallery."
      : "Standard access: group gallery only.";

  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: opts.to,
    subject: `Your ${opts.eventName} ticket code`,
    text: [
      `Hi ${opts.guestName},`,
      "",
      `Your EventVault ticket for ${opts.eventName} is:`,
      opts.ticketCode,
      "",
      access,
      "",
      `Open your vault: ${vaultUrl}`,
      "",
      "Keep this code private — it unlocks your media.",
    ].join("\n"),
  });

  if (error) {
    return { sent: false as const, reason: error.message };
  }
  return { sent: true as const };
}
