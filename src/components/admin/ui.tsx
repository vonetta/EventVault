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
    <section className={`border-b border-[color:var(--line)] pb-8 last:border-b-0 ${className}`}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="font-[family-name:var(--font-fraunces)] text-2xl tracking-tight text-ink">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm leading-relaxed text-pine">{description}</p> : null}
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
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-pine">{label}</span>
      {children}
      {hint ? <span className="text-xs text-pine">{hint}</span> : null}
    </label>
  );
}

const buttonStyles = {
  primary: "bg-ink text-foam hover:bg-pine",
  secondary: "border border-[color:var(--line)] bg-transparent text-ink hover:bg-white",
  ghost: "text-pine hover:text-ink hover:bg-white/70",
  danger: "text-red-800 hover:bg-red-50",
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
      className={`inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${buttonStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="py-1">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-pine">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-fraunces)] text-3xl tracking-tight text-ink">{value}</p>
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
    success: "text-pine",
    warning: "text-gold-deep",
    neutral: "text-pine",
  };
  return <span className={`text-sm font-medium ${tones[tone]}`}>{children}</span>;
}

export function TierBadge({ tier }: { tier: "vip" | "standard" }) {
  return (
    <span className="text-xs font-medium uppercase tracking-[0.08em] text-pine">
      {tier}
    </span>
  );
}

export const inputClassName =
  "h-11 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 text-ink outline-none transition focus-visible:border-ink";

export const textareaClassName =
  "w-full rounded-lg border border-[color:var(--line)] bg-white p-3 text-sm text-ink outline-none transition focus-visible:border-ink";
