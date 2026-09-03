/** Build Day 1…N labels for each calendar day between startsOn and endsOn (inclusive). */

const MAX_DAYS = 14;

export type ScheduleDay = {
  label: string;
  date: string; // YYYY-MM-DD
};

function parseYmd(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

function formatYmd(date: Date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatScheduleDate(ymd: string) {
  const date = parseYmd(ymd);
  if (!date) return ymd;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function daysFromDateRange(
  startsOn: string,
  endsOn: string,
): { ok: true; days: ScheduleDay[] } | { ok: false; error: string } {
  const start = parseYmd(startsOn);
  const end = parseYmd(endsOn);

  if (!start || !end) {
    return { ok: false, error: "Enter both a start and end date." };
  }
  if (end.getTime() < start.getTime()) {
    return { ok: false, error: "End date must be on or after the start date." };
  }

  const days: ScheduleDay[] = [];
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    if (days.length >= MAX_DAYS) {
      return { ok: false, error: `Maximum ${MAX_DAYS} days per event.` };
    }
    days.push({
      label: `Day ${days.length + 1}`,
      date: formatYmd(cursor),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (!days.length) {
    return { ok: false, error: "Add at least one day." };
  }

  return { ok: true, days };
}

export function scheduleLabelsFromRange(startsOn: string, endsOn: string) {
  const result = daysFromDateRange(startsOn, endsOn);
  return result.ok ? result.days.map((day) => day.label) : null;
}
