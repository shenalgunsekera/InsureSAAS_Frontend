// Commission rate resolution.
//
// Standard commission rates are configured per product with date ranges in the
// admin panel (Firestore: settings/commission_rates → { products: { <label>: [rows] } }).
// Each row is { from, to, basic, srcc, tc } where dates are ISO YYYY-MM-DD and an
// empty `to` means "ongoing". A policy uses the row whose [from, to] range contains
// its START date (policy_period_from). If nothing is configured, or no row matches,
// the built-in defaults below apply — so commission always resolves, even before
// anything is set up in the admin panel.

const DEFAULT_BASIC = { Motor: 20, Fire: 20, Marine: 15, Health: 20, Miscellaneous: 20, Individual: 20, Group: 20, Other: 20 };
const defaultST = (mainClass) => (mainClass === 'Motor' ? 5 : 7.5);

const n = (v) => { const x = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(x) ? null : x; };
const toTime = (v) => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.getTime(); };

export const RATE_FIELDS = ['basic', 'srcc', 'tc'];

// The fallback rate for a main class when no schedule applies.
export function defaultRate(mainClass) {
  return {
    basic: DEFAULT_BASIC[mainClass] != null ? DEFAULT_BASIC[mainClass] : 20,
    srcc: defaultST(mainClass),
    tc: defaultST(mainClass),
  };
}

// Resolve { basic, srcc, tc } percentages for a policy.
//   schedules – the products map from settings/commission_rates (or {})
//   product   – the product label
//   mainClass – used only for the fallback default
//   startDate – the policy start date (policy_period_from), any parseable form
export function rateFor(schedules, product, mainClass, startDate) {
  const def = defaultRate(mainClass);
  const rows = (schedules && schedules[product]) || [];
  const t = toTime(startDate);
  if (t == null || !rows.length) return def;

  // Rows whose range contains the start date; among matches the latest `from` wins.
  const matches = rows
    .filter(r => {
      const f = toTime(r.from);
      const to = toTime(r.to);
      if (f != null && t < f) return false;
      if (to != null && t > to) return false;
      return true;
    })
    .sort((a, b) => (toTime(b.from) || 0) - (toTime(a.from) || 0));

  const m = matches[0];
  if (!m) return def;
  return {
    basic: n(m.basic) != null ? n(m.basic) : def.basic,
    srcc: n(m.srcc) != null ? n(m.srcc) : def.srcc,
    tc: n(m.tc) != null ? n(m.tc) : def.tc,
  };
}
