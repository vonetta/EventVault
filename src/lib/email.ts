import nodemailer from "nodemailer";
import QRCode from "qrcode";
import { vaultBaseUrl, vaultLoginUrl } from "@/lib/vault-url";

export type EmailConfigStatus = {
  configured: boolean;
  appUrl: string;
  fromName: string;
  gmailUser: string | null;
};

/** Personal Gmail via App Password (not your normal login password). */
export function emailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export function getEmailConfigStatus(): EmailConfigStatus {
  const gmailUser = process.env.GMAIL_USER?.trim() || null;
  return {
    configured: emailConfigured(),
    appUrl: vaultBaseUrl(),
    fromName: process.env.EMAIL_FROM_NAME?.trim() || "EventVault",
    gmailUser: gmailUser ? maskEmail(gmailUser) : null,
  };
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

function fromAddress() {
  const user = process.env.GMAIL_USER!;
  const name = process.env.EMAIL_FROM_NAME?.trim() || "EventVault";
  return `${name} <${user}>`;
}

async function ticketQrDataUrl(loginUrl: string) {
  return QRCode.toDataURL(loginUrl, {
    width: 200,
    margin: 1,
    color: { dark: "#1c1917", light: "#fafaf9" },
  });
}

async function ticketEmailContent(opts: {
  guestName: string;
  eventName: string;
  ticketCode: string;
  tier: "vip" | "standard";
  loginUrl: string;
}) {
  const access =
    opts.tier === "vip"
      ? "VIP access: personal photos, speaker sessions, and the group gallery."
      : "Standard access: group gallery.";

  const text = [
    `Hi ${opts.guestName},`,
    "",
    `Your EventVault ticket for ${opts.eventName} is:`,
    opts.ticketCode,
    "",
    access,
    "",
    `Open your vault: ${opts.loginUrl}`,
    "",
    "Works on your phone — tap the link or scan the QR code in the email.",
    "",
    "Keep this code private — it unlocks your media.",
  ].join("\n");

  const qrDataUrl = await ticketQrDataUrl(opts.loginUrl);

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; color: #1c1917; line-height: 1.6; max-width: 560px;">
      <p style="font-size: 18px; margin: 0 0 16px;">Hi ${escapeHtml(opts.guestName)},</p>
      <p style="margin: 0 0 16px;">Your private media vault for <strong>${escapeHtml(opts.eventName)}</strong> is ready.</p>
      <p style="margin: 0 0 8px; font-size: 14px; color: #57534e;">Your ticket code</p>
      <p style="margin: 0 0 20px; font-size: 28px; letter-spacing: 0.12em; font-family: ui-monospace, monospace;">${escapeHtml(opts.ticketCode)}</p>
      <p style="margin: 0 0 20px; color: #57534e;">${escapeHtml(access)}</p>
      <table cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 24px;">
        <tr>
          <td style="padding-right: 20px; vertical-align: top;">
            <a href="${escapeHtml(opts.loginUrl)}" style="display: inline-block; background: #1c1917; color: #fafaf9; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-family: system-ui, sans-serif; font-size: 14px;">
              Open my vault
            </a>
          </td>
          <td style="vertical-align: top;">
            <img src="${qrDataUrl}" width="120" height="120" alt="Scan to open your vault" style="display: block; border-radius: 8px; border: 1px solid #e7e5e4;" />
            <p style="margin: 6px 0 0; font-size: 11px; color: #57534e; text-align: center;">Scan to open</p>
          </td>
        </tr>
      </table>
      <p style="margin: 0 0 8px; font-size: 13px; color: #57534e;">Works on your phone — tap the button or scan the code.</p>
      <p style="margin: 0; font-size: 13px; color: #57534e;">Keep this code private — it unlocks your media.</p>
    </div>
  `.trim();

  return { text, html };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}) {
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
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
  });
}

export async function sendTicketEmail(opts: {
  to: string;
  guestName: string;
  eventName: string;
  ticketCode: string;
  tier: "vip" | "standard";
  loginUrl?: string;
}) {
  if (!emailConfigured()) {
    return {
      sent: false as const,
      reason: "Email is not configured (set GMAIL_USER + GMAIL_APP_PASSWORD)",
    };
  }

  const loginUrl = opts.loginUrl || vaultLoginUrl(opts.ticketCode);
  const content = await ticketEmailContent({
    guestName: opts.guestName,
    eventName: opts.eventName,
    ticketCode: opts.ticketCode,
    tier: opts.tier,
    loginUrl,
  });

  try {
    await sendMail({
      to: opts.to,
      subject: `Your ${opts.eventName} ticket code`,
      text: content.text,
      html: content.html,
    });

    return { sent: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed";
    return { sent: false as const, reason: message };
  }
}

export async function sendTestEmail(to: string) {
  if (!emailConfigured()) {
    return {
      sent: false as const,
      reason: "Email is not configured (set GMAIL_USER + GMAIL_APP_PASSWORD)",
    };
  }

  const loginUrl = vaultLoginUrl("EV-TEST-CODE");
  const content = await ticketEmailContent({
    guestName: "Test Guest",
    eventName: process.env.EMAIL_FROM_NAME?.trim() || "EventVault",
    ticketCode: "EV-TEST-CODE",
    tier: "vip",
    loginUrl,
  });

  try {
    await sendMail({
      to,
      subject: "EventVault test email",
      text: `EventVault email is working.\n\n${content.text}`,
      html: `
        <div style="font-family: system-ui, sans-serif; color: #1c1917; max-width: 560px;">
          <p style="margin: 0 0 12px;"><strong>EventVault email is working.</strong></p>
          ${content.html}
        </div>
      `.trim(),
    });

    return { sent: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Send failed";
    return { sent: false as const, reason: message };
  }
}
