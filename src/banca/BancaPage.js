// InsureSAAS Banca — its own sub-space inside the portal (route /banca/:bankId/:section).
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../App';
import { BANKS } from './core';
import { BancaProvider, useBanca } from './store';
import { T, PolicyDrawer } from './ui';
import brandLogo from '../InsureSAAS Logo.png';
import { MasterRegister, GwpRegister, PaymentsRegister, CommissionRegister, RenewalTracker, CommissionTracker, OutstandingTracker, ExpiredTracker, CommissionSplit, Library, ClaimsTracker } from './screens/Registers';
import { UploadPage, BatchHistory, Exceptions, Reconciliation } from './screens/Operations';
import { Statements, Approvals, Targets } from './screens/Finance';
import { Dashboard } from './screens/Dashboard';
import { Settings, AuditLog } from './screens/Admin';
import { UploadFields } from './screens/Fields';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { Platform } from './screens/Platform';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Drawer from '@mui/material/Drawer';
import CircularProgress from '@mui/material/CircularProgress';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MenuIcon from '@mui/icons-material/Menu';
import RefreshIcon from '@mui/icons-material/Refresh';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PercentIcon from '@mui/icons-material/Percent';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import TrackChangesOutlinedIcon from '@mui/icons-material/TrackChangesOutlined';
import HourglassBottomOutlinedIcon from '@mui/icons-material/HourglassBottomOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import CallSplitOutlinedIcon from '@mui/icons-material/CallSplitOutlined';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import BalanceOutlinedIcon from '@mui/icons-material/BalanceOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import ManageSearchOutlinedIcon from '@mui/icons-material/ManageSearchOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import ReportGmailerrorredOutlinedIcon from '@mui/icons-material/ReportGmailerrorredOutlined';
import RestoreOutlinedIcon from '@mui/icons-material/RestoreOutlined';
import BuildCircleOutlinedIcon from '@mui/icons-material/BuildCircleOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import CompareArrowsOutlinedIcon from '@mui/icons-material/CompareArrowsOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Collapse from '@mui/material/Collapse';
import Stack from '@mui/material/Stack';

const NAV_ICONS = {
  'master': TableChartOutlinedIcon,
  'gwp': ReceiptLongOutlinedIcon,
  'payments': PaymentsOutlinedIcon,
  'commission': PercentIcon,
  'renewals': EventRepeatOutlinedIcon,
  'commission-tracker': TrackChangesOutlinedIcon,
  'outstanding': HourglassBottomOutlinedIcon,
  'expired': EventBusyOutlinedIcon,
  'split': CallSplitOutlinedIcon,
  'lib-gwp': LibraryBooksOutlinedIcon,
  'lib-payment': TaskAltOutlinedIcon,
  'lib-commission': DescriptionOutlinedIcon,
  'claims': GavelOutlinedIcon,
  'dashboard': DashboardOutlinedIcon,
  'upload': CloudUploadOutlinedIcon,
  'batches': HistoryOutlinedIcon,
  'exceptions': ErrorOutlineIcon,
  'reconciliation': BalanceOutlinedIcon,
  'statements': AccountBalanceWalletOutlinedIcon,
  'approvals': CheckCircleIcon,
  'lib-pmf': FolderOutlinedIcon,
  'lib-claims': ManageSearchOutlinedIcon,
  'targets': FlagOutlinedIcon,
  'settings': SettingsOutlinedIcon,
  'fields': TuneOutlinedIcon,
  'audit': ReportGmailerrorredOutlinedIcon,
  'p-dr': RestoreOutlinedIcon,
  'p-ca': BuildCircleOutlinedIcon,
  'p-issue': BugReportOutlinedIcon,
  'p-incident': CompareArrowsOutlinedIcon,
  'p-release': RocketLaunchOutlinedIcon,
  'p-training': SchoolOutlinedIcon,
  'p-improvement': LightbulbOutlinedIcon,
  'p-dev': GroupsOutlinedIcon,
};

