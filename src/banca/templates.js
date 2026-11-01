// Bancassurance bulk import — templates, parsing, validation and posting plans.
// Pure functions (no Firebase): validate() returns exactly what would be written.
import {
  num, isNumeric, round2, toYmd, monthOf, norm, normPolicy, hashKey, periodId, expectedCommission,
  TXN_TYPES, ORIGINAL_TYPES, todayYmd,
} from './core';

export const TEMPLATE_VERSION = 'v1';

const C = (key, header, opts = {}) => ({ key, header, ...opts });
const GWP_COLS = [
  C('policy_no', 'Policy No', { required: true, aliases: ['policy number', 'policy no.', 'policyno'] }),
  C('prev_policy_no', 'Previous Policy No', { aliases: ['previous policy number', 'prev policy no'] }),
  C('type', 'Transaction Type', { required: true, type: 'enum', options: TXN_TYPES, aliases: ['type', 'txn type'] }),
  C('customer', 'Customer Name', { aliases: ['name', 'client name', 'insured name', 'customer'] }),
  C('address', 'Address'),
  C('telephone', 'Telephone', { aliases: ['phone', 'mobile', 'contact no', 'telephone no'] }),
  C('insurer', 'Insurance Company', { required: true, aliases: ['insurer', 'insurance company name', 'company'] }),
  C('branch', 'Branch', { aliases: ['pmf branch', 'branch name', 'facility branch'] }),
  C('facility_no', 'Facility No', { aliases: ['facno', 'fac no', 'facility number', 'loan no', 'loan number'] }),
  C('vehicle_no', 'Vehicle Reg No', { aliases: ['vehicleregno', 'vehicle no', 'vehicle number', 'registration no', 'reg no'] }),
  C('pay_type', 'Pay Type', { aliases: ['premium pay type', 'payment mode'] }),
  C('class', 'Class / Product', { aliases: ['class', 'product', 'class of insurance', 'insurance class', 'product / class'] }),
  C('inception', 'Inception Date', { type: 'date', aliases: ['period from', 'from date', 'commencement date', 'start date'] }),
  C('expiry', 'Expiry Date', { type: 'date', aliases: ['period to', 'to date', 'end date'] }),
  C('effective_date', 'Effective Date', { type: 'date', aliases: ['endorsement effective date', 'endorsement date'] }),
  C('sum_insured', 'Sum Insured', { type: 'money' }),
  C('basic', 'Basic Premium', { required: true, type: 'money', aliases: ['basic'] }),
  C('srcc', 'SRCC Premium', { type: 'money', aliases: ['srcc'] }),
  C('tc', 'TC Premium', { type: 'money', aliases: ['tc'] }),
  C('total', 'Total Premium', { type: 'money', aliases: ['total', 'gross premium'] }),
  C('gross_premium', 'Premium incl. Taxes', { type: 'money', aliases: ['premium including taxes', 'gross premium incl taxes', 'total payable'] }),
  C('prev_premium', 'Previous Premium', { type: 'money', aliases: ['expiring premium', 'old premium', 'previous period premium'] }),
  C('comm_basic', 'Commission Basic', { type: 'money', aliases: ['basic commission'] }),
  C('comm_srcc', 'Commission SRCC', { type: 'money', aliases: ['srcc commission'] }),
  C('comm_tc', 'Commission TC', { type: 'money', aliases: ['tc commission'] }),
  C('remarks', 'Remarks', { aliases: ['remark', 'reamaks', 'notes', 'comments'] }),
];
const MASTER_EXTRA = [
  C('paid_amount', 'Premium Paid', { type: 'money', aliases: ['premium paid amount', 'amount paid', 'payment amount'] }),
  C('payment_date', 'Payment Date', { type: 'date' }),
  C('payment_ref', 'Payment Reference', { aliases: ['payment ref', 'receipt no'] }),
  C('comm_received', 'Commission Received', { type: 'money', aliases: ['commission amount', 'commission received amount'] }),
  C('comm_date', 'Commission Date', { type: 'date', aliases: ['commission received date', 'date received'] }),
  C('comm_ref', 'Commission Reference', { aliases: ['commission statement ref', 'statement reference'] }),
];

