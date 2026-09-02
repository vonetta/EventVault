import type { ReactNode } from "react";

export function AdminPanel({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-[color:var(--line)] bg-white/90 p-5 shadow-sm shadow-ink/5 backdrop-blur-sm md:p-6 ${className}`}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-fraunces)] text-xl text-ink md:text-2xl">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm leading-relaxed text-pine/75">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AdminField({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 text-sm text-pine ${className}`}>
      <span className="font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="text-xs text-pine/65">{hint}</span> : null}
    </label>
  );
}

const buttonStyles = {
  primary: "bg-ink text-foam hover:bg-pine",
  secondary: "border border-[color:var(--line)] bg-white text-ink hover:bg-mist/60",
  ghost: "text-pine hover:bg-mist/70",
  danger: "border border-red-200 bg-red-50 text-red-800 hover:bg-red-100",
} as const;

export function AdminButton({
  variant = "secondary",
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonStyles;
}) {
  return (
    <button
      type="button"
      className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-pine/65">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-fraunces)] text-2xl text-ink">{value}</p>
    </div>
  );
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "success" | "warning" | "neutral";
  children: ReactNode;
}) {
  const tones = {
    success: "bg-emerald-100 text-emerald-900",
    warning: "bg-amber-100 text-amber-900",
    neutral: "bg-mist text-pine",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>
  );
}

export function TierBadge({ tier }: { tier: "vip" | "standard" }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${
        tier === "vip" ? "bg-gold/25 text-gold-deep" : "bg-mist text-pine"
      }`}
    >
      {tier}
    </span>
  );
}

export const inputClassName =
  "h-11 w-full rounded-xl border border-[color:var(--line)] bg-white px-3 text-ink outline-none transition focus:border-pine/40 focus:ring-2 focus:ring-gold/25";

export const textareaClassName =
  "w-full rounded-xl border border-[color:var(--line)] bg-white p-3 text-sm text-ink outline-none transition focus:border-pine/40 focus:ring-2 focus:ring-gold/25";