// Left navigation — the first 13 entries are the registers, trackers and libraries.
const NAV = [
  { group: 'InsureSAAS Banca', items: [
    ['master', 'Master Register'], ['gwp', 'GWP Register'], ['payments', 'Payments Register'], ['commission', 'Commission Register'],
    ['renewals', 'Renewal Tracker'], ['commission-tracker', 'Commission Tracker'], ['outstanding', 'Outstanding Tracker'], ['expired', 'Expired Policy Tracker'],
    ['split', 'Bank & InsureSAAS Commission Split'], ['lib-gwp', 'GWP Report Library'], ['lib-payment', 'Payment Confirmations Library'], ['lib-commission', 'Commission Reports Library'], ['claims', 'Claims Tracker'],
  ] },
  { group: 'Operations', items: [['dashboard', 'Management Dashboard'], ['upload', 'Bulk Upload'], ['batches', 'Batch History'], ['exceptions', 'Exceptions'], ['reconciliation', 'Reconciliation'], ['statements', 'Bank Statements & Payments'], ['approvals', 'Approvals'], ['lib-pmf', 'Bank Payment Library'], ['lib-claims', 'Claims Document Library']] },
  { group: 'Administration', items: [['targets', 'GWP Targets'], ['fields', 'Upload Fields'], ['settings', 'Settings'], ['audit', 'Audit Log']] },
  { group: 'Platform Support', items: [['p-dr', 'DR Tests'], ['p-ca', 'Corrective Actions'], ['p-issue', 'Issues & Support'], ['p-incident', 'Incidents'], ['p-release', 'Releases'], ['p-training', 'Training'], ['p-improvement', 'Improvements'], ['p-dev', 'Developer Capacity']] },
];

