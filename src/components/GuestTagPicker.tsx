"use client";

import { useMemo, useState } from "react";
import { suggestSimilarGuests, type NameOnlyGuest } from "@/lib/guest-name-match";

type GuestTagPickerProps = {
  guests: NameOnlyGuest[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onCreateGuest: (name: string) => Promise<NameOnlyGuest | null>;
  /** Rename a person — updates the name everywhere that guest is tagged. */
  onRenameGuest?: (guestId: string, name: string) => Promise<NameOnlyGuest | null>;
  disabled?: boolean;
  /** Compact mode for embedding under a photo thumbnail. */
  compact?: boolean;
};

export function GuestTagPicker({
  guests,
  selectedIds,
  onChange,
  onCreateGuest,
  onRenameGuest,
  disabled,
  compact,
}: GuestTagPickerProps) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [hint, setHint] = useState("");

  const selected = useMemo(() => {
    const byId = new Map(guests.map((guest) => [guest._id, guest]));
    return selectedIds.map((id) => byId.get(id)).filter((g): g is NameOnlyGuest => Boolean(g));
  }, [guests, selectedIds]);

  const foldedQuery = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!foldedQuery) return guests.slice(0, compact ? 8 : 40);
    return guests
      .filter((guest) => guest.name.toLowerCase().includes(foldedQuery))
      .slice(0, 40);
  }, [guests, foldedQuery, compact]);

  const exactMatch = guests.some((guest) => guest.name.toLowerCase() === foldedQuery);
  const similar = useMemo(
    () => (foldedQuery.length >= 2 ? suggestSimilarGuests(guests, query, 3) : []),
    [guests, query, foldedQuery],
  );

  function toggle(id: string) {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
    setHint("");
  }

  async function createFromQuery() {
    const name = query.trim();
    if (!name || creating || disabled) return;
    setCreating(true);
    setHint("");
    try {
      const guest = await onCreateGuest(name);
      if (guest) {
        if (!selectedIds.includes(guest._id)) {
          onChange([...selectedIds, guest._id]);
        }
        setQuery("");
        setHint(`Tagged ${guest.name}`);
      }
    } finally {
      setCreating(false);
    }
  }

  function startRename(guest: NameOnlyGuest) {
    if (!onRenameGuest || disabled) return;
    setRenamingId(guest._id);
    setRenameValue(guest.name);
    setHint("");
  }

  async function commitRename() {
    if (!onRenameGuest || !renamingId) return;
    const name = renameValue.trim();
    if (!name) return;
    setRenaming(true);
    try {
      const guest = await onRenameGuest(renamingId, name);
      if (guest) {
        setHint(`Renamed to ${guest.name} (updates every photo with this tag)`);
        setRenamingId(null);
      }
    } finally {
      setRenaming(false);
    }
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {onRenameGuest ? (
        <div className="rounded-lg border border-ink bg-mist px-3 py-2 text-xs text-ink">
          <p className="font-medium">Fix a typo?</p>
          <p className="mt-0.5 text-pine">
            Tap <span className="font-medium text-ink">Fix spelling</span> under a tagged name.
            It updates every photo with that person.
          </p>
        </div>
      ) : null}

      {selected.length ? (
        <div className="space-y-2">
          <ul className="space-y-2">
            {selected.map((guest) =>
              renamingId === guest._id ? (
                <li
                  key={guest._id}
                  className="rounded-lg border border-ink bg-white px-2.5 py-2"
                >
                  <label className="block text-[10px] font-medium uppercase tracking-wide text-pine">
                    New spelling for this person
                  </label>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <input
                      autoFocus
                      value={renameValue}
                      disabled={renaming}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commitRename();
                        }
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="min-w-0 flex-1 rounded-md border border-[color:var(--line)] px-2 py-1.5 text-sm text-ink outline-none focus-visible:border-ink"
                      aria-label={`Rename ${guest.name}`}
                    />
                    <button
                      type="button"
                      disabled={renaming}
                      onClick={() => void commitRename()}
                      className="shrink-0 rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-foam"
                    >
                      {renaming ? "Saving…" : "Save name"}
                    </button>
                    <button
                      type="button"
                      disabled={renaming}
                      onClick={() => setRenamingId(null)}
                      className="shrink-0 text-xs text-pine"
                    >
                      Cancel
                    </button>
                  </div>
                </li>
              ) : (
                <li
                  key={guest._id}
                  className="rounded-lg border border-[color:var(--line)] bg-white px-2.5 py-2"
                >
                  <p className="text-sm font-medium text-ink">{guest.name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {onRenameGuest ? (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => startRename(guest)}
                        className="rounded-md bg-ink px-2.5 py-1 text-xs font-medium text-foam hover:opacity-90 disabled:opacity-50"
                      >
                        Fix spelling
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggle(guest._id)}
                      className="rounded-md border border-[color:var(--line)] px-2.5 py-1 text-xs text-pine hover:text-ink disabled:opacity-50"
                    >
                      Remove from photo
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-pine">No one tagged yet.</p>
      )}

      <input
        type="search"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          setHint("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!exactMatch && foldedQuery) void createFromQuery();
          }
        }}
        placeholder="Search or type a new name…"
        className="h-9 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 text-sm text-ink outline-none focus-visible:border-ink disabled:opacity-50"
      />

      {foldedQuery && !exactMatch ? (
        <div className="space-y-1.5">
          {similar.length ? (
            <p className="text-xs text-pine">
              Close matches — tap to reuse instead of creating a duplicate:
            </p>
          ) : null}
          {similar.map((guest) => (
            <button
              key={guest._id}
              type="button"
              disabled={disabled}
              onClick={() => {
                toggle(guest._id);
                setQuery("");
              }}
              className="block w-full rounded-lg border border-[color:var(--line)] bg-mist/60 px-3 py-1.5 text-left text-sm text-ink hover:bg-mist"
            >
              {guest.name}
            </button>
          ))}
          <button
            type="button"
            disabled={disabled || creating}
            onClick={() => void createFromQuery()}
            className="w-full rounded-lg border border-dashed border-ink/30 bg-white px-3 py-2 text-sm font-medium text-ink hover:border-ink/50 disabled:opacity-50"
          >
            {creating ? "Adding…" : `Create “${query.trim()}” and tag`}
          </button>
        </div>
      ) : null}

      <ul className={`overflow-y-auto ${compact ? "max-h-36" : "max-h-48"} space-y-0.5`}>
        {filtered.map((guest) => {
          const on = selectedIds.includes(guest._id);
          return (
            <li key={guest._id} className="flex items-center gap-1">
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggle(guest._id)}
                className={`flex min-w-0 flex-1 items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm ${
                  on ? "bg-ink text-foam" : "text-ink hover:bg-mist"
                }`}
              >
                <span className="truncate">{guest.name}</span>
                {on ? <span className="text-xs opacity-80">Tagged</span> : null}
              </button>
              {onRenameGuest ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => startRename(guest)}
                  className="shrink-0 rounded-lg border border-[color:var(--line)] bg-white px-2 py-1 text-xs font-medium text-ink hover:bg-mist disabled:opacity-50"
                  title="Fix spelling on every photo"
                >
                  Fix spelling
                </button>
              ) : null}
            </li>
          );
        })}
        {!filtered.length && foldedQuery && exactMatch === false ? (
          <li className="px-2 py-1 text-xs text-pine">No matching names yet.</li>
        ) : null}
      </ul>

      {hint ? <p className="text-xs text-pine">{hint}</p> : null}
    </div>
  );
}
