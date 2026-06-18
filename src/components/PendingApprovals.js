import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Collapse from '@mui/material/Collapse';
import Skeleton from '@mui/material/Skeleton';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';

const FIELD_LABELS = {
  client_name: 'Client Name', mobile_no: 'Mobile', product: 'Product',
  insurance_provider: 'Insurance Provider', policy_no: 'Policy No',
  policy_type: 'Policy Type', policy_period_from: 'Period From',
  policy_period_to: 'Period To', net_premium: 'Net Premium',
  total_invoice: 'Total Invoice', customer_type: 'Customer Type',
  branch: 'Branch', email: 'Email',
};

function ClientSummary({ client }) {
  const fields = Object.entries(FIELD_LABELS).filter(([k]) => client[k]);
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, mt: 1.5 }}>
      {fields.map(([key, label]) => (
        <Box key={key}>
          <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {label}
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#1A1A2E', fontWeight: 500 }}>
            {['net_premium','total_invoice'].includes(key)
              ? `LKR ${Number(client[key]).toLocaleString()}`
              : client[key]}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function PendingCard({ client, onApprove, onReject }) {
  const [open,       setOpen]       = useState(false);
  const [rejectDlg,  setRejectDlg]  = useState(false);
  const [reason,     setReason]     = useState('');
  const [loading,    setLoading]    = useState(false);

  const submitted = client.submitted_at?.toDate?.()
    ? client.submitted_at.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  const approve = async () => {
    setLoading(true);
    await onApprove(client.id);
    setLoading(false);
  };

  const reject = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    await onReject(client.id, reason.trim());
    setLoading(false);
    setRejectDlg(false);
  };

  return (
    <>
      <Card sx={{ mb: 1.5, border: '1px solid rgba(245,158,11,0.20)', bgcolor: 'rgba(245,158,11,0.02)' }}>
        <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
          <Box sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5,
                      cursor: 'pointer', '&:hover': { bgcolor: 'rgba(245,158,11,0.03)' } }}
               onClick={() => setOpen(o => !o)}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14, color: '#1A1A2E' }}>
                {client.client_name || '(Unnamed)'}
              </Typography>
              <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap" sx={{ mt: 0.3 }}>
                <Chip label={client.product || '—'} size="small"
                  sx={{ bgcolor: 'rgba(59,130,246,0.08)', color: '#3B82F6', fontWeight: 600, fontSize: 11 }} />
                <Typography sx={{ fontSize: 11.5, color: '#9CA3AF' }}>
                  by {client.submitted_by_name || 'Unknown'} · {submitted}
                </Typography>
              </Stack>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button size="small" variant="contained" color="success"
                startIcon={<CheckCircleOutlineIcon />} disabled={loading}
                onClick={e => { e.stopPropagation(); approve(); }}
                sx={{ fontSize: 12, py: 0.5 }}>
                Approve
              </Button>
              <Button size="small" variant="outlined" color="error"
                startIcon={<CancelOutlinedIcon />} disabled={loading}
                onClick={e => { e.stopPropagation(); setRejectDlg(true); }}
                sx={{ fontSize: 12, py: 0.5 }}>
                Reject
              </Button>
              {open ? <ExpandLessIcon sx={{ color: '#9CA3AF' }} /> : <ExpandMoreIcon sx={{ color: '#9CA3AF' }} />}
            </Stack>
          </Box>

          <Collapse in={open} timeout={220} unmountOnExit>
            <Box sx={{ px: 2.5, pb: 2, borderTop: '1px solid rgba(245,158,11,0.10)' }}>
              <ClientSummary client={client} />
            </Box>
          </Collapse>
        </CardContent>
      </Card>

      <Dialog open={rejectDlg} onClose={() => setRejectDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reject Submission</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography sx={{ fontSize: 13, color: '#6B7280', mb: 2 }}>
            Provide a reason so the employee knows what to fix.
          </Typography>
          <TextField
            label="Rejection reason" multiline minRows={3} fullWidth size="small"
            value={reason} onChange={e => setReason(e.target.value)}
            placeholder="e.g. Missing policy number, incorrect premium amount…"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setRejectDlg(false)} variant="outlined"
            sx={{ borderColor: '#e0e0e0', color: '#6B7280' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={reject} disabled={!reason.trim() || loading}>
            {loading ? 'Rejecting…' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

const PendingApprovals = () => {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState({ open: false, msg: '', severity: 'success' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'clients'), where('status', '==', 'pending'));
      const snap = await getDocs(q);
      setPending(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const approve = async (id) => {
    await updateDoc(doc(db, 'clients', id), {
      status: 'approved',
      approved_at: serverTimestamp(),
    });
    setPending(p => p.filter(c => c.id !== id));
    setToast({ open: true, msg: 'Client approved and added to the main list.', severity: 'success' });
  };

  const reject = async (id, reason) => {
    await updateDoc(doc(db, 'clients', id), {
      status: 'rejected',
      rejected_at: serverTimestamp(),
      rejection_reason: reason,
    });
    setPending(p => p.filter(c => c.id !== id));
    setToast({ open: true, msg: 'Submission rejected. The employee will be notified.', severity: 'warning' });
  };

  if (loading) return (
    <Stack spacing={1.5}>
      {[1,2,3].map(i => <Skeleton key={i} height={72} sx={{ borderRadius: '12px', bgcolor: 'rgba(59,130,246,0.05)' }} />)}
    </Stack>
  );

  if (pending.length === 0) return (
    <Box sx={{ textAlign: 'center', py: 6 }}>
      <HourglassEmptyIcon sx={{ fontSize: 42, color: 'rgba(59,130,246,0.15)', mb: 1 }} />
      <Typography sx={{ color: '#9CA3AF', fontWeight: 600 }}>No pending submissions</Typography>
      <Typography sx={{ fontSize: 12, color: '#C4B5B0' }}>All caught up!</Typography>
    </Box>
  );

  return (
    <>
      <Typography sx={{ fontSize: 12, color: '#9CA3AF', mb: 2 }}>
        {pending.length} submission{pending.length !== 1 ? 's' : ''} waiting for approval
      </Typography>
      {pending.map(c => (
        <PendingCard key={c.id} client={c} onApprove={approve} onReject={reject} />
      ))}
      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.severity} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </>
  );
};

export default PendingApprovals;
