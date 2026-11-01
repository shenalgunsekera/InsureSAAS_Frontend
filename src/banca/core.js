// Bancassurance core — pure calculations (no Firebase), shared by every screen.
// Rules implemented from the BRD/SRS:
//   GWP month = inception month (original/renewal) or effective-date month (endorsement etc.); upload date never used (BRU-01)
//   A renewal is a new policy period even with the same insurer policy number (BRU-02)
//   Net premium = signed sum of all non-reversed transactions (BRU-03)
//   Outstanding = net premium − allocated receipts; ages from COMMENCEMENT date only (BRU-04, Q18)
//   Expected commission per component from the versioned rate schedule unless the file supplies it (BRU-05)
//   Bank allocation = Bank % × net BASIC premium; payable only when the whole policy commission is received (BRU-06)
//   InsureSAAS share = commission received − Bank allocation (decision D6, configurable later)
//   Money held to 2 decimals (BRU-11)

export const BANKS = {
  bank: { id: 'bank', name: 'Bank', title: 'InsureSAAS Banca', heading: 'InsureSAAS Banca', storage: 'insuresaas/banca/bank' },
};

export const DEFAULT_CONFIG = {
  pmf_pct: 12,                     // % of net basic premium (example — subject to the signed agreement)
  tolerance: 1,                    // LKR rounding tolerance for commission receipt variances
  rates: [                         // insurer commission schedule (versioned by effective date)
    { id: 'default-motor', insurer: '*', class: 'Motor', basic: 17, srcc: 5, tc: 5, from: '2000-01-01' },
    { id: 'default-all', insurer: '*', class: '*', basic: 17, srcc: 5, tc: 5, from: '2000-01-01' },
  ],
  payment_method_cleared: false,   // legal hold: live Bank payments blocked until set
  approval_limit_manager: 1000000, // managers approve up to this amount; above needs admin
  retention_years: 7,
  archive_after_years: 3,
  strict_masters: false,           // reject unknown branch / insurer / class values on upload
  branches: [], insurers: [], classes: [],
  holidays: [],                    // YYYY-MM-DD public holidays (approval turnaround)
  delegations: [],                 // { from_uid, from_name, to_uid, to_name, start, end, limit }
  alert_open_exceptions: 10,       // warning threshold
  alert_overdue_days: 2,           // approvals overdue after N working days
};

/* ── numbers ── */
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim();
  const neg = /^\(.*\)$/.test(s);                 // accounting negatives (1,234.00)
  s = s.replace(/[()\s,]/g, '').replace(/^(LKR|Rs\.?)/i, '');
  const x = parseFloat(s);
  return isNaN(x) ? 0 : (neg ? -x : x);
}
export const isNumeric = (v) => v !== '' && v !== null && v !== undefined && !isNaN(parseFloat(String(v).replace(/[()\s,]/g, '').replace(/^(LKR|Rs\.?)/i, '')));
export const lkr = (n) => (Number(n) || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ── dates (calendar dates as "YYYY-MM-DD", local) ── */
const pad = (n) => String(n).padStart(2, '0');
export const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayYmd = () => ymdOf(new Date());
export function validYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
}
// Accepts Excel Date cells (UTC midnight), Excel serials, YYYY-MM-DD, DD/MM/YYYY (Sri Lankan
// default when ambiguous), D-Mon-YYYY. Returns "" when it isn't a real calendar date.
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function toYmd(v) {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) {
    if (isNaN(v)) return '';
    // exceljs gives date cells as UTC midnight — read the UTC calendar day
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  }
  if (typeof v === 'number') {
    if (v < 1 || v > 80000) return '';
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s))) {
    const a = +m[1], b = +m[2]; y = +m[3]; if (y < 100) y += 2000;
    if (a > 12) { d = a; mo = b; } else if (b > 12) { mo = a; d = b; } else { d = a; mo = b; } // DD/MM default
  } else if ((m = /^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s,]*(\d{2,4})/.exec(s))) {
    d = +m[1]; mo = MONTHS[m[2].toLowerCase()]; y = +m[3]; if (y < 100) y += 2000;
  } else if (/^\d+(\.\d+)?$/.test(s)) return toYmd(Number(s));
  else return '';
  const out = `${y}-${pad(mo)}-${pad(d)}`;
  return validYmd(out) ? out : '';
}
export const monthOf = (ymd) => (ymd ? String(ymd).slice(0, 7) : '');
export function dayDiff(fromYmd, toYmdStr) {
  if (!fromYmd || !toYmdStr) return null;
  const [a1, a2, a3] = fromYmd.split('-').map(Number), [b1, b2, b3] = toYmdStr.split('-').map(Number);
  return Math.round((Date.UTC(b1, b2 - 1, b3) - Date.UTC(a1, a2 - 1, a3)) / 86400000);
}
export const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return ymdOf(new Date(y, m - 1, d + n)); };
export const monthLabel = (mk) => { if (!mk) return ''; const [y, m] = mk.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }); };
export const monthEnd = (mk) => { const [y, m] = mk.split('-').map(Number); return ymdOf(new Date(y, m, 0)); };
export function workingDaysBetween(fromYmd, toYmdStr, holidays = []) {
  if (!fromYmd || !toYmdStr || toYmdStr <= fromYmd) return 0;
  const hol = new Set(holidays); let n = 0; let cur = fromYmd;
  for (let i = 0; i < 400 && cur < toYmdStr; i++) {
    cur = addDays(cur, 1);
    const [y, m, d] = cur.split('-').map(Number); const wd = new Date(y, m - 1, d).getDay();
    if (wd !== 0 && wd !== 6 && !hol.has(cur)) n++;
  }
  return n;
}

