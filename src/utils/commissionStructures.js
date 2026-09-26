// Declining commission structures (a.k.a. commission scales): a per-product schedule
// where the commission percentage steps DOWN over the policy's life, by year or month —
// e.g. Y1 18%, Y2 7%, Y3 4%. Common for life / pension / health products.
//
// Stored in Firestore at settings/commission_structures as:
//   { products: { [productLabel]: { enabled: true, segments: [ ... ] } } }
// A segment = { unit: 'year' | 'month', length: N, rate: <percent> } and segments apply
// in order from the policy's position in its life — measured from the ORIGINAL (root)
// policy's start date to this policy's start date. Past the last segment, no scale rate
// applies (returns null → the caller keeps the normal commission behaviour).

export const segMonths = (s) => (s && s.unit === 'year' ? 12 : 1) * (Number(s && s.length) || 0);

// Whole months elapsed between two dates (floored to complete months). Accepts ISO
// 'YYYY-MM-DD', Date, or anything new Date() parses. Returns null if either is unusable.
export function monthsBetween(fromStr, toStr) {
  const a = fromStr ? new Date(fromStr) : null;
  const b = toStr ? new Date(toStr) : null;
  if (!a || !b || isNaN(a) || isNaN(b)) return null;
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1; // not a full month yet
  return m < 0 ? 0 : m;
}

// Rate at a given elapsed-months offset. Returns { rate, index, startMonth } or null when
// the offset is past the end of the schedule.
export function rateAtMonths(segments, months) {
  if (!Array.isArray(segments)) return null;
  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    const len = segMonths(segments[i]);
    if (len <= 0) continue;
    if (months < acc + len) return { rate: Number(segments[i].rate) || 0, index: i, startMonth: acc };
    acc += len;
  }
  return null;
}

// Rate for a policy given the ORIGINAL policy start date and THIS policy's start date.
// Returns { rate, index, startMonth, months } or null (no scale / past the end).
export function structureRate(segments, originalStart, thisStart) {
  // No / invalid dates → treat the policy as being at the START of the schedule
  // (Year 1), so a fresh policy uses the first year's rate instead of nothing.
  const m = monthsBetween(originalStart, thisStart);
  const months = m === null ? 0 : m;
  const hit = rateAtMonths(segments, months);
  return hit ? { ...hit, months } : null;
}

// Total length of a schedule in months (0 when empty).
export function totalMonths(segments) {
  return Array.isArray(segments) ? segments.reduce((a, s) => a + segMonths(s), 0) : 0;
}

// Expand a segment schedule into a readable per-step ladder for previews:
// [{ label: 'Year 1', rate: 18 }, { label: 'Year 2', rate: 7 }, ...]. Multi-length
// segments are shown as a single ranged row (e.g. 'Year 3–10').
export function expandLadder(segments) {
  if (!Array.isArray(segments)) return [];
  const out = [];
  let month = 0;
  for (const s of segments) {
    const len = Number(s.length) || 0;
    if (len <= 0) continue;
    const rate = Number(s.rate) || 0;
    if (s.unit === 'year') {
      const y1 = Math.floor(month / 12) + 1;
      const yn = y1 + len - 1;
      out.push({ label: len > 1 ? `Year ${y1}–${yn}` : `Year ${y1}`, rate });
    } else {
      const m1 = month + 1;
      const mn = month + len;
      out.push({ label: len > 1 ? `Month ${m1}–${mn}` : `Month ${m1}`, rate });
    }
    month += segMonths(s);
  }
  return out;
}
