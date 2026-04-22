/**
 * Parse a MySQL/TiDB UTC timestamp string into a proper Date object.
 *
 * MySQL returns TIMESTAMP columns as bare datetime strings without timezone
 * information (e.g. '2026-04-22 11:08:00'). JavaScript's `new Date()` treats
 * such strings as **local time**, which introduces a timezone offset error.
 * For a user in GMT+2 (South Africa) this manifests as a +120 minute error
 * in elapsed-time calculations.
 *
 * This helper normalises the string to ISO 8601 with a 'Z' suffix so the
 * browser correctly interprets it as UTC.
 *
 * Safe to call with ISO 8601 strings, Unix timestamps, Date objects, or null.
 */
export function parseUtcTimestamp(ts: string | number | Date | null | undefined): Date | null {
  if (ts == null) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === 'number') return new Date(ts);

  const s = String(ts).trim();
  if (!s) return null;

  // Already has timezone info (ISO 8601 with Z or +/-offset) — parse directly
  if (/[Zz]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s);
  }

  // Bare MySQL datetime (e.g. '2026-04-22 11:08:00') — append Z to force UTC
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}
