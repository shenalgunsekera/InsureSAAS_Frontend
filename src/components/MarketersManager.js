import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth';
import {
  collection, doc, setDoc, updateDoc, deleteDoc, addDoc, getDocs,
  onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db, firebaseConfig } from '../firebase';
import { confirmTypedDelete } from '../utils/confirmDelete';
import { useAuth } from '../App';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Collapse from '@mui/material/Collapse';
import Tooltip from '@mui/material/Tooltip';

import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

// Marketer logins are synthetic emails: mkt001@<MARKETER_DOMAIN>
const MARKETER_DOMAIN = 'marketers.insuresaas.lk';
// Public website where affiliate links land
const WEBSITE_ORIGIN = process.env.REACT_APP_WEBSITE_ORIGIN || 'https://insuresaas.lk';

function getSecondaryAuth() {
  const existing = getApps().find(a => a.name === 'secondary');
  const secondaryApp = existing || initializeApp(firebaseConfig, 'secondary');
  return getAuth(secondaryApp);
}

const fmtDate = (ts) => ts?.toDate?.()
  ? ts.toDate().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';

const fmtLKR = (n) => `LKR ${Number(n || 0).toLocaleString()}`;

/**
 * Field marketers: accounts, affiliate links, commission log and tracking.
 *
 * • Accounts are created HERE (never self-registered). The marketer logs in on
 *   the public website at /marketer with the ID + password you give them.
 * • Their affiliate link (/get-quote?ref=ID) credits customer quotes to them;
 *   quotes they enter themselves (POS) are credited automatically.
 * • Commissions are a manual staff-recorded log per marketer with totals.
 */
