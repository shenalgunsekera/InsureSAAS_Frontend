import React, { useState, useEffect } from 'react';
import { collection, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
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
import Tooltip from '@mui/material/Tooltip';

import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';

/**
 * Website customer accounts.
 *
 * Signup on the public website is free (no SMS): one account per phone number
 * is enforced by Firebase, and every account starts UNVERIFIED. The broker
 * verifies phone ownership here after the first call to the customer — that
 * call happens before any quote is processed anyway, so verification costs
 * nothing extra.
 *
 * "Shared device" flags mean several accounts were created from the same
 * browser. That is a signal to review, not proof of abuse (a family tablet or
 * an agent helping walk-in customers looks the same).
 */
const CustomersManager = () => {
  const { userProfile } = useAuth();
  const role      = userProfile?.role || '';
  const canVerify = role === 'admin' || role === 'manager';
  const canDelete = role === 'admin';

  const [customers, setCustomers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('all');
  const [search,    setSearch]    = useState('');
  const [busyId,    setBusyId]    = useState('');
  const [toast,     setToast]     = useState({ open: false, msg: '', severity: 'success' });

  useEffect(() => {
    const q = query(collection(db, 'customers'), orderBy('created_at', 'desc'));
    return onSnapshot(q,
      snap => { setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false));
  }, []);

  // How many accounts share each signup device (soft duplicate signal)
  const deviceCounts = {};
  customers.forEach(c => {
    if (c.signup_device_id) deviceCounts[c.signup_device_id] = (deviceCounts[c.signup_device_id] || 0) + 1;
  });
  const isFlagged = c => c.signup_device_id && deviceCounts[c.signup_device_id] > 1;

  const setVerified = async (c, verified) => {
    setBusyId(c.id);
    try {
      await updateDoc(doc(db, 'customers', c.id), {
        phone_verified: verified,
        ...(verified
          ? { verified_by: userProfile?.full_name || '', verified_at: serverTimestamp() }
          : { verified_by: '', verified_at: null }),
      });
      setToast({ open: true, msg: verified ? `${c.full_name || c.phone} marked verified.` : 'Verification removed.', severity: 'success' });
    } catch (err) {
      setToast({ open: true, msg: err.message, severity: 'error' });
    }
    setBusyId('');
  };

  const remove = async (c) => {
    if (!confirmTypedDelete(`Delete customer "${c.full_name || c.phone}"? Their profile and access will be removed.`)) return;
    setBusyId(c.id);
    try {
      await deleteDoc(doc(db, 'customers', c.id));
      setToast({ open: true, msg: 'Customer profile deleted. Note: their login still exists in Firebase Authentication — remove it from the Firebase console if needed.', severity: 'info' });
    } catch (err) {
      setToast({ open: true, msg: err.message, severity: 'error' });
    }
    setBusyId('');
  };

  const filtered = customers.filter(c => {
    if (filter === 'verified'   && !c.phone_verified) return false;
    if (filter === 'unverified' &&  c.phone_verified) return false;
    if (filter === 'flagged'    && !isFlagged(c))     return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [c.full_name, c.phone].some(v => (v || '').toLowerCase().includes(q));
  });

  const stats = {
    total:      customers.length,
    verified:   customers.filter(c => c.phone_verified).length,
    unverified: customers.filter(c => !c.phone_verified).length,
    flagged:    customers.filter(isFlagged).length,
  };

  const fmtDate = (ts) => ts?.toDate?.()
    ? ts.toDate().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ mb: 2.5 }} spacing={1.5}>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Website Customers</Typography>
          <Typography sx={{ fontSize: 12, color: '#9CA3AF' }}>
            Verify a customer's phone after your first call to them — one account per mobile number.
          </Typography>
        </Box>
      </Stack>

      {/* Stats */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        {[
          { label: 'Total',           val: stats.total,      color: '#6366f1', key: 'all' },
          { label: 'Awaiting Verify', val: stats.unverified, color: '#d97706', key: 'unverified' },
          { label: 'Verified',        val: stats.verified,   color: '#059669', key: 'verified' },
          { label: 'Shared Device',   val: stats.flagged,    color: '#dc2626', key: 'flagged' },
        ].map(s => (
          <Box key={s.label} onClick={() => setFilter(s.key)}
            sx={{ flex: 1, p: 2, borderRadius: '12px', cursor: 'pointer',
                  bgcolor: `${s.color}14`,
                  border: filter === s.key ? `1.5px solid ${s.color}` : '1.5px solid transparent' }}>
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</Typography>
            <Typography sx={{ fontSize: 12, color: '#6B7280' }}>{s.label}</Typography>
          </Box>
        ))}
      </Stack>

      <TextField size="small" fullWidth placeholder="Search by name or phone…" value={search}
        onChange={e => setSearch(e.target.value)} sx={{ mb: 2 }} />

      {loading ? (
        [...Array(4)].map((_, i) => <Skeleton key={i} variant="rounded" height={64} sx={{ mb: 1.2, borderRadius: '12px' }} />)
      ) : filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <PeopleAltOutlinedIcon sx={{ fontSize: 40, color: 'rgba(99,102,241,0.25)', mb: 1 }} />
          <Typography sx={{ color: '#9CA3AF' }}>
            {customers.length === 0 ? 'No website customer accounts yet.' : 'No customers match this filter.'}
          </Typography>
        </Box>
      ) : (
        filtered.map(c => (
          <Card key={c.id} sx={{ mb: 1.2, p: 2, border: '1px solid rgba(99,102,241,0.12)',
                                  display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 200 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{c.full_name || 'Unnamed'}</Typography>
                {c.phone_verified ? (
                  <Chip icon={<VerifiedOutlinedIcon sx={{ fontSize: 14 }} />} label="Verified" size="small"
                    sx={{ bgcolor: 'rgba(16,185,129,0.12)', color: '#059669', fontWeight: 700, fontSize: 10.5 }} />
                ) : (
                  <Chip label="Unverified" size="small"
                    sx={{ bgcolor: 'rgba(245,158,11,0.12)', color: '#d97706', fontWeight: 700, fontSize: 10.5 }} />
                )}
                {isFlagged(c) && (
                  <Tooltip title={`${deviceCounts[c.signup_device_id]} accounts were created from the same browser. Review on your verification call — a family device or an agent assisting customers is legitimate.`}>
                    <Chip label={`⚠ Shares device (${deviceCounts[c.signup_device_id]})`} size="small"
                      sx={{ bgcolor: 'rgba(239,68,68,0.10)', color: '#dc2626', fontWeight: 700, fontSize: 10.5 }} />
                  </Tooltip>
                )}
              </Stack>
              <Typography sx={{ fontSize: 12, color: '#6B7280', mt: 0.4, display: 'flex', alignItems: 'center', gap: 0.6 }}>
                <PhoneOutlinedIcon sx={{ fontSize: 13 }} /> {c.phone || '—'}
                <Box component="span" sx={{ color: '#9CA3AF' }}>· Joined {fmtDate(c.created_at)}</Box>
                {c.phone_verified && c.verified_by && (
                  <Box component="span" sx={{ color: '#9CA3AF' }}>· Verified by {c.verified_by}</Box>
                )}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              {canVerify && (c.phone_verified ? (
                <Button size="small" variant="outlined" disabled={busyId === c.id}
                  onClick={() => setVerified(c, false)}
                  sx={{ fontSize: 11.5, borderColor: 'rgba(245,158,11,0.4)', color: '#d97706' }}>
                  Unverify
                </Button>
              ) : (
                <Button size="small" variant="contained" disabled={busyId === c.id}
                  onClick={() => setVerified(c, true)}
                  sx={{ fontSize: 11.5, background: 'linear-gradient(135deg,#10B981,#059669)', boxShadow: 'none' }}>
                  ✓ Verify Phone
                </Button>
              ))}
              {canDelete && (
                <Button size="small" color="error" variant="outlined" disabled={busyId === c.id}
                  onClick={() => remove(c)}
                  sx={{ fontSize: 11.5, borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }}>
                  Delete
                </Button>
              )}
            </Stack>
          </Card>
        ))
      )}

      <Snackbar open={toast.open} autoHideDuration={5000} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast(t => ({ ...t, open: false }))} sx={{ fontSize: 13 }}>
          {toast.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CustomersManager;
