// Screens S-02 … S-14: registers, trackers, commission split, libraries, claims (read-only reports).
import React, { useMemo, useState } from 'react';
import { openFile } from '../../storage';
import { useBanca, storeLibraryFile, audit } from '../store';
import { DataGrid, StatusChip, Kpi, SectionTitle, T, btnPrimary, btnOutline } from '../ui';
import { applyFields, withCustom } from '../fields';
import { lkr, round2, AGE_BUCKETS, EXPIRY_BUCKETS, expiryBucket, monthLabel } from '../core';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import CloseIcon from '@mui/icons-material/Close';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';

const pol = (r) => ({ policy_no: r.policy_no, customer: r.customer });
const policyLink = (open) => (r) => <Box component="span" sx={{ color: T.primary, fontWeight: 700 }} onClick={(e) => { e.stopPropagation(); open(r); }}>{r.policy_no}</Box>;

export function MasterRegister({ openPolicy }) {
  const { model, bank, config } = useBanca();
  const rowsC = useMemo(() => withCustom(model.policies), [model]);
  const cols = [
    { key: 'policy_no', label: 'Policy No', render: policyLink(openPolicy) }, { key: 'customer', label: 'Name' }, { key: 'insurer', label: 'Insurance Company' }, { key: 'branch', label: 'Branch' }, { key: 'class', label: 'Class' },
    { key: 'facility_no', label: 'Facility No' }, { key: 'vehicle_no', label: 'Vehicle Reg No' }, { key: 'pay_type', label: 'Pay Type' },
    { key: 'inception', label: 'Inception' }, { key: 'expiry', label: 'Expiry' }, { key: 'sum_insured', label: 'Sum Insured', type: 'money' },
    { key: 'net_basic', label: 'Basic', type: 'money', group: 'GWP Data' }, { key: 'net_srcc', label: 'SRCC', type: 'money', group: 'GWP Data' }, { key: 'net_tc', label: 'TC', type: 'money', group: 'GWP Data' }, { key: 'net_total', label: 'Net Premium', type: 'money', group: 'GWP Data' },
    { key: 'paid', label: 'Received', type: 'money', group: 'Payment Data' }, { key: 'outstanding', label: 'Outstanding', type: 'money', group: 'Payment Data' }, { key: 'pay_status', label: 'Status', group: 'Payment Data', render: r => <StatusChip value={r.pay_status} /> },
    { key: 'exp_comm', label: 'Expected', type: 'money', group: 'Commission Data' }, { key: 'comm_received', label: 'Received', type: 'money', group: 'Commission Data' }, { key: 'comm_balance', label: 'Balance', type: 'money', group: 'Commission Data' }, { key: 'comm_status', label: 'Status', group: 'Commission Data', render: r => <StatusChip value={r.comm_status} /> },
    { key: 'pmf_alloc', label: 'Bank Allocation', type: 'money' }, { key: 'pmf_status', label: 'Bank Status', render: r => <StatusChip value={r.pmf_status} /> },
  ];
  return (<>
    <SectionTitle sub="Read-only consolidated view — one row per policy period, built from the GWP, Payments and Commission registers. Click a row to drill down to transactions and source documents.">Master Register</SectionTitle>
    <DataGrid title="Master Register" bankName={bank.name} rows={rowsC} columns={applyFields(cols, 'master', config, { net_basic: 'basic', net_srcc: 'srcc', net_tc: 'tc', net_total: 'total' })} dateKey="inception" dateLabel="Inception" groupKey="insurer" onRowClick={openPolicy} exportName={`${bank.name}_Master_Register`} defaultSort={{ key: 'inception', dir: 'desc' }} />
  </>);
}