export const TEMPLATES = {
  master: { label: 'Master Register (combined)', control: 'Total Premium', cols: [...GWP_COLS, ...MASTER_EXTRA], library: 'gwp',
    note: 'One row per policy transaction, optionally with the premium received and insurer commission received for it. Feeds the GWP, Payments and Commission registers at once.' },
  gwp: { label: 'GWP & Endorsements', control: 'Total Premium', cols: GWP_COLS, library: 'gwp',
    note: 'New business, renewals, endorsements (+/−), cancellations and refunds (negative). GWP month = inception month, or effective-date month for endorsements.' },
  renewals: { label: 'Renewals', control: 'Total Premium', cols: GWP_COLS, library: 'gwp', defaultType: 'Renewal',
    note: 'Same layout as GWP. Transaction Type may be left blank (= Renewal). Each renewal is a new policy period linked to the expiring one.' },
  payments: { label: 'Premium Payments & Refunds', control: 'Amount', library: 'payment', cols: [
    C('policy_no', 'Policy No', { required: true, aliases: ['policy number'] }),
    C('customer', 'Customer Name', { aliases: ['name', 'client name'] }),
    C('date', 'Payment Date', { required: true, type: 'date' }),
    C('amount', 'Amount', { required: true, type: 'money', aliases: ['payment amount', 'amount paid'] }),
    C('insurer', 'Insurance Company', { required: true, aliases: ['insurer'] }),
    C('branch', 'Branch'),
    C('reference', 'Payment Reference', { aliases: ['reference', 'receipt no', 'transaction reference'] }),
    C('type', 'Type', { type: 'enum', options: ['Receipt', 'Refund'], aliases: ['payment type'] }),
  ], note: 'Premium receipts and customer refunds. A receipt is matched when Policy No + Insurance Company identify exactly one policy period; otherwise it goes to Exceptions.' },
  commission: { label: 'Insurer Commission Receipts', control: 'Amount', library: 'commission', cols: [
    C('policy_no', 'Policy No', { required: true, aliases: ['policy number'] }),
    C('customer', 'Customer Name', { aliases: ['name', 'client name'] }),
    C('date', 'Commission Date', { required: true, type: 'date', aliases: ['date received', 'commission received date'] }),
    C('amount', 'Amount', { required: true, type: 'money', aliases: ['commission amount'] }),
    C('insurer', 'Insurance Company', { required: true, aliases: ['insurer'] }),
    C('branch', 'Branch'),
    C('reference', 'Statement Reference', { aliases: ['reference', 'statement ref'] }),
    C('component', 'Component', { type: 'enum', options: ['Basic', 'SRCC', 'TC'] }),
  ], note: 'Commission actually received from insurers. Several receipts per policy are allowed. The bank share becomes payable only when the full policy commission is received.' },
  claims: { label: 'Claims Statements', control: 'Estimated Loss', library: 'claims', cols: [
    C('claim_ref', 'Claim Ref ID', { required: true, aliases: ['claim ref', 'claim no', 'claim number', 'claim reference'] }),
    C('customer', 'Client Name', { aliases: ['customer name', 'name'] }),
    C('policy_no', 'Policy No', { required: true, aliases: ['policy number'] }),
    C('insurer', 'Insurance Company', { aliases: ['insurer'] }),
    C('class', 'Product / Class', { aliases: ['class', 'product'] }),
    C('incident_date', 'Incident Date', { type: 'date', aliases: ['date of loss', 'loss date'] }),
    C('intimation_date', 'Intimation Date', { type: 'date', aliases: ['reported date'] }),
    C('cause', 'Cause of Loss', { aliases: ['cause'] }),
    C('description', 'Description'),
    C('estimate', 'Estimated Loss', { type: 'money', aliases: ['estimate', 'claim amount'] }),
    C('status', 'Status', { required: true, aliases: ['claim status'] }),
    C('settlement', 'Settlement Amount', { type: 'money', aliases: ['paid amount', 'settled amount'] }),
    C('payment_date', 'Payment Date', { type: 'date', aliases: ['settlement date'] }),
    C('payee', 'Payee'),
    C('rejection_reason', 'Rejection Reason', { aliases: ['decline reason', 'reason'] }),
  ], note: 'Claim status snapshots from insurers. Status history is kept; a Settlement Amount with a Payment Date is added as an instalment. A claim missing from a later statement is never closed.' },
  targets: { label: 'GWP Targets', control: 'Net GWP Target', library: null, cols: [
    C('month', 'Month', { required: true, aliases: ['period'] }),
    C('branch', 'Branch'),
    C('class', 'Class / Product', { aliases: ['class', 'product'] }),
    C('target', 'Net GWP Target', { required: true, type: 'money', aliases: ['target'] }),
  ], note: 'Monthly net GWP targets (Month as YYYY-MM). Leave Branch / Class blank for "all".' },
};

/* ── configurable fields ──────────────────────────────────────────────────
   Per bank (config):
     fields[register]  = { hidden: [optional column keys], labels: { key: 'Column header' } }
     custom_fields[rec] = [{ key, label, type, options, required, removed }]  rec = policy | payment | commission | claim
   Custom fields are stored on the record under `custom` and show in the grids, drill-downs and exports.
   Removing a field only hides it — values already posted are kept. */
