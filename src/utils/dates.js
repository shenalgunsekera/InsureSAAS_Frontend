// Local calendar-date helpers.
//
// Date pickers return LOCAL midnight. `toISOString()` converts to UTC first, so in
// Sri Lanka (UTC+05:30) a date picked as 15 Jan becomes "2026-01-14T18:30Z" and
// slicing it stores the day BEFORE. Always format calendar dates with ymdLocal.

const pad = (n) => String(n).padStart(2, '0');

/** Date (or anything Date-like / a Firestore Timestamp) → "YYYY-MM-DD" in local time. */
export function ymdLocal(d) {
  if (d === null || d === undefined || d === '') return '';
  const x = d?.toDate ? d.toDate() : (d instanceof Date ? d : new Date(d));
  if (isNaN(x)) return '';
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

/** "YYYY-MM-DD" → Date at LOCAL midnight (new Date("YYYY-MM-DD") would be UTC). */
export function parseYmdLocal(s) {
  if (!s) return null;
  if (s instanceof Date) return isNaN(s) ? null : s;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
