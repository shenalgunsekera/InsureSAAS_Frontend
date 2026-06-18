import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';

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
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';

const CATEGORIES = [
  'Bug Report',
  'Feature Request',
  'Access Issue',
  'Performance Issue',
  'UI / Display Issue',
  'Data Issue',
  'General Support',
  'Other',
];

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

const RaiseTicketModal = ({ open, onClose }) => {
  const { user, userProfile } = useAuth();
  const [form, setForm] = useState({
    subject: '', category: 'Bug Report', priority: 'Medium', description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(false);
  const [errors, setErrors] = useState({});

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.subject.trim()) e.subject = 'Subject is required';
    if (!form.description.trim()) e.description = 'Description is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'tickets'), {
        subject:           form.subject.trim(),
        category:          form.category,
        priority:          form.priority,
        description:       form.description.trim(),
        status:            'Open',
        created_by:        user?.uid || '',
        created_by_name:   userProfile?.full_name || user?.email?.split('@')[0] || 'Unknown',
        created_by_email:  user?.email || '',
        admin_notes:       '',
        created_at:        serverTimestamp(),
        updated_at:        serverTimestamp(),
      });
      setForm({ subject: '', category: 'Bug Report', priority: 'Medium', description: '' });
      setToast(true);
      onClose();
    } catch (err) {
      setErrors({ submit: err.message });
    }
    setSubmitting(false);
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <ConfirmationNumberOutlinedIcon sx={{ color: '#6366f1', fontSize: 20 }} />
          Raise Support Ticket
        </DialogTitle>

        <DialogContent sx={{ pt: 2.5, pb: 1 }}>
          <Typography sx={{ fontSize: 12.5, color: '#6B7280', mb: 2.5, lineHeight: 1.6 }}>
            Report a bug, request a feature, or ask for any change. The admin team will review and respond.
          </Typography>

          <Stack spacing={2}>
            <TextField
              label="Subject" fullWidth size="small"
              value={form.subject} onChange={e => set('subject', e.target.value)}
              error={!!errors.subject} helperText={errors.subject}
              placeholder="Brief summary of the issue or request"
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Category</InputLabel>
                <Select value={form.category} label="Category" onChange={e => set('category', e.target.value)}>
                  {CATEGORIES.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small">
                <InputLabel>Priority</InputLabel>
                <Select value={form.priority} label="Priority" onChange={e => set('priority', e.target.value)}>
                  {PRIORITIES.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>

            <TextField
              label="Description" fullWidth multiline minRows={4}
              value={form.description} onChange={e => set('description', e.target.value)}
              error={!!errors.description} helperText={errors.description}
              placeholder="Describe the issue in detail — what you expected, what happened, steps to reproduce, etc."
            />

            {errors.submit && (
              <Alert severity="error" sx={{ fontSize: 12 }}>{errors.submit}</Alert>
            )}
          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(99,102,241,0.10)' }}>
          <Button onClick={onClose} variant="outlined"
            sx={{ borderColor: '#e0e0e0', color: '#6B7280', '&:hover': { borderColor: '#aaa' } }}>
            Cancel
          </Button>
          <Button
            variant="contained" startIcon={<SendOutlinedIcon />}
            onClick={handleSubmit} disabled={submitting}
          >
            {submitting ? 'Submitting…' : 'Submit Ticket'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast} autoHideDuration={4000} onClose={() => setToast(false)}>
        <Alert severity="success" variant="filled">
          Ticket submitted! The admin team will review it shortly.
        </Alert>
      </Snackbar>
    </>
  );
};

export default RaiseTicketModal;
