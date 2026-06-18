import React, { useState, useEffect } from 'react';
import {
  collection, doc, onSnapshot, query, orderBy,
  updateDoc, deleteDoc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import { getOrCreateDeviceId } from '../utils/deviceFingerprint';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ComputerIcon from '@mui/icons-material/Computer';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import TabletIcon from '@mui/icons-material/Tablet';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

const statusStyles = {
  approved: { label: 'Approved', bg: 'rgba(16,185,129,0.12)', color: '#059669' },
  blocked:  { label: 'Blocked',  bg: 'rgba(239,68,68,0.12)',  color: '#dc2626' },
  pending:  { label: 'Pending',  bg: 'rgba(245,158,11,0.12)', color: '#d97706' },
};

function timeAgo(ts) {
  if (!ts) return 'Never';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function DeviceIcon({ type, size = 28 }) {
  const sx = { fontSize: size, color: '#6B7280' };
  if (type === 'Mobile') return <PhoneAndroidIcon sx={sx} />;
  if (type === 'Tablet') return <TabletIcon sx={sx} />;
  return <ComputerIcon sx={sx} />;
}

function DeviceCard({ session, isCurrentDevice, onApprove, onBlock, onRemove, actionLoading }) {
  const status = session.blocked ? 'blocked' : session.approved ? 'approved' : 'pending';
  const st = statusStyles[status];

  return (
    <Box sx={{
      border: `1.5px solid ${isCurrentDevice ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.12)'}`,
      borderRadius: '14px',
      p: 2.5,
      bgcolor: isCurrentDevice ? 'rgba(99,102,241,0.03)' : '#fff',
      position: 'relative',
      transition: 'box-shadow 0.15s',
      '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,0.06)' },
    }}>
      {isCurrentDevice && (
        <Chip label="This device" size="small"
          sx={{ position: 'absolute', top: 12, right: 12, fontSize: 10, fontWeight: 700,
                bgcolor: 'rgba(99,102,241,0.12)', color: '#6366f1' }} />
      )}

      <Stack direction="row" spacing={2} alignItems="flex-start">
        {/* Device icon */}
        <Box sx={{ width: 48, height: 48, borderRadius: '12px', bgcolor: 'rgba(99,102,241,0.08)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <DeviceIcon type={session.device_type} />
        </Box>

        {/* Main info */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14, color: '#1A1A2E' }}>
              {session.device_type || 'Device'} — {session.browser || 'Unknown'} / {session.os || 'Unknown'}
            </Typography>
            <Chip label={st.label} size="small"
              sx={{ fontSize: 10.5, fontWeight: 700, bgcolor: st.bg, color: st.color, height: 20 }} />
          </Stack>

          <Typography sx={{ fontSize: 12.5, color: '#374151', mb: 0.5 }}>
            <strong>{session.user_name || session.user_email}</strong>
            {session.user_name && (
              <Box component="span" sx={{ color: '#9CA3AF', ml: 0.8 }}>· {session.user_email}</Box>
            )}
          </Typography>

          <Stack direction="row" spacing={2.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
            {session.city && session.country && (
              <Stack direction="row" spacing={0.4} alignItems="center">
                <LocationOnIcon sx={{ fontSize: 13, color: '#9CA3AF' }} />
                <Typography sx={{ fontSize: 12, color: '#6B7280' }}>
                  {session.city}, {session.country}
                  {session.ip && ` · ${session.ip}`}
                </Typography>
              </Stack>
            )}
            <Stack direction="row" spacing={0.4} alignItems="center">
              <AccessTimeIcon sx={{ fontSize: 13, color: '#9CA3AF' }} />
              <Typography sx={{ fontSize: 12, color: '#6B7280' }}>
                Last seen: {timeAgo(session.last_seen)}
                {session.first_seen && (
                  <Box component="span" sx={{ color: '#C4B5B0', ml: 0.8 }}>
                    · First login: {timeAgo(session.first_seen)}
                  </Box>
                )}
              </Typography>
            </Stack>
            {session.timezone && (
              <Typography sx={{ fontSize: 12, color: '#9CA3AF' }}>⏱ {session.timezone}</Typography>
            )}
          </Stack>
        </Box>

        {/* Actions */}
        <Stack direction="row" spacing={0.8} alignItems="center" flexShrink={0}>
          {status !== 'approved' && (
            <Tooltip title="Approve device">
              <span>
                <IconButton size="small" onClick={() => onApprove(session.id)}
                  disabled={!!actionLoading}
                  sx={{ bgcolor: 'rgba(16,185,129,0.10)', color: '#059669',
                        '&:hover': { bgcolor: 'rgba(16,185,129,0.20)' }, borderRadius: '8px', p: 0.8 }}>
                  {actionLoading === session.id + '_approve' ? <CircularProgress size={16} color="inherit" /> : <CheckCircleIcon sx={{ fontSize: 18 }} />}
                </IconButton>
              </span>
            </Tooltip>
          )}
          {status !== 'blocked' && !isCurrentDevice && (
            <Tooltip title="Block device">
              <span>
                <IconButton size="small" onClick={() => onBlock(session.id)}
                  disabled={!!actionLoading}
                  sx={{ bgcolor: 'rgba(239,68,68,0.10)', color: '#dc2626',
                        '&:hover': { bgcolor: 'rgba(239,68,68,0.20)' }, borderRadius: '8px', p: 0.8 }}>
                  {actionLoading === session.id + '_block' ? <CircularProgress size={16} color="inherit" /> : <BlockIcon sx={{ fontSize: 18 }} />}
                </IconButton>
              </span>
            </Tooltip>
          )}
          {!isCurrentDevice && (
            <Tooltip title="Remove record">
              <span>
                <IconButton size="small" onClick={() => onRemove(session.id)}
                  disabled={!!actionLoading}
                  sx={{ bgcolor: 'rgba(107,114,128,0.08)', color: '#6B7280',
                        '&:hover': { bgcolor: 'rgba(239,68,68,0.10)', color: '#dc2626' }, borderRadius: '8px', p: 0.8 }}>
                  <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}

export default function DevicesManager() {
  const { user } = useAuth();
  const [sessions,        setSessions]        = useState([]);
  const [lockdownMode,    setLockdownMode]    = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [togglingLock,    setTogglingLock]    = useState(false);
  const [actionLoading,   setActionLoading]   = useState('');
  const [filter,          setFilter]          = useState('all');
  const [search,          setSearch]          = useState('');
  const [confirmLockdown, setConfirmLockdown] = useState(false);

  const [myDeviceId, setMyDeviceId] = useState('');
  useEffect(() => { getOrCreateDeviceId().then(setMyDeviceId); }, []);
  const mySessionId = user && myDeviceId ? `${user.uid}_${myDeviceId}` : '';

  useEffect(() => {
    const q = query(collection(db, 'device_sessions'), orderBy('last_seen', 'desc'));
    return onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Auto-delete orphaned sessions created when device_id was a Promise (bug now fixed)
      all.filter(s => s.id.includes('[object') || typeof s.device_id !== 'string')
         .forEach(s => deleteDoc(doc(db, 'device_sessions', s.id)).catch(() => {}));
      setSessions(all.filter(s => !s.id.includes('[object') && typeof s.device_id === 'string'));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'device_control'), snap => {
      setLockdownMode(snap.exists() ? !!snap.data().lockdown_mode : false);
    });
  }, []);

  const toggleLockdown = async () => {
    setTogglingLock(true);
    try {
      await setDoc(doc(db, 'settings', 'device_control'), {
        lockdown_mode: !lockdownMode,
        updated_by:    user?.email || '',
        updated_at:    serverTimestamp(),
      }, { merge: true });
    } catch (_) { }
    setTogglingLock(false);
    setConfirmLockdown(false);
  };

  const approve = async (id) => {
    setActionLoading(id + '_approve');
    await updateDoc(doc(db, 'device_sessions', id), { approved: true, blocked: false });
    setActionLoading('');
  };

  const block = async (id) => {
    setActionLoading(id + '_block');
    await updateDoc(doc(db, 'device_sessions', id), { blocked: true, approved: false });
    setActionLoading('');
  };

  const remove = async (id) => {
    await deleteDoc(doc(db, 'device_sessions', id));
  };

  const approveAll = async () => {
    const targets = sessions.filter(s => !s.approved && !s.blocked);
    await Promise.all(targets.map(s =>
      updateDoc(doc(db, 'device_sessions', s.id), { approved: true, blocked: false })
    ));
  };

  const blockAll = async () => {
    const targets = sessions.filter(s => s.id !== mySessionId && !s.blocked);
    await Promise.all(targets.map(s =>
      updateDoc(doc(db, 'device_sessions', s.id), { blocked: true, approved: false })
    ));
  };

  const filtered = sessions.filter(s => {
    if (filter === 'approved' && !s.approved)              return false;
    if (filter === 'blocked'  && !s.blocked)               return false;
    if (filter === 'pending'  && (s.approved || s.blocked)) return false;
    if (search) {
      const q = search.toLowerCase();
      return [s.user_name, s.user_email, s.browser, s.os, s.city, s.country, s.ip]
        .some(v => (v || '').toLowerCase().includes(q));
    }
    return true;
  });

  const counts = {
    approved: sessions.filter(s => s.approved).length,
    blocked:  sessions.filter(s => s.blocked).length,
    pending:  sessions.filter(s => !s.approved && !s.blocked).length,
  };

  return (
    <Box>
      {/* Lockdown toggle */}
      <Box sx={{
        p: 2.5, mb: 3, borderRadius: '14px',
        border: lockdownMode ? '1.5px solid rgba(239,68,68,0.30)' : '1.5px solid rgba(16,185,129,0.25)',
        bgcolor: lockdownMode ? 'rgba(239,68,68,0.03)' : 'rgba(16,185,129,0.03)',
      }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.4 }}>
              {lockdownMode
                ? <LockIcon sx={{ fontSize: 20, color: '#dc2626' }} />
                : <LockOpenIcon sx={{ fontSize: 20, color: '#059669' }} />}
              <Typography sx={{ fontWeight: 800, fontSize: 15, color: lockdownMode ? '#dc2626' : '#059669' }}>
                {lockdownMode ? 'Lockdown Mode — ON' : 'Open Mode — All devices allowed'}
              </Typography>
            </Stack>
            <Typography sx={{ fontSize: 12.5, color: '#6B7280', maxWidth: 520 }}>
              {lockdownMode
                ? 'Only approved devices can access the system. New devices see a "Pending Approval" screen until you approve them here.'
                : 'All authenticated staff can log in from any device. Turn on Lockdown Mode to restrict access to approved devices only.'}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={togglingLock ? <CircularProgress size={14} color="inherit" /> : lockdownMode ? <LockOpenIcon /> : <LockIcon />}
            onClick={() => setConfirmLockdown(true)}
            disabled={togglingLock}
            sx={{
              flexShrink: 0, fontWeight: 700, fontSize: 13,
              background: lockdownMode
                ? 'linear-gradient(135deg,#10B981,#059669)'
                : 'linear-gradient(135deg,#ef4444,#dc2626)',
              boxShadow: 'none',
            }}>
            {lockdownMode ? 'Switch to Open Mode' : 'Enable Lockdown Mode'}
          </Button>
        </Stack>
      </Box>

      {/* Stats row */}
      <Stack direction="row" spacing={1.5} sx={{ mb: 3 }}>
        {[
          { label: 'Total',    val: sessions.length, color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
          { label: 'Approved', val: counts.approved,  color: '#059669', bg: 'rgba(16,185,129,0.08)' },
          { label: 'Pending',  val: counts.pending,   color: '#d97706', bg: 'rgba(245,158,11,0.08)' },
          { label: 'Blocked',  val: counts.blocked,   color: '#dc2626', bg: 'rgba(239,68,68,0.08)'  },
        ].map(s => (
          <Box key={s.label} onClick={() => setFilter(s.label.toLowerCase() === 'total' ? 'all' : s.label.toLowerCase())}
            sx={{ flex: 1, p: 1.5, borderRadius: '12px', bgcolor: s.bg, cursor: 'pointer',
                  border: `1px solid ${s.bg}`, '&:hover': { opacity: 0.8 } }}>
            <Typography sx={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</Typography>
            <Typography sx={{ fontSize: 11.5, color: s.color, opacity: 0.8, mt: 0.2 }}>{s.label}</Typography>
          </Box>
        ))}
      </Stack>

      {/* Search + filter + actions */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center" sx={{ mb: 2.5 }}>
        <TextField size="small" placeholder="Search by user, browser, location…"
          value={search} onChange={e => setSearch(e.target.value)}
          sx={{ flex: 1, '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
        <Stack direction="row" spacing={1}>
          {['all','approved','pending','blocked'].map(f => (
            <Button key={f} size="small" variant={filter === f ? 'contained' : 'outlined'}
              onClick={() => setFilter(f)}
              sx={{ fontSize: 11.5, textTransform: 'capitalize', py: 0.6,
                    ...(filter === f ? { background: 'linear-gradient(135deg,#2563EB,#3B82F6)', boxShadow: 'none' } : { borderColor: 'rgba(99,102,241,0.3)', color: '#6B7280' }) }}>
              {f}
            </Button>
          ))}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" onClick={approveAll}
            sx={{ fontSize: 11.5, borderColor: 'rgba(16,185,129,0.3)', color: '#059669' }}>
            Approve All Pending
          </Button>
          <Button size="small" variant="outlined" onClick={blockAll}
            sx={{ fontSize: 11.5, borderColor: 'rgba(239,68,68,0.3)', color: '#dc2626' }}>
            Block All Others
          </Button>
        </Stack>
      </Stack>

      {/* Device list */}
      {loading ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CircularProgress sx={{ color: '#3B82F6' }} />
        </Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography sx={{ color: '#9CA3AF', fontWeight: 600 }}>No devices found.</Typography>
          <Typography sx={{ fontSize: 12.5, color: '#C4B5B0', mt: 0.5 }}>
            Devices appear here when staff log in.
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {filtered.map(s => (
            <DeviceCard key={s.id} session={s}
              isCurrentDevice={s.id === mySessionId}
              onApprove={approve} onBlock={block} onRemove={remove}
              actionLoading={actionLoading} />
          ))}
        </Stack>
      )}

      {/* Lockdown confirm dialog */}
      <Dialog open={confirmLockdown} onClose={() => setConfirmLockdown(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {lockdownMode ? <LockOpenIcon sx={{ color: '#10B981' }} /> : <LockIcon sx={{ color: '#ef4444' }} />}
          {lockdownMode ? 'Switch to Open Mode?' : 'Enable Lockdown Mode?'}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: '#374151', lineHeight: 1.7 }}>
            {lockdownMode
              ? 'All authenticated staff will be able to log in from any device. You can still see and track all devices.'
              : `Only devices you've marked as Approved will be able to access the system. ${counts.pending > 0 ? `There are currently ${counts.pending} pending device(s) that will be locked out.` : ''}`}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setConfirmLockdown(false)} variant="outlined"
            sx={{ borderColor: '#e0e0e0', color: '#6B7280', fontSize: 13 }}>Cancel</Button>
          <Button onClick={toggleLockdown} variant="contained" disabled={togglingLock}
            sx={{ fontSize: 13, background: lockdownMode ? 'linear-gradient(135deg,#10B981,#059669)' : 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: 'none' }}>
            {togglingLock ? 'Updating…' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
