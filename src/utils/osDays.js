// Live "Outstanding Days".
//
// Counts up by 1 every day from the policy commencement date until payment is
// made, then shows 0 once the payment status is "Paid". Computed on read so it
// never goes stale — the `os_days` stored on the client is only a snapshot from
// the last time the record was saved, which froze old policies at an old number.
// Always prefer this over the stored value when displaying, exporting, or
// reporting.

// Parse the assorted date shapes the app stores: Firestore Timestamp, JS Date,
// ISO string ("2026-06-01"), or day-first ("01/06/2026", "01-06-2026").
function parseDate(v) {
  if (!v) return null;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate();
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v).trim();
  if (!s) return null;
  const native = new Date(s);
  if (!isNaN(native)) return native;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // DD/MM/YYYY or DD-MM-YYYY
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return isNaN(d) ? null : d;
  }
  return null;
}

// "Active" while the policy expiry (period-to) is today or later, "Expired" once
// it's in the past, "" when there's no usable expiry date. Computed on read so
// reports always reflect the current date.
export function policyStatus(client) {
  if (!client) return '';
  const to = parseDate(client.policy_period_to);
  if (!to) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  to.setHours(0, 0, 0, 0);
  return to >= today ? 'Active' : 'Expired';
}

export function liveOsDays(client) {
  if (!client) return '';

  // Any spelling/spacing of "paid" clears the outstanding days.
  if (String(client.payment_status || '').trim().toLowerCase() === 'paid') return '0';

  const start = parseDate(client.policy_period_from);
  if (!start) return ''; // no usable start date — blank is honest, a stale number is not

  // Once a payment date is recorded the clock stops there; otherwise it runs to today.
  const end = parseDate(client.payment_date) || new Date();

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diff = Math.round((end - start) / 86400000);
  return diff > 0 ? String(diff) : '0';
}