export const RECORD_OF = { master: 'policy', gwp: 'policy', renewals: 'policy', payments: 'payment', commission: 'commission', claims: 'claim', targets: null };
export const RECORD_LABEL = { policy: 'Policy (Master, GWP & Renewals uploads)', payment: 'Payment', commission: 'Commission receipt', claim: 'Claim' };
export const CUSTOM_TYPES = [['text', 'Text'], ['number', 'Number'], ['money', 'Amount (LKR)'], ['date', 'Date'], ['select', 'Dropdown']];
// Columns the calculations and matching depend on — they can be renamed but never removed.
const LOCKED_EXTRA = { master: ['customer', 'inception', 'expiry', 'effective_date'], gwp: ['customer', 'inception', 'expiry', 'effective_date'], renewals: ['customer', 'inception', 'expiry', 'effective_date'] };
export const isLocked = (register, key) => !!(TEMPLATES[register]?.cols.find(c => c.key === key)?.required) || (LOCKED_EXTRA[register] || []).includes(key);
export const customFieldsFor = (config, register) => { const rec = RECORD_OF[register]; return rec ? ((config?.custom_fields || {})[rec] || []).filter(f => f && f.key && !f.removed) : []; };
// Column order for a register (standard keys + 'cf:<key>' custom fields): the saved order first;
// a column it doesn't list yet (new or restored) goes after its default neighbour.
export function columnOrder(register, config) {
  const all = [...TEMPLATES[register].cols.map(c => c.key), ...customFieldsFor(config, register).map(f => 'cf:' + f.key)];
  const out = [...new Set((((config?.fields || {})[register] || {}).order || []).filter(k => all.includes(k)))];
  all.forEach((k, i) => { if (!out.includes(k)) out.splice(i ? out.indexOf(all[i - 1]) + 1 : 0, 0, k); });
  return out;
}
export function effectiveTemplate(register, config) {
  const baseTpl = TEMPLATES[register];
  const fc = (config?.fields || {})[register] || {};
  const hidden = new Set(fc.hidden || []);
  const labels = fc.labels || {};
  const cols = baseTpl.cols
    .filter(c => isLocked(register, c.key) || !hidden.has(c.key))
    .map(c => (labels[c.key] && labels[c.key].trim() && labels[c.key].trim() !== c.header
      ? { ...c, header: labels[c.key].trim(), aliases: [c.header, ...(c.aliases || [])] } : c));
  for (const f of customFieldsFor(config, register)) {
    cols.push({ key: 'cf:' + f.key, header: f.label, type: f.type === 'select' ? 'enum' : f.type === 'money' ? 'money' : f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text',
      options: f.type === 'select' ? (f.options || []) : undefined, required: !!f.required, aliases: [f.key], custom: f });
  }
  const rank = new Map(columnOrder(register, config).map((k, i) => [k, i]));
  cols.sort((a, b) => rank.get(a.key) - rank.get(b.key));
  return { ...baseTpl, cols };
}

const hnorm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Map file headers → template keys. Returns { map: {key: header}, missing: [labels] }. */
export function matchHeaders(headers, tpl) {
  const map = {};
  const used = new Set();
  // exact column names first, then aliases — so the column order never changes how a file is read
  const pass = (namesOf) => {
    for (const col of tpl.cols) {
      if (map[col.key]) continue;
      const names = namesOf(col).map(hnorm);
      const h = headers.find(x => !used.has(x) && names.includes(hnorm(x)));
      if (h) { map[col.key] = h; used.add(h); }
    }
  };
  pass(c => [c.header]);
  pass(c => c.aliases || []);
  const missing = tpl.cols.filter(c => c.required && !map[c.key]).map(c => c.header);
  return { map, missing };
}

/* ── file parsing (browser) ── */
const cellVal = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.result !== undefined) return v.result;
    if (v.text !== undefined) return v.text;
    return '';
  }
  return v;
};
export async function parseFile(file, tpl) {
  const name = (file.name || '').toLowerCase();
  let grid = [];
  let version = '';
  if (name.endsWith('.csv')) {
    const { default: Papa } = await import('papaparse');
    const res = Papa.parse(await file.text(), { skipEmptyLines: 'greedy' });
    grid = res.data;
  } else if (name.endsWith('.xlsx')) {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const info = wb.getWorksheet('Instructions');
    if (info) info.eachRow(r => { const t = String(cellVal(r.getCell(1).value) || ''); const m = /^Template:\s*banca-(\w+)-(v\d+)/i.exec(t); if (m) version = m[2]; });
    const ws = wb.getWorksheet('Data') || wb.worksheets.find(w => w.name !== 'Instructions') || wb.worksheets[0];
    if (!ws) throw new Error('The workbook has no sheets.');
    ws.eachRow({ includeEmpty: false }, (row) => { grid.push(row.values.slice(1).map(cellVal)); });
  } else throw new Error('Upload an .xlsx or .csv file (old .xls: open in Excel and Save As .xlsx).');
  if (version && version !== TEMPLATE_VERSION) throw new Error(`This file uses template ${version}; the system expects ${TEMPLATE_VERSION}. Download the current template.`);
  // header row = first row (within the first 15) that matches at least 2 template columns
  let hi = -1;
  for (let i = 0; i < Math.min(15, grid.length); i++) {
    const { map } = matchHeaders(grid[i].map(x => String(x ?? '').trim()), tpl);
    if (Object.keys(map).length >= 2) { hi = i; break; }
  }
  if (hi < 0) throw new Error('Could not find the header row — use the standard template headers.');
  const headers = grid[hi].map(x => String(x ?? '').trim());
  const rows = [];
  for (let i = hi + 1; i < grid.length; i++) {
    const r = grid[i]; if (!r || r.every(v => v === '' || v === null || v === undefined)) continue;
    const o = { __row: i + 1 }; headers.forEach((h, j) => { if (h) o[h] = r[j] ?? ''; }); rows.push(o);
  }
  return { headers, rows, version };
}

/* ── validation + posting plan ── */
const str = (v) => (v instanceof Date ? toYmd(v) : String(v ?? '').trim());
function uniqueId(prefix, key, taken, reversedIds) {
  let id = prefix + hashKey(key).toUpperCase();
  let n = 1;
  while (reversedIds.has(id)) id = prefix + hashKey(`${key}#${++n}`).toUpperCase(); // re-post after a reversal
  return { id, duplicate: taken.has(id) };
}

