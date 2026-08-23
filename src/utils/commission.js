// Live commission — fills the standard commission (premiums × main-class rate)
// when the stored value is empty, matching the underwriting form's auto-calc.
// Used so imported records (which don't store commission) still show it wherever
// commission is displayed, without needing a re-import.
//
// Basic commission = basic premium × class rate; SRCC/TC = those premiums × 5%
// (Motor) or 7.5% (everything else). A stored value always wins over the
// computed one, so anything entered by hand is preserved.

const BASIC_RATES = { Motor: 20, Fire: 20, Marine: 15, Health: 20, Miscellaneous: 20, Individual: 20, Group: 20, Other: 20 };
const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
const r2 = (n) => Math.round(n * 100) / 100;
const has = (v) => v !== undefined && v !== null && v !== '';

export function liveCommission(client) {
  const c = client || {};
  const mc = c.main_class || '';
  const basicRate = BASIC_RATES[mc] != null ? BASIC_RATES[mc] : 20;
  const stRate = mc === 'Motor' ? 5 : 7.5;

  const commission_pct   = has(c.commission_pct)   ? c.commission_pct   : String(basicRate);
  const commission_basic = has(c.commission_basic) ? c.commission_basic : (num(c.basic_premium) ? String(r2(num(c.basic_premium) * basicRate / 100)) : '');
  const commission_srcc  = has(c.commission_srcc)  ? c.commission_srcc  : (num(c.srcc_premium)  ? String(r2(num(c.srcc_premium)  * stRate   / 100)) : '');
  const commission_tc    = has(c.commission_tc)    ? c.commission_tc    : (num(c.tc_premium)    ? String(r2(num(c.tc_premium)    * stRate   / 100)) : '');
  const total = num(commission_basic) + num(commission_srcc) + num(commission_tc) + num(c.commission_special_amount);
  const commission_total = has(c.commission_total) ? c.commission_total : (total ? String(r2(total)) : '');

  return { commission_pct, commission_basic, commission_srcc, commission_tc, commission_total };
}
