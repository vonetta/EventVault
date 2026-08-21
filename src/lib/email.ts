import nodemailer from "nodemailer";

/** Personal Gmail via App Password (not your normal login password). */
export function emailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function fromAddress() {
  const user = process.env.GMAIL_USER!;
  const name = process.env.EMAIL_FROM_NAME?.trim() || "EventVault";
  return `${name} <${user}>`;
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
    return {
      sent: false as const,
      reason: "Email is not configured (set GMAIL_USER + GMAIL_APP_PASSWORD)",
    };
  }

  const vaultUrl = opts.vaultUrl || process.env.APP_URL || "http://localhost:3000";
  const access =
    opts.tier === "vip"
      ? "VIP access: personal photos, speaker sessions, and the group gallery."
      : "Standard access: group gallery only.";

  const text = [
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
  ].join("\n");

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER!,
        pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, ""),
      },
    });

    await transporter.sendMail({
      from: fromAddress(),
      to: opts.to,
      subject: `Your ${opts.eventName} ticket code`,
      text,
    });

    return { sent: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed";
    return { sent: false as const, reason: message };
  }
}
