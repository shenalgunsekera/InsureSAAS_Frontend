import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import { MODULES, DEFAULT_MODULE_ACCESS } from '../config/products';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Chip from '@mui/material/Chip';

// Role columns shown in the UI
// Admin: always locked ON (admin always has full access)
// Manager: only admin can toggle
// Employee: admin and manager can toggle
const ROLE_COLS = [
  { key: 'admin',    label: 'Admin',    color: '#ef4444', bg: 'rgba(239,68,68,0.10)'  },
  { key: 'manager',  label: 'Manager',  color: '#d97706', bg: 'rgba(245,158,11,0.10)' },
  { key: 'employee', label: 'Employee', color: '#2563eb', bg: 'rgba(59,130,246,0.10)' },
];

const ModuleAccessManager = () => {
  const { userProfile } = useAuth();
  const currentRole = userProfile?.role || 'employee';
  const isAdmin   = currentRole === 'admin';
  const isManager = currentRole === 'manager';

  const [access,  setAccess]  = useState(DEFAULT_MODULE_ACCESS);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState({ open: false, msg: '', severity: 'success' });

  useEffect(() => {
    getDoc(doc(db, 'settings', 'module_access'))
      .then(snap => { if (snap.exists()) setAccess({ ...DEFAULT_MODULE_ACCESS, ...snap.data() }); })
      .finally(() => setLoading(false));
  }, []);

  // Whether a given role column is editable by the current user
  const canEditRole = (role) => {
    if (role === 'admin')    return false;            // admin always locked
    if (role === 'manager')  return isAdmin;           // only admin changes manager access
    if (role === 'employee') return isAdmin || isManager; // both can change employee
    return false;
  };

  const toggle = (moduleKey, role) => {
    if (!canEditRole(role)) return;
    setAccess(prev => {
      const current = prev[moduleKey] || [];
      const next = current.includes(role)
        ? current.filter(r => r !== role)
        : [...current, role];
      return { ...prev, [moduleKey]: next };
    });
  };

  const save = async (overrideAccess) => {
    setSaving(true);
    const payload = overrideAccess || access;
    try {
      await setDoc(doc(db, 'settings', 'module_access'), payload);
      setAccess(payload);
      setToast({ open: true, msg: 'Module access updated.', severity: 'success' });
    } catch (err) {
      setToast({ open: true, msg: err.message, severity: 'error' });
    }
    setSaving(false);
  };

  const resetToDefaults = () => {
    if (!window.confirm('Reset all module access to defaults? All roles will get access to all modules.')) return;
    save(DEFAULT_MODULE_ACCESS);
  };

  if (loading) return <Stack spacing={1.5}>{[1,2,3,4,5,6].map(i => <Skeleton key={i} height={72} sx={{ borderRadius: '12px' }} />)}</Stack>;

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ mb: 2.5 }} spacing={1.5}>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Module Access Control</Typography>
          <Typography sx={{ fontSize: 12, color: '#9CA3AF' }}>
            {isAdmin
              ? 'As admin you can configure access for both managers and employees.'
              : 'As manager you can configure employee access only.'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          {isAdmin && (
            <Button variant="outlined" size="small" onClick={resetToDefaults} disabled={saving}
              sx={{ fontSize: 12, borderColor: 'rgba(99,102,241,0.35)', color: '#6366f1' }}>
              Reset to Defaults
            </Button>
          )}
          <Button variant="contained" size="small" onClick={() => save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </Stack>
      </Stack>

      {/* Role legend */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap">
        {ROLE_COLS.map(rc => (
          <Chip key={rc.key} size="small" label={
            rc.key === 'admin'
              ? `${rc.label} — always full access`
              : rc.key === 'manager' && !isAdmin
              ? `${rc.label} — view only`
              : rc.label
          }
          sx={{ fontSize: 11, fontWeight: 700, bgcolor: rc.bg, color: rc.color,
                border: `1px solid ${rc.bg}`, opacity: canEditRole(rc.key) || rc.key === 'admin' ? 1 : 0.6 }} />
        ))}
      </Stack>

      <Stack spacing={1.5}>
        {MODULES.map(mod => {
          const allowed = access[mod.key] || DEFAULT_MODULE_ACCESS[mod.key] || [];
          return (
            <Card key={mod.key} sx={{ border: '1px solid rgba(99,102,241,0.12)' }}>
              <CardContent sx={{ py: 1.5, px: 2.5, '&:last-child': { pb: 1.5 } }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
                    <Typography sx={{ fontSize: 22 }}>{mod.icon}</Typography>
                    <Box>
                      <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>{mod.label}</Typography>
                      <Typography sx={{ fontSize: 11.5, color: '#9CA3AF' }}>{mod.description}</Typography>
                    </Box>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    {ROLE_COLS.map(rc => {
                      const editable = canEditRole(rc.key);
                      const checked  = rc.key === 'admin' ? true : allowed.includes(rc.key);
                      return (
                        <FormControlLabel
                          key={rc.key}
                          control={
                            <Checkbox
                              size="small"
                              checked={checked}
                              disabled={!editable}
                              onChange={() => toggle(mod.key, rc.key)}
                              sx={{
                                color: rc.color,
                                '&.Mui-checked': { color: rc.color },
                                opacity: editable ? 1 : 0.45,
                              }}
                            />
                          }
                          label={
                            <Typography sx={{ fontSize: 12.5, fontWeight: 600, textTransform: 'capitalize',
                                             color: editable ? rc.color : '#9CA3AF' }}>
                              {rc.label}
                            </Typography>
                          }
                          sx={{ mr: 0 }}
                        />
                      );
                    })}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.severity} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default ModuleAccessManager;