export function GwpRegister({ openPolicy }) {
  const { model, bank, config } = useBanca();
  const types = ['New', 'Renewal', 'Endorsement', 'Cancellation', 'Refund'];
  const cols = [
    { key: 'policy_no', label: 'Policy No' }, { key: 'facility_no', label: 'Facility No' }, { key: 'customer', label: 'Name' }, { key: 'address', label: 'Address' }, { key: 'telephone', label: 'Telephone' }, { key: 'insurer', label: 'Insurance Company' }, { key: 'branch', label: 'Branch' },
    { key: 'vehicle_no', label: 'Vehicle Reg No' }, { key: 'pay_type', label: 'Pay Type' }, { key: 'sum_insured', label: 'Sum Insured', type: 'money' },
    { key: 'basic', label: 'Basic Premium', type: 'money' }, { key: 'srcc', label: 'SRCC Premium', type: 'money' }, { key: 'tc', label: 'TC Premium', type: 'money' }, { key: 'total', label: 'Total Premium', type: 'money' },
    { key: 'gross_premium', label: 'Premium incl. Taxes', type: 'money' }, { key: 'prev_premium', label: 'Previous Premium', type: 'money' },
    { key: 'type', label: 'Type' }, { key: 'effective_date', label: 'Effective Date' }, { key: 'expiry', label: 'Expiry Date' }, { key: 'gwp_month', label: 'GWP Month' }, { key: 'class', label: 'Class' },
    { key: 'remarks', label: 'Remarks' }, { key: 'upload_date', label: 'Uploaded' },
  ];
  const rows = useMemo(() => withCustom(model.txns), [model]);
  return (<>
    <SectionTitle sub="Every policy and endorsement transaction from confirmed batches. Total = Basic + SRCC + TC. GWP month = inception month for originals, effective-date month for endorsements.">GWP Register</SectionTitle>
    <DataGrid title="GWP Register" bankName={bank.name} rows={rows} columns={applyFields(cols, 'gwp', config)} dateKey="effective_date" dateLabel="GWP date" groupKey="type"
      chips={[{ label: 'All', test: () => true }, ...types.map(t => ({ label: t, test: r => r.type === t }))]}
      onRowClick={(r) => openPolicy(model.byId.get(r.policy_id))} exportName={`${bank.name}_GWP_Register`} defaultSort={{ key: 'effective_date', dir: 'desc' }} />
  </>);
}

export function PaymentsRegister({ openPolicy }) {
  const { model, bank, config } = useBanca();
  const rowsC = useMemo(() => withCustom(model.receipts), [model]);
  const cols = [
    { key: 'policy_no', label: 'Policy No' }, { key: 'customer', label: 'Name' }, { key: 'date', label: 'Payment Date' }, { key: 'amount', label: 'Amount', type: 'money' }, { key: 'insurer', label: 'Insurance Company' }, { key: 'branch', label: 'Branch' },
    { key: 'type', label: 'Type' }, { key: 'reference', label: 'Reference' }, { key: 'unallocated', label: 'Unallocated', type: 'money' }, { key: 'status', label: 'Match', render: r => <StatusChip value={r.unallocated > 0.005 ? 'Unmatched' : 'Matched'} />, exportValue: r => (r.unallocated > 0.005 ? 'Unmatched' : 'Matched') },
  ];
  return (<>
    <SectionTitle sub="Premium receipts and refunds from confirmed payment batches. Unmatched receipts are listed in Exceptions for allocation.">Payments Register</SectionTitle>
    <DataGrid title="Payments Register" bankName={bank.name} rows={rowsC} columns={applyFields(cols, 'payments', config)} dateKey="date" dateLabel="Payment date" groupKey="insurer"
      chips={[{ label: 'All', test: () => true }, { label: 'Unmatched', test: r => r.unallocated > 0.005 }, { label: 'Refunds', test: r => r.type === 'Refund' }]}
      onRowClick={(r) => r.policy_id && openPolicy(model.byId.get(r.policy_id))} exportName={`${bank.name}_Payments_Register`} defaultSort={{ key: 'date', dir: 'desc' }} />
  </>);
}

export function CommissionRegister({ openPolicy }) {
  const { model, bank, config } = useBanca();
  const rowsC = useMemo(() => withCustom(model.commissions), [model]);
  const cols = [
    { key: 'policy_no', label: 'Policy No' }, { key: 'customer', label: 'Name' }, { key: 'date', label: 'Commission Date' }, { key: 'amount', label: 'Amount', type: 'money' }, { key: 'insurer', label: 'Insurance Company' }, { key: 'branch', label: 'Branch' },
    { key: 'reference', label: 'Statement Ref' }, { key: 'component', label: 'Component' }, { key: 'unallocated', label: 'Unallocated', type: 'money' },
  ];
  return (<>
    <SectionTitle sub="Insurer commission receipts from confirmed commission batches. Several receipts per policy are listed individually.">Commission Register</SectionTitle>
    <DataGrid title="Commission Register" bankName={bank.name} rows={rowsC} columns={applyFields(cols, 'commission', config)} dateKey="date" dateLabel="Commission date" groupKey="insurer"
      chips={[{ label: 'All', test: () => true }, { label: 'Unmatched', test: r => r.unallocated > 0.005 }]}
      onRowClick={(r) => r.policy_id && openPolicy(model.byId.get(r.policy_id))} exportName={`${bank.name}_Commission_Register`} defaultSort={{ key: 'date', dir: 'desc' }} />
  </>);
}