/**
 * @param register  key of TEMPLATES
 * @param parsed    { headers, rows }
 * @param raw       current raw data { policies, txns, receipts, commissions, claims, targets }
 * @param config    bank config
 * @param ctx       { batchId, user, bankId }
 */
export function validate(register, parsed, raw, config, ctx) {
  const tpl = effectiveTemplate(register, config);
  const H = (k) => (tpl.cols.find(c => c.key === k) || TEMPLATES[register].cols.find(c => c.key === k) || { header: k }).header;
  const { map, missing } = matchHeaders(parsed.headers, tpl);
  if (missing.length) return { fatal: `Missing required column(s): ${missing.join(', ')}` };
  const get = (row, key) => (map[key] ? row[map[key]] : '');
  const customCols = tpl.cols.filter(c => c.custom);
  // Parse this row's custom fields by type; errors reject the row. Required is enforced only where it applies.
  const readCustom = (row, errs, enforceRequired) => {
    const o = {};
    for (const c of customCols) {
      const f = c.custom; const v = get(row, c.key);
      if (v === '' || v === null || v === undefined) { if (f.required && enforceRequired) errs.push(`${f.label} missing`); continue; }
      if (f.type === 'date') { const d = toYmd(v); if (!d) { errs.push(`${f.label} is not a real date`); continue; } o[f.key] = d; }
      else if (f.type === 'number' || f.type === 'money') { if (!isNumeric(v)) { errs.push(`${f.label} is not a number`); continue; } o[f.key] = f.type === 'money' ? round2(num(v)) : num(v); }
      else if (f.type === 'select') { const m = (f.options || []).find(x => norm(x) === norm(str(v))); if (!m) { errs.push(`${f.label} must be one of: ${(f.options || []).join(', ')}`); continue; } o[f.key] = m; }
      else o[f.key] = str(v).slice(0, 500);
    }
    return o;
  };
  const today = todayYmd();
  const masters = { insurers: new Set((config.insurers || []).map(norm)), branches: new Set((config.branches || []).map(norm)), classes: new Set((config.classes || []).map(norm)) };
  const strict = !!config.strict_masters;
  const newMasters = { insurers: new Set(), branches: new Set(), classes: new Set() };

  // existing ids (live) and reversed ids (re-postable)
  const ids = (arr) => new Set((arr || []).filter(x => !x.reversed).map(x => x.id));
  const rids = (arr) => new Set((arr || []).filter(x => x.reversed).map(x => x.id));
  const taken = { T: ids(raw.txns), R: ids(raw.receipts), K: ids(raw.commissions) };
  const revd = { T: rids(raw.txns), R: rids(raw.receipts), K: rids(raw.commissions) };
  const policyIndex = new Map(); // insurer|policy → [period]
  const indexPeriod = (p) => { const k = `${norm(p.insurer)}|${normPolicy(p.policy_no)}`; if (!policyIndex.has(k)) policyIndex.set(k, []); const a = policyIndex.get(k); if (!a.some(x => x.id === p.id)) a.push(p); };
  const livePolicyIds = new Set((raw.txns || []).filter(t => !t.reversed).map(t => t.policy_id));
  (raw.policies || []).filter(p => livePolicyIds.has(p.id)).forEach(indexPeriod);
  const byPolicyNo = (pno) => [...policyIndex.entries()].filter(([k]) => k.endsWith('|' + normPolicy(pno))).flatMap(([, v]) => v);

  const resolvePeriod = (insurer, pno, dateYmd) => {
    let cands = insurer ? (policyIndex.get(`${norm(insurer)}|${normPolicy(pno)}`) || []) : byPolicyNo(pno);
    if (cands.length === 1) return { period: cands[0] };
    if (!cands.length) return { error: 'No policy period found for this Policy No' + (insurer ? ' + Insurance Company' : '') };
    const inRange = cands.filter(p => dateYmd && p.inception <= dateYmd && (!p.expiry || dateYmd <= p.expiry));
    if (inRange.length === 1) return { period: inRange[0] };
    // a payment can arrive shortly before inception — take the nearest following period
    const after = cands.filter(p => dateYmd && p.inception > dateYmd).sort((a, b) => a.inception.localeCompare(b.inception));
    if (!inRange.length && after.length) return { period: after[0] };
    return { error: `Ambiguous: ${cands.length} policy periods match — allocate manually` };
  };

  const out = { register, rows: [], writes: { policies: [], txns: [], receipts: [], commissions: [], claims: [], targets: [], exceptions: [] },
    stats: { count: 0, accepted: 0, rejected: 0, duplicates: 0, total: 0, acceptedTotal: 0, rejectedTotal: 0, duplicateTotal: 0, unmatched: 0, unmatchedTotal: 0 } };
  const seen = { T: new Set(), R: new Set(), K: new Set(), P: new Set() };
  const newPeriods = new Map();
  const claimDocs = new Map((raw.claims || []).filter(c => !c.reversed).map(c => [c.id, JSON.parse(JSON.stringify(c))]));
  const touchedClaims = new Set();
  const controlOf = (row) => {
    if (register === 'claims') return num(get(row, 'estimate'));
    if (register === 'targets') return num(get(row, 'target'));
    if (register === 'payments' || register === 'commission') return num(get(row, 'amount'));
    const t = get(row, 'total');
    return isNumeric(t) ? num(t) : num(get(row, 'basic')) + num(get(row, 'srcc')) + num(get(row, 'tc'));
  };
  const masterCheck = (errs, warns, kind, value) => {
    if (!value) return;
    const set = masters[kind];
    if (set.size && !set.has(norm(value))) { if (strict) errs.push(`Unknown ${kind.slice(0, -1)} "${value}"`); else warns.push(`New ${kind.slice(0, -1)} "${value}"`); }
    if (!set.has(norm(value))) newMasters[kind].add(value);
  };
  // optional money columns kept on the transaction only when the file fills them (negative for cancellations / refunds)
  const optMoney = (row, k, type) => {
    const v = get(row, k); if (!isNumeric(v)) return {};
    const n = round2(num(v)); return { [k]: (type === 'Cancellation' || type === 'Refund') && n > 0 ? -n : n };
  };
  const base = (extra = {}) => ({ batch_id: ctx.batchId, created_at: new Date().toISOString(), created_by: ctx.user || '', ...extra });

  // GWP-style rows: originals first (so endorsements in the same file find their period)
  let rowsInOrder = parsed.rows;
  if (['gwp', 'master', 'renewals'].includes(register)) {
    const typeOf = (r) => str(get(r, 'type')) || tpl.defaultType || '';
    rowsInOrder = [...parsed.rows].sort((a, b) => (ORIGINAL_TYPES.has(normType(typeOf(a))) ? 0 : 1) - (ORIGINAL_TYPES.has(normType(typeOf(b))) ? 0 : 1) || a.__row - b.__row);
  }

  for (const row of rowsInOrder) {
    const errs = [], warns = []; let status = 'accepted'; let key = '';
    const ctl = controlOf(row);
    out.stats.count++; out.stats.total += ctl;
    const rec = { rowNo: row.__row, errors: errs, warnings: warns, raw: row, amount: round2(ctl) };

    if (['gwp', 'master', 'renewals'].includes(register)) {
      const type = normType(str(get(row, 'type')) || tpl.defaultType || '');
      const pno = str(get(row, 'policy_no')); const insurer = str(get(row, 'insurer'));
      if (!TXN_TYPES.includes(type)) errs.push(`Transaction Type must be one of ${TXN_TYPES.join(', ')}`);
      const custom = readCustom(row, errs, ORIGINAL_TYPES.has(type));
      if (!pno) errs.push('Policy No missing');
      if (!insurer) errs.push('Insurance Company missing');
      const dates = {};
      for (const k of ['inception', 'expiry', 'effective_date']) {
        const v = get(row, k); dates[k] = toYmd(v);
        if (v !== '' && v !== null && v !== undefined && !dates[k]) errs.push(`${H(k)} is not a real date`);
      }
      for (const k of ['basic', 'srcc', 'tc', 'total', 'sum_insured', 'gross_premium', 'prev_premium', 'comm_basic', 'comm_srcc', 'comm_tc']) {
        const v = get(row, k); if (v !== '' && v !== null && v !== undefined && !isNumeric(v)) errs.push(`${H(k)} is not a number`);
      }
      let basic = num(get(row, 'basic')), srcc = num(get(row, 'srcc')), tc = num(get(row, 'tc'));
      let total = isNumeric(get(row, 'total')) ? num(get(row, 'total')) : basic + srcc + tc;
      if (Math.abs(round2(total) - round2(basic + srcc + tc)) > 0.01) errs.push('Total Premium ≠ Basic + SRCC + TC');
      // cancellations / refunds are negative transactions
      if ((type === 'Cancellation' || type === 'Refund') && total > 0) { basic = -basic; srcc = -srcc; tc = -tc; total = -total; warns.push(`${type} amounts posted as negative`); }
      let period = null;
      if (ORIGINAL_TYPES.has(type)) {
        if (!str(get(row, 'customer'))) errs.push('Customer Name missing');
        const blank = (k) => { const v = get(row, k); return v === '' || v === null || v === undefined; };
        if (blank('inception')) errs.push('Inception Date missing');
        if (blank('expiry')) errs.push('Expiry Date missing');
        if (dates.inception && dates.expiry && dates.expiry <= dates.inception) errs.push('Expiry Date must be after Inception Date');
        masterCheck(errs, warns, 'insurers', insurer); masterCheck(errs, warns, 'branches', str(get(row, 'branch'))); masterCheck(errs, warns, 'classes', str(get(row, 'class')));
        if (!errs.length) {
          const id = periodId(insurer, pno, dates.inception);
          const exists = (raw.policies || []).some(p => p.id === id && livePolicyIds.has(id));
          period = { id, policy_no: pno, prev_policy_no: str(get(row, 'prev_policy_no')), customer: str(get(row, 'customer')), address: str(get(row, 'address')),
            telephone: str(get(row, 'telephone')), insurer, branch: str(get(row, 'branch')), class: str(get(row, 'class')), inception: dates.inception, expiry: dates.expiry,
            sum_insured: round2(num(get(row, 'sum_insured'))), facility_no: str(get(row, 'facility_no')), vehicle_no: str(get(row, 'vehicle_no')).toUpperCase(),
            pay_type: str(get(row, 'pay_type')), ...(Object.keys(custom).length ? { custom } : {}) };
          if (exists || seen.P.has(id)) { period._exists = true; }
        }
      } else if (!errs.length) {
        if (!dates.effective_date) { const v = get(row, 'effective_date'); if (v === '' || v === null || v === undefined) errs.push('Effective Date is required for ' + type); }
        else {
          const r = resolvePeriod(insurer, pno, dates.effective_date);
          if (r.error) errs.push(r.error); else period = r.period;
        }
      }
      const eff = ORIGINAL_TYPES.has(type) ? dates.inception : dates.effective_date;
      if (!errs.length) {
        key = `T|${norm(insurer)}|${normPolicy(pno)}|${type}|${eff}|${round2(basic)}|${round2(srcc)}|${round2(tc)}`;
        const u = uniqueId('T', key, taken.T, revd.T);
        if (u.duplicate || seen.T.has(u.id)) status = 'duplicate';
        else if (ORIGINAL_TYPES.has(type) && period._exists) { errs.push('This policy period already has an original transaction — post an Endorsement instead'); }
        else {
          seen.T.add(u.id);
          if (ORIGINAL_TYPES.has(type)) {
            seen.P.add(period.id); const { _exists, ...pdoc } = period;
            out.writes.policies.push({ id: period.id, data: { ...pdoc, ...base() } });
            newPeriods.set(period.id, pdoc); indexPeriod(pdoc);
          }
          const supplied = ['comm_basic', 'comm_srcc', 'comm_tc'].some(k => isNumeric(get(row, k)));
          let cm;
          if (supplied) {
            const sign = (type === 'Cancellation' || type === 'Refund') && num(get(row, 'comm_basic')) + num(get(row, 'comm_srcc')) + num(get(row, 'comm_tc')) > 0 ? -1 : 1;
            const b = round2(sign * num(get(row, 'comm_basic'))), s = round2(sign * num(get(row, 'comm_srcc'))), t = round2(sign * num(get(row, 'comm_tc')));
            cm = { comm_basic: b, comm_srcc: s, comm_tc: t, comm_total: round2(b + s + t), rate_id: null };
          } else cm = expectedCommission(config, period.insurer, period.class, eff, basic, srcc, tc);
          out.writes.txns.push({ id: u.id, data: { policy_id: period.id, type, effective_date: eff, gwp_month: monthOf(eff), upload_date: today,
            basic: round2(basic), srcc: round2(srcc), tc: round2(tc), total: round2(total), ...cm, comm_source: supplied ? 'file' : 'schedule', posting_key: key,
            ...optMoney(row, 'gross_premium', type), ...optMoney(row, 'prev_premium'), ...(str(get(row, 'remarks')) ? { remarks: str(get(row, 'remarks')).slice(0, 500) } : {}),
            ...(Object.keys(custom).length ? { custom } : {}), ...base() } });
          // master register rows may also carry the premium receipt and insurer commission
          if (register === 'master') {
            const paidV = get(row, 'paid_amount'), commV = get(row, 'comm_received');
            if (isNumeric(paidV) && num(paidV) !== 0) {
              const d = toYmd(get(row, 'payment_date')) || eff;
              const rk = `R|${normPolicy(pno)}|${d}|${round2(num(paidV))}|${str(get(row, 'payment_ref'))}|Receipt`;
              const ru = uniqueId('R', rk, taken.R, revd.R);
              if (!ru.duplicate && !seen.R.has(ru.id)) { seen.R.add(ru.id); out.writes.receipts.push({ id: ru.id, data: { policy_id: period.id, policy_no: pno, customer: period.customer, insurer: period.insurer, branch: period.branch, date: d, amount: round2(num(paidV)), type: 'Receipt', reference: str(get(row, 'payment_ref')), status: 'Matched', posting_key: rk, ...base() } }); }
            }
            if (isNumeric(commV) && num(commV) !== 0) {
              const d = toYmd(get(row, 'comm_date')) || eff;
              const ck = `K|${normPolicy(pno)}|${d}|${round2(num(commV))}|${str(get(row, 'comm_ref'))}|`;
              const cu = uniqueId('K', ck, taken.K, revd.K);
              if (!cu.duplicate && !seen.K.has(cu.id)) { seen.K.add(cu.id); out.writes.commissions.push({ id: cu.id, data: { policy_id: period.id, policy_no: pno, customer: period.customer, insurer: period.insurer, branch: period.branch, date: d, amount: round2(num(commV)), reference: str(get(row, 'comm_ref')), component: '', status: 'Matched', posting_key: ck, ...base() } }); }
            }
          }
        }
      }
    } else if (register === 'payments' || register === 'commission') {
      const pno = str(get(row, 'policy_no')), insurer = str(get(row, 'insurer'));
      const d = toYmd(get(row, 'date')); const amtV = get(row, 'amount');
      if (!pno) errs.push('Policy No missing');
      if (!insurer) errs.push('Insurance Company missing');
      if (!d) errs.push(`${register === 'payments' ? 'Payment' : 'Commission'} Date missing or not a real date`);
      if (!isNumeric(amtV)) errs.push('Amount is not a number'); else if (num(amtV) === 0) errs.push('Amount is zero');
      let amount = round2(num(amtV));
      let type = 'Receipt';
      if (register === 'payments') {
        type = str(get(row, 'type')) ? (norm(get(row, 'type')).startsWith('ref') ? 'Refund' : norm(get(row, 'type')).startsWith('rec') ? 'Receipt' : '') : 'Receipt';
        if (!type) errs.push('Type must be Receipt or Refund');
        if (type === 'Refund' && amount > 0) amount = -amount;
      }
      const custom = readCustom(row, errs, true);
      const comp = str(get(row, 'component'));
      if (register === 'commission' && comp && !['basic', 'srcc', 'tc'].includes(norm(comp))) errs.push('Component must be Basic, SRCC or TC');
      if (!errs.length) {
        const P = register === 'payments' ? 'R' : 'K';
        key = `${P}|${normPolicy(pno)}|${d}|${amount}|${str(get(row, 'reference'))}|${register === 'payments' ? type : comp}`;
        const u = uniqueId(P, key, taken[P], revd[P]);
        if (u.duplicate || seen[P].has(u.id)) status = 'duplicate';
        else {
          seen[P].add(u.id);
          const r = resolvePeriod(insurer, pno, d);
          const doc = { policy_id: r.period ? r.period.id : null, policy_no: pno, customer: str(get(row, 'customer')) || r.period?.customer || '', insurer, branch: str(get(row, 'branch')) || r.period?.branch || '',
            date: d, amount, reference: str(get(row, 'reference')), status: r.period ? 'Matched' : 'Unmatched', posting_key: key, ...base() };
          if (register === 'payments') doc.type = type; else doc.component = comp;
          if (Object.keys(custom).length) doc.custom = custom;
          (register === 'payments' ? out.writes.receipts : out.writes.commissions).push({ id: u.id, data: doc });
          if (!r.period) {
            status = 'unmatched'; warns.push(r.error);
            out.stats.unmatched++; out.stats.unmatchedTotal += amount;
            out.writes.exceptions.push({ id: 'X' + u.id.slice(1), data: { kind: register === 'payments' ? 'receipt' : 'commission', ref_coll: register === 'payments' ? 'receipts' : 'commissions', ref_id: u.id,
              policy_no: pno, insurer, customer: doc.customer, amount, date: d, reason: r.error, status: 'Open', opened_at: today, ...base() } });
          }
        }
      }
    } else if (register === 'claims') {
      const ref = str(get(row, 'claim_ref')), pno = str(get(row, 'policy_no')), insurer = str(get(row, 'insurer'));
      const st = str(get(row, 'status'));
      if (!ref) errs.push('Claim Ref ID missing'); if (!pno) errs.push('Policy No missing'); if (!st) errs.push('Status missing');
      const dates = {};
      for (const k of ['incident_date', 'intimation_date', 'payment_date']) { const v = get(row, k); dates[k] = toYmd(v); if (v !== '' && v != null && !dates[k]) errs.push(`${H(k)} is not a real date`); }
      for (const k of ['estimate', 'settlement']) { const v = get(row, k); if (v !== '' && v != null && !isNumeric(v)) errs.push(`${H(k)} is not a number`); }
      const custom = readCustom(row, errs, true);
      const settle = round2(num(get(row, 'settlement')));
      if (settle && !dates.payment_date) errs.push('Payment Date is required with a Settlement Amount');
      let period = null;
      if (!errs.length) { const r = resolvePeriod(insurer, pno, dates.incident_date || dates.intimation_date || today); if (r.error) errs.push(r.error); else period = r.period; }
      if (!errs.length) {
        const id = 'CL' + hashKey(`${norm(period.insurer)}|${normPolicy(ref)}`).toUpperCase();
        key = `CL|${id}|${st}|${round2(num(get(row, 'estimate')))}|${settle}|${dates.payment_date}`;
        const existing = claimDocs.get(id);
        const c = existing || { claim_ref: ref, policy_id: period.id, policy_no: period.policy_no, insurer: period.insurer, branch: period.branch, customer: str(get(row, 'customer')) || period.customer,
          class: str(get(row, 'class')) || period.class, status_history: [], payments: [], ...base() };
        let changed = !existing;
        const setIf = (k, v) => { if (v !== '' && v !== undefined && v !== null && c[k] !== v) { c[k] = v; changed = true; } };
        setIf('incident_date', dates.incident_date); setIf('intimation_date', dates.intimation_date); setIf('cause', str(get(row, 'cause')));
        setIf('description', str(get(row, 'description'))); setIf('rejection_reason', str(get(row, 'rejection_reason')));
        if (isNumeric(get(row, 'estimate'))) setIf('estimate', round2(num(get(row, 'estimate'))));
        for (const [k, v] of Object.entries(custom)) if ((c.custom || {})[k] !== v) { c.custom = { ...(c.custom || {}), [k]: v }; changed = true; }
        if (c.status !== st) { c.status_history = [...(c.status_history || []), { status: st, at: today, batch_id: ctx.batchId }]; c.status = st; changed = true; }
        if (settle) {
          const pid = 'P' + hashKey(`${id}|${dates.payment_date}|${settle}`);
          if (!(c.payments || []).some(p => p.id === pid && !p.reversed)) { c.payments = [...(c.payments || []).filter(p => p.id !== pid), { id: pid, amount: settle, date: dates.payment_date, payee: str(get(row, 'payee')), batch_id: ctx.batchId }]; changed = true; }
        }
        if (!changed) status = 'duplicate';
        else { c.updated_at = new Date().toISOString(); c.last_batch_id = ctx.batchId; claimDocs.set(id, c); touchedClaims.add(id); }
      }
    } else if (register === 'targets') {
      const mRaw = str(get(row, 'month')); const month = /^\d{4}-\d{2}$/.test(mRaw) ? mRaw : monthOf(toYmd(get(row, 'month')));
      if (!month) errs.push('Month must be YYYY-MM');
      if (!isNumeric(get(row, 'target'))) errs.push('Net GWP Target is not a number');
      if (!errs.length) {
        const branch = str(get(row, 'branch')), cls = str(get(row, 'class'));
        const id = 'TG' + hashKey(`${month}|${norm(branch)}|${norm(cls)}`).toUpperCase();
        const prev = (raw.targets || []).find(t => t.id === id);
        const target = round2(num(get(row, 'target')));
        if (prev && num(prev.target) === target) status = 'duplicate';
        else out.writes.targets.push({ id, data: { month, branch, class: cls, target, version: (prev?.version || 0) + 1,
          history: [...(prev?.history || []), { target, at: new Date().toISOString(), by: ctx.user || '', batch_id: ctx.batchId, previous: prev ? prev.target : null }], ...base() } });
      }
    }

    if (errs.length) status = 'rejected';
    rec.status = status; rec.key = key;
    if (status === 'rejected') { out.stats.rejected++; out.stats.rejectedTotal += ctl; }
    else if (status === 'duplicate') { out.stats.duplicates++; out.stats.duplicateTotal += ctl; }
    else { out.stats.accepted++; out.stats.acceptedTotal += ctl; }
    out.rows.push(rec);
  }
  for (const id of touchedClaims) { const { id: _drop, ...data } = claimDocs.get(id); out.writes.claims.push({ id, data }); }
  for (const k of ['total', 'acceptedTotal', 'rejectedTotal', 'duplicateTotal', 'unmatchedTotal']) out.stats[k] = round2(out.stats[k]);
  out.rows.sort((a, b) => a.rowNo - b.rowNo);
  out.newMasters = { insurers: [...newMasters.insurers], branches: [...newMasters.branches], classes: [...newMasters.classes] };
  return out;
}

