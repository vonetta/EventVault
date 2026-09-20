"use client";

import { FormEvent, useState } from "react";

export default function UploaderLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const response = await fetch("/api/auth/uploader", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "Login failed");
      return;
    }

    window.location.assign("/upload");
  }

  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12"
    >
      <p className="font-[family-name:var(--font-fraunces)] text-3xl text-ink">EventVault</p>
      <h1 className="mt-4 font-[family-name:var(--font-fraunces)] text-4xl text-ink">
        Team photo upload
      </h1>
      <p className="mt-2 text-pine">
        For the photo team. Sign in with the team upload password to add photos to an event
        gallery. This is separate from the admin login.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-3">
        <label className="text-sm font-medium text-pine" htmlFor="password">
          Team upload password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "uploader-login-error" : undefined}
          className="h-12 w-full rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 outline-none focus:ring-2 focus:ring-ink/20"
        />
        <button
          type="submit"
          disabled={loading}
          className="h-12 w-full rounded-2xl bg-ink text-foam disabled:opacity-60"
        >
          {loading ? "Checking…" : "Continue"}
        </button>
        {error ? (
          <p id="uploader-login-error" role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
