// S-27 Platform support: DR tests, corrective actions, issues, incidents, releases, training, improvements, developer capacity.
import React, { useMemo, useState } from 'react';
import { collection, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { uploadFile, openFile } from '../../storage';
import { useBanca, audit, nowIso } from '../store';
import { DataGrid, StatusChip, Kpi, SectionTitle, T, btnPrimary, btnOutline } from '../ui';
import { todayYmd, addDays, dayDiff, num, norm, workingDaysBetween, GATED_FUNCTIONS } from '../core';
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
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';

const PCOLL = 'platform_ops';
const SEVERITY = ['Critical', 'High', 'Medium', 'Low'];
const SLA_DAYS = { Critical: 1, High: 3, Medium: 7, Low: 14 };
const AREAS = ['Software', 'Database', 'Uploads', 'Security', 'Disaster recovery', 'Performance'];

export const quarterOf = (ymd) => `${ymd.slice(0, 4)}-Q${Math.floor((+ymd.slice(5, 7) - 1) / 3) + 1}`;
const nextQuarterDate = (ymd) => { const [y, m] = ymd.split('-').map(Number); const q = Math.floor((m - 1) / 3); const d = new Date(y, (q + 1) * 3 + 1, 15); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`; };
// Suggested priority from failure rules: security / DR / database failures rank higher (admin may override with audit)
export const suggestPriority = (area, severity) => { const s = SEVERITY.indexOf(severity); const bump = ['Security', 'Disaster recovery', 'Database'].includes(area) ? 1 : 0; return SEVERITY[Math.max(0, s - bump)] || 'Medium'; };
const problemKey = (title) => norm(title).replace(/[^a-z0-9 ]/g, '').split(' ').filter(w => w.length > 3).sort().slice(0, 4).join(' ');

let AUDIT_BANK = 'bank';
async function save(me, id, raw, event) {
  const data = Object.fromEntries(Object.entries(raw).filter(([k, x]) => x !== undefined && k !== 'id'));
  const ref = id ? doc(db, PCOLL, id) : doc(collection(db, PCOLL));
  await (id ? updateDoc(ref, { ...data, updated_at: nowIso(), updated_by: me.name }) : setDoc(ref, { ...data, created_at: nowIso(), created_by: me.name, created_by_uid: me.uid }));
  await audit(AUDIT_BANK, me, event || (id ? 'platform_update' : 'platform_create'), ref.id, { type: data.type, status: data.status });
  return ref.id;
}

function Form({ open, title, fields, value, onClose, onSave, extra }) {
  const [v, setV] = useState(value || {});
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  React.useEffect(() => { if (open) { setV(value || {}); setErr(''); } }, [open, value]);
  const go = async () => { setBusy(true); setErr(''); try { await onSave(v); } catch (e) { setErr(e.message); } setBusy(false); };
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 800 }}>{title}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          {fields.map(f => f.type === 'bool'
            ? <FormControlLabel key={f.key} control={<Checkbox checked={!!v[f.key]} onChange={e => setV({ ...v, [f.key]: e.target.checked })} />} label={f.label} />
            : f.type === 'files' ? (
              <Box key={f.key}>
                <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{f.label}</Typography>
                {(v[f.key] || []).map((x, i) => <Button key={i} size="small" onClick={() => openFile(x.url)} sx={{ textTransform: 'none' }}>{x.name}</Button>)}
                <Button component="label" size="small" variant="outlined" sx={{ ...btnOutline, ml: 1 }}>Attach<input hidden type="file" multiple onChange={async e => {
                  const files = [...(e.target.files || [])]; setBusy(true);
                  try { const up = []; for (const fl of files) up.push({ name: fl.name, url: await uploadFile(fl, `insuresaas/banca/platform/${f.key}`, undefined, fl.name.replace(/\.[^.]+$/, '')), at: nowIso() }); setV(cur => ({ ...cur, [f.key]: [...(cur[f.key] || []), ...up] })); }
                  catch (er) { setErr(er.message); } setBusy(false);
                }} /></Button>
              </Box>
            ) : (
              <TextField key={f.key} size="small" label={f.label} value={v[f.key] ?? ''} onChange={e => setV({ ...v, [f.key]: e.target.value })}
                type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'} multiline={f.type === 'textarea'} minRows={f.type === 'textarea' ? 3 : undefined}
                select={!!f.options} InputLabelProps={f.type === 'date' ? { shrink: true } : undefined} helperText={f.help}>
                {f.options && f.options.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
              </TextField>))}
          {extra}
        </Stack>
        {busy && <LinearProgress sx={{ mt: 1 }} />}{err && <Alert severity="error" sx={{ mt: 1 }}>{err}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={busy}>Cancel</Button><Button sx={btnPrimary} disabled={busy} onClick={go}>Save</Button></DialogActions>
    </Dialog>
  );
}

export function Platform({ kind }) {
  const { platform = [], reloadPlatform, me, bank, bankId } = useBanca();
  AUDIT_BANK = bankId;
  const [edit, setEdit] = useState(null);
  const today = todayYmd();
  const isMgr = me.role === 'admin' || me.role === 'manager';
  const list = useMemo(() => platform.filter(x => x.type === kind), [platform, kind]);
  const close = () => setEdit(null);
  const done = async () => { setEdit(null); await reloadPlatform(); };
  const [fail, setFail] = useState('');
  const act = async (fn) => { setFail(''); try { await fn(); await reloadPlatform(); } catch (e) { setFail(e.message); } };

  if (kind === 'dr') {
    const rows = list.map(x => ({ ...x, days: x.scheduled_date ? dayDiff(today, x.scheduled_date) : null, reminder: x.status === 'Scheduled' && x.scheduled_date ? ([14, 7, 1].find(n => dayDiff(today, x.scheduled_date) <= n && dayDiff(today, x.scheduled_date) >= 0) ? `Due in ${dayDiff(today, x.scheduled_date)} day(s)` : '') : '' }));
    const fields = [{ key: 'quarter', label: 'Quarter (YYYY-Qn)' }, { key: 'scheduled_date', label: 'Scheduled date', type: 'date' }, { key: 'officer', label: 'Accountable technical officer *' }, { key: 'team', label: 'Supporting team' },
      { key: 'rto_minutes', label: 'Actual restoration time (minutes) — target 60', type: 'number' }, { key: 'rpo_position', label: 'Restored data position / data loss measured' }, { key: 'evidence', label: 'Evidence (logs, screenshots, recovery verification) *', type: 'files' }, { key: 'notes', label: 'Notes', type: 'textarea' }];
    return (<>
      <SectionTitle sub="Quarterly disaster-recovery tests: scheduled automatically, reminders at 14 / 7 / 1 days, one accountable officer, evidence required to submit, management approval, failed tests need a corrective action and a retest without moving the quarterly schedule."
        right={<Button sx={btnPrimary} onClick={() => setEdit({ type: 'dr', bank: bankId, quarter: quarterOf(today), scheduled_date: addDays(today, 30), status: 'Scheduled' })}>Schedule test</Button>}>Disaster Recovery Tests</SectionTitle>
      {fail && <Alert severity="error" sx={{ mb: 1 }}>{fail}</Alert>}
      {rows.filter(r => r.reminder).map(r => <Alert key={r.id} severity="warning" sx={{ mb: 1, py: 0 }}>Reminder: DR test {r.quarter} {r.reminder} — officer {r.officer || 'not assigned'}</Alert>)}
      <DataGrid title="DR Tests" bankName={bank.name} rows={rows} filterKeys={['status', 'quarter']} onRowClick={setEdit} exportName="DR_Tests" columns={[
        { key: 'quarter', label: 'Quarter' }, { key: 'scheduled_date', label: 'Scheduled' }, { key: 'officer', label: 'Officer' }, { key: 'status', label: 'Status', render: r => <StatusChip value={r.status} /> },
        { key: 'rto_minutes', label: 'RTO actual (min)', type: 'int' }, { key: 'rpo_position', label: 'RPO / data position' }, { key: 'evidence_n', label: 'Evidence', render: r => (r.evidence || []).length, exportValue: r => (r.evidence || []).length },
        { key: 'retest_of', label: 'Retest of' }, { key: 'approved_by', label: 'Approved by' },
        { key: 'act', label: '', noExport: true, noSort: true, render: r => <Stack direction="row" spacing={0.5} onClick={e => e.stopPropagation()}>
          {['Scheduled', 'In progress'].includes(r.status) && <Button size="small" onClick={() => act(async () => {
            if (!r.officer) throw new Error('Assign the accountable technical officer first'); if (!(r.evidence || []).length) throw new Error('Attach at least one evidence file before submitting');
            await save(me, r.id, { status: 'Submitted', submitted_at: nowIso() }, 'dr_submitted'); })} sx={{ textTransform: 'none' }}>Submit</Button>}
          {r.status === 'Submitted' && isMgr && <>
            <Button size="small" color="success" onClick={() => act(async () => {
              if (r.created_by_uid === me.uid && me.role !== 'admin') throw new Error('Approval must be by management, not the test owner');
              await save(me, r.id, { status: 'Passed', approved_by: me.name, approved_at: nowIso() }, 'dr_passed');
              if (!r.retest_of && !list.some(x => x.quarter === quarterOf(nextQuarterDate(r.scheduled_date || today)) && !x.retest_of))
                await save(me, null, { type: 'dr', bank: r.bank, quarter: quarterOf(nextQuarterDate(r.scheduled_date || today)), scheduled_date: nextQuarterDate(r.scheduled_date || today), officer: r.officer, status: 'Scheduled' }, 'dr_next_scheduled');
            })} sx={{ textTransform: 'none' }}>Pass</Button>
            <Button size="small" color="error" onClick={() => act(async () => {
              await save(me, r.id, { status: 'Failed', approved_by: me.name, approved_at: nowIso() }, 'dr_failed');
              const ca = await save(me, null, { type: 'ca', title: `DR test ${r.quarter} failed — corrective action`, area: 'Disaster recovery', severity: 'High', priority: suggestPriority('Disaster recovery', 'High'), status: 'Open', due: addDays(today, SLA_DAYS.High), owner: r.officer, source_id: r.id }, 'ca_created');
              await save(me, null, { type: 'dr', bank: r.bank, quarter: r.quarter, scheduled_date: addDays(today, 14), officer: r.officer, status: 'Scheduled', retest_of: r.id, corrective_action_id: ca }, 'dr_retest_scheduled');
            })} sx={{ textTransform: 'none' }}>Fail</Button></>}
        </Stack> },
      ]} />
      <Form open={!!edit} title={edit?.id ? `DR test ${edit.quarter}` : 'Schedule DR test'} fields={fields} value={edit} onClose={close} onSave={async v => { await save(me, v.id, { ...v, id: undefined, type: 'dr', status: v.status === 'Scheduled' && (v.evidence || []).length ? 'In progress' : v.status }); await done(); }} />
    </>);
  }

  if (kind === 'ca') {
    const rows = list.map(x => { const overdue = !['Done', 'Verified'].includes(x.status) && x.due && x.due < today; return { ...x, overdue: overdue ? 'Overdue' : '', escalated: overdue && x.severity === 'Critical' ? 'Escalated to management' : overdue ? 'Reminder sent' : '' }; });
    const fields = [{ key: 'title', label: 'Title *' }, { key: 'area', label: 'Area', options: AREAS }, { key: 'severity', label: 'Severity', options: SEVERITY },
      { key: 'priority', label: 'Priority (suggested from failure rules — override needs a reason)', options: SEVERITY }, { key: 'override_reason', label: 'Override reason' }, { key: 'owner', label: 'Owner' },
      { key: 'due', label: 'Due date (default from severity)', type: 'date' }, { key: 'status', label: 'Status', options: ['Open', 'In progress', 'Done', 'Verified'] }, { key: 'evidence', label: 'Implementation evidence', type: 'files' }, { key: 'notes', label: 'Notes', type: 'textarea' }];
    return (<>
      <SectionTitle sub="Central corrective-action tracker across software, database, uploads, security, DR and performance. Severity-based deadlines; overdue items are flagged and critical ones escalate."
        right={<Button sx={btnPrimary} onClick={() => setEdit({ type: 'ca', area: 'Software', severity: 'Medium', status: 'Open' })}>New corrective action</Button>}>Corrective Actions</SectionTitle>
      <Stack direction="row" spacing={1.2} sx={{ mb: 1.5 }}><Kpi label="Open" value={rows.filter(r => !['Done', 'Verified'].includes(r.status)).length} /><Kpi label="Overdue" value={rows.filter(r => r.overdue).length} color={rows.some(r => r.overdue) ? T.danger : undefined} /></Stack>
      <DataGrid title="Corrective Actions" bankName={bank.name} rows={rows} filterKeys={['area', 'severity', 'status']} onRowClick={setEdit} exportName="Corrective_Actions" columns={[
        { key: 'title', label: 'Title', wrap: true }, { key: 'area', label: 'Area' }, { key: 'severity', label: 'Severity' }, { key: 'priority', label: 'Priority' }, { key: 'owner', label: 'Owner' }, { key: 'due', label: 'Due' },
        { key: 'status', label: 'Status', render: r => <StatusChip value={r.status} /> }, { key: 'overdue', label: 'Overdue', render: r => <StatusChip value={r.overdue} /> }, { key: 'escalated', label: 'Escalation' }]} />
      <Form open={!!edit} title={edit?.id ? 'Corrective action' : 'New corrective action'} fields={fields} value={edit} onClose={close} onSave={async v => {
        if (!String(v.title || '').trim()) throw new Error('Title required');
        const sug = suggestPriority(v.area, v.severity);
        if (v.priority && v.priority !== sug && !String(v.override_reason || '').trim()) throw new Error(`Suggested priority is ${sug} — give a reason to override`);
        if (v.status === 'Verified' && !(v.evidence || []).length) throw new Error('Attach implementation evidence before verifying');
        await save(me, v.id, { ...v, id: undefined, type: 'ca', suggested_priority: sug, priority: v.priority || sug, due: v.due || addDays(today, SLA_DAYS[v.severity] || 7) }); await done();
      }} />
    </>);
  }

  if (kind === 'issue') {
    const groups = {}; list.forEach(x => { const k = x.problem_key || problemKey(x.title); groups[k] = (groups[k] || 0) + 1; });
    const rows = list.map(x => ({ ...x, mine: x.reporter_uid === me.uid ? 'Mine' : '', related: (groups[x.problem_key || problemKey(x.title)] || 1) - 1, waiting: x.status === 'Resolved' ? workingDaysBetween(String(x.resolved_at || '').slice(0, 10), today) : 0 }));
    const fields = [{ key: 'title', label: 'What went wrong? *' }, { key: 'description', label: 'Description / steps', type: 'textarea' }, { key: 'severity', label: 'Severity', options: SEVERITY }, { key: 'screenshots', label: 'Screenshots', type: 'files' }];
    return (<>
      <SectionTitle sub="Report an Issue and My Reported Issues. Safe context (page, browser, time) is captured automatically. Similar reports are correlated under one problem. An issue closes only after the reporter confirms — silence triggers reminders and escalation, never auto-closure."
        right={<Button sx={btnPrimary} onClick={() => setEdit({ type: 'issue', severity: 'Medium' })}>Report an issue</Button>}>Issues &amp; Support</SectionTitle>
      {fail && <Alert severity="error" sx={{ mb: 1 }}>{fail}</Alert>}
      <Stack direction="row" spacing={1.2} sx={{ mb: 1.5 }}>
        <Kpi label="Open" value={rows.filter(r => !['Closed'].includes(r.status)).length} /><Kpi label="Awaiting reporter confirmation" value={rows.filter(r => r.status === 'Resolved').length} />
        <Kpi label="Reopened" value={rows.filter(r => (r.reopen_count || 0) > 0).length} /><Kpi label="My issues" value={rows.filter(r => r.mine).length} />
      </Stack>
      <DataGrid title="Issues" bankName={bank.name} rows={rows} filterKeys={['status', 'severity', 'mine']} onRowClick={setEdit} exportName="Issues" columns={[
        { key: 'ref', label: 'Ref' }, { key: 'title', label: 'Issue', wrap: true }, { key: 'severity', label: 'Severity' }, { key: 'reporter', label: 'Reporter' }, { key: 'related', label: 'Similar reports', type: 'int' },
        { key: 'status', label: 'Status', render: r => <StatusChip value={r.status} /> }, { key: 'waiting', label: 'Days awaiting confirmation', type: 'int' },
        { key: 'act', label: '', noExport: true, noSort: true, render: r => <Stack direction="row" spacing={0.5} onClick={e => e.stopPropagation()}>
          {isMgr && ['Open', 'In progress', 'Reopened'].includes(r.status) && <Button size="small" onClick={() => act(() => save(me, r.id, { status: 'Resolved', resolved_at: nowIso(), resolved_by: me.name }, 'issue_resolved'))} sx={{ textTransform: 'none' }}>Mark resolved</Button>}
          {r.status === 'Resolved' && r.reporter_uid === me.uid && <><Button size="small" color="success" onClick={() => act(() => save(me, r.id, { status: 'Closed', reporter_confirmed: true, closed_at: nowIso() }, 'issue_closed'))} sx={{ textTransform: 'none' }}>Confirm fixed</Button>
            <Button size="small" color="error" onClick={() => act(() => save(me, r.id, { status: 'Reopened', reopen_count: (r.reopen_count || 0) + 1 }, 'issue_reopened'))} sx={{ textTransform: 'none' }}>Reopen</Button></>}
          {r.status === 'Resolved' && r.waiting >= 3 && <StatusChip value="Overdue" />}
        </Stack> },
      ]} />
      <Form open={!!edit} title={edit?.id ? `Issue ${edit.ref}` : 'Report an issue'} fields={fields} value={edit} onClose={close} onSave={async v => {
        if (!String(v.title || '').trim()) throw new Error('Describe the problem');
        const base = v.id ? {} : { ref: `ISS-${Date.now().toString(36).toUpperCase()}`, status: 'Open', reporter: me.name, reporter_uid: me.uid,
          context: { page: window.location.pathname, browser: navigator.userAgent.slice(0, 160), at: nowIso(), module: bank.title } };
        await save(me, v.id, { ...v, ...base, id: undefined, type: 'issue', problem_key: problemKey(v.title) }); await done();
      }} />
    </>);
  }

  if (kind === 'incident') {
    const rows = list.map(x => ({ ...x, escalation: x.severity === 'Critical' ? 'Immediate' : num(x.affected_users) >= 10 ? 'Escalated (users ≥ 10)' : '', review_due: x.status === 'Resolved' && !x.root_cause ? addDays(String(x.resolved_at || today).slice(0, 10), x.severity === 'Critical' ? 2 : 5) : '' }));
    const fields = [{ key: 'title', label: 'Incident *' }, { key: 'severity', label: 'Severity', options: SEVERITY }, { key: 'affected_users', label: 'Affected users', type: 'number' }, { key: 'impact', label: 'Impact', type: 'textarea' },
      { key: 'status', label: 'Status', options: ['Active', 'Monitoring', 'Resolved'] }, { key: 'notice', label: 'In-app notice shown to staff while active' },
      { key: 'root_cause', label: 'Post-incident review: root cause', type: 'textarea' }, { key: 'duration', label: 'Duration' }, { key: 'recovery', label: 'Recovery', type: 'textarea' }, { key: 'lessons', label: 'Lessons learned', type: 'textarea' },
      { key: 'preventive_evidence', label: 'Preventive action evidence (implementation, testing, independent verification)', type: 'files' }, { key: 'verified_by', label: 'Independently verified by' }];
    return (<>
      <SectionTitle sub="Major incidents: escalation by severity and affected users (critical escalates immediately), in-app notices, structured post-incident review with deadlines. Preventive actions close only with evidence and independent verification. The independent outage email must run outside this application (configure an external status/email service)."
        right={<Button sx={btnPrimary} onClick={() => setEdit({ type: 'incident', severity: 'High', status: 'Active' })}>Log incident</Button>}>Incidents</SectionTitle>
      <DataGrid title="Incidents" bankName={bank.name} rows={rows} filterKeys={['status', 'severity']} onRowClick={setEdit} exportName="Incidents" columns={[
        { key: 'title', label: 'Incident', wrap: true }, { key: 'severity', label: 'Severity' }, { key: 'affected_users', label: 'Users', type: 'int' }, { key: 'status', label: 'Status', render: r => <StatusChip value={r.status === 'Active' ? 'Critical' : r.status} /> },
        { key: 'escalation', label: 'Escalation' }, { key: 'review_due', label: 'Review due' }, { key: 'verified_by', label: 'Verified by' }]} />
      <Form open={!!edit} title={edit?.id ? 'Incident' : 'Log incident'} fields={fields} value={edit} onClose={close} onSave={async v => {
        if (!String(v.title || '').trim()) throw new Error('Title required');
        if (v.closed_preventive && !(v.preventive_evidence || []).length) throw new Error('Preventive actions need implementation evidence');
        if (v.verified_by && v.verified_by === me.name) throw new Error('Verification must be independent of the person recording it');
        await save(me, v.id, { ...v, id: undefined, type: 'incident', started_at: v.started_at || nowIso(), resolved_at: v.status === 'Resolved' ? (v.resolved_at || nowIso()) : '' }); await done();
      }} />
    </>);
  }

  if (kind === 'release') {
    const fields = [{ key: 'version', label: 'Version *' }, { key: 'title', label: 'Title' }, { key: 'planned_date', label: 'Planned date', type: 'date' }, { key: 'window', label: 'Deployment window' },
      { key: 'dev_test', label: 'Developer test passed', type: 'bool' }, { key: 'uat', label: 'UAT passed', type: 'bool' }, { key: 'regression', label: 'Regression (incl. cross-bank isolation) passed', type: 'bool' },
      { key: 'rollback_plan', label: 'Rollback plan', type: 'textarea' }, { key: 'emergency', label: 'Emergency release (audited path)', type: 'bool' }, { key: 'emergency_reason', label: 'Emergency reason' },
      { key: 'notes', label: 'Release notes (targeted)', type: 'textarea' }, { key: 'materials', label: 'Screenshots / guides / PDFs / videos', type: 'files' }, { key: 'status', label: 'Status', options: ['Planned', 'In UAT', 'Approved', 'Released', 'Rolled back'] }];
    return (<>
      <SectionTitle sub="Controlled releases: developer test, UAT, regression, InsureSAAS approval and a rollback plan before production, with an audited emergency path. Release calendar with advance notice and targeted release notes."
        right={<Button sx={btnPrimary} onClick={() => setEdit({ type: 'release', status: 'Planned', planned_date: addDays(today, 7) })}>Plan release</Button>}>Releases</SectionTitle>
      {fail && <Alert severity="error" sx={{ mb: 1 }}>{fail}</Alert>}
      <DataGrid title="Releases" bankName={bank.name} rows={list} filterKeys={['status']} onRowClick={setEdit} dateKey="planned_date" exportName="Releases" columns={[
        { key: 'planned_date', label: 'Planned' }, { key: 'version', label: 'Version' }, { key: 'title', label: 'Title' }, { key: 'window', label: 'Window' },
        { key: 'gates', label: 'Gates', noSort: true, render: r => ['dev_test', 'uat', 'regression'].map(k => (r[k] ? '✓' : '✗')).join(' ') + (r.rollback_plan ? ' ✓RB' : ' ✗RB'), exportValue: r => ['dev_test', 'uat', 'regression'].filter(k => r[k]).join(',') },
        { key: 'approved_by', label: 'Approved by' }, { key: 'status', label: 'Status', render: r => <StatusChip value={r.status} /> },
        { key: 'act', label: '', noExport: true, noSort: true, render: r => isMgr && r.status !== 'Released' && r.status !== 'Approved' ? <Button size="small" onClick={(e) => { e.stopPropagation(); act(async () => {
          if (r.created_by_uid === me.uid) throw new Error('InsureSAAS approval must come from someone other than the release owner');
          if (!r.emergency && !(r.dev_test && r.uat && r.regression && r.rollback_plan)) throw new Error('Developer test, UAT, regression and a rollback plan are required');
          if (r.emergency && !String(r.emergency_reason || '').trim()) throw new Error('Emergency releases need an audited reason');
          await save(me, r.id, { status: 'Approved', approved_by: me.name, approved_at: nowIso() }, 'release_approved'); }); }} sx={{ textTransform: 'none' }}>Approve</Button> : null },
      ]} />
      <Form open={!!edit} title={edit?.id ? `Release ${edit.version}` : 'Plan release'} fields={fields} value={edit} onClose={close} onSave={async v => {
        if (!String(v.version || '').trim()) throw new Error('Version required');
        if (v.status === 'Released' && !v.approved_by) throw new Error('A release cannot reach production without recorded approval');
        await save(me, v.id, { ...v, id: undefined, type: 'release' }); await done();
      }} />
    </>);
  }

  if (kind === 'training') {
    const rows = list.map(x => { const ack = (x.acks || {})[me.uid]; const passed = ack && (!num(x.pass_mark) || num(ack.score) >= num(x.pass_mark)); return { ...x, my_status: passed ? 'Completed' : x.due_date && x.due_date < today ? 'Overdue' : 'Pending', completed: Object.keys(x.acks || {}).length, gates_text: (x.gates || []).map(g => GATED_FUNCTIONS[g]).join(', ') }; });
    const fields = [{ key: 'title', label: 'Training *' }, { key: 'release_version', label: 'Related release version' }, { key: 'due_date', label: 'Due date', type: 'date' }, { key: 'mandatory', label: 'Mandatory', type: 'bool' },
      { key: 'pass_mark', label: 'Assessment pass mark %', type: 'number' }, { key: 'material', label: 'Material', type: 'files' }];
    return (<>
      <SectionTitle sub="Mandatory release training with due dates, acknowledgement and assessment pass marks. Training can gate high-risk functions — a user without verified training cannot use them unless an approved, time-limited exception exists."
        right={isMgr && <Button sx={btnPrimary} onClick={() => setEdit({ type: 'training', mandatory: true, gates: [] })}>New training</Button>}>Training</SectionTitle>
      {fail && <Alert severity="error" sx={{ mb: 1 }}>{fail}</Alert>}
      <DataGrid title="Training" bankName={bank.name} rows={rows} filterKeys={['my_status']} onRowClick={isMgr ? setEdit : undefined} exportName="Training" columns={[
        { key: 'title', label: 'Training' }, { key: 'release_version', label: 'Release' }, { key: 'due_date', label: 'Due' }, { key: 'pass_mark', label: 'Pass mark', type: 'int' }, { key: 'gates_text', label: 'Gated functions', wrap: true },
        { key: 'completed', label: 'Completed by', type: 'int' }, { key: 'my_status', label: 'My status', render: r => <StatusChip value={r.my_status} /> },
        { key: 'act', label: '', noExport: true, noSort: true, render: r => r.my_status !== 'Completed' ? <Button size="small" onClick={(e) => { e.stopPropagation(); act(async () => {
          let score = 100;
          if (num(r.pass_mark)) { const s = window.prompt(`Enter your assessment score for "${r.title}" (pass mark ${r.pass_mark}%)`); if (s === null) return; score = num(s); }
          await save(me, r.id, { [`acks.${me.uid}`]: { name: me.name, at: nowIso(), score } }, 'training_acknowledged'); }); }} sx={{ textTransform: 'none' }}>Acknowledge / record score</Button> : null },
      ]} />
      <Form open={!!edit} title={edit?.id ? 'Training' : 'New training'} fields={fields} value={edit} onClose={close}
        extra={edit && <Box><Typography sx={{ fontSize: 12, fontWeight: 700 }}>Gate these functions until completed</Typography>
          {Object.entries(GATED_FUNCTIONS).map(([k, l]) => <FormControlLabel key={k} control={<Checkbox checked={(edit.gates || []).includes(k)} onChange={e => setEdit({ ...edit, gates: e.target.checked ? [...(edit.gates || []), k] : (edit.gates || []).filter(g => g !== k) })} />} label={l} />)}
          <Typography sx={{ fontSize: 11.5, color: T.muted }}>Time-limited exceptions: add below as "uid until YYYY-MM-DD" lines (approved by you).</Typography>
          <TextField fullWidth size="small" multiline minRows={2} value={(edit.exceptions || []).map(x => `${x.uid} ${x.until}`).join('\n')} onChange={e => setEdit({ ...edit, exceptions: e.target.value.split('\n').map(l => l.trim().split(/\s+/)).filter(p => p[0] && /^\d{4}-\d{2}-\d{2}$/.test(p[1] || '')).map(p => ({ uid: p[0], until: p[1], approved_by: me.name })) })} />
        </Box>}
        onSave={async v => { if (!String(v.title || '').trim()) throw new Error('Title required'); await save(me, v.id, { ...v, gates: edit.gates || [], exceptions: edit.exceptions || [], id: undefined, type: 'training' }); await done(); }} />
    </>);
  }

  if (kind === 'improvement') {
    const score = (x) => (x.override_score !== undefined && x.override_score !== '' ? num(x.override_score) : Math.round(num(x.impact) * 4 + num(x.time_saved_hours) / 10 + num(x.affected_users) / 5 - num(x.risk) * 2 - num(x.cost) / 100000));
    const rows = list.map(x => ({ ...x, score: score(x) }));
    const fields = [{ key: 'title', label: 'Opportunity *' }, { key: 'source', label: 'Source', options: ['Recurring errors', 'Delays', 'Manual work', 'Other'] }, { key: 'impact', label: 'Impact (1–5)', type: 'number' },
      { key: 'time_saved_hours', label: 'Time saved (hours / month)', type: 'number' }, { key: 'cost', label: 'Estimated cost (LKR)', type: 'number' }, { key: 'risk', label: 'Risk (1–5)', type: 'number' }, { key: 'affected_users', label: 'Affected users', type: 'number' },
      { key: 'override_score', label: 'Management override score (optional)', type: 'number' }, { key: 'override_reason', label: 'Override reason' }, { key: 'owner', label: 'Owner' }, { key: 'effort', label: 'Effort (days)', type: 'number' },
      { key: 'target_date', label: 'Target date', type: 'date' }, { key: 'status', label: 'Status', options: ['Proposed', 'Approved', 'In development', 'Testing', 'Deployed', 'Rejected'] }, { key: 'actual_result', label: 'Actual result after deployment', type: 'textarea' }];
    return (<>
      <SectionTitle sub="Continuous improvement: opportunities from recurring errors, delays and manual work, scored by impact, time saved, cost, risk and affected users. Management may override the score; approved plans are tracked to deployment and actual results. Nothing changes automatically."
        right={<Button sx={btnPrimary} onClick={() => setEdit({ type: 'improvement', status: 'Proposed', impact: 3, risk: 2 })}>Propose improvement</Button>}>Improvements</SectionTitle>
      <DataGrid title="Improvements" bankName={bank.name} rows={rows} filterKeys={['status', 'source']} onRowClick={setEdit} exportName="Improvements" defaultSort={{ key: 'score', dir: 'desc' }} columns={[
        { key: 'title', label: 'Opportunity', wrap: true }, { key: 'source', label: 'Source' }, { key: 'score', label: 'Score', type: 'int' }, { key: 'owner', label: 'Owner' }, { key: 'effort', label: 'Effort (d)', type: 'int' },
        { key: 'target_date', label: 'Target' }, { key: 'status', label: 'Status', render: r => <StatusChip value={r.status} /> }, { key: 'actual_result', label: 'Actual result', wrap: true }]} />
      <Form open={!!edit} title={edit?.id ? 'Improvement' : 'Propose improvement'} fields={fields} value={edit} onClose={close} onSave={async v => {
        if (!String(v.title || '').trim()) throw new Error('Title required');
        if (v.override_score !== undefined && v.override_score !== '' && !String(v.override_reason || '').trim()) throw new Error('Give a reason for the override');
        if (['Approved', 'Rejected'].includes(v.status) && !isMgr) throw new Error('Only management approves or rejects improvements');
        await save(me, v.id, { ...v, id: undefined, type: 'improvement' }); await done();
      }} />
    </>);
  }

  // developer capacity
  const devs = list;
  const work = platform.filter(x => ['ca', 'improvement', 'release', 'issue'].includes(x.type) && !['Done', 'Verified', 'Deployed', 'Rejected', 'Released', 'Closed'].includes(x.status));
  const rows = devs.map(d => {
    const mine = work.filter(w => norm(w.owner || w.assignee) === norm(d.name));
    const effort = mine.reduce((s, w) => s + num(w.effort), 0);
    return { ...d, open: mine.length, effort, load: num(d.capacity_days) ? Math.round(effort / num(d.capacity_days) * 100) : null, overdue: mine.filter(w => (w.due || w.target_date) && (w.due || w.target_date) < today).length };
  });
  return (<>
    <SectionTitle sub="Developer resource planning: assignments, workload against capacity, priorities and overdue work. Work items are matched by owner name."
      right={isMgr && <Button sx={btnPrimary} onClick={() => setEdit({ type: 'dev' })}>Add developer</Button>}>Developer Capacity</SectionTitle>
    <DataGrid title="Developer Capacity" bankName={bank.name} rows={rows} filterKeys={[]} onRowClick={isMgr ? setEdit : undefined} exportName="Developer_Capacity" columns={[
      { key: 'name', label: 'Developer' }, { key: 'capacity_days', label: 'Capacity (days / month)', type: 'int' }, { key: 'open', label: 'Open items', type: 'int' }, { key: 'effort', label: 'Assigned effort (days)', type: 'int' },
      { key: 'load', label: 'Load %', type: 'pct' }, { key: 'overdue', label: 'Overdue', type: 'int' }, { key: 'skills', label: 'Skills / modules' }]} />
    <Form open={!!edit} title="Developer" fields={[{ key: 'name', label: 'Name *' }, { key: 'capacity_days', label: 'Capacity (days / month)', type: 'number' }, { key: 'skills', label: 'Skills / modules' }]} value={edit} onClose={close}
      onSave={async v => { if (!String(v.name || '').trim()) throw new Error('Name required'); await save(me, v.id, { ...v, id: undefined, type: 'dev' }); await done(); }} />
  </>);
}
