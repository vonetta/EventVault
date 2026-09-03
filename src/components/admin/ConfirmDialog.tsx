"use client";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-[color:var(--line)] bg-foam p-6 shadow-xl">
        <h3 className="font-[family-name:var(--font-fraunces)] text-lg text-ink">{title}</h3>
        <p className="mt-2 text-sm text-pine/80">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-[color:var(--line)] bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist/60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-ink px-4 py-2 text-sm font-medium text-foam transition hover:bg-pine"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
