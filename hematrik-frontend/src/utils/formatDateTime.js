export function formatDateTimeId(value) {
  if (value === null || value === undefined || value === "") return "-";

  // Fast path for Date
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    // If backend already sends a human-readable string we can't parse reliably,
    // fall back to original value.
    return String(value);
  }

  // Indonesian locale: show only date + time (no seconds)
  // Example output: "01 Mei 2026 09.41"
  const formatter = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // Ensure no comma between date and time.
  return formatter.format(date).replace(/,\s*/g, " ");
}

export function formatDateId(value) {
  if (value === null || value === undefined || value === "") return "-";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  // Example: "11 Mei" or "11 Mei 2026" if needed later.
  const formatter = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
  });

  return formatter.format(date);
}

export function toLocalDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
