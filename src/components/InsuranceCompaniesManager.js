import React, { useState, useEffect, useCallback } from 'react';
import { collection, addDoc, writeBatch, getDocs, deleteDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_INSURANCE_COMPANIES, CATEGORY_COLORS } from '../config/insuranceCompanies';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';

import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';

const InsuranceCompaniesManager = () => {
  const [companies,   setCompanies]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [addOpen,     setAddOpen]     = useState(false);
  const [editId,      setEditId]      = useState(null);
  const [form,        setForm]        = useState({ name:'', email:'', category:'' });
  const [saving,      setSaving]      = useState(false);
  const [importing,   setImporting]   = useState(false);
  const [filterCat,   setFilterCat]   = useState('all');
  const [search,      setSearch]      = useState('');
  const [toast,       setToast]       = useState({ open:false, msg:'', severity:'success' });

  const load = useCallback(async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, 'insurance_companies'));
    setCompanies(snap.docs.map(d => ({ id:d.id, ...d.data() })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setToast({ open:true, msg:'Name and email are required', severity:'error' }); return;
    }
    setSaving(true);
    try {
      const payload = { name:form.name.trim(), email:form.email.trim(), category:form.category || '' };
      if (editId) {
        await updateDoc(doc(db,'insurance_companies',editId), payload);
        setToast({ open:true, msg:'Company updated.', severity:'success' });
        setEditId(null);
      } else {
        await addDoc(collection(db,'insurance_companies'), { ...payload, created_at:serverTimestamp() });
        setToast({ open:true, msg:'Company added.', severity:'success' });
        setAddOpen(false);
      }
      setForm({ name:'', email:'', category:'' });
      load();
    } catch (err) { setToast({ open:true, msg:err.message, severity:'error' }); }
    setSaving(false);
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Remove ${name}?`)) return;
    await deleteDoc(doc(db,'insurance_companies',id));
    setCompanies(c => c.filter(x => x.id !== id));
    setToast({ open:true, msg:`${name} removed.`, severity:'info' });
  };

  const handleImportDefaults = async () => {
    if (!window.confirm(`This will add ${DEFAULT_INSURANCE_COMPANIES.length} default company contacts. Continue?`)) return;
    setImporting(true);
    try {
      // Write in batches of 500 (Firestore limit)
      for (let i = 0; i < DEFAULT_INSURANCE_COMPANIES.length; i += 490) {
        const batch = writeBatch(db);
        DEFAULT_INSURANCE_COMPANIES.slice(i, i+490).forEach(co => {
          batch.set(doc(collection(db,'insurance_companies')), { ...co, created_at:serverTimestamp() });
        });
        await batch.commit();
      }
      setToast({ open:true, msg:`${DEFAULT_INSURANCE_COMPANIES.length} companies imported successfully!`, severity:'success' });
      load();
    } catch (err) { setToast({ open:true, msg:err.message, severity:'error' }); }
    setImporting(false);
  };

  // All unique categories that actually exist in the data
  const allCategories = [...new Set(companies.map(c => c.category || '').filter(Boolean))].sort();

  const filtered = companies.filter(c => {
    if (filterCat !== 'all' && (c.category || '') !== filterCat) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [c.name, c.email, c.category].some(v => (v||'').toLowerCase().includes(q));
  });

  const catColor = (cat) => CATEGORY_COLORS[cat] || { bg:'rgba(107,114,128,0.08)', color:'#6B7280', border:'rgba(107,114,128,0.20)' };

  return (
    <Box>
      <Stack direction={{ xs:'column', sm:'row' }} justifyContent="space-between" alignItems={{ sm:'center' }} sx={{ mb:2.5 }} spacing={1.5}>
        <Box>
          <Typography sx={{ fontWeight:700, fontSize:15 }}>Insurance Companies</Typography>
          <Typography sx={{ fontSize:12, color:'#9CA3AF' }}>
            {companies.length} contacts — Motor, Non Motor & Life
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" size="small"
            startIcon={importing ? <CircularProgress size={13} color="inherit" /> : <FileDownloadOutlinedIcon />}
            onClick={handleImportDefaults} disabled={importing}
            sx={{ fontSize:12, borderColor:'rgba(99,102,241,0.35)', color:'#6366f1' }}>
            {importing ? 'Importing…' : 'Import Defaults'}
          </Button>
          <Button variant="contained" size="small" startIcon={<AddIcon />}
            onClick={() => { setForm({ name:'', email:'', category:'' }); setAddOpen(true); }}>
            Add Company
          </Button>
        </Stack>
      </Stack>

      {/* Search + category filter */}
      <Stack direction={{ xs:'column', sm:'row' }} spacing={1.5} sx={{ mb:2 }}>
        <TextField size="small" placeholder="Search by name or email…"
          value={search} onChange={e => setSearch(e.target.value)}
          sx={{ flex:1, '& .MuiOutlinedInput-root': { borderRadius:'10px', fontSize:13 } }} />
        <Stack direction="row" spacing={0.8}>
          {['all', ...allCategories].map(c => {
            const cc = c === 'all' ? { bg:'rgba(99,102,241,0.10)',color:'#6366f1' } : catColor(c);
            const cnt = c === 'all' ? companies.length : companies.filter(co => (co.category||'') === c).length;
            return (
              <Chip key={c} label={`${c === 'all' ? 'All' : c} (${cnt})`} size="small" clickable
                onClick={() => setFilterCat(c)}
                sx={{ fontSize:11.5, fontWeight:700, height:26,
                  bgcolor: filterCat===c ? cc.bg : 'transparent',
                  color:   filterCat===c ? cc.color : '#9CA3AF',
                  border:  filterCat===c ? `1.5px solid ${cc.color}` : '1.5px solid rgba(107,114,128,0.20)',
                }} />
            );
          })}
        </Stack>
      </Stack>

      {loading ? (
        <Stack spacing={1}>{[1,2,3,4].map(i=><Skeleton key={i} height={56} sx={{ borderRadius:'12px' }} />)}</Stack>
      ) : filtered.length === 0 ? (
        <Box sx={{ textAlign:'center', py:5 }}>
          <BusinessOutlinedIcon sx={{ fontSize:40, color:'rgba(59,130,246,0.2)', mb:1 }} />
          <Typography sx={{ color:'#9CA3AF' }}>
            {companies.length === 0 ? 'No companies yet — click "Import Defaults" above.' : 'No results for this filter.'}
          </Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {filtered.map(co => {
            const cc = catColor(co.category);
            return (
              <Card key={co.id} sx={{ border:'1px solid rgba(99,102,241,0.12)' }}>
                <CardContent sx={{ p:0, '&:last-child':{ pb:0 } }}>
                  {editId === co.id ? (
                    <Stack direction={{ xs:'column', sm:'row' }} spacing={1.5} alignItems={{ sm:'center' }} sx={{ p:2 }}>
                      <TextField size="small" label="Company Name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} sx={{ flex:1 }} />
                      <TextField size="small" label="Email" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} sx={{ flex:1 }} />
                      <TextField size="small" label="Category" placeholder="e.g. Motor"
                        value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
                        sx={{ minWidth:130 }} />
                      <Stack direction="row" spacing={0.5}>
                        <Button size="small" variant="contained" startIcon={<SaveOutlinedIcon />} onClick={handleSave} disabled={saving}>Save</Button>
                        <Button size="small" variant="outlined" onClick={()=>setEditId(null)} sx={{ borderColor:'#e0e0e0', color:'#6B7280' }}>Cancel</Button>
                      </Stack>
                    </Stack>
                  ) : (
                    <Box sx={{ px:2.5, py:1.5, display:'flex', alignItems:'center', gap:1.5 }}>
                      <Box sx={{ width:36, height:36, borderRadius:'10px', bgcolor:'rgba(59,130,246,0.08)',
                                 display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <BusinessOutlinedIcon sx={{ color:'#3B82F6', fontSize:18 }} />
                      </Box>
                      <Box sx={{ flex:1, minWidth:0 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography sx={{ fontWeight:700, fontSize:13.5 }}>{co.name}</Typography>
                          {co.category && (
                            <Chip label={co.category} size="small"
                              sx={{ fontSize:10, height:18, fontWeight:700, bgcolor:cc.bg, color:cc.color, border:`1px solid ${cc.border}` }} />
                          )}
                        </Stack>
                        <Typography sx={{ fontSize:12, color:'#9CA3AF' }}>{co.email}</Typography>
                      </Box>
                      <IconButton size="small" onClick={()=>{ setEditId(co.id); setForm({ name:co.name, email:co.email, category:co.category||'' }); }}
                        sx={{ color:'#9CA3AF', '&:hover':{ color:'#3B82F6' } }}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={()=>handleDelete(co.id, co.name)}
                        sx={{ color:'#9CA3AF', '&:hover':{ color:'#ef4444' } }}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Add company dialog */}
      <Dialog open={addOpen} onClose={()=>setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Insurance Company</DialogTitle>
        <DialogContent sx={{ pt:2.5 }}>
          <Stack spacing={2}>
            <TextField label="Company Name *" fullWidth size="small" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} />
            <TextField label="Email Address *" type="email" fullWidth size="small" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}
              helperText="This email receives quote requests" />
            <TextField fullWidth size="small" label="Category" placeholder="e.g. Motor, Non Motor, Life…"
              value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))}
              helperText="Type any category — filter chips auto-update" />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px:3, py:2, borderTop:'1px solid rgba(99,102,241,0.10)' }}>
          <Button onClick={()=>setAddOpen(false)} variant="outlined" sx={{ borderColor:'#e0e0e0', color:'#6B7280' }}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Add Company'}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={3500} onClose={()=>setToast(t=>({...t,open:false}))}>
        <Alert severity={toast.severity} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default InsuranceCompaniesManager;
