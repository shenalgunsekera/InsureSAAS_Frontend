// Bancassurance data layer — Firestore reads/writes, scoped to ONE bank: banca/{bankId}/...
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, query, orderBy, limit as qLimit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import { uploadFile } from '../storage';
import { BANKS, DEFAULT_CONFIG, buildModel, round2, num, monthEnd, todayYmd, hashKey, trainingBlock } from './core';

export const COLLS = ['policies', 'txns', 'receipts', 'commissions', 'claims', 'batches', 'files', 'exceptions', 'statements', 'pmf_payments', 'approvals', 'targets', 'signoffs'];
const nowIso = () => new Date().toISOString();
const path = (bankId, coll) => `banca/${bankId}/${coll}`;

const Ctx = createContext(null);
export const useBanca = () => useContext(Ctx);

export function BancaProvider({ bankId, children }) {
  const bank = BANKS[bankId];
  const { user, userProfile } = useAuth();
  const [raw, setRaw] = useState(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState(null);
  const [platform, setPlatform] = useState([]);
  const loadPlatform = useCallback(async () => {
    try { const s2 = await getDocs(collection(db, 'platform_ops')); setPlatform(s2.docs.map(d => ({ ...d.data(), id: d.id }))); } catch (_) { setPlatform([]); }
  }, []);
  useEffect(() => { loadPlatform(); }, [loadPlatform]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [cfgSnap, ...snaps] = await Promise.all([getDoc(doc(db, 'banca', bankId)), ...COLLS.map(c => getDocs(collection(db, path(bankId, c))))]);
      const r = {}; COLLS.forEach((c, i) => { r[c] = snaps[i].docs.map(d => ({ ...d.data(), id: d.id })); });
      setConfig({ ...DEFAULT_CONFIG, ...(cfgSnap.exists() ? cfgSnap.data() : {}) });
      setRaw(r); setLoadedAt(new Date());
    } catch (e) {
      setError(e.code === 'permission-denied' ? 'Access denied — the Bancassurance database rules need to be deployed, or your role has no access to this bank module.' : (e.message || 'Could not load bank data.'));
    }
    setLoading(false);
  }, [bankId]);
  useEffect(() => { load(); }, [load]);

  const model = useMemo(() => (raw ? buildModel(raw, config) : null), [raw, config]);
  const me = useMemo(() => ({ uid: user?.uid || '', name: userProfile?.full_name || user?.email || '', role: userProfile?.role || '' }), [user, userProfile]);

  const value = useMemo(() => ({ bankId, bank, raw, config, model, loading, error, loadedAt, reload: load, me, setConfig, platform, reloadPlatform: loadPlatform }), [bankId, bank, raw, config, model, loading, error, loadedAt, load, me, platform, loadPlatform]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ── audit (append-only) ── */
export async function audit(bankId, me, event, record = '', detail = {}) {
  try {
    const ref = doc(collection(db, path(bankId, 'audit')));
    await setDoc(ref, { event, record: String(record || ''), detail: JSON.parse(JSON.stringify(detail || {})), user_uid: me.uid, user_name: me.name, at: nowIso() });
  } catch (_) { /* never block the business action */ }
}
export async function loadAudit(bankId, max = 1000) {
  const s = await getDocs(query(collection(db, path(bankId, 'audit')), orderBy('at', 'desc'), qLimit(max)));
  return s.docs.map(d => ({ ...d.data(), id: d.id }));
}

/* ── ids / fingerprints ── */
export const newId = (bankId, coll) => doc(collection(db, path(bankId, coll))).id;
export async function fileFingerprint(file) {
  try {
    const buf = await file.arrayBuffer();
    const h = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (_) { return hashKey(`${file.name}|${file.size}|${file.lastModified}`); }
}

/* ── library files: stored once (content hash), linked many times ── */
export async function storeLibraryFile(ctx, file, meta) {
  const { bankId, bank, raw, me } = ctx;
  const hash = await fileFingerprint(file);
  const existing = (raw.files || []).find(f => f.hash === hash && f.library === meta.library);
  if (existing) {
    const links = [...new Set([...(existing.batch_ids || []), ...(meta.batch_id ? [meta.batch_id] : [])])];
    await updateDoc(doc(db, path(bankId, 'files'), existing.id), { batch_ids: links, updated_at: nowIso() });
    return { id: existing.id, url: existing.url, reused: true };
  }
  const url = await uploadFile(file, `${bank.storage}/library/${meta.library}`, meta.onProgress, `${meta.library}_${(meta.insurer || 'doc').replace(/[^a-zA-Z0-9]+/g, '_')}_${meta.from || ''}`);
  const id = newId(bankId, 'files');
  const sameName = (raw.files || []).filter(f => f.library === meta.library && f.name === file.name).length;
  await setDoc(doc(db, path(bankId, 'files'), id), {
    library: meta.library, insurer: meta.insurer || '', from: meta.from || '', to: meta.to || '', name: file.name, size: file.size, hash, url,
    version: sameName + 1, batch_ids: meta.batch_id ? [meta.batch_id] : [], ref_ids: meta.ref_ids || [], note: meta.note || '',
    uploaded_at: nowIso(), uploaded_by: me.name, uploaded_by_uid: me.uid,
  });
  await audit(bankId, me, 'document_upload', id, { library: meta.library, name: file.name });
  return { id, url, reused: false };
}

/* ── post a validated batch (idempotent: deterministic ids, safe to retry) ── */
export async function postBatch(ctx, { batchId, register, plan, fileName, fileHash, fileId, declared, override, corrects, onProgress }) {
  const { bankId, me } = ctx;
  const bref = doc(db, path(bankId, 'batches'), batchId);
  const rejectedSample = plan.rows.filter(r => r.status === 'rejected').slice(0, 300).map(r => ({ row: r.rowNo, reason: r.errors.join('; '), amount: r.amount }));
  await setDoc(bref, {
    register, status: 'Posting', file_name: fileName, file_hash: fileHash, file_id: fileId || '', declared: declared || null, override: override || null,
    stats: plan.stats, rejected_rows: rejectedSample, corrects: corrects || '',
    uploaded_by: me.name, uploaded_by_uid: me.uid, uploaded_at: nowIso(), confirmed_by: me.name, confirmed_by_uid: me.uid, confirmed_at: nowIso(),
  }, { merge: true });
  const jobs = [];
  for (const [coll, list] of Object.entries(plan.writes)) for (const w of list) jobs.push([coll, w]);
  let done = 0;
  for (let i = 0; i < jobs.length; i += 400) {
    const b = writeBatch(db);
    // JSON round-trip drops any undefined field (Firestore rejects undefined values)
    for (const [coll, w] of jobs.slice(i, i + 400)) b.set(doc(db, path(bankId, coll), w.id), JSON.parse(JSON.stringify(w.data)));
    await b.commit();
    done += Math.min(400, jobs.length - i); onProgress && onProgress(Math.round(done / Math.max(1, jobs.length) * 100));
  }
  const counts = Object.fromEntries(Object.entries(plan.writes).map(([k, v]) => [k, v.length]));
  await updateDoc(bref, { status: 'Posted', posted_at: nowIso(), written: counts });
  if (corrects) await updateDoc(doc(db, path(bankId, 'batches'), corrects), { corrected_by: batchId });
  await audit(bankId, me, 'batch_posted', batchId, { register, file: fileName, stats: plan.stats, override: override || null });
  return counts;
}

/* ── approvals (maker-checker) ── */
export const APPROVAL_LABELS = { batch_reversal: 'Batch reversal', allocation: 'Receipt / commission allocation', statement: 'Bank statement', pmf_payment: 'Bank payment' };
export async function requestApproval(ctx, { category, ref_id, amount, title, payload }) {
  const { bankId, raw, me, config } = ctx;
  const id = newId(bankId, 'approvals');
  const limit = num(config.approval_limit_manager);
  const recent = (raw.approvals || []).filter(a => a.status === 'Pending' && a.category === category && a.maker_uid === me.uid && (Date.now() - new Date(a.created_at).getTime()) < 86400000);
  const nearLimit = (x) => limit && Math.abs(num(x)) >= limit * 0.8 && Math.abs(num(x)) < limit;
  const possibleSplit = nearLimit(amount) && recent.filter(a => nearLimit(a.amount)).length >= 2;
  await setDoc(doc(db, path(bankId, 'approvals'), id), {
    category, ref_id, amount: round2(num(amount)), title, payload: payload || {}, status: 'Pending', possible_split: !!possibleSplit,
    maker_uid: me.uid, maker_name: me.name, created_at: nowIso(),
  });
  await audit(bankId, me, 'approval_requested', id, { category, ref_id, amount });
  return id;
}

// Who may decide an approval. Returns '' when allowed, else the reason.
export function approvalBlock(ctx, a) {
  const { me, config } = ctx;
  if (a.status !== 'Pending') return 'Already decided';
  if (a.maker_uid === me.uid) return 'You prepared this — a different person must approve it (maker-checker)';
  const today = todayYmd();
  const delegation = (config.delegations || []).find(d => d.to_uid === me.uid && (!d.start || d.start <= today) && (!d.end || today <= d.end));
  const isApprover = me.role === 'admin' || me.role === 'manager' || !!delegation;
  if (!isApprover) return 'Only managers, admins or an active delegate can approve';
  const tb = trainingBlock(ctx.platform || [], me.uid, a.category);
  if (tb) return tb;
  if (me.role !== 'admin') {
    const lim = delegation && !['admin', 'manager'].includes(me.role) ? num(delegation.limit) : num(config.approval_limit_manager);
    if (lim && Math.abs(num(a.amount)) > lim) return `Amount above your approval limit (LKR ${lim.toLocaleString()}) — an admin must approve`;
  }
  return '';
}

export async function decideApproval(ctx, a, approve, reason) {
  const { bankId, me } = ctx;
  const block = approvalBlock(ctx, a);
  if (block) throw new Error(block);
  if (!approve && !String(reason || '').trim()) throw new Error('A reason is required to reject');
  if (approve) await executeApproval(ctx, a);
  else await undoRequest(ctx, { ...a, reason });
  await updateDoc(doc(db, path(bankId, 'approvals'), a.id), {
    status: approve ? 'Approved' : 'Rejected', decided_by_uid: me.uid, decided_by_name: me.name, decided_at: nowIso(), reason: String(reason || ''),
  });
  await audit(bankId, me, approve ? 'approval_approved' : 'approval_rejected', a.id, { category: a.category, ref_id: a.ref_id, amount: a.amount, reason });
}

async function executeApproval(ctx, a) {
  const { bankId } = ctx;
  if (a.category === 'batch_reversal') await executeReversal(ctx, a.ref_id, a.payload?.reason || '', a.id);
  else if (a.category === 'allocation') {
    const { coll, id, allocations, exception_id } = a.payload;
    const policy_id = allocations.length === 1 ? allocations[0].policy_id : null;
    await updateDoc(doc(db, path(bankId, coll), id), { allocations, policy_id, status: 'Matched', allocated_at: nowIso(), allocation_approval: a.id });
    if (exception_id) await updateDoc(doc(db, path(bankId, 'exceptions'), exception_id), { status: 'Resolved', resolved_at: nowIso(), resolution: 'Allocated', approval_id: a.id });
  } else if (a.category === 'statement') {
    const s = (ctx.raw.statements || []).find(x => x.id === a.ref_id);
    const chk = statementBlock(ctx, s);
    if (chk) throw new Error(chk);
    await updateDoc(doc(db, path(bankId, 'statements'), a.ref_id), { state: 'Approved', approved_at: nowIso(), approved_by: ctx.me.name, approval_id: a.id });
  } else if (a.category === 'pmf_payment') {
    if (!ctx.config.payment_method_cleared) throw new Error('Live Bank payments are blocked until the legal sign-off flag is set in Settings');
    await updateDoc(doc(db, path(bankId, 'pmf_payments'), a.ref_id), { status: 'Approved', approved_at: nowIso(), approved_by: ctx.me.name, approval_id: a.id });
    await updateDoc(doc(db, path(bankId, 'statements'), a.payload.statement_id), { paid: true, paid_at: nowIso() });
  }
}
async function undoRequest(ctx, a) {
  const { bankId } = ctx;
  if (a.category === 'batch_reversal') await updateDoc(doc(db, path(bankId, 'batches'), a.ref_id), { status: 'Posted', reversal_requested: false });
  else if (a.category === 'statement') await updateDoc(doc(db, path(bankId, 'statements'), a.ref_id), { state: 'Draft', rejected_reason: a.reason || '' });
  else if (a.category === 'pmf_payment') await updateDoc(doc(db, path(bankId, 'pmf_payments'), a.ref_id), { status: 'Rejected' });
  else if (a.category === 'allocation' && a.payload?.coll) await updateDoc(doc(db, path(bankId, a.payload.coll), a.payload.id), { allocation_pending: false });
}

/* ── reversal: originals kept, flagged reversed, linked to a reversal batch ── */
export async function executeReversal(ctx, batchId, reason, approvalId) {
  const { bankId, raw, me } = ctx;
  const batch = (raw.batches || []).find(b => b.id === batchId);
  if (!batch || batch.status === 'Reversed') throw new Error('Batch not found or already reversed');
  const revId = newId(bankId, 'batches');
  const stamp = { reversed: true, reversed_at: nowIso(), reversed_by_batch: revId };
  const ops = [];
  for (const coll of ['txns', 'receipts', 'commissions']) for (const d of (raw[coll] || []).filter(x => x.batch_id === batchId && !x.reversed)) ops.push([coll, d.id, stamp]);
  for (const e of (raw.exceptions || []).filter(x => x.batch_id === batchId && x.status === 'Open')) ops.push(['exceptions', e.id, { status: 'Void', resolved_at: nowIso(), resolution: 'Batch reversed' }]);
  // claims: drop this batch's instalments + status changes; a claim created by the batch is reversed
  for (const c of (raw.claims || [])) {
    const touched = c.batch_id === batchId || (c.payments || []).some(p => p.batch_id === batchId) || (c.status_history || []).some(h => h.batch_id === batchId);
    if (!touched) continue;
    const payments = (c.payments || []).map(p => (p.batch_id === batchId ? { ...p, reversed: true } : p));
    const history = (c.status_history || []).map(h => (h.batch_id === batchId ? { ...h, reversed: true } : h));
    const live = history.filter(h => !h.reversed);
    const upd = { payments, status_history: history, status: live.length ? live[live.length - 1].status : c.status };
    if (c.batch_id === batchId && !live.length) Object.assign(upd, stamp);
    ops.push(['claims', c.id, upd]);
  }
  // targets: restore the previous value
  for (const t of (raw.targets || []).filter(x => x.batch_id === batchId)) {
    const hist = (t.history || []).filter(h => h.batch_id !== batchId);
    const prev = hist[hist.length - 1];
    ops.push(['targets', t.id, prev ? { target: prev.target, version: (t.version || 1) + 1, history: [...(t.history || []), { target: prev.target, at: nowIso(), by: me.name, reversal_of: batchId }] } : { target: 0, reversed: true }]);
  }
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    for (const [coll, id, data] of ops.slice(i, i + 400)) b.update(doc(db, path(bankId, coll), id), data);
    await b.commit();
  }
  await setDoc(doc(db, path(bankId, 'batches'), revId), {
    register: batch.register, status: 'Posted', type: 'Reversal', reverses: batchId, reason, approval_id: approvalId || '', file_name: `Reversal of ${batch.file_name || batchId}`,
    stats: { count: ops.length }, uploaded_by: me.name, uploaded_by_uid: me.uid, uploaded_at: nowIso(), confirmed_by: me.name, confirmed_at: nowIso(),
  });
  await updateDoc(doc(db, path(bankId, 'batches'), batchId), { status: 'Reversed', reversed_by: revId, reversed_at: nowIso(), reversal_reason: reason });
  await audit(bankId, me, 'batch_reversed', batchId, { reversal_batch: revId, records: ops.length, reason });
}

/* ── Bank statements ── */
export function statementLines(model, month) {
  const end = monthEnd(month);
  return model.policies
    .filter(p => !p.pmf_statement && Math.abs(p.pmf_due) > 0.005 && ((p.pmf_eligible && p.eligible_date && p.eligible_date <= end) || p.pmf_due < 0))
    .map(p => ({ policy_id: p.id, policy_no: p.policy_no, customer: p.customer, insurer: p.insurer, branch: p.branch, class: p.class, net_basic: p.net_basic,
      pmf_alloc: p.pmf_alloc, paid_before: p.pmf_paid, amount: p.pmf_due, kind: p.pmf_due < 0 ? 'Clawback / offset' : 'Allocation', eligible_date: p.eligible_date || '' }));
}
// Reconciliation checks before a statement may be approved (statement checks)
export function statementBlock(ctx, s) {
  if (!s) return 'Statement not found';
  if (s.state !== 'Pending') return 'Only a Pending statement can be approved';
  const end = monthEnd(s.month);
  const open = (ctx.raw.exceptions || []).filter(e => e.status === 'Open' && (!e.date || e.date <= end));
  if (open.length) return `${open.length} open reconciliation exception(s) up to ${end} must be resolved first`;
  const total = round2((s.lines || []).reduce((a, l) => a + num(l.amount), 0));
  if (Math.abs(total - num(s.total)) > 0.01) return 'Statement total does not equal its lines';
  return '';
}

/* ── config (admin) ── */
export async function saveConfig(ctx, next, note) {
  const { bankId, me, config } = ctx;
  const changed = Object.keys(next).filter(k => JSON.stringify(next[k]) !== JSON.stringify(config[k]));
  // mergeFields: each setting passed is replaced whole (a deep merge would keep removed labels / orders); other settings untouched
  await setDoc(doc(db, 'banca', bankId), { ...next, updated_at: nowIso(), updated_by: me.name }, { mergeFields: [...Object.keys(next), 'updated_at', 'updated_by'] });
  await audit(bankId, me, 'config_changed', bankId, { keys: changed, note: note || '', before: Object.fromEntries(changed.map(k => [k, config[k] ?? null])), after: Object.fromEntries(changed.map(k => [k, next[k]])) });
}

/* generic writes used by screens */
export const setRecord = (bankId, coll, id, data) => setDoc(doc(db, path(bankId, coll), id), JSON.parse(JSON.stringify(data)), { merge: true });
export const updateRecord = (bankId, coll, id, data) => updateDoc(doc(db, path(bankId, coll), id), data);
export { nowIso };

/* ── backup & restore (never overwrites, never deletes) ── */
export const BACKUP_COLLS = [...COLLS, 'audit'];
export async function exportBank(ctx) {
  const { bankId, config } = ctx;
  const dump = { format: 'insuresaas-banca-backup-v1', bank: bankId, exported_at: nowIso(), config, collections: {} };
  for (const c of BACKUP_COLLS) {
    const s = await getDocs(collection(db, path(bankId, c)));
    dump.collections[c] = s.docs.map(d => ({ ...d.data(), id: d.id }));
  }
  return dump;
}
// Adds back only records whose id is missing now. Existing records are never touched;
// the audit trail is not replayed (history stays in the backup file).
export function restorePlan(ctx, dump) {
  if (!dump || dump.format !== 'insuresaas-banca-backup-v1') throw new Error('Not a Bancassurance backup file (BANCA_<BANK>.json from the Admin Panel backup).');
  if (dump.bank !== ctx.bankId) throw new Error(`This backup is for bank "${dump.bank}", not "${ctx.bankId}".`);
  const plan = {};
  for (const c of COLLS) {
    const have = new Set((ctx.raw[c] || []).map(x => x.id));
    plan[c] = (dump.collections?.[c] || []).filter(x => x && x.id && !have.has(x.id));
  }
  return plan;
}
export async function restoreMissing(ctx, plan, fileName) {
  const { bankId, me } = ctx;
  const jobs = [];
  for (const [c, list] of Object.entries(plan)) for (const x of list) { const { id, ...data } = x; jobs.push([c, id, data]); }
  let written = 0;
  for (let i = 0; i < jobs.length; i += 400) {
    const chunk = jobs.slice(i, i + 400);
    // re-check right before writing: a record created since the screen loaded is skipped, never overwritten
    const exists = await Promise.all(chunk.map(([c, id]) => getDoc(doc(db, path(bankId, c), id)).then(x => x.exists())));
    const b = writeBatch(db); let n = 0;
    chunk.forEach(([c, id, data], k) => { if (!exists[k]) { b.set(doc(db, path(bankId, c), id), JSON.parse(JSON.stringify(data))); n++; } });
    if (n) await b.commit();
    written += n;
  }
  await audit(bankId, me, 'backup_restore', bankId, { file: fileName, restored: Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.length])) });
  return written;
}
