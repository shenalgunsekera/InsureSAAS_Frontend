// Claims CSV export / import + document backup-restore helpers.
//
// Shared by ClaimsPage (Export CSV, CSV Template, Import CSV, Import Documents)
// and the Admin Panel backup, so claims AND their documents round-trip exactly
// like clients and quotations already do. Nothing here talks to Firestore — the
// callers do the reads/writes; this module only shapes data and matches files.

// Tracker step keys that can hold uploaded documents (mirrors ClaimsPage TRACKER_STEPS).
export const TRACKER_KEYS = [
  'claim_intimated', 'claim_number_created', 'surveyor_assigned', 'inspection_completed',
  'documents_requested', 'customer_informed', 'documents_received', 'documents_verified',
  'documents_submitted_insurer', 'claim_under_assessment', 'further_queries_raised',
  'query_response_submitted', 'offer_received', 'dispute_raised', 'negotiation_history',
  'final_offer_received', 'customer_acceptance', 'payment_released', 'payment_received',
  'receipt_issued', 'claim_closed', 'customer_satisfaction_survey', 'lessons_learned',
];
const DEFAULT_DOC_STEP = 'documents_received';
const DELIM = '__';
const sanitize = (s) => String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_');

// Friendly columns shown in the downloadable CSV template (for manual bulk-add).
export const CLAIM_TEMPLATE_FIELDS = [
  { key: 'claim_ref_id',      label: 'Claim Ref ID' },
  { key: 'client_name',       label: 'Client Name' },
  { key: 'policy_no',         label: 'Policy No' },
  { key: 'product',           label: 'Product / Class' },
  { key: 'incident_date',     label: 'Incident Date' },
  { key: 'cause',             label: 'Cause of Loss' },
  { key: 'description',       label: 'Description' },
  { key: 'loss_amount',       label: 'Estimated Loss' },
  { key: 'status',            label: 'Status' },
  { key: 'settlement_amount', label: 'Settlement Amount' },
];

const PREFERRED = ['reference', 'claim_ref_id', 'client_name', 'policy_no', 'product',
  'incident_date', 'cause', 'description', 'loss_amount', 'status', 'settlement_amount',
  'created_by_name', 'created_at'];
const INTERNAL = new Set(['id', 'process_tracker', 'updated_at']);

const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const toCell = (v) => {
  if (v === null || v === undefined) return '';
  if (v?.toDate) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return String(v);
};

/* Robust CSV parser (quotes, escaped quotes, embedded newlines). */
export function parseCsv(text) {
  const rows = []; let row = [], cur = '', qd = false;
  const t = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (qd) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else qd = false; } else cur += c; }
    else if (c === '"') qd = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

/* Full claims CSV — every scalar field + the whole tracker (with doc links) as
   JSON, so a re-import restores the claim completely. Used for Export + backup. */
export function buildClaimsCsv(claims) {
  const keys = [...PREFERRED];
  const seen = new Set(keys);
  claims.forEach(c => Object.keys(c).forEach(k => {
    if (INTERNAL.has(k) || seen.has(k)) return;
    const v = c[k];
    if (v && typeof v === 'object' && !v.toDate) return; // skip nested/arrays
    seen.add(k); keys.push(k);
  }));
  const header = [...keys, 'process_tracker_json'];
  const lines = [header.map(q).join(',')];
  claims.forEach(c => {
    const cells = keys.map(k => q(toCell(c[k])));
    cells.push(q(JSON.stringify(c.process_tracker || {})));
    lines.push(cells.join(','));
  });
  return '﻿' + lines.join('\r\n');
}

export function buildClaimsTemplate() {
  return '﻿' + CLAIM_TEMPLATE_FIELDS.map(f => q(f.label)).join(',') + '\r\n';
}

/* Parse a claims CSV (friendly template OR full export) into plain objects.
   Returns { rows, errors }. process_tracker_json is decoded back to an object. */
export function parseClaimsCsv(text) {
  const raw = parseCsv(text).filter(r => r.some(c => (c || '').trim() !== ''));
  const errors = [];
  if (raw.length < 2) return { rows: [], errors: ['The file has no data rows.'] };
  const header = raw[0].map(h => h.trim());
  const labelToKey = {};
  CLAIM_TEMPLATE_FIELDS.forEach(f => { labelToKey[f.label.toLowerCase()] = f.key; });
  const keyFor = (h) => labelToKey[h.toLowerCase()] || h;
  const rows = [];
  raw.slice(1).forEach((r, i) => {
    const obj = {};
    header.forEach((h, idx) => {
      const key = keyFor(h);
      const val = (r[idx] ?? '').trim();
      if (key === 'process_tracker_json' || key === 'tracker_json') {
        if (val) { try { obj.process_tracker = JSON.parse(val); } catch { obj.process_tracker = {}; } }
        return;
      }
      if (val !== '') obj[key] = val;
    });
    if (!obj.client_name && !obj.reference && !obj.claim_ref_id && !obj.policy_no) return; // blank row
    if (!obj.client_name) { errors.push(`Row ${i + 2}: skipped — Client Name is required.`); return; }
    rows.push(obj);
  });
  return { rows, errors };
}

/* Backup filename for one claim document — encodes reference + step so a later
   Import Documents drops it back onto the right claim and tracker step. */
export function claimDocFileName(reference, stepKey, originalName) {
  return `${sanitize(reference)}${DELIM}${stepKey}${DELIM}${originalName || 'file'}`;
}

/* Work out which claim + tracker step an uploaded file belongs to (by reference). */
export function matchClaimDoc(fileName, claims) {
  const base = String(fileName || '').replace(/\.[^.]+$/, '');
  const parts = base.split(DELIM);
  const byRef = (rs) => claims.find(c => sanitize(c.reference) === rs)
    || claims.find(c => sanitize(c.reference).toLowerCase() === rs.toLowerCase());
  if (parts.length >= 3) {
    const c = byRef(parts[0]);
    if (c) return { claim: c, step: TRACKER_KEYS.includes(parts[1]) ? parts[1] : DEFAULT_DOC_STEP };
  }
  // Fallback: filename begins with a claim reference (longest match wins).
  let best = null, bestLen = 0;
  claims.forEach(c => {
    const rs = sanitize(c.reference);
    if (rs && (base === rs || base.startsWith(rs + DELIM) || base.startsWith(rs + '_') || base.startsWith(rs)) && rs.length > bestLen) {
      best = c; bestLen = rs.length;
    }
  });
  return best ? { claim: best, step: DEFAULT_DOC_STEP } : null;
}
