import React, { useState, useEffect } from 'react';
import { collection, doc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import Pagination from '@mui/material/Pagination';

import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import SupervisorAccountOutlinedIcon from '@mui/icons-material/SupervisorAccountOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';

const ROLE_CONFIG = {
  admin:    { label: 'Admin',    color: '#ef4444', bg: 'rgba(239,68,68,0.10)',   border: 'rgba(239,68,68,0.25)',   Icon: AdminPanelSettingsOutlinedIcon },
  manager:  { label: 'Manager', color: '#d97706', bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.25)',  Icon: SupervisorAccountOutlinedIcon },
  employee: { label: 'Employee',color: '#2563eb', bg: 'rgba(59,130,246,0.10)', border: 'rgba(59,130,246,0.25)', Icon: BadgeOutlinedIcon },
};

const PER_PAGE = 15;

const UsersManager = ({ currentUserId, isAdmin }) => {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  const [toast,   setToast]   = useState({ open: false, msg: '', severity: 'success' });

  const [confirmDlg, setConfirmDlg] = useState({ open: false, userId: null, userName: '', newRole: '' });
  const [deleteDlg,  setDeleteDlg]  = useState({ open: false, userId: null, userName: '' });
  const [saving,     setSaving]     = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, 'users'),
      snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Sort client-side: admins first, then managers, then employees, then by name
        const order = { admin: 0, manager: 1, employee: 2 };
        all.sort((a, b) => (order[a.role] ?? 3) - (order[b.role] ?? 3) || (a.full_name || '').localeCompare(b.full_name || ''));
        setUsers(all);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [u.full_name, u.email, u.role].some(v => (v || '').toLowerCase().includes(q));
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleRoleChange = (userId, userName, newRole) => {
    setConfirmDlg({ open: true, userId, userName, newRole });
  };

  const confirmRoleChange = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', confirmDlg.userId), { role: confirmDlg.newRole });
      setUsers(prev => prev.map(u => u.id === confirmDlg.userId ? { ...u, role: confirmDlg.newRole } : u));
      setToast({ open: true, msg: `${confirmDlg.userName}'s role changed to ${confirmDlg.newRole}.`, severity: 'success' });
    } catch (err) {
      setToast({ open: true, msg: err.message, severity: 'error' });
    }
    setSaving(false);
    setConfirmDlg({ open: false, userId: null, userName: '', newRole: '' });
  };

  const confirmDelete = async () => {
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'users', deleteDlg.userId));
      setUsers(prev => prev.filter(u => u.id !== deleteDlg.userId));
      setToast({ open: true, msg: `${deleteDlg.userName} removed.`, severity: 'info' });
    } catch (err) {
      setToast({ open: true, msg: err.message, severity: 'error' });
    }
    setSaving(false);
    setDeleteDlg({ open: false, userId: null, userName: '' });
  };

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ mb: 2.5 }} spacing={1.5}>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Staff Accounts</Typography>
          <Typography sx={{ fontSize: 12, color: '#9CA3AF' }}>
            {users.length} user{users.length !== 1 ? 's' : ''} — updates live
          </Typography>
        </Box>
      </Stack>

      <TextField
        size="small" fullWidth placeholder="Search by name, email or role…"
        value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
        sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }}
      />

      {loading ? (
        <Stack spacing={1}>{[1,2,3].map(i => <Skeleton key={i} height={64} sx={{ borderRadius: '12px' }} />)}</Stack>
      ) : filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 5 }}>
          <PersonOutlinedIcon sx={{ fontSize: 40, color: 'rgba(59,130,246,0.2)', mb: 1 }} />
          <Typography sx={{ color: '#9CA3AF' }}>No users found.</Typography>
        </Box>
      ) : (
        <>
          <Stack spacing={1}>
            {paged.map(u => {
              const rc = ROLE_CONFIG[u.role] || ROLE_CONFIG.employee;
              const RoleIcon = rc.Icon;
              const isSelf = u.id === currentUserId;

              return (
                <Card key={u.id} sx={{ border: '1px solid rgba(99,102,241,0.12)' }}>
                  <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                    <Box sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Box sx={{ width: 38, height: 38, borderRadius: '10px', bgcolor: rc.bg,
                                 display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <RoleIcon sx={{ color: rc.color, fontSize: 19 }} />
                      </Box>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>
                            {u.full_name || u.email?.split('@')[0] || 'Unknown'}
                          </Typography>
                          {isSelf && (
                            <Chip label="You" size="small"
                              sx={{ fontSize: 10, height: 18, fontWeight: 700,
                                    bgcolor: 'rgba(99,102,241,0.10)', color: '#6366f1',
                                    border: '1px solid rgba(99,102,241,0.25)' }} />
                          )}
                        </Stack>
                        <Typography sx={{ fontSize: 12, color: '#9CA3AF' }}>{u.email}</Typography>
                      </Box>

                      {/* Role selector — admins can change any role except their own */}
                      {isAdmin && !isSelf ? (
                        <FormControl size="small" sx={{ minWidth: 130 }}>
                          <Select
                            value={u.role || 'employee'}
                            onChange={e => handleRoleChange(u.id, u.full_name || u.email, e.target.value)}
                            sx={{ fontSize: 12, fontWeight: 700,
                                  color: rc.color,
                                  '& .MuiOutlinedInput-notchedOutline': { borderColor: rc.border },
                                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: rc.color },
                                  borderRadius: '8px' }}
                          >
                            {Object.entries(ROLE_CONFIG).map(([val, cfg]) => (
                              <MenuItem key={val} value={val} sx={{ fontSize: 13 }}>
                                {cfg.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      ) : (
                        <Chip label={rc.label} size="small"
                          sx={{ fontSize: 11, fontWeight: 700, height: 24,
                                bgcolor: rc.bg, color: rc.color,
                                border: `1px solid ${rc.border}` }} />
                      )}

                      {isAdmin && !isSelf && (
                        <Tooltip title="Remove user">
                          <IconButton size="small"
                            onClick={() => setDeleteDlg({ open: true, userId: u.id, userName: u.full_name || u.email })}
                            sx={{ color: '#9CA3AF', '&:hover': { color: '#ef4444' } }}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2.5 }}>
              <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} size="small"
                sx={{ '& .MuiPaginationItem-root': { fontSize: 12 },
                      '& .Mui-selected': { bgcolor: 'rgba(59,130,246,0.12) !important', color: '#3B82F6', fontWeight: 700 } }} />
            </Box>
          )}
        </>
      )}

      {/* Role change confirm dialog */}
      <Dialog open={confirmDlg.open} onClose={() => setConfirmDlg(d => ({ ...d, open: false }))} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16 }}>Change Role</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: '#374151' }}>
            Change <strong>{confirmDlg.userName}</strong>'s role to{' '}
            <strong style={{ color: ROLE_CONFIG[confirmDlg.newRole]?.color }}>
              {ROLE_CONFIG[confirmDlg.newRole]?.label}
            </strong>?
          </Typography>
          {confirmDlg.newRole === 'admin' && (
            <Typography sx={{ fontSize: 12, color: '#d97706', mt: 1, p: 1.5, bgcolor: 'rgba(245,158,11,0.08)', borderRadius: '8px' }}>
              Admins have full access including all settings and data backup.
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setConfirmDlg(d => ({ ...d, open: false }))} variant="outlined"
            sx={{ borderColor: '#e0e0e0', color: '#6B7280' }}>Cancel</Button>
          <Button variant="contained" onClick={confirmRoleChange} disabled={saving}>
            {saving ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteDlg.open} onClose={() => setDeleteDlg(d => ({ ...d, open: false }))} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16 }}>Remove User</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: '#374151' }}>
            Remove <strong>{deleteDlg.userName}</strong> from the system? This only deletes their profile record — they can still log in until their Firebase Auth account is removed.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteDlg(d => ({ ...d, open: false }))} variant="outlined"
            sx={{ borderColor: '#e0e0e0', color: '#6B7280' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmDelete} disabled={saving}>
            {saving ? 'Removing…' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={3500} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.severity} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default UsersManager;
