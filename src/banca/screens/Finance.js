// S-19 Bank statements & payments · Approvals dashboard · S-21 Targets
import React, { useMemo, useState } from 'react';
import { openFile } from '../../storage';
import { useBanca, newId, setRecord, requestApproval, approvalBlock, decideApproval, statementLines, storeLibraryFile, audit, nowIso, APPROVAL_LABELS } from '../store';
import { DataGrid, StatusChip, Kpi, SectionTitle, T, btnPrimary, btnOutline, exportExcel, exportPdf } from '../ui';
import { lkr, round2, num, monthOf, todayYmd, monthLabel, workingDaysBetween, gwpByMonth, norm, hashKey } from '../core';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';

const STMT_COLS = [
  { key: 'policy_no', label: 'Policy No' }, { key: 'customer', label: 'Client Name' }, { key: 'insurer', label: 'Insurer' }, { key: 'branch', label: 'Branch' }, { key: 'class', label: 'Class' },
  { key: 'net_basic', label: 'Net Basic', type: 'money' }, { key: 'pmf_alloc', label: 'Bank Allocation', type: 'money' }, { key: 'paid_before', label: 'Previously Paid', type: 'money' },
  { key: 'kind', label: 'Line' }, { key: 'eligible_date', label: 'Eligible On' }, { key: 'amount', label: 'Payable This Statement', type: 'money' },
];

