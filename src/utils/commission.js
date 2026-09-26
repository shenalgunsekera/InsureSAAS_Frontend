// Live commission — fills the standard commission (premiums × rate) when the
// stored value is empty, matching the underwriting form's auto-calc. Used so
// imported records (which don't store commission) still show it wherever
// commission is displayed, without needing a re-import.
//
// Rates come from the admin rate table when a `schedules` map is passed (the
// products map from settings/commission_rates), resolved by product + policy
// start date; otherwise the built-in per-class defaults apply. A stored value
// always wins over the computed one, so anything entered by hand is preserved.
//
// Total = Basic + SRCC + TC, plus the Special Commission on a Special record
// (new single field, or the legacy commission_special_amount for old records).

import { rateFor, defaultRate } from './commissionRates';

const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
const r2  = (n) => Math.round(n * 100) / 100;
const has = (v) => v !== undefined && v !== null && v !== '';

export function liveCommission(client, schedules) {
  const c = client || {};
  const mc = c.main_class || '';
  const rate = schedules ? rateFor(schedules, c.product, mc, c.policy_period_from) : defaultRate(mc);

  // Standard uses the admin/default rates; Special uses its own entered rates
  // (Special Basic/SRCC/TC %). A stored amount always wins over the computed one.
  const isSpecial = c.commission_type === 'Special';
  const bRate = isSpecial ? num(c.commission_special_pct)      : rate.basic;
  const sRate = isSpecial ? num(c.commission_special_srcc_pct) : rate.srcc;
  const tRate = isSpecial ? num(c.commission_special_tc_pct)   : rate.tc;

  const commission_pct   = isSpecial ? '' : (has(c.commission_pct) ? c.commission_pct : String(rate.basic));
  const commission_basic = has(c.commission_basic) ? c.commission_basic : (num(c.basic_premium) && bRate ? String(r2(num(c.basic_premium) * bRate / 100)) : '');
  const commission_srcc  = has(c.commission_srcc)  ? c.commission_srcc  : (num(c.srcc_premium)  && sRate ? String(r2(num(c.srcc_premium)  * sRate / 100)) : '');
  const commission_tc    = has(c.commission_tc)    ? c.commission_tc    : (num(c.tc_premium)    && tRate ? String(r2(num(c.tc_premium)    * tRate / 100)) : '');

  // Legacy: very old Special records may hold a single special amount instead of a
  // Basic/SRCC/TC breakdown — only count it when there is no breakdown (no double-count).
  const legacySpecial = (isSpecial && !num(commission_basic) && !num(commission_srcc) && !num(commission_tc))
    ? (num(c.commission_special) || num(c.commission_special_amount)) : 0;

  const total = num(commission_basic) + num(commission_srcc) + num(commission_tc) + legacySpecial;
  const commission_total = has(c.commission_total) ? c.commission_total : (total ? String(r2(total)) : '');

  return { commission_pct, commission_basic, commission_srcc, commission_tc, commission_special: legacySpecial ? String(legacySpecial) : '', commission_total };
}
