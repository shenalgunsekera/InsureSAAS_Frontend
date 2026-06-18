import React, { useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, firebaseConfig } from '../firebase';

import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';

import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

function getSecondaryAuth() {
  const existing = getApps().find(a => a.name === 'secondary');
  const secondaryApp = existing || initializeApp(firebaseConfig, 'secondary');
  return getAuth(secondaryApp);
}

const CreateAccountModal = ({ open, onClose, onCreated }) => {
  const [form,    setForm]    = useState({ fullName: '', email: '', password: '', role: 'employee' });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [created, setCreated] = useState(null);
  const [copied,  setCopied]  = useState(false);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(''); };

  const handleCreate = async () => {
    if (!form.fullName.trim())  { setError('Full name is required'); return; }
    if (!form.email.trim())     { setError('Email is required'); return; }
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return; }

    setSaving(true);
    try {
      const secondaryAuth = getSecondaryAuth();
      const cred = await createUserWithEmailAndPassword(secondaryAuth, form.email.trim(), form.password);
      await updateProfile(cred.user, { displayName: form.fullName.trim() });

      await setDoc(doc(db, 'users', cred.user.uid), {
        full_name:  form.fullName.trim(),
        email:      form.email.trim(),
        role:       form.role,
        created_at: serverTimestamp(),
      });

      await signOut(secondaryAuth);

      setCreated({ email: form.email.trim(), password: form.password, name: form.fullName.trim(), role: form.role });
      setForm({ fullName: '', email: '', password: '', role: 'employee' });
      onCreated?.();
    } catch (err) {
      const msg =
        err.code === 'auth/email-already-in-use' ? 'That email is already registered.' :
        err.code === 'auth/invalid-email'        ? 'Invalid email address.' :
        err.message;
      setError(msg);
    }
    setSaving(false);
  };

  const copyCredentials = () => {
    if (!created) return;
    navigator.clipboard.writeText(`Name: ${created.name}\nEmail: ${created.email}\nPassword: ${created.password}\nRole: ${created.role}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => { setCreated(null); setError(''); onClose(); };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <PersonAddOutlinedIcon sx={{ color: '#6366f1', fontSize: 20 }} />
        Create Employee Account
      </DialogTitle>

      <DialogContent sx={{ pt: 2.5, pb: 1 }}>
        {created ? (
          <Box>
            <Alert severity="success" sx={{ mb: 2 }}>
              Account created for <strong>{created.name}</strong>!
            </Alert>
            <Box sx={{ p: 2, borderRadius: '12px', bgcolor: '#F9F9FB', border: '1px solid rgba(99,102,241,0.15)' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', mb: 1.5, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Login Credentials — share securely
              </Typography>
              <Stack spacing={1.2}>
                {[
                  ['Name',     created.name],
                  ['Email',    created.email],
                  ['Password', created.password],
                ].map(([label, val]) => (
                  <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography sx={{ fontSize: 13, color: '#6B7280' }}>{label}</Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: label === 'Password' ? 'monospace' : 'inherit' }}>
                      {val}
                    </Typography>
                  </Box>
                ))}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography sx={{ fontSize: 13, color: '#6B7280' }}>Role</Typography>
                  <Chip label={created.role} size="small"
                    sx={{ bgcolor: 'rgba(59,130,246,0.10)', color: '#3B82F6', fontWeight: 700, fontSize: 11, textTransform: 'capitalize' }} />
                </Box>
              </Stack>
              <Button fullWidth variant="outlined" startIcon={<ContentCopyIcon />}
                onClick={copyCredentials}
                sx={{ mt: 2, fontSize: 12, borderColor: 'rgba(99,102,241,0.3)', color: '#6366f1' }}>
                {copied ? '✓ Copied!' : 'Copy Credentials'}
              </Button>
            </Box>
            <Typography sx={{ fontSize: 11.5, color: '#9CA3AF', mt: 1.5, textAlign: 'center' }}>
              The employee can change their password after logging in.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={2}>
            {error && <Alert severity="error" sx={{ fontSize: 12 }}>{error}</Alert>}
            <TextField label="Full Name" fullWidth size="small"
              value={form.fullName} onChange={e => set('fullName', e.target.value)} />
            <TextField label="Email Address" type="email" fullWidth size="small"
              value={form.email} onChange={e => set('email', e.target.value)} />
            <TextField label="Password" type="password" fullWidth size="small"
              value={form.password} onChange={e => set('password', e.target.value)}
              helperText="Minimum 6 characters" />
            <FormControl fullWidth size="small">
              <InputLabel>Role</InputLabel>
              <Select value={form.role} label="Role" onChange={e => set('role', e.target.value)}>
                <MenuItem value="employee">Employee</MenuItem>
                <MenuItem value="manager">Manager</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(99,102,241,0.10)' }}>
        <Button onClick={handleClose} variant="outlined"
          sx={{ borderColor: '#e0e0e0', color: '#6B7280' }}>
          {created ? 'Done' : 'Cancel'}
        </Button>
        {!created && (
          <Button variant="contained" onClick={handleCreate} disabled={saving}>
            {saving ? 'Creating…' : 'Create Account'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default CreateAccountModal;
