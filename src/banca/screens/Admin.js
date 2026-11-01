// S-25 Bank module settings · S-26 Audit search
import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useBanca, saveConfig, loadAudit, audit, nowIso, exportBank, restorePlan, restoreMissing } from '../store';
import { saveAs } from 'file-saver';
import { DataGrid, SectionTitle, T, btnPrimary, btnOutline } from '../ui';
import { num, todayYmd } from '../core';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

const Card = ({ title, children, sub }) => (
  <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: '12px', border: `1px solid ${T.line}`, mb: 2 }}>
    <Typography sx={{ fontWeight: 800, fontSize: 14 }}>{title}</Typography>
    {sub && <Typography sx={{ fontSize: 12, color: T.muted, mb: 1.2 }}>{sub}</Typography>}
    {children}
  </Box>
);

function ListEditor({ label, values, onChange, disabled, suggestions = [] }) {
  const [v, setV] = useState('');
  const add = (x) => { const s = String(x || '').trim(); if (s && !values.some(y => y.toLowerCase() === s.toLowerCase())) onChange([...values, s].sort()); setV(''); };
  const missing = suggestions.filter(s => s && !values.some(y => y.toLowerCase() === String(s).toLowerCase()));
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, mb: 0.5 }}>{label} ({values.length})</Typography>
      <Stack direction="row" spacing={0.6} useFlexGap flexWrap="wrap">
        {values.map(x => <Chip key={x} size="small" label={x} onDelete={disabled ? undefined : () => onChange(values.filter(y => y !== x))} />)}
      </Stack>
      {!disabled && <Stack direction="row" spacing={1} sx={{ mt: 0.8 }}>
        <TextField size="small" placeholder={`Add ${label.toLowerCase().replace(/s$/, '')}`} value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(v); }} />
        <Button size="small" onClick={() => add(v)}>Add</Button>
        {missing.length > 0 && <Button size="small" onClick={() => onChange([...values, ...missing].sort())}>Add {missing.length} from data</Button>}
      </Stack>}
    </Box>
  );
}