const MarketersManager = () => {
  const { userProfile } = useAuth();
  const role      = userProfile?.role || '';
  const canManage = role === 'admin' || role === 'manager';
  const canDelete = role === 'admin';

  const [view, setView] = useState('marketers'); // 'marketers' | 'track'
  const [marketers, setMarketers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [quotes,    setQuotes]    = useState([]);       // marketer-attributed quotes
  const [commTotals, setCommTotals] = useState({});     // uid -> total paid
  const [commLogs,   setCommLogs]   = useState({});     // uid -> [records]
  const [expanded,  setExpanded]  = useState('');
  const [trackFilter, setTrackFilter] = useState('all');
  const [toast, setToast] = useState({ open: false, msg: '', severity: 'success' });

  // Create dialog
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ fullName: '', phone: '', marketerId: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState('');
  const [created, setCreated] = useState(null);

  // Commission dialog
  const [commFor, setCommFor] = useState(null);
  const [commForm, setCommForm] = useState({ amount: '', note: '' });
  const [commSaving, setCommSaving] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'marketers'), orderBy('created_at', 'desc'));
    return onSnapshot(q,
      snap => { setMarketers(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false));
  }, []);

  // Marketer-attributed quotes (loaded once; refresh button re-runs)
  const loadQuotes = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'quotes'));
      setQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => q.marketer_id));
    } catch (_) { }
  }, []);
  useEffect(() => { loadQuotes(); }, [loadQuotes]);

  // Commission totals per marketer
  const loadCommissions = useCallback(async (uid) => {
    try {
      const snap = await getDocs(query(collection(db, 'marketers', uid, 'commissions'), orderBy('paid_at', 'desc')));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setCommLogs(prev => ({ ...prev, [uid]: list }));
      setCommTotals(prev => ({ ...prev, [uid]: list.reduce((s, r) => s + Number(r.amount || 0), 0) }));
    } catch (_) { }
  }, []);
  useEffect(() => { marketers.forEach(m => loadCommissions(m.id)); }, [marketers, loadCommissions]);

  const nextId = () => {
    const nums = marketers
      .map(m => /^MKT(\d+)$/.exec(m.marketer_id || ''))
      .filter(Boolean)
      .map(m => parseInt(m[1], 10));
    const n = (nums.length ? Math.max(...nums) : 0) + 1;
    return `MKT${String(n).padStart(3, '0')}`;
  };

  const openAdd = () => {
    setForm({ fullName: '', phone: '', marketerId: nextId(), password: '' });
    setAddError(''); setCreated(null); setAddOpen(true);
  };

  const handleCreate = async () => {
    const id = (form.marketerId || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!form.fullName.trim())    { setAddError('Full name is required'); return; }
    if (id.length < 3)            { setAddError('Marketer ID must be at least 3 characters (e.g. MKT001)'); return; }
    if (form.password.length < 6) { setAddError('Password must be at least 6 characters'); return; }
    if (marketers.some(m => (m.marketer_id || '').toUpperCase() === id)) {
      setAddError(`Marketer ID ${id} is already in use`); return;
    }

    setSaving(true);
    setAddError('');
    try {
      const secondaryAuth = getSecondaryAuth();
      const email = `${id.toLowerCase()}@${MARKETER_DOMAIN}`;
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, form.password);
      await updateProfile(cred.user, { displayName: form.fullName.trim() });

      await setDoc(doc(db, 'marketers', cred.user.uid), {
        marketer_id: id,
        full_name:   form.fullName.trim(),
        phone:       form.phone.trim(),
        active:      true,
        created_at:  serverTimestamp(),
        created_by_name: userProfile?.full_name || '',
      });
      // Public lookup so ?ref= attribution can resolve the name
      await setDoc(doc(db, 'marketer_links', id.toLowerCase()), {
        marketer_id: id,
        name: form.fullName.trim(),
        active: true,
      });

      await signOut(secondaryAuth);
      setCreated({ id, password: form.password, name: form.fullName.trim() });
    } catch (err) {
      setAddError(err.code === 'auth/email-already-in-use'
        ? `Marketer ID ${id} already has a login — pick another ID.`
        : err.message);
    }
    setSaving(false);
  };

  const toggleActive = async (m) => {
    try {
      await updateDoc(doc(db, 'marketers', m.id), { active: !m.active });
      await setDoc(doc(db, 'marketer_links', (m.marketer_id || '').toLowerCase()),
        { marketer_id: m.marketer_id, name: m.full_name || '', active: !m.active });
      setToast({ open: true, msg: !m.active ? `${m.marketer_id} activated.` : `${m.marketer_id} deactivated — their link no longer attributes.`, severity: 'info' });
    } catch (err) { setToast({ open: true, msg: err.message, severity: 'error' }); }
  };

  const removeMarketer = async (m) => {
    if (!confirmTypedDelete(`Delete marketer ${m.full_name || ''} (${m.marketer_id})? Their commission history stays in the database but they disappear from this list.`)) return;
    try {
      await deleteDoc(doc(db, 'marketer_links', (m.marketer_id || '').toLowerCase())).catch(() => {});
      await deleteDoc(doc(db, 'marketers', m.id));
      setToast({ open: true, msg: `${m.marketer_id} deleted. Note: their login still exists in Firebase Authentication — remove it from the console to fully revoke.`, severity: 'info' });
    } catch (err) { setToast({ open: true, msg: err.message, severity: 'error' }); }
  };

  const recordCommission = async () => {
    const amount = Number(String(commForm.amount).replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) { setToast({ open: true, msg: 'Enter a valid amount', severity: 'error' }); return; }
    setCommSaving(true);
    try {
      await addDoc(collection(db, 'marketers', commFor.id, 'commissions'), {
        amount,
        note: commForm.note.trim(),
        marketer_id: commFor.marketer_id,
        recorded_by: userProfile?.full_name || '',
        paid_at: serverTimestamp(),
      });
      await loadCommissions(commFor.id);
      setToast({ open: true, msg: `Commission of ${fmtLKR(amount)} recorded for ${commFor.marketer_id}.`, severity: 'success' });
      setCommFor(null);
      setCommForm({ amount: '', note: '' });
    } catch (err) { setToast({ open: true, msg: err.message, severity: 'error' }); }
    setCommSaving(false);
  };

  const quotesOf = (m) => quotes.filter(q => (q.marketer_id || '').toUpperCase() === (m.marketer_id || '').toUpperCase());
  const confirmedOf = (m) => quotesOf(m).filter(q => q.status === 'confirmed' || q.customer_selection).length;

  const copyLink = async (m) => {
    try {
      await navigator.clipboard.writeText(`${WEBSITE_ORIGIN}/get-quote?ref=${m.marketer_id}`);
      setToast({ open: true, msg: `Affiliate link for ${m.marketer_id} copied.`, severity: 'success' });
    } catch (_) { }
  };

  const trackedQuotes = (trackFilter === 'all'
    ? quotes
    : quotes.filter(q => (q.marketer_id || '').toUpperCase() === trackFilter)
  ).sort((a, b) => (b.created_at?.toDate?.()?.getTime() || 0) - (a.created_at?.toDate?.()?.getTime() || 0));

  const statusChip = (q) => {
    if (q.status === 'confirmed') return { label: 'Confirmed', bg: 'rgba(37,99,235,0.12)', color: '#2563eb' };
    if (q.customer_selection)     return { label: 'Customer Selected', bg: 'rgba(16,185,129,0.12)', color: '#059669' };
    if ((q.responses?.length || 0) > 0) return { label: 'Quotes Ready', bg: 'rgba(16,185,129,0.10)', color: '#059669' };
    if ((q.sent_to?.length || 0) > 0)   return { label: 'In Review', bg: 'rgba(245,158,11,0.12)', color: '#d97706' };
    return { label: 'Submitted', bg: 'rgba(99,102,241,0.10)', color: '#6366f1' };
  };

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ mb: 2.5 }} spacing={1.5}>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Marketers</Typography>
          <Typography sx={{ fontSize: 12, color: '#9CA3AF' }}>
            Field marketers log in on the website at <strong>/marketer</strong> with the ID + password you create here.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant={view === 'marketers' ? 'contained' : 'outlined'} size="small"
            onClick={() => setView('marketers')} sx={{ fontSize: 12 }}>
            Marketers
          </Button>
          <Button variant={view === 'track' ? 'contained' : 'outlined'} size="small"
            onClick={() => { setView('track'); loadQuotes(); }} sx={{ fontSize: 12 }}>
            Track Marketer
          </Button>
          {canManage && view === 'marketers' && (
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openAdd}
              sx={{ fontSize: 12, background: 'linear-gradient(135deg,#10B981,#059669)', boxShadow: 'none' }}>
              New Marketer
            </Button>
          )}
        </Stack>
      </Stack>

      {/* ══ MARKETERS VIEW ══ */}
      {view === 'marketers' && (
        loading ? (
          [...Array(3)].map((_, i) => <Skeleton key={i} variant="rounded" height={80} sx={{ mb: 1.2, borderRadius: '12px' }} />)
        ) : marketers.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <CampaignOutlinedIcon sx={{ fontSize: 40, color: 'rgba(99,102,241,0.25)', mb: 1 }} />
            <Typography sx={{ color: '#9CA3AF' }}>No marketers yet — click "New Marketer" to create the first account.</Typography>
          </Box>
        ) : (
          marketers.map(m => {
            const mq = quotesOf(m);
            const open = expanded === m.id;
            return (
              <Card key={m.id} sx={{ mb: 1.2, border: '1px solid rgba(99,102,241,0.12)' }}>
                <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ flex: 1, minWidth: 220 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{m.full_name || 'Unnamed'}</Typography>
                      <Chip label={m.marketer_id} size="small"
                        sx={{ bgcolor: 'rgba(99,102,241,0.10)', color: '#6366f1', fontWeight: 800, fontSize: 10.5 }} />
                      {m.active === false && (
                        <Chip label="Deactivated" size="small"
                          sx={{ bgcolor: 'rgba(107,114,128,0.12)', color: '#6B7280', fontWeight: 700, fontSize: 10.5 }} />
                      )}
                    </Stack>
                    <Typography sx={{ fontSize: 12, color: '#6B7280', mt: 0.4 }}>
                      {m.phone || '—'} · {mq.length} quote{mq.length === 1 ? '' : 's'} · {confirmedOf(m)} confirmed
                      · Commissions paid: <strong>{fmtLKR(commTotals[m.id])}</strong>
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Tooltip title={`${WEBSITE_ORIGIN}/get-quote?ref=${m.marketer_id}`}>
                      <Button size="small" variant="outlined" startIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                        onClick={() => copyLink(m)}
                        sx={{ fontSize: 11.5, borderColor: 'rgba(99,102,241,0.35)', color: '#6366f1' }}>
                        Affiliate Link
                      </Button>
                    </Tooltip>
                    {canManage && (
                      <Button size="small" variant="outlined" startIcon={<PaymentsOutlinedIcon sx={{ fontSize: 14 }} />}
                        onClick={() => { setCommFor(m); setCommForm({ amount: '', note: '' }); }}
                        sx={{ fontSize: 11.5, borderColor: 'rgba(16,185,129,0.4)', color: '#059669' }}>
                        Record Commission
                      </Button>
                    )}
                    {canManage && (
                      <Button size="small" variant="outlined" onClick={() => toggleActive(m)}
                        sx={{ fontSize: 11.5, borderColor: 'rgba(245,158,11,0.4)', color: '#d97706' }}>
                        {m.active === false ? 'Activate' : 'Deactivate'}
                      </Button>
                    )}
                    {canDelete && (
                      <Button size="small" color="error" variant="outlined" onClick={() => removeMarketer(m)}
                        sx={{ fontSize: 11.5, borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }}>
                        Delete
                      </Button>
                    )}
                    <Button size="small" onClick={() => setExpanded(open ? '' : m.id)} sx={{ minWidth: 34, color: '#9CA3AF' }}>
                      {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </Button>
                  </Stack>
                </Box>
                <Collapse in={open} timeout={200} unmountOnExit>
                  <Box sx={{ px: 2, pb: 2, borderTop: '1px solid rgba(99,102,241,0.08)', pt: 1.5 }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: 1, mb: 1 }}>
                      Commission history — total {fmtLKR(commTotals[m.id])}
                    </Typography>
                    {(commLogs[m.id] || []).length === 0 ? (
                      <Typography sx={{ fontSize: 12.5, color: '#9CA3AF', mb: 1.5 }}>No commissions recorded yet.</Typography>
                    ) : (
                      (commLogs[m.id] || []).map(r => (
                        <Box key={r.id} sx={{ display: 'flex', gap: 2, py: 0.7, borderBottom: '1px dashed rgba(107,114,128,0.15)', flexWrap: 'wrap' }}>
                          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#059669', minWidth: 110 }}>{fmtLKR(r.amount)}</Typography>
                          <Typography sx={{ fontSize: 12.5, color: '#374151', flex: 1 }}>{r.note || '—'}</Typography>
                          <Typography sx={{ fontSize: 11.5, color: '#9CA3AF' }}>{fmtDate(r.paid_at)}{r.recorded_by && ` · by ${r.recorded_by}`}</Typography>
                        </Box>
                      ))
                    )}
                  </Box>
                </Collapse>
              </Card>
            );
          })
        )
      )}

      {/* ══ TRACK VIEW ══ */}
      {view === 'track' && (
        <Box>
          <Stack direction="row" spacing={0.8} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
            <Chip label={`All (${quotes.length})`} size="small" clickable onClick={() => setTrackFilter('all')}
              sx={{ fontWeight: 700, fontSize: 11.5,
                bgcolor: trackFilter === 'all' ? 'rgba(99,102,241,0.12)' : 'transparent',
                color: trackFilter === 'all' ? '#6366f1' : '#9CA3AF',
                border: '1.5px solid rgba(99,102,241,0.25)' }} />
            {marketers.map(m => (
              <Chip key={m.id} label={`${m.marketer_id} (${quotesOf(m).length})`} size="small" clickable
                onClick={() => setTrackFilter((m.marketer_id || '').toUpperCase())}
                sx={{ fontWeight: 700, fontSize: 11.5,
                  bgcolor: trackFilter === (m.marketer_id || '').toUpperCase() ? 'rgba(99,102,241,0.12)' : 'transparent',
                  color: trackFilter === (m.marketer_id || '').toUpperCase() ? '#6366f1' : '#9CA3AF',
                  border: '1.5px solid rgba(107,114,128,0.20)' }} />
            ))}
            <Button size="small" onClick={loadQuotes} sx={{ fontSize: 11.5, color: '#9CA3AF', ml: 'auto' }}>Refresh</Button>
          </Stack>

          {trackedQuotes.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography sx={{ color: '#9CA3AF' }}>No marketer-attributed quotes yet.</Typography>
              <Typography sx={{ fontSize: 12, color: '#A9B6C8', mt: 0.5 }}>
                Quotes arrive here when a customer uses a marketer's affiliate link, or a marketer enters a quote from their portal.
              </Typography>
            </Box>
          ) : (
            trackedQuotes.map(q => {
              const sc = statusChip(q);
              return (
                <Card key={q.id} sx={{ mb: 1, p: 1.8, border: '1px solid rgba(99,102,241,0.10)', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Box sx={{ flex: 1, minWidth: 220 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>{q.reference}</Typography>
                      <Chip label={`👤 ${q.marketer_name || q.marketer_id}`} size="small"
                        sx={{ bgcolor: 'rgba(139,92,246,0.10)', color: '#7c3aed', fontWeight: 700, fontSize: 10.5 }} />
                      <Chip label={q.source === 'marketer' ? 'Entered by marketer' : 'Via affiliate link'} size="small"
                        sx={{ bgcolor: 'rgba(107,114,128,0.10)', color: '#6B7280', fontWeight: 600, fontSize: 10 }} />
                    </Stack>
                    <Typography sx={{ fontSize: 11.5, color: '#9CA3AF', mt: 0.3 }}>
                      {q.client_name || '—'} · {q.product_label || q.product_key} · {fmtDate(q.created_at)}
                    </Typography>
                  </Box>
                  <Chip label={sc.label} size="small" sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 700, fontSize: 11 }} />
                </Card>
              );
            })
          )}
        </Box>
      )}

      {/* ── Create dialog ── */}
      <Dialog open={addOpen} onClose={() => !saving && setAddOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, fontSize: 16 }}>
          {created ? 'Marketer Created ✓' : 'New Marketer Account'}
        </DialogTitle>
        <DialogContent sx={{ pt: '10px !important' }}>
          {created ? (
            <Box>
              <Alert severity="success" sx={{ mb: 2, fontSize: 13 }}>
                Give these credentials to <strong>{created.name}</strong> — they log in at{' '}
                <strong>{WEBSITE_ORIGIN}/marketer</strong>
              </Alert>
              <Box sx={{ p: 2, borderRadius: '10px', bgcolor: 'rgba(99,102,241,0.06)', border: '1px dashed rgba(99,102,241,0.3)' }}>
                <Typography sx={{ fontSize: 13, fontFamily: 'monospace' }}>Marketer ID: <strong>{created.id}</strong></Typography>
                <Typography sx={{ fontSize: 13, fontFamily: 'monospace' }}>Password: <strong>{created.password}</strong></Typography>
                <Typography sx={{ fontSize: 13, fontFamily: 'monospace', mt: 1 }}>
                  Affiliate link:<br /><strong>{WEBSITE_ORIGIN}/get-quote?ref={created.id}</strong>
                </Typography>
              </Box>
              <Button size="small" sx={{ mt: 1.5, fontSize: 12 }} startIcon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                onClick={() => navigator.clipboard.writeText(
                  `Marketer login — ${WEBSITE_ORIGIN}/marketer\nMarketer ID: ${created.id}\nPassword: ${created.password}\nAffiliate link: ${WEBSITE_ORIGIN}/get-quote?ref=${created.id}`
                ).then(() => setToast({ open: true, msg: 'Credentials copied.', severity: 'success' }))}>
                Copy credentials
              </Button>
            </Box>
          ) : (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <TextField size="small" label="Full Name *" value={form.fullName}
                onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
              <TextField size="small" label="Phone" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              <TextField size="small" label="Marketer ID *" value={form.marketerId}
                onChange={e => setForm(f => ({ ...f, marketerId: e.target.value.toUpperCase() }))}
                helperText="Used to log in and in the affiliate link — e.g. MKT001" />
              <TextField size="small" label="Password *" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                helperText="At least 6 characters — you give this to the marketer" />
              {addError && <Alert severity="error" sx={{ fontSize: 12.5 }}>{addError}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddOpen(false)} disabled={saving} variant="outlined"
            sx={{ borderColor: '#e0e0e0', color: '#6B7280' }}>
            {created ? 'Done' : 'Cancel'}
          </Button>
          {!created && (
            <Button variant="contained" onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating…' : 'Create Marketer'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ── Commission dialog ── */}
      <Dialog open={!!commFor} onClose={() => !commSaving && setCommFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, fontSize: 16 }}>
          Record Commission — {commFor?.marketer_id}
        </DialogTitle>
        <DialogContent sx={{ pt: '10px !important' }}>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField size="small" label="Amount (LKR) *" value={commForm.amount}
              onChange={e => setCommForm(f => ({ ...f, amount: e.target.value }))}
              inputProps={{ inputMode: 'numeric' }} />
            <TextField size="small" label="Note" multiline minRows={2} value={commForm.note}
              onChange={e => setCommForm(f => ({ ...f, note: e.target.value }))}
              placeholder="e.g. July commissions — 3 confirmed motor policies" />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCommFor(null)} disabled={commSaving} variant="outlined"
            sx={{ borderColor: '#e0e0e0', color: '#6B7280' }}>Cancel</Button>
          <Button variant="contained" onClick={recordCommission} disabled={commSaving}
            sx={{ background: 'linear-gradient(135deg,#10B981,#059669)', boxShadow: 'none' }}>
            {commSaving ? 'Saving…' : 'Record Payment'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={5000} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast(t => ({ ...t, open: false }))} sx={{ fontSize: 13 }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default MarketersManager;
