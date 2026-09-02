import nodemailer from "nodemailer";
import { requireProductionAppUrl } from "@/lib/env";

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
    appUrl: process.env.APP_URL?.trim() || "http://localhost:3000",
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

function vaultUrl() {
  if (process.env.NODE_ENV === "production") {
    return requireProductionAppUrl();
  }
  return process.env.APP_URL?.trim() || "http://localhost:3000";
}

function ticketEmailContent(opts: {
  guestName: string;
  eventName: string;
  ticketCode: string;
  tier: "vip" | "standard";
  vaultUrl: string;
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
    `Open your vault: ${opts.vaultUrl}`,
    "",
    "Keep this code private — it unlocks your media.",
  ].join("\n");

  const html = `
    <div style="font-family: Georgia, 'Times New Roman', serif; color: #10241f; line-height: 1.6; max-width: 560px;">
      <p style="font-size: 18px; margin: 0 0 16px;">Hi ${escapeHtml(opts.guestName)},</p>
      <p style="margin: 0 0 16px;">Your private media vault for <strong>${escapeHtml(opts.eventName)}</strong> is ready.</p>
      <p style="margin: 0 0 8px; font-size: 14px; color: #3d5c52;">Your ticket code</p>
      <p style="margin: 0 0 20px; font-size: 28px; letter-spacing: 0.12em; font-family: ui-monospace, monospace;">${escapeHtml(opts.ticketCode)}</p>
      <p style="margin: 0 0 20px; color: #3d5c52;">${escapeHtml(access)}</p>
      <p style="margin: 0 0 24px;">
        <a href="${escapeHtml(opts.vaultUrl)}" style="display: inline-block; background: #10241f; color: #f4f1ea; text-decoration: none; padding: 12px 20px; border-radius: 999px; font-family: system-ui, sans-serif; font-size: 14px;">
          Open my vault
        </a>
      </p>
      <p style="margin: 0; font-size: 13px; color: #3d5c52;">Keep this code private — it unlocks your media.</p>
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
  vaultUrl?: string;
}) {
  if (!emailConfigured()) {
    return {
      sent: false as const,
      reason: "Email is not configured (set GMAIL_USER + GMAIL_APP_PASSWORD)",
    };
  }

  const url = opts.vaultUrl || vaultUrl();
  const content = ticketEmailContent({
    guestName: opts.guestName,
    eventName: opts.eventName,
    ticketCode: opts.ticketCode,
    tier: opts.tier,
    vaultUrl: url,
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

  const url = vaultUrl();
  const content = ticketEmailContent({
    guestName: "Test Guest",
    eventName: process.env.EMAIL_FROM_NAME?.trim() || "EventVault",
    ticketCode: "EV-TEST-CODE",
    tier: "vip",
    vaultUrl: url,
  });

  try {
    await sendMail({
      to,
      subject: "EventVault test email",
      text: `EventVault email is working.\n\n${content.text}`,
      html: `
        <div style="font-family: system-ui, sans-serif; color: #10241f; max-width: 560px;">
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