export function RenewalTracker({ openPolicy }) {
  const { model, bank, config } = useBanca();
  const rows = useMemo(() => model.policies.filter(p => !p.cancelled && p.days_left !== null && p.days_left >= 0 && p.days_left <= 90), [model]);
  const cols = [
    { key: 'customer', label: 'Client Name' }, { key: 'policy_no', label: 'Policy No' }, { key: 'class', label: 'Product' }, { key: 'insurer', label: 'Insurer' }, { key: 'expiry', label: 'Expiry Date' },
    { key: 'days_left', label: 'Days Left', type: 'int' }, { key: 'branch', label: 'Branch' }, { key: 'net_total', label: 'Premium', type: 'money' },
    { key: 'renewal_status', label: 'Status', render: r => <StatusChip value={r.renewal_status} /> },
  ];
  return (<>
    <SectionTitle sub="Reports only — policies expiring within 90 days. A renewal posted in the GWP register updates the status automatically (no follow-up entries, Q15).">Renewal Tracker</SectionTitle>
    <DataGrid title="Renewal Tracker" bankName={bank.name} rows={withCustom(rows)} columns={applyFields(cols, 'master', config, {}, true)} dateKey="expiry" dateLabel="Expiry" groupKey="insurer" onRowClick={openPolicy}
      chips={[90, 60, 30, 15, 7].map(d => ({ label: `≤ ${d} days`, test: r => r.days_left <= d })).concat([{ label: 'Renewed', test: r => r.renewal_status === 'Renewed' }, { label: 'Pending', test: r => r.renewal_status === 'Pending' }])}
      exportName={`${bank.name}_Renewal_Tracker`} defaultSort={{ key: 'days_left', dir: 'asc' }} />
  </>);
}

export function CommissionTracker({ openPolicy }) {
  const { model, bank, config } = useBanca();
  const rows = useMemo(() => model.policies.filter(p => p.exp_comm > 0.005 || p.comm_received > 0.005).map(p => ({ ...p, last_comm: [...p.comms].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.date || '' })), [model]);
  const cols = [
    { key: 'customer', label: 'Client Name' }, { key: 'policy_no', label: 'Policy No' }, { key: 'class', label: 'Product' }, { key: 'insurer', label: 'Insurer' },
    { key: 'exp_comm', label: 'Commission Due', type: 'money' }, { key: 'comm_received', label: 'Commission Amount Received', type: 'money' }, { key: 'last_comm', label: 'Date Received' },
    { key: 'comm_balance', label: 'Balance', type: 'money' }, { key: 'comm_status', label: 'Status', render: r => <StatusChip value={r.comm_status} /> }, { key: 'branch', label: 'Branch' },
  ];
  const st = ['Fully received', 'Partly received', 'Outstanding', 'Over received'];
  return (<>
    <SectionTitle sub="Commission due vs received per policy. Due = Basic, SRCC and TC premium × the configured rates (or insurer-supplied amounts).">Commission Tracker</SectionTitle>
    <DataGrid title="Commission Tracker" bankName={bank.name} rows={withCustom(rows)} columns={applyFields(cols, 'master', config, {}, true)} groupKey="comm_status" onRowClick={openPolicy}
      chips={[{ label: 'All', test: () => true }, ...st.map(s => ({ label: s, test: r => r.comm_status === s }))]} exportName={`${bank.name}_Commission_Tracker`} defaultSort={{ key: 'comm_balance', dir: 'desc' }} />
  </>);
}