export function Settings() {
  const ctx = useBanca();
  const { config, me, model, reload, bank } = ctx;
  const isAdmin = me.role === 'admin';
  const [c, setC] = useState(config);
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const [legal, setLegal] = useState(false); const [legalRef, setLegalRef] = useState('');
  useEffect(() => { setC(config); }, [config]);
  useEffect(() => { if (isAdmin) getDocs(collection(db, 'users')).then(s => setUsers(s.docs.map(d => ({ uid: d.id, ...d.data() })))).catch(() => {}); }, [isAdmin]);
  const set = (k) => (e) => setC({ ...c, [k]: e.target.type === 'number' ? e.target.value : e.target.value });
  const fromData = (k) => [...new Set(model.policies.map(p => p[k]).filter(Boolean))];
  const save = async () => {
    setBusy(true); setMsg('');
    try {
      const clean = { ...c, pmf_pct: num(c.pmf_pct), tolerance: num(c.tolerance), approval_limit_manager: num(c.approval_limit_manager), retention_years: num(c.retention_years), archive_after_years: num(c.archive_after_years),
        alert_open_exceptions: num(c.alert_open_exceptions), alert_overdue_days: num(c.alert_overdue_days), rates: (c.rates || []).map(r => ({ ...r, basic: num(r.basic), srcc: num(r.srcc), tc: num(r.tc) })) };
      if (clean.pmf_pct < 0 || clean.pmf_pct > 100) throw new Error('Bank % must be between 0 and 100');
      if (clean.retention_years < 6) throw new Error('Retention cannot be shorter than the statutory minimum (6 years assumed — confirm with legal)');
      await saveConfig(ctx, clean, 'Settings screen'); setMsg('Saved.'); reload();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  const setRate = (i, k, v) => setC({ ...c, rates: c.rates.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });
  const approvers = users.filter(u => ['admin', 'manager', 'employee'].includes(u.role));
  return (<>
    <SectionTitle sub={`Configuration for the ${bank.name} module only — invisible to other bank modules. Every change is logged with before / after values.${isAdmin ? '' : ' View only: an administrator changes these.'}`}
      right={isAdmin && <Button sx={btnPrimary} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</Button>}>Bank Module Settings</SectionTitle>
    {msg && <Alert severity={msg === 'Saved.' ? 'success' : 'error'} sx={{ mb: 1.5 }}>{msg}</Alert>}
    <Card title="Commission split & controls">
      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
        <TextField size="small" type="number" label="Bank allocation % of net basic premium" value={c.pmf_pct} onChange={set('pmf_pct')} disabled={!isAdmin} sx={{ width: 270 }} helperText="12% is the approved example — use the signed agreement" />
        <TextField size="small" type="number" label="Commission tolerance (LKR)" value={c.tolerance} onChange={set('tolerance')} disabled={!isAdmin} sx={{ width: 220 }} helperText="Receipts within this of expected count as fully received" />
        <TextField size="small" type="number" label="Manager approval limit (LKR)" value={c.approval_limit_manager} onChange={set('approval_limit_manager')} disabled={!isAdmin} sx={{ width: 230 }} helperText="Above this an admin must approve" />
        <TextField size="small" type="number" label="Alert: open exceptions ≥" value={c.alert_open_exceptions} onChange={set('alert_open_exceptions')} disabled={!isAdmin} sx={{ width: 190 }} />
        <TextField size="small" type="number" label="Approvals overdue after (working days)" value={c.alert_overdue_days} onChange={set('alert_overdue_days')} disabled={!isAdmin} sx={{ width: 260 }} />
      </Stack>
      <Stack direction="row" spacing={3} sx={{ mt: 1 }}>
        <FormControlLabel control={<Switch checked={!!c.strict_masters} onChange={e => setC({ ...c, strict_masters: e.target.checked })} disabled={!isAdmin} />} label="Strict masters (reject unknown branch / insurer / class on upload)" />
      </Stack>
      <Box sx={{ mt: 1, p: 1.5, borderRadius: '10px', bgcolor: c.payment_method_cleared ? 'rgba(5,150,105,0.06)' : 'rgba(220,38,38,0.05)' }}>
        <Typography sx={{ fontWeight: 800, fontSize: 13 }}>Legal hold — Bank payment method {c.payment_method_cleared ? 'CLEARED' : 'NOT CLEARED'}</Typography>
        <Typography sx={{ fontSize: 12, color: T.muted }}>The commission-sharing / cost-reimbursement structure needs independent Sri Lankan legal and regulatory validation before live payments. While not cleared, Bank payments cannot be recorded.</Typography>
        {c.payment_method_cleared && <Typography sx={{ fontSize: 12, mt: 0.5 }}>Cleared by {c.payment_cleared_by} on {String(c.payment_cleared_at || '').slice(0, 10)} — ref: {c.payment_clearance_ref}</Typography>}
        {isAdmin && (c.payment_method_cleared
          ? <Button size="small" color="error" sx={{ mt: 1, textTransform: 'none' }} onClick={() => setC({ ...c, payment_method_cleared: false })}>Re-impose legal hold (then Save)</Button>
          : <Button size="small" sx={{ mt: 1, textTransform: 'none' }} onClick={() => setLegal(true)}>Record legal clearance…</Button>)}
      </Box>
    </Card>
    <Card title="Insurer commission rate schedule" sub="Expected commission = Basic × basic rate + SRCC × SRCC rate + TC × TC rate. The most specific matching row (insurer, then class) with the latest 'from' date on or before the transaction date applies. To change a rate, add a new row with a later 'from' date so history is kept.">
      <Table size="small">
        <TableHead><TableRow>{['Insurer (* = any)', 'Class (* = any)', 'Basic %', 'SRCC %', 'TC %', 'Effective from', ''].map(h => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
        <TableBody>{(c.rates || []).map((r, i) => (
          <TableRow key={r.id || i}>
            <TableCell><TextField size="small" select value={r.insurer} onChange={e => setRate(i, 'insurer', e.target.value)} disabled={!isAdmin} sx={{ minWidth: 160 }}>{['*', ...new Set([...(c.insurers || []), ...fromData('insurer'), r.insurer])].filter(Boolean).map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField></TableCell>
            <TableCell><TextField size="small" select value={r.class} onChange={e => setRate(i, 'class', e.target.value)} disabled={!isAdmin} sx={{ minWidth: 140 }}>{['*', ...new Set([...(c.classes || []), ...fromData('class'), r.class])].filter(Boolean).map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}</TextField></TableCell>
            {['basic', 'srcc', 'tc'].map(k => <TableCell key={k}><TextField size="small" type="number" value={r[k]} onChange={e => setRate(i, k, e.target.value)} disabled={!isAdmin} sx={{ width: 90 }} /></TableCell>)}
            <TableCell><TextField size="small" type="date" value={r.from || ''} onChange={e => setRate(i, 'from', e.target.value)} disabled={!isAdmin} /></TableCell>
            <TableCell>{isAdmin && <IconButton size="small" onClick={() => setC({ ...c, rates: c.rates.filter((_, j) => j !== i) })}><DeleteOutlineIcon fontSize="small" /></IconButton>}</TableCell>
          </TableRow>))}</TableBody>
      </Table>
      {isAdmin && <Button size="small" startIcon={<AddIcon />} sx={{ mt: 1, textTransform: 'none' }} onClick={() => setC({ ...c, rates: [...(c.rates || []), { id: `r${Date.now()}`, insurer: '*', class: '*', basic: 0, srcc: 0, tc: 0, from: todayYmd() }] })}>Add rate row</Button>}
    </Card>
    <Card title="Masters" sub="Controlled lists used to validate uploads (warnings, or rejections when strict masters is on).">
      <ListEditor label="Branches" values={c.branches || []} onChange={v => setC({ ...c, branches: v })} disabled={!isAdmin} suggestions={fromData('branch')} />
      <ListEditor label="Insurers" values={c.insurers || []} onChange={v => setC({ ...c, insurers: v })} disabled={!isAdmin} suggestions={fromData('insurer')} />
      <ListEditor label="Classes" values={c.classes || []} onChange={v => setC({ ...c, classes: v })} disabled={!isAdmin} suggestions={fromData('class')} />
    </Card>
    <Card title="Retention & archive" sub="Configurable per bank, never below the statutory minimum. Archived policies stay searchable; nothing is hard-deleted.">
      <Stack direction="row" spacing={1.5}>
        <TextField size="small" type="number" label="Retention (years)" value={c.retention_years} onChange={set('retention_years')} disabled={!isAdmin} />
        <TextField size="small" type="number" label="Archive after (years)" value={c.archive_after_years} onChange={set('archive_after_years')} disabled={!isAdmin} />
      </Stack>
    </Card>
    <Card title="Holiday calendar" sub="Sri Lankan public holidays — excluded when measuring approval turnaround in working days.">
      <ListEditor label="Holidays (YYYY-MM-DD)" values={c.holidays || []} onChange={v => setC({ ...c, holidays: v.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)) })} disabled={!isAdmin} />
    </Card>
    <Card title="Approval delegation" sub="Temporary delegation with an effective period and limit. The delegate can never approve their own items.">
      <Table size="small"><TableHead><TableRow>{['Delegate from', 'Delegate to', 'Start', 'End', 'Limit (LKR)', ''].map(h => <TableCell key={h} sx={{ fontWeight: 800 }}>{h}</TableCell>)}</TableRow></TableHead>
        <TableBody>{(c.delegations || []).map((d, i) => (
          <TableRow key={i}>
            <TableCell>{d.from_name}</TableCell><TableCell>{d.to_name}</TableCell><TableCell>{d.start}</TableCell><TableCell>{d.end}</TableCell><TableCell>{num(d.limit).toLocaleString()}</TableCell>
            <TableCell>{isAdmin && <IconButton size="small" onClick={() => setC({ ...c, delegations: c.delegations.filter((_, j) => j !== i) })}><DeleteOutlineIcon fontSize="small" /></IconButton>}</TableCell>
          </TableRow>))}</TableBody></Table>
      {isAdmin && <DelegationAdd users={approvers} onAdd={d => setC({ ...c, delegations: [...(c.delegations || []), d] })} />}
    </Card>
    <BackupCard ctx={ctx} isAdmin={isAdmin} onDone={reload} />
    <Dialog open={legal} onClose={() => setLegal(false)} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Record legal clearance</DialogTitle>
      <DialogContent dividers>
        <Alert severity="warning" sx={{ mb: 1.5 }}>Only record this once a qualified Sri Lankan legal / regulatory adviser has confirmed the Bank payment structure in writing. The system does not imply the structure is lawful.</Alert>
        <TextField fullWidth label="Legal opinion reference / date *" value={legalRef} onChange={e => setLegalRef(e.target.value)} />
      </DialogContent>
      <DialogActions><Button onClick={() => setLegal(false)}>Cancel</Button>
        <Button sx={btnPrimary} disabled={!legalRef.trim()} onClick={() => { setC({ ...c, payment_method_cleared: true, payment_clearance_ref: legalRef, payment_cleared_by: me.name, payment_cleared_at: nowIso() }); setLegal(false); }}>Mark cleared (then Save)</Button></DialogActions>
    </Dialog>
  </>);
}
function BackupCard({ ctx, isAdmin, onDone }) {
  const [busy, setBusy] = useState(''); const [plan, setPlan] = useState(null); const [fileName, setFileName] = useState(''); const [msg, setMsg] = useState(null);
  const total = plan ? Object.values(plan).reduce((a, l) => a + l.length, 0) : 0;
  const download = async () => {
    setBusy('export'); setMsg(null);
    try {
      const d = await exportBank(ctx);
      saveAs(new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' }), `BANCA_${ctx.bankId.toUpperCase()}_${d.exported_at.slice(0, 10)}.json`);
      await audit(ctx.bankId, ctx.me, 'backup_export', ctx.bankId, {});
    } catch (e) { setMsg({ s: 'error', t: e.message }); }
    setBusy('');
  };
  const pick = async (f) => {
    setPlan(null); setMsg(null); if (!f) return;
    try { setFileName(f.name); setPlan(restorePlan(ctx, JSON.parse(await f.text()))); }
    catch (e) { setMsg({ s: 'error', t: /JSON|Unexpected/.test(e.message) && !/backup/.test(e.message) ? 'That file is not valid JSON.' : e.message }); }
  };
  const restore = async () => {
    setBusy('restore'); setMsg(null);
    try { const n = await restoreMissing(ctx, plan, fileName); setMsg({ s: 'success', t: `Restored ${n} missing record(s). Nothing existing was changed.` }); setPlan(null); onDone(); }
    catch (e) { setMsg({ s: 'error', t: e.message }); }
    setBusy('');
  };
  return (
    <Card title="Backup & restore" sub="Everything in this module is also in the weekly Firestore backup (kept 98 days), point-in-time recovery (last 7 days) and the Admin Panel manual backup. Records are never deleted from the app.">
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <Button variant="outlined" sx={btnOutline} disabled={!!busy} onClick={download}>{busy === 'export' ? 'Preparing…' : 'Download module backup (JSON)'}</Button>
        {isAdmin && <Button component="label" variant="outlined" sx={{ ...btnOutline, color: '#374151', borderColor: '#D1D5DB' }} disabled={!!busy}>Restore missing records…<input hidden type="file" accept=".json" onChange={e => pick(e.target.files?.[0])} /></Button>}
      </Stack>
      {plan && <Box sx={{ mt: 1.5, p: 1.5, borderRadius: '10px', bgcolor: '#F9FAFB' }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{fileName}: {total} record(s) are in the backup but missing now</Typography>
        <Typography sx={{ fontSize: 12, color: T.muted, mb: 1 }}>{Object.entries(plan).filter(([, l]) => l.length).map(([k, l]) => `${k}: ${l.length}`).join(' · ') || 'Nothing to restore — every record is present.'} Existing records are never overwritten.</Typography>
        <Button sx={btnPrimary} disabled={!total || !!busy} onClick={restore}>{busy === 'restore' ? 'Restoring…' : `Restore ${total} record(s)`}</Button>
      </Box>}
      {msg && <Alert severity={msg.s} sx={{ mt: 1.5 }}>{msg.t}</Alert>}
    </Card>
  );
}

function DelegationAdd({ users, onAdd }) {
  const [d, setD] = useState({ from: '', to: '', start: todayYmd(), end: '', limit: '' });
  const u = (uid) => users.find(x => x.uid === uid);
  return (
    <Stack direction="row" spacing={1} sx={{ mt: 1 }} useFlexGap flexWrap="wrap">
      <TextField size="small" select label="From" value={d.from} onChange={e => setD({ ...d, from: e.target.value })} sx={{ minWidth: 170 }}>{users.filter(x => ['admin', 'manager'].includes(x.role)).map(x => <MenuItem key={x.uid} value={x.uid}>{x.full_name || x.email}</MenuItem>)}</TextField>
      <TextField size="small" select label="To" value={d.to} onChange={e => setD({ ...d, to: e.target.value })} sx={{ minWidth: 170 }}>{users.filter(x => x.uid !== d.from).map(x => <MenuItem key={x.uid} value={x.uid}>{x.full_name || x.email}</MenuItem>)}</TextField>
      <TextField size="small" type="date" label="Start" value={d.start} onChange={e => setD({ ...d, start: e.target.value })} InputLabelProps={{ shrink: true }} />
      <TextField size="small" type="date" label="End" value={d.end} onChange={e => setD({ ...d, end: e.target.value })} InputLabelProps={{ shrink: true }} />
      <TextField size="small" type="number" label="Limit" value={d.limit} onChange={e => setD({ ...d, limit: e.target.value })} sx={{ width: 120 }} />
      <Button size="small" sx={btnOutline} variant="outlined" disabled={!d.from || !d.to || !d.end || d.end < d.start}
        onClick={() => { onAdd({ from_uid: d.from, from_name: u(d.from)?.full_name || u(d.from)?.email, to_uid: d.to, to_name: u(d.to)?.full_name || u(d.to)?.email, start: d.start, end: d.end, limit: num(d.limit) }); setD({ from: '', to: '', start: todayYmd(), end: '', limit: '' }); }}>Add delegation</Button>
    </Stack>
  );
}

export function AuditLog() {
  const { bankId, bank, me } = useBanca();
  const [rows, setRows] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { loadAudit(bankId, 2000).then(setRows).catch(e => setErr(e.message)); }, [bankId]);
  const data = useMemo(() => (rows || []).map(r => ({ ...r, when: String(r.at).slice(0, 19).replace('T', ' '), date: String(r.at).slice(0, 10), detail_text: JSON.stringify(r.detail || {}).slice(0, 400) })), [rows]);
  if (me.role !== 'admin' && me.role !== 'manager') return <Alert severity="info">The audit trail is available to managers and administrators.</Alert>;
  return (<>
    <SectionTitle sub="Append-only trail of uploads, postings, reversals, approvals, allocations, configuration changes and document downloads — who, what, when, before and after. Events cannot be edited or deleted.">Audit Log</SectionTitle>
    {err && <Alert severity="error">{err}</Alert>}
    {!rows ? <Typography>Loading…</Typography> : (
      <DataGrid title="Audit Log" bankName={bank.name} rows={data} filterKeys={['event', 'user_name']} dateKey="date" exportName={`${bank.name}_Audit_Log`} defaultSort={{ key: 'when', dir: 'desc' }}
        onExport={(kind, n) => audit(bankId, me, 'audit_export', '', { kind, rows: n })}
        columns={[{ key: 'when', label: 'When' }, { key: 'user_name', label: 'User' }, { key: 'event', label: 'Event' }, { key: 'record', label: 'Record' }, { key: 'detail_text', label: 'Detail (before / after)', wrap: true }]} />
    )}
  </>);
}