function Shell() {
  const { bankId, section = 'master' } = useParams();
  const navigate = useNavigate();
  const ctx = useBanca();
  const { bank, loading, error, model, raw, reload, me, platform = [], loadedAt } = ctx;
  const [policy, setPolicy] = useState(null);
  const [uploadReg, setUploadReg] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [closed, setClosed] = useState({ 'Platform Support': true });
  const go = (s) => { navigate(`/banca/${bankId}/${s}`); setMobileNav(false); };
  const goUpload = (reg) => { setUploadReg(reg); go('upload'); };
  const openPolicy = (p) => p && setPolicy(model.byId.get(p.id) || p);
  const pendingMine = (raw?.approvals || []).filter(a => a.status === 'Pending' && a.maker_uid !== me.uid).length;
  const openEx = (raw?.exceptions || []).filter(e => e.status === 'Open').length;
  const incidents = platform.filter(x => x.type === 'incident' && x.status === 'Active');

  const nav = (
    <Box sx={{ width: 272, bgcolor: T.dark, color: '#fff', height: '100%', overflowY: 'auto', py: 1.5, display: 'flex', flexDirection: 'column',
      '&::-webkit-scrollbar': { width: 6 }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 3 } }}>
      <Box sx={{ mx: 1.5, mb: 1.5, p: 1.4, borderRadius: '12px', background: 'linear-gradient(135deg, rgba(37,94,171,0.22), rgba(29,78,150,0.12))', border: '1px solid rgba(255,255,255,0.08)' }}>
        <Typography sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: 'rgba(255,255,255,0.6)' }}>BANCASSURANCE</Typography>
        <Typography sx={{ fontSize: 14, fontWeight: 800 }}>{bank.title}</Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.8 }}>
          <Chip size="small" label={`${model ? model.policies.length : 0} policies`} sx={{ height: 20, fontSize: 10.5, bgcolor: 'rgba(255,255,255,0.1)', color: '#fff' }} />
          {openEx > 0 && <Chip size="small" label={`${openEx} exceptions`} sx={{ height: 20, fontSize: 10.5, bgcolor: 'rgba(37,94,171,0.35)', color: '#fff' }} />}
        </Stack>
      </Box>
      {NAV.map(g => {
        const isOpen = !closed[g.group];
        const hasActive = g.items.some(([k]) => k === section);
        return (
          <Box key={g.group} sx={{ mb: 0.8 }}>
            <Box onClick={() => setClosed(c => ({ ...c, [g.group]: isOpen }))} sx={{ px: 2.2, py: 0.7, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', '&:hover .gl': { color: 'rgba(255,255,255,0.8)' } }}>
              <Typography className="gl" sx={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.1, textTransform: 'uppercase', color: hasActive ? T.active : 'rgba(255,255,255,0.45)', transition: 'color .15s' }}>{g.group}</Typography>
              <ExpandMoreIcon sx={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', transform: isOpen ? 'none' : 'rotate(-90deg)', transition: 'transform .2s' }} />
            </Box>
            <Collapse in={isOpen || hasActive}>
              {g.items.map(([k, label]) => {
                const active = section === k;
                const badge = k === 'approvals' ? pendingMine : k === 'exceptions' ? openEx : 0;
                const Icon = NAV_ICONS[k] || FolderOutlinedIcon;
                return (
                  <Box key={k} onClick={() => go(k)} sx={{ mx: 1.2, my: 0.25, pl: 1.2, pr: 1, py: 0.8, borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.2,
                    bgcolor: active ? T.active : 'transparent', color: active ? T.dark : 'rgba(255,255,255,0.82)',
                    boxShadow: active ? '0 4px 14px rgba(255,224,102,0.25)' : 'none', transition: 'background .15s, transform .15s',
                    '&:hover': { bgcolor: active ? T.active : 'rgba(255,255,255,0.07)', transform: active ? 'none' : 'translateX(2px)' } }}>
                    <Icon sx={{ fontSize: 18, color: active ? T.dark : 'rgba(255,255,255,0.55)', flexShrink: 0 }} />
                    <Typography sx={{ flex: 1, fontSize: 13, fontWeight: active ? 800 : 500, lineHeight: 1.25 }}>{label}</Typography>
                    {badge > 0 && <Box sx={{ minWidth: 20, height: 20, px: 0.6, borderRadius: '10px', bgcolor: active ? T.dark : T.primary, color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{badge}</Box>}
                  </Box>
                );
              })}
            </Collapse>
          </Box>
        );
      })}
      <Box sx={{ flex: 1 }} />
      <Box sx={{ mx: 1.5, mt: 1, p: 1.2, borderRadius: '12px', bgcolor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg,${T.primary},${T.accent})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>
          {(me.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.name}</Typography>
          <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize' }}>{me.role}</Typography>
        </Box>
      </Box>
    </Box>
  );

  let body = null;
  if (!loading && !error && model) {
    const P = { openPolicy, goUpload };
    const map = {
      master: <MasterRegister {...P} />, gwp: <GwpRegister {...P} />, payments: <PaymentsRegister {...P} />, commission: <CommissionRegister {...P} />,
      renewals: <RenewalTracker {...P} />, 'commission-tracker': <CommissionTracker {...P} />, outstanding: <OutstandingTracker {...P} />, expired: <ExpiredTracker {...P} />,
      split: <CommissionSplit {...P} />, 'lib-gwp': <Library library="gwp" />, 'lib-payment': <Library library="payment" />, 'lib-commission': <Library library="commission" />,
      'lib-pmf': <Library library="pmf_payment" />, 'lib-claims': <Library library="claims" />, claims: <ClaimsTracker {...P} />,
      dashboard: <Dashboard />, upload: <UploadPage key={uploadReg || 'u'} initialRegister={uploadReg} />, batches: <BatchHistory />, exceptions: <Exceptions {...P} />, reconciliation: <Reconciliation />,
      statements: <Statements />, approvals: <Approvals />, targets: <Targets {...P} />, settings: <Settings />, fields: <UploadFields />, audit: <AuditLog />,
      'p-dr': <Platform kind="dr" />, 'p-ca': <Platform kind="ca" />, 'p-issue': <Platform kind="issue" />, 'p-incident': <Platform kind="incident" />, 'p-release': <Platform kind="release" />,
      'p-training': <Platform kind="training" />, 'p-improvement': <Platform kind="improvement" />, 'p-dev': <Platform kind="dev" />,
    };
    body = map[section] || <Alert severity="warning">Unknown section.</Alert>;
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: T.bg, display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <Box sx={{ height: 62, px: { xs: 1, md: 2 }, display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: '#fff', borderBottom: `1px solid ${T.line}`, position: 'sticky', top: 0, zIndex: 20 }}>
        <IconButton sx={{ display: { md: 'none' } }} onClick={() => setMobileNav(true)}><MenuIcon /></IconButton>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/menu')} sx={{ textTransform: 'none', color: T.muted, display: { xs: 'none', sm: 'inline-flex' } }}>Portal</Button>
        <Box component="img" src={brandLogo} alt="InsureSAAS" sx={{ width: 40, height: 40, objectFit: 'cover', borderRadius: '10px', border: `1px solid ${T.line}` }} />
        <Box sx={{ ml: 0.5 }}>
          <Typography sx={{ fontWeight: 900, fontSize: 17, color: T.dark, lineHeight: 1.1 }}>{bank.heading}</Typography>
          <Typography sx={{ fontSize: 11, color: T.muted }}>Bancassurance · InsureSAAS Insurance Brokers (Pvt) Ltd</Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        {loadedAt && <Typography sx={{ fontSize: 11, color: '#9CA3AF', display: { xs: 'none', md: 'block' } }}>Data loaded {loadedAt.toLocaleTimeString()}</Typography>}
        <IconButton onClick={reload} title="Refresh data"><RefreshIcon /></IconButton>
        <Chip label={`${me.name} · ${me.role}`} size="small" sx={{ fontWeight: 700, display: { xs: 'none', sm: 'flex' } }} />
      </Box>
      <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Box sx={{ display: { xs: 'none', md: 'block' }, position: 'sticky', top: 62, height: 'calc(100vh - 62px)' }}>{nav}</Box>
        <Drawer open={mobileNav} onClose={() => setMobileNav(false)} sx={{ display: { md: 'none' } }}>{nav}</Drawer>
        <Box sx={{ flex: 1, minWidth: 0, p: { xs: 1.5, md: 2.5 } }}>
          {incidents.map(i => <Alert key={i.id} severity="error" sx={{ mb: 1 }}>Incident in progress: {i.title}{i.notice ? ` — ${i.notice}` : ''}</Alert>)}
          {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: T.primary }} /></Box>}
          {error && <Alert severity="error">{error}</Alert>}
          {body}
        </Box>
      </Box>
      <PolicyDrawer policy={policy} model={model || { byId: new Map() }} batches={raw?.batches} files={raw?.files} onClose={() => setPolicy(null)} onOpenPolicy={openPolicy} />
    </Box>
  );
}

export default function BancaPage() {
  const { bankId } = useParams();
  const { hasAccess } = useAuth();
  const navigate = useNavigate();
  const bank = BANKS[bankId];
  if (!bank) return <Box sx={{ p: 4 }}><Alert severity="error">Unknown bank module.</Alert></Box>;
  if (!hasAccess(`banca_${bankId}`)) return (
    <Box sx={{ p: 4 }}><Alert severity="warning" action={<Button onClick={() => navigate('/menu')}>Back</Button>}>You don't have access to the {bank.title} module. Ask an administrator to grant it in Admin Panel → Module Access.</Alert></Box>
  );
  return <BancaProvider bankId={bankId}><Shell /></BancaProvider>;
}