export function OutstandingTracker({ openPolicy }) {
  const { model, bank, config } = useBanca();
  const rows = useMemo(() => model.policies.filter(p => p.outstanding > 0.005), [model]);
  const byBucket = AGE_BUCKETS.map(b => ({ b, n: rows.filter(r => r.age_bucket === b).length, v: round2(rows.filter(r => r.age_bucket === b).reduce((s, r) => s + r.outstanding, 0)) }));
  const cols = [
    { key: 'customer', label: 'Client Name' }, { key: 'policy_no', label: 'Policy No' }, { key: 'class', label: 'Product' }, { key: 'insurer', label: 'Insurer' },
    { key: 'outstanding', label: 'Outstanding Amount', type: 'money' }, { key: 'age_days', label: 'No. of Days', type: 'int' }, { key: 'age_bucket', label: 'Bucket' },
    { key: 'inception', label: 'Commencement' }, { key: 'net_total', label: 'Net Premium', type: 'money' }, { key: 'paid', label: 'Received', type: 'money' }, { key: 'branch', label: 'Branch' },
  ];
  return (<>
    <SectionTitle sub="Outstanding premium = net premium − allocated receipts. No. of days counts from the policy commencement date only (Q18) — there is no due-date option.">Outstanding Tracker</SectionTitle>
    <Stack direction="row" spacing={1.2} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
      {byBucket.map(x => <Kpi key={x.b} label={`${x.b} days`} value={`LKR ${lkr(x.v)}`} sub={`${x.n} polic${x.n === 1 ? 'y' : 'ies'}`} color={x.b === '90+' ? T.danger : undefined} />)}
      <Kpi label="Grand total" value={`LKR ${lkr(byBucket.reduce((s, x) => s + x.v, 0))}`} sub={`${rows.length} policies`} />
    </Stack>
    <DataGrid title="Outstanding Premium Ageing" bankName={bank.name} rows={withCustom(rows)} columns={applyFields(cols, 'master', config, {}, true)} dateKey="inception" dateLabel="Commencement" groupKey="age_bucket" onRowClick={openPolicy}
      chips={[{ label: 'All', test: () => true }, ...AGE_BUCKETS.map(b => ({ label: `${b} days`, test: r => r.age_bucket === b }))]} exportName={`${bank.name}_Outstanding_Ageing`} defaultSort={{ key: 'age_days', dir: 'desc' }} />
  </>);
}

export function ExpiredTracker({ openPolicy }) {
  const { model, bank, config } = useBanca();
  const rows = useMemo(() => model.policies.filter(p => !p.cancelled && !p.renewed_by && p.days_left !== null && p.days_left < 0).map(p => ({ ...p, since: -p.days_left, bucket: expiryBucket(-p.days_left) })), [model]);
  const cols = [
    { key: 'customer', label: 'Client Name' }, { key: 'policy_no', label: 'Policy No' }, { key: 'class', label: 'Product' }, { key: 'insurer', label: 'Insurer' },
    { key: 'renewal_status', label: 'Policy Status', render: r => <StatusChip value={r.renewal_status} /> }, { key: 'since', label: 'No. of Days', type: 'int' }, { key: 'bucket', label: 'Bucket' },
    { key: 'expiry', label: 'Expired On' }, { key: 'net_total', label: 'Expiring Premium', type: 'money' }, { key: 'branch', label: 'Branch' },
  ];
  return (<>
    <SectionTitle sub="Expired policies with no recorded renewal (Q16). Entries clear automatically when a renewal is posted. Reports only.">Expired Policy Tracker</SectionTitle>
    <DataGrid title="Expired Policy Tracker" bankName={bank.name} rows={withCustom(rows)} columns={applyFields(cols, 'master', config, {}, true)} dateKey="expiry" dateLabel="Expiry" groupKey="bucket" onRowClick={openPolicy}
      chips={[{ label: 'All', test: () => true }, ...EXPIRY_BUCKETS.map(b => ({ label: `${b} days`, test: r => r.bucket === b }))]} exportName={`${bank.name}_Expired_Tracker`} defaultSort={{ key: 'since', dir: 'asc' }} />
  </>);
}

