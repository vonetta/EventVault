/** Production environment checks — fail closed for misconfiguration. */
export function requireProductionAppUrl() {
  const url = process.env.APP_URL?.trim();
  if (process.env.NODE_ENV !== "production") {
    return url || "http://localhost:3000";
  }
  if (!url || url.includes("localhost") || url.includes("127.0.0.1")) {
    throw new Error("APP_URL must be set to your public site URL in production");
  }
  return url;
}

export function assertProductionSecrets() {
  if (process.env.NODE_ENV !== "production") return;

  const adminPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters in production");
  }

  // Team uploads are optional; when enabled they need the same password hygiene
  // as admin, and must not reuse the admin password (they grant different access).
  const uploaderPassword = process.env.UPLOADER_PASSWORD?.trim();
  if (uploaderPassword) {
    if (uploaderPassword.length < 12) {
      throw new Error("UPLOADER_PASSWORD must be at least 12 characters in production");
    }
    if (uploaderPassword === adminPassword) {
      throw new Error("UPLOADER_PASSWORD must be different from ADMIN_PASSWORD");
    }
  }

  requireProductionAppUrl();
}