/* ── keys / hashing ── */
export const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const normPolicy = (s) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '');
// FNV-1a 64-bit (as two 32-bit halves) → 16 hex chars. Deterministic posting keys / ids.
export function hashKey(str) {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0; h2 ^= h2 >>> 13;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
export const periodId = (insurer, policyNo, inception) => 'PP' + hashKey(`${norm(insurer)}|${normPolicy(policyNo)}|${inception}`).toUpperCase().slice(0, 12);

/* ── rates ── */
export function rateFor(config, insurer, cls, dateYmd) {
  const rates = (config?.rates || []).filter(r => !r.from || !dateYmd || r.from <= dateYmd);
  const score = (r) => (r.insurer !== '*' && norm(r.insurer) === norm(insurer) ? 2 : r.insurer === '*' ? 0 : -9)
    + (r.class !== '*' && norm(r.class) === norm(cls) ? 1 : r.class === '*' ? 0 : -9);
  let best = null;
  for (const r of rates) {
    const s = score(r); if (s < 0) continue;
    if (!best || s > best.s || (s === best.s && String(r.from || '') > String(best.r.from || ''))) best = { r, s };
  }
  return best ? { basic: num(best.r.basic), srcc: num(best.r.srcc), tc: num(best.r.tc), id: best.r.id } : { basic: 0, srcc: 0, tc: 0, id: null };
}
export function expectedCommission(config, insurer, cls, dateYmd, basic, srcc, tc) {
  const r = rateFor(config, insurer, cls, dateYmd);
  const b = round2(basic * r.basic / 100), s = round2(srcc * r.srcc / 100), t = round2(tc * r.tc / 100);
  return { comm_basic: b, comm_srcc: s, comm_tc: t, comm_total: round2(b + s + t), rate_id: r.id || null };
}

/* ── buckets ── */
export const AGE_BUCKETS = ['0-30', '31-60', '61-90', '90+'];
export const ageBucket = (days) => (days === null ? '' : days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+');
export const RENEWAL_WINDOWS = [90, 60, 30, 15, 7];
export const EXPIRY_BUCKETS = ['0-7', '8-15', '16-30', '31-60', '61-90', '90+'];
export const expiryBucket = (d) => (d <= 7 ? '0-7' : d <= 15 ? '8-15' : d <= 30 ? '16-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+');

export const TXN_TYPES = ['New', 'Renewal', 'Endorsement', 'Cancellation', 'Refund'];
export const ORIGINAL_TYPES = new Set(['New', 'Renewal']);

/* ── the model: every register / tracker / report reads from this ── */
export function buildModel(raw, config = DEFAULT_CONFIG, today = todayYmd()) {
  const tol = num(config.tolerance);
  const pct = num(config.pmf_pct);
  const live = (x) => !x.reversed;
  const policies = (raw.policies || []).map(p => ({ ...p }));
  const byId = new Map(policies.map(p => [p.id, p]));
  for (const p of policies) {
    Object.assign(p, { txns: [], receipts: [], comms: [], claims: [], net_basic: 0, net_srcc: 0, net_tc: 0, net_total: 0,
      gross_total: 0, endo_total: 0, exp_basic: 0, exp_srcc: 0, exp_tc: 0, paid: 0, comm_received: 0, cancelled: false });
  }
  const txns = (raw.txns || []).filter(live);
  for (const t of txns) {
    const p = byId.get(t.policy_id); if (!p) continue;
    p.txns.push(t);
    p.net_basic += num(t.basic); p.net_srcc += num(t.srcc); p.net_tc += num(t.tc); p.net_total += num(t.total);
    if (ORIGINAL_TYPES.has(t.type)) p.gross_total += num(t.total); else p.endo_total += num(t.total);
    p.exp_basic += num(t.comm_basic); p.exp_srcc += num(t.comm_srcc); p.exp_tc += num(t.comm_tc);
    if (t.type === 'Cancellation') p.cancelled = true;
  }
  // Receipts: single policy_id, or split `allocations` [{policy_id, amount}]
  const receipts = (raw.receipts || []).filter(live).map(r => ({ ...r }));
  for (const r of receipts) {
    const allocs = Array.isArray(r.allocations) && r.allocations.length ? r.allocations : (r.policy_id ? [{ policy_id: r.policy_id, amount: r.amount }] : []);
    for (const a of allocs) { const p = byId.get(a.policy_id); if (p) { p.paid += num(a.amount); p.receipts.push({ ...r, alloc_amount: num(a.amount) }); } }
    r.unallocated = round2(num(r.amount) - allocs.reduce((s, a) => s + num(a.amount), 0));
  }
  const comms = (raw.commissions || []).filter(live).map(c => ({ ...c }));
  for (const c of comms) {
    const allocs = Array.isArray(c.allocations) && c.allocations.length ? c.allocations : (c.policy_id ? [{ policy_id: c.policy_id, amount: c.amount }] : []);
    for (const a of allocs) { const p = byId.get(a.policy_id); if (p) { p.comm_received += num(a.amount); p.comms.push({ ...c, amount: num(a.amount) }); } }
    c.unallocated = round2(num(c.amount) - allocs.reduce((s2, a) => s2 + num(a.amount), 0));
  }
  const claims = (raw.claims || []).filter(live).map(c => {
    const pays = (c.payments || []).filter(x => !x.reversed);
    const paid = round2(pays.reduce((s, x) => s + num(x.amount), 0));
    const out = { ...c, payments: pays, paid, outstanding_claim: round2(num(c.estimate) - paid) };
    const p = byId.get(c.policy_id); if (p) p.claims.push(out);
    return out;
  });

  // Statements → Bank per policy (latest live version wins; payments recorded only via approved payments)
  const statements = (raw.statements || []).filter(s => s.state !== 'Superseded');
  const paidStatement = new Set((raw.pmf_payments || []).filter(x => x.status === 'Approved').map(x => x.statement_id));
  const pmfPaid = new Map(), pmfOnStmt = new Map();
  for (const s of statements) {
    for (const l of s.lines || []) {
      if (paidStatement.has(s.id)) pmfPaid.set(l.policy_id, round2((pmfPaid.get(l.policy_id) || 0) + num(l.amount)));
      else if (s.state !== 'Rejected') pmfOnStmt.set(l.policy_id, { state: s.state, statement_id: s.id, month: s.month, version: s.version });
    }
  }

  // Renewal chains: same insurer + policy number (or an explicit previous number), ordered by inception
  const groups = new Map();
  const live_policies = policies.filter(p => p.txns.length);
  for (const p of live_policies) { const k = `${norm(p.insurer)}|${normPolicy(p.policy_no)}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  for (const g of groups.values()) g.sort((a, b) => String(a.inception).localeCompare(String(b.inception)));
  for (const p of live_policies) {
    let prev = null;
    if (p.prev_policy_no) {
      const g = groups.get(`${norm(p.insurer)}|${normPolicy(p.prev_policy_no)}`) || [];
      prev = [...g].reverse().find(x => x.inception < p.inception && x.id !== p.id) || null;
    }
    if (!prev && p.txns.some(t => t.type === 'Renewal')) {
      const g = groups.get(`${norm(p.insurer)}|${normPolicy(p.policy_no)}`) || [];
      prev = [...g].reverse().find(x => x.inception < p.inception) || null;
    }
    if (!prev) { // same policy number, a later period → treat as its renewal
      const g = groups.get(`${norm(p.insurer)}|${normPolicy(p.policy_no)}`) || [];
      const i = g.indexOf(p); if (i > 0) prev = g[i - 1];
    }
    if (prev) { p.renewal_of = prev.id; prev.renewed_by = p.id; }
  }

  for (const p of policies) {
    p.net_basic = round2(p.net_basic); p.net_srcc = round2(p.net_srcc); p.net_tc = round2(p.net_tc); p.net_total = round2(p.net_total);
    p.gross_total = round2(p.gross_total); p.endo_total = round2(p.endo_total);
    p.exp_basic = round2(p.exp_basic); p.exp_srcc = round2(p.exp_srcc); p.exp_tc = round2(p.exp_tc);
    p.exp_comm = round2(p.exp_basic + p.exp_srcc + p.exp_tc);
    p.paid = round2(p.paid); p.comm_received = round2(p.comm_received);
    p.outstanding = round2(p.net_total - p.paid);
    p.pay_status = p.net_total <= 0 && p.paid === 0 ? 'Nil' : p.outstanding <= 0.005 ? (p.outstanding < -0.005 ? 'Overpaid' : 'Paid') : p.paid > 0.005 ? 'Part paid' : 'Unpaid';
    p.comm_balance = round2(p.exp_comm - p.comm_received);
    p.comm_status = p.exp_comm <= 0.005 && p.comm_received <= 0.005 ? 'Not due'
      : p.comm_received >= p.exp_comm - tol ? (p.comm_received > p.exp_comm + tol ? 'Over received' : 'Fully received')
      : p.comm_received > 0.005 ? 'Partly received' : 'Outstanding';
    p.pmf_alloc = round2(Math.max(0, p.net_basic) * pct / 100);
    p.pmf_eligible = p.exp_comm > 0.005 && p.comm_received >= p.exp_comm - tol;
    // date the policy became eligible: when cumulative receipts first reached expected − tolerance
    if (p.pmf_eligible) {
      let cum = 0; const sorted = [...p.comms].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      for (const c of sorted) { cum += num(c.amount); if (cum >= p.exp_comm - tol) { p.eligible_date = c.date; break; } }
    } else p.eligible_date = '';
    p.pmf_paid = pmfPaid.get(p.id) || 0;
    const onS = pmfOnStmt.get(p.id);
    p.pmf_statement = onS || null;
    p.pmf_due = p.pmf_eligible ? round2(p.pmf_alloc - p.pmf_paid) : round2(-p.pmf_paid); // negative = clawback
    p.pmf_status = !p.pmf_eligible ? (p.pmf_paid > 0.005 ? 'Clawback' : 'Not eligible')
      : p.pmf_due < -0.005 ? 'Clawback' : p.pmf_due <= 0.005 ? 'Paid'
      : onS ? `On statement (${onS.state})` : 'Payable';
    p.broker_share = round2(p.comm_received - p.pmf_alloc);
    p.gwp_month = monthOf(p.inception);
    p.age_days = p.inception ? Math.max(0, dayDiff(p.inception, today)) : null;
    p.age_bucket = ageBucket(p.age_days);
    p.days_left = p.expiry ? dayDiff(today, p.expiry) : null;
    p.renewal_status = p.renewed_by ? 'Renewed' : p.cancelled ? 'Cancelled' : (p.days_left !== null && p.days_left < 0 ? 'Expired' : 'Pending');
    p.claims_count = p.claims.length;
    p.claims_paid = round2(p.claims.reduce((s, c) => s + c.paid, 0));
    p.claims_estimate = round2(p.claims.reduce((s, c) => s + num(c.estimate), 0));
  }
  const active = policies.filter(p => p.txns.length); // periods with at least one live transaction
  // flat txn view with policy context
  const txnRows = txns.map(t => { const p = byId.get(t.policy_id) || {}; return { ...t, policy_no: p.policy_no, customer: p.customer, address: p.address, telephone: p.telephone, insurer: p.insurer, branch: p.branch, class: p.class, inception: p.inception, expiry: p.expiry,
    facility_no: p.facility_no, vehicle_no: p.vehicle_no, pay_type: p.pay_type, sum_insured: p.sum_insured, custom: { ...(p.custom || {}), ...(t.custom || {}) } }; });
  return { policies: active, byId, txns: txnRows, receipts, commissions: comms, claims, statements, today, config };
}

/* ── GWP aggregation by month (net, NB / renewal / endorsement split) ── */
export function gwpByMonth(txns) {
  const m = new Map();
  for (const t of txns) {
    const k = t.gwp_month || monthOf(t.effective_date); if (!k) continue;
    const r = m.get(k) || { month: k, new: 0, renewal: 0, endorsement: 0, net: 0, count: 0 };
    const v = num(t.total);
    if (t.type === 'New') r.new += v; else if (t.type === 'Renewal') r.renewal += v; else r.endorsement += v;
    r.net += v; r.count++; m.set(k, r);
  }
  return [...m.values()].map(r => ({ ...r, new: round2(r.new), renewal: round2(r.renewal), endorsement: round2(r.endorsement), net: round2(r.net) })).sort((a, b) => a.month.localeCompare(b.month));
}

/* ── renewal retention for expiring periods within [from, to] (FR-REN-05) ── */
export function retention(policies, from, to) {
  const expiring = policies.filter(p => p.expiry && p.expiry >= from && p.expiry <= to && !p.cancelled);
  const renewed = expiring.filter(p => p.renewed_by);
  const prem = (arr) => round2(arr.reduce((s, p) => s + p.net_total, 0));
  return {
    expiring: expiring.length, renewed: renewed.length, lost: expiring.filter(p => !p.renewed_by && p.days_left < 0).length,
    countPct: expiring.length ? round2(renewed.length / expiring.length * 100) : 0,
    expiringPremium: prem(expiring), renewedPremium: prem(renewed),
    premiumPct: prem(expiring) ? round2(prem(renewed) / prem(expiring) * 100) : 0,
  };
}

/* ── claims metrics (SRS 4.9, formulas DD) ── */
export function claimMetrics(claims, policies) {
  const settledStatuses = new Set(['settled', 'closed', 'paid']);
  const settled = claims.filter(c => settledStatuses.has(norm(c.status)));
  const durations = settled.map(c => {
    const last = [...(c.payments || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    return last && c.intimation_date ? dayDiff(c.intimation_date, last.date) : null;
  }).filter(x => x !== null && x >= 0);
  const paid = round2(claims.reduce((s, c) => s + c.paid, 0));
  const out = round2(claims.reduce((s, c) => s + Math.max(0, c.outstanding_claim), 0));
  const ids = new Set(claims.map(c => c.policy_id));
  const gwp = round2(policies.filter(p => ids.has(p.id)).reduce((s, p) => s + p.net_total, 0));
  return {
    count: claims.length, settled: settled.length,
    settlementRate: claims.length ? round2(settled.length / claims.length * 100) : 0,
    avgSettlementDays: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    estimate: round2(claims.reduce((s, c) => s + num(c.estimate), 0)), paid, outstanding: out,
    lossRatio: gwp ? round2((paid + out) / gwp * 100) : null,
  };
}

/* ── 4-stage reconciliation (FR-REC-01) ── */
export function reconciliation(model, unmatched = []) {
  const P = model.policies;
  const s = (f) => round2(P.reduce((a, p) => a + f(p), 0));
  return [
    { stage: 'GWP → premium receipts', expected: s(p => p.net_total), actual: s(p => p.paid), unmatched: round2(unmatched.filter(e => e.kind === 'receipt').reduce((a, e) => a + num(e.amount), 0)) },
    { stage: 'Expected → received commission', expected: s(p => p.exp_comm), actual: s(p => p.comm_received), unmatched: round2(unmatched.filter(e => e.kind === 'commission').reduce((a, e) => a + num(e.amount), 0)) },
    { stage: 'Bank payable → Bank paid', expected: s(p => (p.pmf_eligible ? p.pmf_alloc : 0)), actual: s(p => p.pmf_paid), unmatched: 0 },
    { stage: 'Outstanding (policy level)', expected: s(p => Math.max(0, p.outstanding)), actual: 0, unmatched: 0 },
  ].map(r => ({ ...r, variance: round2(r.expected - r.actual) }));
}

/* ── training gates (AT-15) ── */
export const GATED_FUNCTIONS = { batch_reversal: 'Approve batch reversals', allocation: 'Approve allocations', statement: 'Approve Bank statements', pmf_payment: 'Approve Bank payments' };
// Training gate: returns '' or the reason a user may not use a gated function (AT-15)
export function trainingBlock(platform, uid, fn) {
  const today = todayYmd();
  for (const t of platform.filter(x => x.type === 'training' && x.mandatory && (x.gates || []).includes(fn))) {
    const ack = (t.acks || {})[uid];
    const passed = ack && (!num(t.pass_mark) || num(ack.score) >= num(t.pass_mark));
    const exc = (t.exceptions || []).some(e => e.uid === uid && e.until >= today);
    if (!passed && !exc) return `Mandatory training "${t.title}" must be completed${num(t.pass_mark) ? ` (pass mark ${t.pass_mark}%)` : ''} before you can ${GATED_FUNCTIONS[fn].toLowerCase()}`;
  }
  return '';
}