export function CommissionSplit({ openPolicy }) {
  const { model, bank, config } = useBanca();
  const rows = useMemo(() => model.policies.filter(p => p.exp_comm > 0.005 || p.comm_received > 0.005), [model]);
  const sum = (f) => round2(rows.reduce((s, r) => s + f(r), 0));
  const cols = [
    { key: 'customer', label: 'Client Name' }, { key: 'policy_no', label: 'Policy No' }, { key: 'class', label: 'Product' },
    { key: 'comm_received', label: 'Total Commission', type: 'money' }, { key: 'pmf_alloc', label: 'Bank Commission', type: 'money' }, { key: 'broker_share', label: 'InsureSAAS Commission', type: 'money' },
    { key: 'net_basic', label: 'Net Basic (Bank base)', type: 'money' }, { key: 'exp_comm', label: 'Expected Commission', type: 'money' },
    { key: 'pmf_status', label: 'Bank Status', render: r => <StatusChip value={r.pmf_status} /> }, { key: 'pmf_paid', label: 'Bank Paid', type: 'money' }, { key: 'pmf_due', label: 'Bank Outstanding', type: 'money' }, { key: 'insurer', label: 'Insurer' }, { key: 'branch', label: 'Branch' },
  ];
  return (<>
    <SectionTitle sub={`Bank commission = ${config.pmf_pct}% of net BASIC premium (not of the broker commission). It becomes payable only when the policy's whole insurer commission is received. InsureSAAS commission = total commission received − Bank commission (decision D6).`}>Bank &amp; InsureSAAS Commission Split</SectionTitle>
    {!config.payment_method_cleared && <Alert severity="warning" sx={{ mb: 1.5 }}>Legal hold: live Bank payments are blocked until the bank payment structure is legally cleared (Settings → payment method cleared).</Alert>}
    <Stack direction="row" spacing={1.2} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
      <Kpi label="Commission received" value={`LKR ${lkr(sum(r => r.comm_received))}`} />
      <Kpi label="Bank payable now" value={`LKR ${lkr(sum(r => (r.pmf_eligible ? Math.max(0, r.pmf_due) : 0)))}`} sub={`${rows.filter(r => r.pmf_status === 'Payable').length} eligible policies`} color={T.green} />
      <Kpi label="Bank not yet eligible" value={`LKR ${lkr(sum(r => (!r.pmf_eligible ? r.pmf_alloc : 0)))}`} sub="Commission not fully received" color={T.amber} />
      <Kpi label="Bank paid" value={`LKR ${lkr(sum(r => r.pmf_paid))}`} />
      <Kpi label="InsureSAAS commission" value={`LKR ${lkr(sum(r => r.broker_share))}`} />
    </Stack>
    <DataGrid title="Bank & InsureSAAS Commission Split" bankName={bank.name} rows={withCustom(rows)} columns={applyFields(cols, 'master', config, {}, true)} groupKey="pmf_status" onRowClick={openPolicy}
      chips={[{ label: 'All', test: () => true }, { label: 'Payable', test: r => r.pmf_status === 'Payable' }, { label: 'Not eligible', test: r => r.pmf_status === 'Not eligible' }, { label: 'On statement', test: r => String(r.pmf_status).startsWith('On statement') }, { label: 'Paid', test: r => r.pmf_status === 'Paid' }, { label: 'Clawback', test: r => r.pmf_status === 'Clawback' }]}
      exportName={`${bank.name}_Commission_Split`} />
  </>);
}

