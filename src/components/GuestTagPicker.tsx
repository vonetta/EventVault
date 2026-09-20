"use client";

import { useMemo, useState } from "react";
import { suggestSimilarGuests, type NameOnlyGuest } from "@/lib/guest-name-match";

type GuestTagPickerProps = {
  guests: NameOnlyGuest[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onCreateGuest: (name: string) => Promise<NameOnlyGuest | null>;
  disabled?: boolean;
  /** Compact mode for embedding under a photo thumbnail. */
  compact?: boolean;
};

export function GuestTagPicker({
  guests,
  selectedIds,
  onChange,
  onCreateGuest,
  disabled,
  compact,
}: GuestTagPickerProps) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
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

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {selected.length ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((guest) => (
            <button
              key={guest._id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(guest._id)}
              className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-xs text-foam disabled:opacity-50"
              title="Remove tag"
            >
              {guest.name}
              <span aria-hidden>×</span>
            </button>
          ))}
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
            <li key={guest._id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggle(guest._id)}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm ${
                  on ? "bg-ink text-foam" : "text-ink hover:bg-mist"
                }`}
              >
                <span>{guest.name}</span>
                {on ? <span className="text-xs opacity-80">Tagged</span> : null}
              </button>
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