function normType(t) {
  const s = norm(t);
  if (!s) return '';
  if (s.startsWith('new') || s === 'nb' || s.startsWith('fresh')) return 'New';
  if (s.startsWith('ren')) return 'Renewal';
  if (s.startsWith('endo') || s.startsWith('add') || s.startsWith('alter')) return 'Endorsement';
  if (s.startsWith('canc')) return 'Cancellation';
  if (s.startsWith('ref') || s.startsWith('return')) return 'Refund';
  return t;
}

/* ── template + error workbooks ── */
export async function templateWorkbook(register, bankName, config) {
  const tpl = effectiveTemplate(register, config);
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Data');
  ws.addRow(tpl.cols.map(c => c.header));
  ws.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1A3E' } }; });
  tpl.cols.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(14, c.header.length + 4); if (c.type === 'date') ws.getColumn(i + 1).numFmt = 'yyyy-mm-dd'; if (c.type === 'money') ws.getColumn(i + 1).numFmt = '#,##0.00'; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const info = wb.addWorksheet('Instructions');
  info.addRow([`Template: banca-${register}-${TEMPLATE_VERSION}`]);
  info.addRow([`InsureSAAS Banca — ${tpl.label}`]).font = { bold: true, size: 13 };
  info.addRow([tpl.note]);
  info.addRow(['Dates: real Excel dates or YYYY-MM-DD (DD/MM/YYYY is also read). Amounts in LKR, 2 decimals. Do not rename the headers.']);
  info.addRow([]);
  info.addRow(['Column', 'Required', 'Format / allowed values']).font = { bold: true };
  tpl.cols.forEach(c => info.addRow([c.header + (c.custom ? ' (custom)' : ''), c.required ? 'Yes' : '', c.type === 'enum' ? (c.options || []).join(' / ') : c.type === 'date' ? 'Date' : c.type === 'money' ? 'Amount (LKR)' : c.type === 'number' ? 'Number' : 'Text']));
  info.getColumn(1).width = 28; info.getColumn(2).width = 10; info.getColumn(3).width = 60;
  return wb.xlsx.writeBuffer();
}

export async function errorWorkbook(plan, parsedHeaders) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Errors');
  ws.addRow(['Row', 'Outcome', 'Reason', ...parsedHeaders]);
  ws.getRow(1).font = { bold: true };
  plan.rows.filter(r => r.status !== 'accepted').forEach(r => ws.addRow([r.rowNo, r.status, [...r.errors, ...r.warnings].join('; '), ...parsedHeaders.map(h => { const v = r.raw[h]; return v instanceof Date ? toYmd(v) : v; })]));
  ws.getColumn(3).width = 60;
  return wb.xlsx.writeBuffer();
}