/* ── Libraries (S-11, S-12, S-13, S-22, S-23) ── */
export const LIBRARIES = {
  gwp: { title: 'GWP Report Library', sub: 'Original insurer GWP statements by insurer and period, linked to their upload batches (Q19).' },
  payment: { title: 'Payment Confirmations Library', sub: 'Original premium payment and refund statements, traceable to matched and unmatched rows (Q20).' },
  commission: { title: 'Commission Reports Library', sub: 'Original insurer commission statements linked to batches and receipts, incl. partial / outstanding (Q21).' },
  pmf_payment: { title: 'Bank Payment Library', sub: 'Proofs of payment to the bank, linked to their monthly statements.' },
  claims: { title: 'Claims Document Library', sub: 'Claim evidence linked to claims and claim statements.' },
};
export function Library({ library }) {
  const ctx = useBanca();
  const { raw, bank, bankId, me, reload, model } = ctx;
  const L = LIBRARIES[library];
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => (raw.files || []).filter(f => f.library === library).map(f => {
    const bs = (f.batch_ids || []).map(id => (raw.batches || []).find(b => b.id === id)).filter(Boolean);
    return { ...f, date_added: String(f.uploaded_at || '').slice(0, 10), batches: bs.map(b => `${b.file_name} (${b.status})`).join(', ') };
  }), [raw, library]);
  const view = async (f) => { await audit(bankId, me, 'document_download', f.id, { library, name: f.name }); openFile(f.url); };
  const cols = [
    { key: 'insurer', label: 'Insurance Company' }, { key: 'from', label: 'From' }, { key: 'to', label: 'To' }, { key: 'date_added', label: 'Data Added to System' },
    { key: 'name', label: 'PDF Report', render: r => <Button size="small" onClick={(e) => { e.stopPropagation(); view(r); }} sx={{ textTransform: 'none', p: 0 }}>{r.name}</Button> },
    { key: 'version', label: 'Version', type: 'int' }, { key: 'batches', label: 'Linked Batches', wrap: true }, { key: 'uploaded_by', label: 'Uploaded By' }, { key: 'note', label: 'Note' },
  ];
  return (<>
    <SectionTitle sub={L.sub} right={<Button startIcon={<UploadFileOutlinedIcon />} sx={btnPrimary} onClick={() => setOpen(true)}>Upload document</Button>}>{L.title}</SectionTitle>
    <DataGrid title={L.title} bankName={bank.name} rows={rows} columns={cols} filterKeys={['insurer']} dateKey="date_added" dateLabel="Added" groupKey="insurer" exportName={`${bank.name}_${L.title.replace(/\W+/g, '_')}`} defaultSort={{ key: 'date_added', dir: 'desc' }} />
    <LibraryUpload open={open} onClose={() => setOpen(false)} library={library} ctx={ctx} insurers={[...new Set(model.policies.map(p => p.insurer))].sort()} onDone={() => { setOpen(false); reload(); }} />
  </>);
}
function LibraryUpload({ open, onClose, library, ctx, insurers, onDone }) {
  const [f, setF] = useState(null); const [ins, setIns] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [pct, setPct] = useState(0); const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { const r = await storeLibraryFile(ctx, f, { library, insurer: ins, from, to, note, onProgress: setPct }); if (r.reused) alert('This exact file is already stored — linked to the existing copy.'); onDone(); }
    catch (e) { setErr(e.message || 'Upload failed'); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>Upload to {LIBRARIES[library].title}</DialogTitle>
      <DialogContent dividers>
        <Button component="label" variant="outlined" sx={btnOutline}>{f ? f.name : 'Choose file (PDF, image, Excel, Word)'}<input hidden type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.doc,.docx" onChange={e => setF(e.target.files?.[0] || null)} /></Button>
        <Stack spacing={1.5} sx={{ mt: 2 }}>
          <TextField select size="small" label="Insurance company" value={ins} onChange={e => setIns(e.target.value)}>{['', ...insurers].map(i => <MenuItem key={i} value={i}>{i || '—'}</MenuItem>)}</TextField>
          <Stack direction="row" spacing={1}><TextField size="small" type="date" label="Period from" value={from} onChange={e => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth /><TextField size="small" type="date" label="Period to" value={to} onChange={e => setTo(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth /></Stack>
          <TextField size="small" label="Note / linked reference" value={note} onChange={e => setNote(e.target.value)} />
        </Stack>
        {busy && <LinearProgress variant="determinate" value={pct} sx={{ mt: 2 }} />}
        {err && <Alert severity="error" sx={{ mt: 2 }}>{err}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={busy}>Cancel</Button><Button sx={btnPrimary} disabled={!f || busy} onClick={go}>{busy ? 'Uploading…' : 'Upload'}</Button></DialogActions>
    </Dialog>
  );
}

/* ── Claims Tracker (S-14) ── */
export function ClaimsTracker({ openPolicy, goUpload }) {
  const { model, bank, raw, config } = useBanca();
  const [sel, setSel] = useState(null);
  const rows = useMemo(() => withCustom(model.claims).map(c => ({ ...c, payees: [...new Set((c.payments || []).map(p => p.payee).filter(Boolean))].join(', ') })), [model]);
  const statuses = [...new Set(rows.map(r => r.status).filter(Boolean))].sort();
  const cols = [
    { key: 'claim_ref', label: 'Claim Ref ID' }, { key: 'customer', label: 'Client Name' }, { key: 'policy_no', label: 'Policy No' }, { key: 'class', label: 'Product / Class' },
    { key: 'incident_date', label: 'Incident Date' }, { key: 'cause', label: 'Cause of Loss' }, { key: 'description', label: 'Description', wrap: true }, { key: 'estimate', label: 'Estimated Loss', type: 'money' },
    { key: 'status', label: 'Status', render: r => <StatusChip value={r.status} /> }, { key: 'paid', label: 'Settlement Amount', type: 'money' }, { key: 'outstanding_claim', label: 'Outstanding', type: 'money' },
    { key: 'intimation_date', label: 'Intimation' }, { key: 'payees', label: 'Payee' }, { key: 'rejection_reason', label: 'Rejection Reason' }, { key: 'insurer', label: 'Insurer' }, { key: 'branch', label: 'Branch' },
  ];
  const docs = sel ? (raw.files || []).filter(f => f.library === 'claims' && ((f.ref_ids || []).includes(sel.id) || (f.batch_ids || []).some(b => (sel.payments || []).some(p => p.batch_id === b) || (sel.status_history || []).some(h => h.batch_id === b)))) : [];
  return (<>
    <SectionTitle sub="Claims from bulk claim statements. Status history is kept; settlement is cumulative across instalments. A claim is never closed because it is missing from a later statement."
      right={<Button startIcon={<UploadFileOutlinedIcon />} sx={btnPrimary} onClick={() => goUpload('claims')}>Upload claims statement</Button>}>Claims Tracker</SectionTitle>
    <DataGrid title="Claims Tracker" bankName={bank.name} rows={rows} columns={applyFields(cols, 'claims', config, { paid: 'settlement', payees: 'payee' })} dateKey="incident_date" dateLabel="Incident" groupKey="status" onRowClick={setSel}
      chips={[{ label: 'All', test: () => true }, ...statuses.map(s => ({ label: s, test: r => r.status === s }))]} exportName={`${bank.name}_Claims_Tracker`} defaultSort={{ key: 'incident_date', dir: 'desc' }} />
    <Drawer anchor="right" open={!!sel} onClose={() => setSel(null)} PaperProps={{ sx: { width: { xs: '100%', md: 620 } } }}>
      {sel && <Box sx={{ p: 2.5 }}>
        <Stack direction="row" justifyContent="space-between"><Typography sx={{ fontSize: 18, fontWeight: 800 }}>Claim {sel.claim_ref}</Typography><IconButton onClick={() => setSel(null)}><CloseIcon /></IconButton></Stack>
        <Typography sx={{ fontSize: 12.5, color: T.muted, mb: 1 }}>{sel.customer} · <Box component="span" sx={{ color: T.primary, cursor: 'pointer' }} onClick={() => { const p = model.byId.get(sel.policy_id); if (p) openPolicy(p); }}>{sel.policy_no}</Box> · {sel.insurer}</Typography>
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}><Kpi label="Estimate" value={lkr(sel.estimate)} /><Kpi label="Paid" value={lkr(sel.paid)} /><Kpi label="Outstanding" value={lkr(sel.outstanding_claim)} /></Stack>
        <Typography sx={{ fontWeight: 800, fontSize: 12, color: T.primary }}>STATUS HISTORY</Typography>
        <Table size="small"><TableHead><TableRow><TableCell>Status</TableCell><TableCell>Recorded</TableCell><TableCell>Batch</TableCell></TableRow></TableHead>
          <TableBody>{(sel.status_history || []).map((h, i) => <TableRow key={i} sx={{ opacity: h.reversed ? 0.45 : 1 }}><TableCell>{h.status}{h.reversed ? ' (reversed)' : ''}</TableCell><TableCell>{h.at}</TableCell><TableCell sx={{ fontSize: 11 }}>{h.batch_id}</TableCell></TableRow>)}</TableBody></Table>
        <Typography sx={{ fontWeight: 800, fontSize: 12, color: T.primary, mt: 2 }}>PAYMENTS</Typography>
        <Table size="small"><TableHead><TableRow><TableCell>Date</TableCell><TableCell align="right">Amount</TableCell><TableCell>Payee</TableCell></TableRow></TableHead>
          <TableBody>{(sel.payments || []).map((p, i) => <TableRow key={i}><TableCell>{p.date}</TableCell><TableCell align="right">{lkr(p.amount)}</TableCell><TableCell>{p.payee}</TableCell></TableRow>)}</TableBody></Table>
        {sel.rejection_reason && <Alert severity="info" sx={{ mt: 2 }}>Rejection reason: {sel.rejection_reason}</Alert>}
        <Typography sx={{ fontWeight: 800, fontSize: 12, color: T.primary, mt: 2 }}>DOCUMENTS ({docs.length})</Typography>
        {docs.map(d => <Button key={d.id} size="small" onClick={() => openFile(d.url)} sx={{ textTransform: 'none', display: 'block' }}>{d.name}</Button>)}
      </Box>}
    </Drawer>
  </>);
}

export const monthName = monthLabel;
export { pol };
