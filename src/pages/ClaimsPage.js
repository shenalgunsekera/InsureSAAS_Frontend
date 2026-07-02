import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, addDoc, getDocs, doc, updateDoc,
  query, orderBy, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Collapse from '@mui/material/Collapse';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Pagination from '@mui/material/Pagination';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddIcon from '@mui/icons-material/Add';

const STATUS_CONFIG = {
  'Filed':        { color: '#6366f1', bg: 'rgba(99,102,241,0.10)' },
  'Under Review': { color: '#d97706', bg: 'rgba(245,158,11,0.10)' },
  'Investigating':{ color: '#0ea5e9', bg: 'rgba(14,165,233,0.10)' },
  'Approved':     { color: '#059669', bg: 'rgba(16,185,129,0.10)' },
  'Settled':      { color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  'Rejected':     { color: '#dc2626', bg: 'rgba(239,68,68,0.10)'  },
};

function ClaimCard({ claim, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(claim.status);
  const [notes, setNotes] = useState(claim.notes || '');
  const [settlement, setSettlement] = useState(claim.settlement_amount || '');
  const [saving, setSaving] = useState(false);
  const s = STATUS_CONFIG[claim.status] || STATUS_CONFIG['Filed'];
  const filed = claim.created_at?.toDate?.()
    ? claim.created_at.toDate().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
    : '—';

  const save = async () => {
    setSaving(true);
    await updateDoc(doc(db, 'claims', claim.id), {
      status, notes, settlement_amount: settlement, updated_at: serverTimestamp(),
    });
    onUpdate(claim.id, { status, notes, settlement_amount: settlement });
    setSaving(false);
  };

  return (
    <Card sx={{ mb: 1.5, border: '1px solid rgba(255,139,90,0.12)' }}>
      <CardContent sx={{ p:0,'&:last-child':{pb:0} }}>
        <Box sx={{ px:2.5, py:1.5, display:'flex', alignItems:'center', gap:1.5,
                    cursor:'pointer','&:hover':{bgcolor:'rgba(255,90,90,0.02)'} }}
             onClick={() => setOpen(o=>!o)}>
          <Box sx={{ flex:1, minWidth:0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb:0.3 }}>
              <Typography sx={{ fontWeight:700, fontSize:14 }}>{claim.reference}</Typography>
              <Chip label={claim.status} size="small" sx={{ bgcolor:s.bg, color:s.color, fontWeight:700, fontSize:10.5 }} />
            </Stack>
            <Typography sx={{ fontSize:12, color:'#9CA3AF' }}>
              {claim.client_name} · {claim.policy_no} · Filed: {filed}
            </Typography>
          </Box>
          <Typography sx={{ fontWeight:800, fontSize:14, color:'#FF5A5A', flexShrink:0 }}>
            {claim.loss_amount ? `LKR ${Number(claim.loss_amount).toLocaleString()}` : '—'}
          </Typography>
          {open ? <ExpandLessIcon sx={{ color:'#9CA3AF' }} /> : <ExpandMoreIcon sx={{ color:'#9CA3AF' }} />}
        </Box>
        <Collapse in={open} timeout={220} unmountOnExit>
          <Box sx={{ px:2.5, pb:2.5, pt:0.5, borderTop:'1px solid rgba(255,139,90,0.08)' }}>
            <Box sx={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:1.5, mb:2 }}>
              {[
                ['Incident Date', claim.incident_date],
                ['Cause of Loss', claim.cause],
                ['Product / Class', claim.product],
                ['Loss Description', claim.description],
              ].filter(([,v])=>v).map(([l,v])=>(
                <Box key={l}>
                  <Typography sx={{ fontSize:10.5, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:0.5 }}>{l}</Typography>
                  <Typography sx={{ fontSize:13, color:'#1A1A2E' }}>{v}</Typography>
                </Box>
              ))}
            </Box>
            <Stack direction={{ xs:'column', sm:'row' }} spacing={1.5} alignItems="flex-start">
              <FormControl size="small" sx={{ minWidth:160 }}>
                <InputLabel>Status</InputLabel>
                <Select value={status} label="Status" onChange={e=>setStatus(e.target.value)}>
                  {Object.keys(STATUS_CONFIG).map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField size="small" label="Settlement Amount (LKR)" type="number"
                value={settlement} onChange={e=>setSettlement(e.target.value)} />
              <TextField size="small" label="Internal Notes" multiline minRows={2} fullWidth
                value={notes} onChange={e=>setNotes(e.target.value)} />
              <Button variant="contained" size="small" onClick={save} disabled={saving} sx={{ alignSelf:'flex-end', flexShrink:0 }}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </Stack>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

const ClaimsPage = () => {
  const { user, userProfile } = useAuth();
  const [claims,   setClaims]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [open,     setOpen]     = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState({ open:false, msg:'', severity:'success' });
  const [cPage,    setCPage]    = useState(1);
  const C_PER_PAGE = 15;
  const [form,     setForm]     = useState({
    client_name:'', policy_no:'', product:'', incident_date:'',
    cause:'', description:'', loss_amount:'',
  });

  const load = useCallback(async () => {
    const q = query(collection(db,'claims'), orderBy('created_at','desc'));
    const snap = await getDocs(q);
    setClaims(snap.docs.map(d=>({id:d.id,...d.data()})));
    setLoading(false);
  },[]);

  useEffect(()=>{ load(); },[load]);

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleCreate = async () => {
    if (!form.client_name||!form.incident_date) {
      setToast({open:true, msg:'Client name and incident date are required', severity:'error'}); return;
    }
    setSaving(true);
    const ref = `CLM-${Date.now().toString().slice(-6)}`;
    await addDoc(collection(db,'claims'),{
      ...form, reference:ref, status:'Filed',
      created_by: user?.uid||'', created_by_name: userProfile?.full_name||'',
      created_at: serverTimestamp(), updated_at: serverTimestamp(),
    });
    setForm({client_name:'',policy_no:'',product:'',incident_date:'',cause:'',description:'',loss_amount:''});
    setOpen(false);
    setSaving(false);
    setToast({open:true, msg:'Claim registered successfully!', severity:'success'});
    load();
  };

  const stats = {
    filed:    claims.filter(c=>c.status==='Filed').length,
    active:   claims.filter(c=>['Under Review','Investigating'].includes(c.status)).length,
    settled:  claims.filter(c=>c.status==='Settled').length,
    rejected: claims.filter(c=>c.status==='Rejected').length,
  };

  return (
    <Box className="page-enter" sx={{ maxWidth:1000, mx:'auto' }}>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} sx={{mb:3}}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight:800, mb:0.3 }}>Claims</Typography>
          <Typography sx={{ fontSize:13, color:'#9CA3AF' }}>Register and track insurance claims</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={()=>setOpen(true)} sx={{mt:{xs:1.5,sm:0}}}>
          Register Claim
        </Button>
      </Stack>

      <Stack direction={{xs:'column',sm:'row'}} spacing={1.5} sx={{mb:3}}>
        {[
          { label:'Filed',    val:stats.filed,    color:'#6366f1', bg:'rgba(99,102,241,0.08)' },
          { label:'Active',   val:stats.active,   color:'#d97706', bg:'rgba(245,158,11,0.08)' },
          { label:'Settled',  val:stats.settled,  color:'#059669', bg:'rgba(16,185,129,0.08)' },
          { label:'Rejected', val:stats.rejected, color:'#dc2626', bg:'rgba(239,68,68,0.08)' },
        ].map(s=>(
          <Box key={s.label} sx={{flex:1, p:2, borderRadius:'12px', bgcolor:s.bg}}>
            <Typography sx={{fontSize:24, fontWeight:800, color:s.color}}>{s.val}</Typography>
            <Typography sx={{fontSize:12, color:'#6B7280'}}>{s.label}</Typography>
          </Box>
        ))}
      </Stack>

      {loading
        ? <Stack spacing={1.5}>{[1,2,3].map(i=><Skeleton key={i} height={64} sx={{borderRadius:'12px'}} />)}</Stack>
        : claims.length===0
          ? <Box sx={{textAlign:'center',py:6}}><Typography sx={{color:'#9CA3AF'}}>No claims registered yet.</Typography></Box>
          : <>
              {claims.slice((cPage-1)*C_PER_PAGE, cPage*C_PER_PAGE).map(c=>(
                <ClaimCard key={c.id} claim={c} onUpdate={(id,updates)=>setClaims(p=>p.map(x=>x.id===id?{...x,...updates}:x))} />
              ))}
              {claims.length > C_PER_PAGE && (
                <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', pt:2, flexWrap:'wrap', gap:1 }}>
                  <Typography sx={{ fontSize:12.5, color:'#9CA3AF' }}>
                    Showing {(cPage-1)*C_PER_PAGE+1}–{Math.min(cPage*C_PER_PAGE, claims.length)} of {claims.length} claims
                  </Typography>
                  <Pagination count={Math.ceil(claims.length/C_PER_PAGE)} page={cPage}
                    onChange={(_,v)=>{ setCPage(v); window.scrollTo({top:0,behavior:'smooth'}); }}
                    shape="rounded" size="small" />
                </Box>
              )}
            </>
      }

      <Dialog open={open} onClose={()=>setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Register New Claim</DialogTitle>
        <DialogContent sx={{pt:2.5}}>
          <Stack spacing={2}>
            <TextField size="small" fullWidth label="Client Name *" value={form.client_name} onChange={e=>set('client_name',e.target.value)} />
            <Stack direction="row" spacing={1.5}>
              <TextField size="small" fullWidth label="Policy No" value={form.policy_no} onChange={e=>set('policy_no',e.target.value)} />
              <TextField size="small" fullWidth label="Product / Class" value={form.product} onChange={e=>set('product',e.target.value)} />
            </Stack>
            <Stack direction="row" spacing={1.5}>
              <TextField size="small" fullWidth label="Incident Date *" type="date" InputLabelProps={{shrink:true}} value={form.incident_date} onChange={e=>set('incident_date',e.target.value)} />
              <TextField size="small" fullWidth label="Estimated Loss (LKR)" type="number" value={form.loss_amount} onChange={e=>set('loss_amount',e.target.value)} />
            </Stack>
            <TextField size="small" fullWidth label="Cause of Loss" value={form.cause} onChange={e=>set('cause',e.target.value)} />
            <TextField size="small" fullWidth multiline minRows={3} label="Loss Description" value={form.description} onChange={e=>set('description',e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{px:3,py:2,borderTop:'1px solid rgba(255,139,90,0.10)'}}>
          <Button onClick={()=>setOpen(false)} variant="outlined" sx={{borderColor:'#e0e0e0',color:'#6B7280'}}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>{saving?'Saving…':'Register Claim'}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={()=>setToast(t=>({...t,open:false}))}>
        <Alert severity={toast.severity} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default ClaimsPage;
