// S-20 Management dashboard — five tabs, one global month filter, alerts. No league tables (alphabetical only).
import React, { useMemo, useState } from 'react';
import { useBanca } from '../store';
import { Kpi, SectionTitle, T } from '../ui';
import { lkr, round2, num, monthOf, todayYmd, monthLabel, monthEnd, gwpByMonth, retention, claimMetrics, reconciliation, AGE_BUCKETS } from '../core';
import { TEMPLATES } from '../templates';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, LineChart, Line } from 'recharts';

const shiftMonth = (mk, n) => { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const pctChange = (a, b) => (b ? round2((a - b) / Math.abs(b) * 100) : null);
const chg = (a, b) => { const p = pctChange(a, b); return p === null ? '—' : `${p >= 0 ? '▲' : '▼'} ${Math.abs(p)}%`; };
const short = (v) => (Math.abs(v) >= 1e6 ? `${round2(v / 1e6)}M` : Math.abs(v) >= 1e3 ? `${round2(v / 1e3)}K` : String(round2(v)));

function MiniTable({ title, rows, cols }) {
  return (
    <Box sx={{ flex: '1 1 380px', bgcolor: '#fff', borderRadius: '12px', border: `1px solid ${T.line}`, p: 1.5, overflowX: 'auto' }}>
      <Typography sx={{ fontWeight: 800, fontSize: 13, mb: 1 }}>{title}</Typography>
      <Table size="small"><TableHead><TableRow>{cols.map(c => <TableCell key={c[0]} align={c[2] ? 'right' : 'left'} sx={{ fontWeight: 800, fontSize: 11.5 }}>{c[1]}</TableCell>)}</TableRow></TableHead>
        <TableBody>{rows.length === 0 ? <TableRow><TableCell colSpan={cols.length} sx={{ color: '#9CA3AF' }}>No data</TableCell></TableRow> : rows.map((r, i) => (
          <TableRow key={i}>{cols.map(c => <TableCell key={c[0]} align={c[2] ? 'right' : 'left'} sx={{ fontSize: 12 }}>{c[2] === 'm' ? lkr(r[c[0]]) : c[2] === 'p' ? (r[c[0]] === null ? '—' : `${r[c[0]]}%`) : r[c[0]]}</TableCell>)}</TableRow>))}</TableBody></Table>
    </Box>
  );
}

export function Dashboard() {
  const { model, raw, config } = useBanca();
  const [tab, setTab] = useState(0);
  const [month, setMonth] = useState(monthOf(todayYmd()));
  const year = month.slice(0, 4);
  const byMonth = useMemo(() => gwpByMonth(model.txns), [model]);
  const g = (mk) => byMonth.find(r => r.month === mk) || { new: 0, renewal: 0, endorsement: 0, net: 0, count: 0 };
  const sumRange = (from, to) => round2(byMonth.filter(r => r.month >= from && r.month <= to).reduce((s, r) => s + r.net, 0));
  const cur = g(month), prev = g(shiftMonth(month, -1)), ly = g(shiftMonth(month, -12));
  const ytd = sumRange(`${year}-01`, month), lyYtd = sumRange(`${+year - 1}-01`, shiftMonth(month, -12));
  const lifetime = sumRange('0000-00', month);
  const P = model.policies;
  const S = (f, arr = P) => round2(arr.reduce((s, p) => s + f(p), 0));
  const chart = Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11)).map(mk => ({ month: monthLabel(mk), 'New business': g(mk).new, Renewals: g(mk).renewal, Endorsements: g(mk).endorsement, Net: g(mk).net }));
  const latest = Object.keys(TEMPLATES).map(k => { const b = (raw.batches || []).filter(x => x.register === k && x.status === 'Posted' && x.type !== 'Reversal').sort((a, c) => String(c.uploaded_at).localeCompare(String(a.uploaded_at)))[0]; return { k, label: TEMPLATES[k].label, at: b ? String(b.uploaded_at).slice(0, 16).replace('T', ' ') : '—' }; });
  const openEx = (raw.exceptions || []).filter(e => e.status === 'Open');
  const pendingAppr = (raw.approvals || []).filter(a => a.status === 'Pending');

  // alerts (auto-clear when the cause is resolved)
  const alerts = [];
  if (openEx.length >= num(config.alert_open_exceptions)) alerts.push(['error', `Critical: ${openEx.length} open reconciliation exceptions (threshold ${config.alert_open_exceptions}), exposure LKR ${lkr(openEx.reduce((s, e) => s + num(e.amount), 0))}`]);
  else if (openEx.length) alerts.push(['warning', `${openEx.length} open exception(s) awaiting allocation`]);
  const claw = P.filter(p => p.pmf_due < -0.005);
  if (claw.length) alerts.push(['warning', `${claw.length} Bank clawback(s) totalling LKR ${lkr(-S(p => Math.min(0, p.pmf_due), claw))} to offset on the next statement`]);
  const old = P.filter(p => p.outstanding > 0.005 && p.age_bucket === '90+');
  if (old.length) alerts.push(['warning', `${old.length} polic${old.length === 1 ? 'y has' : 'ies have'} premium outstanding over 90 days (LKR ${lkr(S(p => p.outstanding, old))})`]);
  const noDoc = (raw.batches || []).filter(b => b.type !== 'Reversal' && b.status === 'Posted' && !b.file_id && TEMPLATES[b.register]?.library);
  if (noDoc.length) alerts.push(['info', `${noDoc.length} posted batch(es) have no source document linked`]);
  if (pendingAppr.length) alerts.push(['info', `${pendingAppr.length} approval(s) pending`]);
  if (!config.payment_method_cleared) alerts.push(['info', 'Legal hold active — live Bank payments are blocked until the payment method is cleared']);

  const groupBy = (key, arr, fn) => { const m = new Map(); for (const x of arr) { const k = x[key] || '—'; m.set(k, fn(m.get(k), x)); } return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))); };
  const monthTx = model.txns.filter(t => t.gwp_month === month);
  const byBranch = groupBy('branch', monthTx, (a = { net: 0, n: 0 }, t) => ({ net: a.net + num(t.total), n: a.n + 1 })).map(([k, v]) => ({ k, net: round2(v.net), n: v.n }));
  const byClass = groupBy('class', monthTx, (a = { net: 0, n: 0 }, t) => ({ net: a.net + num(t.total), n: a.n + 1 })).map(([k, v]) => ({ k, net: round2(v.net), n: v.n }));
  const byInsurer = groupBy('insurer', P, (a = { prem: 0, comm: 0, claims: 0 }, p) => ({ prem: a.prem + p.net_total, comm: a.comm + p.comm_received, claims: a.claims + p.claims_paid })).map(([k, v]) => ({ k, prem: round2(v.prem), comm: round2(v.comm), claims: round2(v.claims) }));

  // renewals
  const ret = retention(P, `${month}-01`, monthEnd(month));
  const retTrend = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).map(mk => { const r = retention(P, `${mk}-01`, monthEnd(mk)); return { month: monthLabel(mk), 'By count %': r.countPct, 'By premium %': r.premiumPct }; });
  const retBy = (key) => groupBy(key, P.filter(p => p.expiry && p.expiry.slice(0, 7) === month && !p.cancelled), (a = [], p) => [...a, p]).map(([k, arr]) => { const r = retention(arr, `${month}-01`, monthEnd(month)); return { k, expiring: r.expiring, renewed: r.renewed, lost: r.lost, pct: r.countPct, prem: r.premiumPct }; });
  // claims
  const cm = claimMetrics(model.claims, P);
  const claimsBy = (key) => groupBy(key, model.claims, (a = [], c) => [...a, c]).map(([k, arr]) => { const m = claimMetrics(arr, P); return { k, n: m.count, est: m.estimate, paid: m.paid, out: m.outstanding, rate: m.settlementRate, lr: m.lossRatio }; });
  // data quality
  const regDq = Object.keys(TEMPLATES).map(k => { const bs = (raw.batches || []).filter(b => b.register === k && b.type !== 'Reversal'); return { k: TEMPLATES[k].label, batches: bs.length, rejected: bs.reduce((s, b) => s + (b.stats?.rejected || 0), 0), exposure: round2(bs.reduce((s, b) => s + num(b.stats?.rejectedTotal), 0)), missing: bs.filter(b => !b.file_id && TEMPLATES[k].library).length }; });
  const stages = reconciliation(model, openEx);
  const exAge = AGE_BUCKETS.map(b => { const arr = openEx.filter(e => { const d = Math.max(0, Math.round((new Date(todayYmd()) - new Date(e.opened_at || todayYmd())) / 86400000)); return (d <= 30 ? '0-30' : d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+') === b; }); return { k: `${b} days`, n: arr.length, v: round2(arr.reduce((s, e) => s + num(e.amount), 0)) }; });

  return (<>
    <SectionTitle sub="Live figures refresh after every confirmed import. Net GWP is recognised by inception month (originals) or effective-date month (endorsements)."
      right={<TextField size="small" type="month" label="Reporting month" value={month} onChange={e => setMonth(e.target.value)} InputLabelProps={{ shrink: true }} />}>Management Dashboard</SectionTitle>
    {alerts.map(([sev, txt], i) => <Alert key={i} severity={sev} sx={{ mb: 0.8, py: 0 }}>{txt}</Alert>)}
    <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ my: 1, '& .MuiTab-root': { textTransform: 'none', fontWeight: 700 } }}>
      {['Financial Performance', 'Renewals', 'Claims', 'Data Quality', 'Reconciliation'].map(t => <Tab key={t} label={t} />)}
    </Tabs>

    {tab === 0 && <>
      <Stack direction="row" spacing={1.2} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
        <Kpi label={`Net GWP · ${monthLabel(month)}`} value={`LKR ${lkr(cur.net)}`} sub={`MoM ${chg(cur.net, prev.net)} · same month LY ${chg(cur.net, ly.net)}`} />
        <Kpi label="New business" value={`LKR ${lkr(cur.new)}`} /><Kpi label="Renewals" value={`LKR ${lkr(cur.renewal)}`} /><Kpi label="Net endorsements" value={`LKR ${lkr(cur.endorsement)}`} />
        <Kpi label={`YTD ${year}`} value={`LKR ${lkr(ytd)}`} sub={`YoY ${chg(ytd, lyYtd)}`} /><Kpi label="Lifetime net GWP" value={`LKR ${lkr(lifetime)}`} />
      </Stack>
      <Stack direction="row" spacing={1.2} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
        <Kpi label="Premium received" value={`LKR ${lkr(S(p => p.paid))}`} /><Kpi label="Premium outstanding" value={`LKR ${lkr(S(p => Math.max(0, p.outstanding)))}`} color={T.amber} />
        <Kpi label="Commission expected" value={`LKR ${lkr(S(p => p.exp_comm))}`} /><Kpi label="Commission received" value={`LKR ${lkr(S(p => p.comm_received))}`} />
        <Kpi label="Bank payable" value={`LKR ${lkr(S(p => (p.pmf_eligible ? Math.max(0, p.pmf_due) : 0)))}`} color={T.green} /><Kpi label="Bank paid" value={`LKR ${lkr(S(p => p.pmf_paid))}`} />
      </Stack>
      <Box sx={{ bgcolor: '#fff', borderRadius: '12px', border: `1px solid ${T.line}`, p: 1.5, mb: 1.5, height: 320 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 13 }}>Net GWP — last 12 months</Typography>
        <ResponsiveContainer width="100%" height="90%"><BarChart data={chart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" fontSize={11} /><YAxis tickFormatter={short} fontSize={11} /><Tooltip formatter={(v) => lkr(v)} /><Legend />
          <Bar dataKey="New business" stackId="a" fill={T.primary} /><Bar dataKey="Renewals" stackId="a" fill={T.dark} /><Bar dataKey="Endorsements" stackId="a" fill={T.accent} /></BarChart></ResponsiveContainer>
      </Box>
      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
        <MiniTable title={`Net GWP by branch · ${monthLabel(month)}`} rows={byBranch} cols={[['k', 'Branch'], ['n', 'Txns', 1], ['net', 'Net GWP', 'm']]} />
        <MiniTable title={`Net GWP by class · ${monthLabel(month)}`} rows={byClass} cols={[['k', 'Class'], ['n', 'Txns', 1], ['net', 'Net GWP', 'm']]} />
        <MiniTable title="Insurer performance (all periods)" rows={byInsurer} cols={[['k', 'Insurer'], ['prem', 'Net premium', 'm'], ['comm', 'Commission received', 'm'], ['claims', 'Claims paid', 'm']]} />
        <MiniTable title="Latest upload per register" rows={latest} cols={[['label', 'Register'], ['at', 'Latest posted batch']]} />
      </Stack>
    </>}

    {tab === 1 && <>
      <Stack direction="row" spacing={1.2} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
        <Kpi label={`Expiring in ${monthLabel(month)}`} value={ret.expiring} sub={`LKR ${lkr(ret.expiringPremium)}`} />
        <Kpi label="Renewed" value={ret.renewed} sub={`LKR ${lkr(ret.renewedPremium)}`} color={T.green} /><Kpi label="Lost (expired, not renewed)" value={ret.lost} color={ret.lost ? T.danger : undefined} />
        <Kpi label="Retention by count" value={`${ret.countPct}%`} /><Kpi label="Retention by premium" value={`${ret.premiumPct}%`} />
        <Kpi label="Expiring next 30 days" value={P.filter(p => !p.renewed_by && !p.cancelled && p.days_left >= 0 && p.days_left <= 30).length} />
      </Stack>
      <Box sx={{ bgcolor: '#fff', borderRadius: '12px', border: `1px solid ${T.line}`, p: 1.5, mb: 1.5, height: 280 }}>
        <Typography sx={{ fontWeight: 800, fontSize: 13 }}>Retention — last 6 months (by expiry month)</Typography>
        <ResponsiveContainer width="100%" height="88%"><LineChart data={retTrend}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" fontSize={11} /><YAxis unit="%" fontSize={11} /><Tooltip /><Legend />
          <Line dataKey="By count %" stroke={T.primary} strokeWidth={2} /><Line dataKey="By premium %" stroke={T.dark} strokeWidth={2} /></LineChart></ResponsiveContainer>
      </Box>
      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
        <MiniTable title="Renewal movement by insurer" rows={retBy('insurer')} cols={[['k', 'Insurer'], ['expiring', 'Expiring', 1], ['renewed', 'Renewed', 1], ['lost', 'Lost', 1], ['pct', 'By count', 'p'], ['prem', 'By premium', 'p']]} />
        <MiniTable title="Renewal movement by branch" rows={retBy('branch')} cols={[['k', 'Branch'], ['expiring', 'Expiring', 1], ['renewed', 'Renewed', 1], ['lost', 'Lost', 1], ['pct', 'By count', 'p'], ['prem', 'By premium', 'p']]} />
      </Stack>
    </>}

    {tab === 2 && <>
      <Stack direction="row" spacing={1.2} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
        <Kpi label="Claims" value={cm.count} /><Kpi label="Estimated loss" value={`LKR ${lkr(cm.estimate)}`} /><Kpi label="Paid" value={`LKR ${lkr(cm.paid)}`} />
        <Kpi label="Outstanding" value={`LKR ${lkr(cm.outstanding)}`} color={T.amber} /><Kpi label="Settlement rate" value={`${cm.settlementRate}%`} />
        <Kpi label="Avg settlement time" value={cm.avgSettlementDays === null ? '—' : `${cm.avgSettlementDays} days`} sub="intimation → final payment" />
        <Kpi label="Loss ratio" value={cm.lossRatio === null ? '—' : `${cm.lossRatio}%`} sub="(paid + outstanding) / net GWP of claimed policies" />
      </Stack>
      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
        {[['class', 'Class'], ['insurer', 'Insurer'], ['branch', 'Branch']].map(([k, l]) => (
          <MiniTable key={k} title={`Claims by ${l.toLowerCase()}`} rows={claimsBy(k)} cols={[['k', l], ['n', 'Claims', 1], ['est', 'Estimate', 'm'], ['paid', 'Paid', 'm'], ['out', 'Outstanding', 'm'], ['rate', 'Settled', 'p'], ['lr', 'Loss ratio', 'p']]} />))}
      </Stack>
    </>}

    {tab === 3 && <>
      <Stack direction="row" spacing={1.2} useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
        <Kpi label="Open exceptions" value={openEx.length} sub={`LKR ${lkr(openEx.reduce((s, e) => s + num(e.amount), 0))} exposure`} color={openEx.length ? T.amber : T.green} />
        <Kpi label="Rejected rows (all batches)" value={regDq.reduce((s, r) => s + r.rejected, 0)} sub={`LKR ${lkr(regDq.reduce((s, r) => s + r.exposure, 0))}`} />
        <Kpi label="Batches without source document" value={noDoc.length} color={noDoc.length ? T.amber : T.green} />
        <Kpi label="Policies missing branch / class" value={P.filter(p => !p.branch || !p.class).length} />
      </Stack>
      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
        <MiniTable title="Completeness by source register" rows={regDq} cols={[['k', 'Register'], ['batches', 'Batches', 1], ['rejected', 'Rejected rows', 1], ['exposure', 'Rejected exposure', 'm'], ['missing', 'Missing source docs', 1]]} />
        <MiniTable title="Open exceptions by type" rows={['receipt', 'commission'].map(k => ({ k, n: openEx.filter(e => e.kind === k).length, v: round2(openEx.filter(e => e.kind === k).reduce((s, e) => s + num(e.amount), 0)) }))} cols={[['k', 'Type'], ['n', 'Count', 1], ['v', 'Exposure', 'm']]} />
      </Stack>
    </>}

    {tab === 4 && <>
      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
        <MiniTable title="Four-stage reconciliation" rows={stages.map(s => ({ ...s, k: s.stage }))} cols={[['k', 'Stage'], ['expected', 'Expected', 'm'], ['actual', 'Actual', 'm'], ['variance', 'Variance', 'm'], ['unmatched', 'Unmatched', 'm']]} />
        <MiniTable title="Unresolved exceptions — ageing" rows={exAge} cols={[['k', 'Age'], ['n', 'Count', 1], ['v', 'Amount', 'm']]} />
        <MiniTable title="Month-end sign-offs" rows={[...(raw.signoffs || [])].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12).map(s => ({ k: s.month, by: s.by, at: String(s.at).slice(0, 10), ex: s.open_exceptions }))} cols={[['k', 'Month'], ['by', 'Signed by'], ['at', 'On'], ['ex', 'Open exceptions', 1]]} />
      </Stack>
      <Typography sx={{ fontSize: 11.5, color: T.muted, mt: 1 }}>Statements for a month cannot be approved while exceptions dated up to that month are open.</Typography>
    </>}
    <Typography sx={{ fontSize: 11, color: '#9CA3AF', mt: 2 }}>No rankings of employees or insurers are shown; tables are alphabetical. Formulas for claims and retention measures follow SRS §4.9 (pending business approval, D4).</Typography>
  </>);
}