export function Statements() {
  const ctx = useBanca();
  const { raw, model, bank, me, bankId, config, reload } = ctx;
  const [month, setMonth] = useState(monthOf(todayYmd()));
  const [sel, setSel] = useState(null);
  const [pay, setPay] = useState(null);
  const [revise, setRevise] = useState(null); const [reviseReason, setReviseReason] = useState('');
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const stmts = useMemo(() => (raw.statements || []).map(s => {
    const pays = (raw.pmf_payments || []).filter(p => p.statement_id === s.id);
    return { ...s, total: round2(num(s.total)), lines_n: (s.lines || []).length, pay_state: pays.find(p => p.status === 'Approved') ? 'Paid' : pays.find(p => p.status === 'Pending') ? 'Payment pending' : '' };
  }).sort((a, b) => String(b.month).localeCompare(String(a.month)) || (b.version || 0) - (a.version || 0)), [raw]);
  const preview = useMemo(() => statementLines(model, month), [model, month]);
  const liveForMonth = stmts.find(s => s.month === month && ['Draft', 'Pending'].includes(s.state));
  const act = async (fn) => { setBusy(true); setMsg(''); try { await fn(); await reload(); } catch (e) { setMsg(e.message); } setBusy(false); };

  const generate = () => act(async () => {
    if (!preview.length) throw new Error('Nothing payable for this month — no eligible, unpaid policies.');
    const id = newId(bankId, 'statements');
    const version = stmts.filter(s => s.month === month).reduce((m, s) => Math.max(m, s.version || 0), 0) + 1;
    const total = round2(preview.reduce((s, l) => s + num(l.amount), 0));
    await setRecord(bankId, 'statements', id, { month, version, state: 'Draft', lines: preview, total, created_by: me.name, created_by_uid: me.uid, created_at: nowIso() });
    await audit(bankId, me, 'statement_generated', id, { month, version, total, lines: preview.length });
  });
  const submit = (s) => act(async () => {
    await setRecord(bankId, 'statements', s.id, { state: 'Pending', submitted_by: me.name, submitted_at: nowIso() });
    await requestApproval(ctx, { category: 'statement', ref_id: s.id, amount: s.total, title: `${bank.name} statement ${monthLabel(s.month)} v${s.version}` });
  });
  const doRevise = () => act(async () => {
    const s = revise; if (!reviseReason.trim()) throw new Error('Reason required');
    const id = newId(bankId, 'statements');
    // a revision re-derives the lines from live data for the same month, excluding the superseded version's own lines
    await setRecord(bankId, 'statements', s.id, { state: 'Superseded', superseded_by: id, updated_at: nowIso() });
    const fresh = statementLines({ ...model, policies: model.policies.map(p => (p.pmf_statement?.statement_id === s.id ? { ...p, pmf_statement: null } : p)) }, s.month);
    await setRecord(bankId, 'statements', id, { month: s.month, version: (s.version || 1) + 1, state: 'Draft', revision_of: s.id, revision_reason: reviseReason, lines: fresh, total: round2(fresh.reduce((a, l) => a + num(l.amount), 0)), created_by: me.name, created_by_uid: me.uid, created_at: nowIso() });
    await audit(bankId, me, 'statement_revised', id, { previous: s.id, reason: reviseReason });
    setRevise(null); setReviseReason('');
  });
  const exp = (s, kind) => (kind === 'xlsx' ? exportExcel : exportPdf)({ title: `Bank Commission Statement ${monthLabel(s.month)} — v${s.version} (${s.state})`, bankName: bank.name, columns: STMT_COLS, rows: s.lines || [], filtersText: `Month ${s.month}`, groupKey: 'insurer', version: `v${s.version} ${s.state}`, fileName: `${bank.name}_Statement_${s.month}_v${s.version}_${s.state}` });

  return (<>
    <SectionTitle sub="Monthly Bank commission statement: eligible, unpaid policies plus clawback offsets. Draft → Pending (submitted) → Approved by a different person. Approved statements are immutable; a change creates a Revised version. Approval never means paid — payment is recorded separately with proof.">Bank Statements &amp; Payments</SectionTitle>
    {!config.payment_method_cleared && <Alert severity="warning" sx={{ mb: 1.5 }}>Legal hold: recording live Bank payments is disabled until an administrator confirms the payment structure is legally cleared.</Alert>}
    <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: '12px', border: `1px solid ${T.line}`, mb: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap">
        <TextField size="small" type="month" label="Statement month" value={month} onChange={e => setMonth(e.target.value)} InputLabelProps={{ shrink: true }} />
        <Typography sx={{ fontSize: 13 }}>{preview.length} line(s) · LKR {lkr(preview.reduce((s, l) => s + num(l.amount), 0))} payable</Typography>
        <Button sx={btnPrimary} disabled={busy || !!liveForMonth || !preview.length} onClick={generate}>Generate draft</Button>
        {liveForMonth && <Typography sx={{ fontSize: 12, color: T.amber }}>A {liveForMonth.state} statement already exists for {monthLabel(month)}.</Typography>}
      </Stack>
      {msg && <Alert severity="error" sx={{ mt: 1.5 }}>{msg}</Alert>}
    </Box>
    <DataGrid title="Statements" bankName={bank.name} rows={stmts} filterKeys={['state']} onRowClick={setSel} exportName={`${bank.name}_Statements`} columns={[
      { key: 'month', label: 'Month', render: r => monthLabel(r.month) }, { key: 'version', label: 'Version', type: 'int' }, { key: 'state', label: 'State', render: r => <StatusChip value={r.state} /> },
      { key: 'lines_n', label: 'Lines', type: 'int' }, { key: 'total', label: 'Total', type: 'money' }, { key: 'pay_state', label: 'Payment', render: r => <StatusChip value={r.pay_state} /> },
      { key: 'created_by', label: 'Prepared by' }, { key: 'approved_by', label: 'Approved by' },
      { key: 'act', label: '', noExport: true, noSort: true, render: r => (
        <Stack direction="row" spacing={0.5} onClick={e => e.stopPropagation()}>
          {r.state === 'Draft' && <Button size="small" disabled={busy} onClick={() => submit(r)} sx={{ textTransform: 'none' }}>Submit</Button>}
          {r.state === 'Approved' && !r.pay_state && <Button size="small" disabled={!config.payment_method_cleared} onClick={() => setPay(r)} sx={{ textTransform: 'none' }}>Record payment</Button>}
          {r.state === 'Approved' && !r.pay_state && <Button size="small" onClick={() => setRevise(r)} sx={{ textTransform: 'none' }}>Revise</Button>}
          <Button size="small" onClick={() => exp(r, 'pdf')} sx={{ textTransform: 'none' }}>PDF</Button>
          <Button size="small" onClick={() => exp(r, 'xlsx')} sx={{ textTransform: 'none' }}>Excel</Button>
        </Stack>) },
    ]} />
    <Dialog open={!!sel} onClose={() => setSel(null)} maxWidth="lg" fullWidth>
      {sel && <><DialogTitle sx={{ fontWeight: 800 }}>{monthLabel(sel.month)} statement v{sel.version} — <StatusChip value={sel.state} /></DialogTitle>
        <DialogContent dividers>
          {sel.revision_of && <Alert severity="info" sx={{ mb: 1 }}>Revision of {sel.revision_of}: {sel.revision_reason}</Alert>}
          <DataGrid title={`Statement ${sel.month} v${sel.version}`} bankName={bank.name} rows={sel.lines || []} columns={STMT_COLS} />
          {(raw.pmf_payments || []).filter(p => p.statement_id === sel.id).map(p => (
            <Alert key={p.id} severity={p.status === 'Approved' ? 'success' : p.status === 'Rejected' ? 'error' : 'warning'} sx={{ mt: 1 }}>
              Payment LKR {lkr(p.amount)} on {p.date} ref {p.reference} — {p.status}{p.proof_url && <Button size="small" onClick={() => openFile(p.proof_url)} sx={{ ml: 1, textTransform: 'none' }}>proof</Button>}
            </Alert>))}
        </DialogContent><DialogActions><Button onClick={() => setSel(null)}>Close</Button></DialogActions></>}
    </Dialog>
    <PaymentDialog stmt={pay} ctx={ctx} onClose={() => setPay(null)} onDone={() => { setPay(null); reload(); }} />
    <Dialog open={!!revise} onClose={() => setRevise(null)} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Revise approved statement</DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: 13, mb: 1.5 }}>The approved version stays viewable and is marked Superseded. A new Draft version is built from current data and goes through approval again.</Typography>
        <TextField fullWidth multiline minRows={2} label="Authorised reason for revision *" value={reviseReason} onChange={e => setReviseReason(e.target.value)} />
      </DialogContent>
      <DialogActions><Button onClick={() => setRevise(null)}>Cancel</Button><Button sx={btnPrimary} disabled={!reviseReason.trim() || busy} onClick={doRevise}>Create revised draft</Button></DialogActions>
    </Dialog>
  </>);
}
function PaymentDialog({ stmt, ctx, onClose, onDone }) {
  const [amount, setAmount] = useState(''); const [date, setDate] = useState(todayYmd()); const [ref, setRef] = useState(''); const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  React.useEffect(() => { if (stmt) { setAmount(String(stmt.total)); setProof(null); setRef(''); setErr(''); } }, [stmt]);
  if (!stmt) return null;
  const go = async () => {
    setBusy(true); setErr('');
    try {
      if (Math.abs(num(amount) - num(stmt.total)) > 0.01) throw new Error('Payment must equal the approved statement total. Differences go on the next statement as offsets.');
      const id = newId(ctx.bankId, 'pmf_payments');
      const f = await storeLibraryFile(ctx, proof, { library: 'pmf_payment', insurer: '', from: stmt.month + '-01', to: stmt.month + '-28', note: `Statement ${stmt.month} v${stmt.version}`, ref_ids: [stmt.id, id] });
      await setRecord(ctx.bankId, 'pmf_payments', id, { statement_id: stmt.id, month: stmt.month, amount: round2(num(amount)), date, reference: ref, proof_url: f.url, proof_file_id: f.id, status: 'Pending', recorded_by: ctx.me.name, recorded_by_uid: ctx.me.uid, recorded_at: nowIso() });
      await requestApproval(ctx, { category: 'pmf_payment', ref_id: id, amount, title: `Bank payment ${monthLabel(stmt.month)} v${stmt.version} — ref ${ref}`, payload: { statement_id: stmt.id } });
      onDone();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Dialog open={!!stmt} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Record Bank payment — {monthLabel(stmt.month)} v{stmt.version}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <TextField size="small" type="number" label="Amount paid (LKR)" value={amount} onChange={e => setAmount(e.target.value)} helperText={`Statement total LKR ${lkr(stmt.total)}`} />
          <TextField size="small" type="date" label="Payment date" value={date} onChange={e => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField size="small" label="Bank / transfer reference *" value={ref} onChange={e => setRef(e.target.value)} />
          <Button component="label" variant="outlined" sx={btnOutline}>{proof ? proof.name : 'Attach proof of payment *'}<input hidden type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => setProof(e.target.files?.[0] || null)} /></Button>
        </Stack>
        <Typography sx={{ fontSize: 12, color: T.muted, mt: 1.5 }}>Recorded as Pending; a different manager/admin approves it before the statement shows as Paid.</Typography>
        {busy && <LinearProgress sx={{ mt: 1 }} />}{err && <Alert severity="error" sx={{ mt: 1.5 }}>{err}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={busy}>Cancel</Button><Button sx={btnPrimary} disabled={!proof || !ref.trim() || busy} onClick={go}>Submit for approval</Button></DialogActions>
    </Dialog>
  );
}

/* ── Approvals dashboard ── */
export function Approvals() {
  const ctx = useBanca();
  const { raw, bank, me, config, reload } = ctx;
  const [tab, setTab] = useState(0);
  const [decide, setDecide] = useState(null); const [reason, setReason] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const today = todayYmd();
  const all = useMemo(() => (raw.approvals || []).map(a => {
    const age = workingDaysBetween(String(a.created_at).slice(0, 10), today, config.holidays || []);
    return { ...a, created: String(a.created_at).slice(0, 16).replace('T', ' '), category_label: APPROVAL_LABELS[a.category] || a.category, age, overdue: a.status === 'Pending' && age > num(config.alert_overdue_days), block: approvalBlock(ctx, a) };
  }).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [raw, config, today, ctx]);
  const mine = all.filter(a => a.status === 'Pending' && !a.block);
  const pending = all.filter(a => a.status === 'Pending');
  const done = all.filter(a => a.status !== 'Pending');
  const rows = tab === 0 ? mine : tab === 1 ? pending : done;
  const byCat = Object.entries(pending.reduce((m, a) => { m[a.category_label] = m[a.category_label] || { n: 0, v: 0 }; m[a.category_label].n++; m[a.category_label].v += num(a.amount); return m; }, {}));
  const go = async (approve) => {
    setBusy(true); setErr('');
    try { await decideApproval(ctx, decide, approve, reason); setDecide(null); setReason(''); await reload(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (<>
    <SectionTitle sub="Maker-checker: the person who prepared an item can never approve it. Managers approve up to the configured limit; above it needs an admin. Turnaround counts working days, excluding weekends and the holiday calendar.">Approvals</SectionTitle>
    <Stack direction="row" spacing={1.2} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
      <Kpi label="My approvals" value={mine.length} color={mine.length ? T.amber : T.green} />
      <Kpi label="Overdue" value={pending.filter(a => a.overdue).length} sub={`> ${config.alert_overdue_days} working days`} color={pending.some(a => a.overdue) ? T.danger : undefined} />
      {byCat.map(([k, v]) => <Kpi key={k} label={k} value={v.n} sub={`LKR ${lkr(v.v)}`} />)}
    </Stack>
    <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1, '& .MuiTab-root': { textTransform: 'none', fontWeight: 700 } }}>
      <Tab label={`My approvals (${mine.length})`} /><Tab label={`All pending (${pending.length})`} /><Tab label={`History (${done.length})`} />
    </Tabs>
    <DataGrid title="Approvals" bankName={bank.name} rows={rows} filterKeys={['category_label', 'status']} onRowClick={(a) => a.status === 'Pending' && setDecide(a)} exportName={`${bank.name}_Approvals`} columns={[
      { key: 'created', label: 'Requested' }, { key: 'category_label', label: 'Category' }, { key: 'title', label: 'Item', wrap: true }, { key: 'amount', label: 'Amount', type: 'money' },
      { key: 'maker_name', label: 'Maker' }, { key: 'age', label: 'Working days', type: 'int' },
      { key: 'flags', label: 'Flags', noSort: true, render: r => <>{r.overdue && <Chip size="small" label="Overdue" color="error" sx={{ mr: 0.5, height: 20 }} />}{r.possible_split && <Chip size="small" label="Possible split" color="warning" sx={{ height: 20 }} />}</>, exportValue: r => [r.overdue && 'Overdue', r.possible_split && 'Possible split'].filter(Boolean).join(', ') },
      { key: 'status', label: 'Status', render: r => <StatusChip value={r.status} /> }, { key: 'decided_by_name', label: 'Decided by' }, { key: 'reason', label: 'Reason', wrap: true },
    ]} />
    <Dialog open={!!decide} onClose={() => setDecide(null)} maxWidth="sm" fullWidth>
      {decide && <><DialogTitle sx={{ fontWeight: 800 }}>{decide.category_label}</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ fontWeight: 700 }}>{decide.title}</Typography>
          <Typography sx={{ fontSize: 13, color: T.muted, mb: 1.5 }}>LKR {lkr(decide.amount)} · requested by {decide.maker_name} on {decide.created}</Typography>
          {decide.payload?.reason && <Alert severity="info" sx={{ mb: 1 }}>Reason given: {decide.payload.reason}</Alert>}
          {decide.possible_split && <Alert severity="warning" sx={{ mb: 1 }}>Several requests just under the approval limit from the same maker — check for splitting.</Alert>}
          {decide.block && <Alert severity="error" sx={{ mb: 1 }}>{decide.block}</Alert>}
          <TextField fullWidth multiline minRows={2} label="Reason / comment (required to reject)" value={reason} onChange={e => setReason(e.target.value)} />
          {busy && <LinearProgress sx={{ mt: 1 }} />}{err && <Alert severity="error" sx={{ mt: 1 }}>{err}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecide(null)}>Close</Button>
          <Button color="error" disabled={!!decide.block || busy || !reason.trim()} onClick={() => go(false)}>Reject</Button>
          <Button sx={btnPrimary} disabled={!!decide.block || busy} onClick={() => go(true)}>Approve</Button>
        </DialogActions></>}
    </Dialog>
    <Typography sx={{ fontSize: 11.5, color: T.muted, mt: 1 }}>Signed in as {me.name} ({me.role}). Delegations and limits are set in Settings.</Typography>
  </>);
}

/* ── S-21 Targets: actual vs target ── */
export function Targets({ goUpload }) {
  const ctx = useBanca();
  const { raw, model, bank, me, bankId, reload } = ctx;
  const [month, setMonth] = useState(monthOf(todayYmd()));
  const [edit, setEdit] = useState(null);
  const year = month.slice(0, 4);
  const targets = (raw.targets || []).filter(t => !t.reversed);
  const actual = (m, branch, cls, ytd) => round2(model.txns.filter(t => (ytd ? (t.gwp_month >= `${year}-01` && t.gwp_month <= m) : t.gwp_month === m) && (!branch || norm(t.branch) === norm(branch)) && (!cls || norm(t.class) === norm(cls))).reduce((s, t) => s + num(t.total), 0));
  const split = (m, branch, cls) => { const g = gwpByMonth(model.txns.filter(t => t.gwp_month === m && (!branch || norm(t.branch) === norm(branch)) && (!cls || norm(t.class) === norm(cls)))); return g[0] || { new: 0, renewal: 0, endorsement: 0 }; };
  const rows = targets.filter(t => t.month === month).map(t => {
    const a = actual(month, t.branch, t.class, false), sp = split(month, t.branch, t.class);
    const ytdT = round2(targets.filter(x => x.month >= `${year}-01` && x.month <= month && norm(x.branch) === norm(t.branch) && norm(x.class) === norm(t.class)).reduce((s, x) => s + num(x.target), 0));
    const ytdA = actual(month, t.branch, t.class, true);
    return { ...t, branch_l: t.branch || 'All', class_l: t.class || 'All', actual: a, nb: sp.new, ren: sp.renewal, endo: sp.endorsement, gap: round2(a - num(t.target)), gap_pct: num(t.target) ? round2((a - num(t.target)) / num(t.target) * 100) : null, ytd_target: ytdT, ytd_actual: ytdA, ytd_gap: round2(ytdA - ytdT) };
  });
  const save = async () => {
    const b = edit.branch.trim(), c = edit.class.trim();
    const id = 'TG' + hashKey(`${edit.month}|${norm(b)}|${norm(c)}`).toUpperCase();
    const prev = targets.find(t => t.id === id);
    await setRecord(bankId, 'targets', id, { month: edit.month, branch: b, class: c, target: round2(num(edit.target)), version: (prev?.version || 0) + 1,
      history: [...(prev?.history || []), { target: round2(num(edit.target)), previous: prev ? prev.target : null, at: nowIso(), by: me.name }], updated_by: me.name, updated_at: nowIso() });
    await audit(bankId, me, 'target_changed', id, { before: prev?.target ?? null, after: num(edit.target) });
    setEdit(null); reload();
  };
  return (<>
    <SectionTitle sub="Monthly net GWP targets by branch and class (form or Excel upload). Actual = net GWP by recognition month; new business, renewals and net endorsements shown separately. Every change keeps its history."
      right={<Stack direction="row" spacing={1}><Button sx={btnOutline} variant="outlined" onClick={() => goUpload('targets')}>Upload targets</Button>{me.role === 'admin' && <Button sx={btnPrimary} onClick={() => setEdit({ month, branch: '', class: '', target: '' })}>Add / change target</Button>}</Stack>}>GWP Targets</SectionTitle>
    <TextField size="small" type="month" label="Month" value={month} onChange={e => setMonth(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ mb: 1.5 }} />
    <DataGrid title={`Targets ${month}`} bankName={bank.name} rows={rows} filterKeys={['branch_l', 'class_l']} exportName={`${bank.name}_Targets_${month}`} onRowClick={(r) => me.role === 'admin' && setEdit({ month: r.month, branch: r.branch, class: r.class, target: String(r.target) })} columns={[
      { key: 'branch_l', label: 'Branch' }, { key: 'class_l', label: 'Class' }, { key: 'target', label: 'Target', type: 'money' }, { key: 'actual', label: 'Actual net GWP', type: 'money' },
      { key: 'nb', label: 'New business', type: 'money' }, { key: 'ren', label: 'Renewals', type: 'money' }, { key: 'endo', label: 'Net endorsements', type: 'money' },
      { key: 'gap', label: 'Gap', type: 'money' }, { key: 'gap_pct', label: 'Gap %', type: 'pct' }, { key: 'ytd_target', label: 'YTD target', type: 'money' }, { key: 'ytd_actual', label: 'YTD actual', type: 'money' }, { key: 'ytd_gap', label: 'YTD gap', type: 'money' }, { key: 'version', label: 'Version', type: 'int' },
    ]} />
    <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="xs" fullWidth>
      {edit && <><DialogTitle sx={{ fontWeight: 800 }}>Set target</DialogTitle><DialogContent dividers><Stack spacing={1.5}>
        <TextField size="small" type="month" label="Month" value={edit.month} onChange={e => setEdit({ ...edit, month: e.target.value })} InputLabelProps={{ shrink: true }} />
        <TextField size="small" select label="Branch (blank = all)" value={edit.branch} onChange={e => setEdit({ ...edit, branch: e.target.value })}>{['', ...new Set(model.policies.map(p => p.branch).filter(Boolean))].map(b => <MenuItem key={b} value={b}>{b || 'All'}</MenuItem>)}</TextField>
        <TextField size="small" select label="Class (blank = all)" value={edit.class} onChange={e => setEdit({ ...edit, class: e.target.value })}>{['', ...new Set(model.policies.map(p => p.class).filter(Boolean))].map(b => <MenuItem key={b} value={b}>{b || 'All'}</MenuItem>)}</TextField>
        <TextField size="small" type="number" label="Net GWP target (LKR)" value={edit.target} onChange={e => setEdit({ ...edit, target: e.target.value })} />
      </Stack></DialogContent><DialogActions><Button onClick={() => setEdit(null)}>Cancel</Button><Button sx={btnPrimary} disabled={!edit.month || edit.target === ''} onClick={save}>Save</Button></DialogActions></>}
    </Dialog>
  </>);
}
