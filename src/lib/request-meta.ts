/** Lightweight device/browser label for usage logs (no heavy UA parser). */
export function summarizeUserAgent(userAgent: string | null | undefined) {
  const ua = (userAgent || "").trim();
  if (!ua) return "Unknown device";

  let device = "Desktop";
  if (/iPhone/i.test(ua)) device = "iPhone";
  else if (/iPad/i.test(ua)) device = "iPad";
  else if (/Android/i.test(ua)) device = "Android";
  else if (/Macintosh|Mac OS X/i.test(ua)) device = "Mac";
  else if (/Windows/i.test(ua)) device = "Windows";
  else if (/CrOS/i.test(ua)) device = "Chromebook";
  else if (/Linux/i.test(ua)) device = "Linux";

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";

  return `${device} · ${browser}`;
}

export function requestUserAgent(request: Request) {
  return request.headers.get("user-agent") || "";
}
