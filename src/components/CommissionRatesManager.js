import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { PRODUCTS } from '../config/products';
import { defaultRate } from '../utils/commissionRates';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Collapse from '@mui/material/Collapse';
import Chip from '@mui/material/Chip';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import InputAdornment from '@mui/material/InputAdornment';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SearchIcon from '@mui/icons-material/Search';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';

const RATE_DOC = doc(db, 'settings', 'commission_rates');
const blankRow = () => ({ from: '', to: '', basic: '', srcc: '', tc: '' });

// product label → main class (for the "falls back to" default hint)
const PRODUCT_LIST = Object.values(PRODUCTS).filter(p => !p.hidden)
  .map(p => ({ label: p.label, mainClass: p.mainClass || '' }));

export default function CommissionRatesManager() {
  const [rates,   setRates]   = useState({});   // { [productLabel]: [rows] }
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [search,  setSearch]  = useState('');
  const [openProduct, setOpenProduct] = useState('');
  const [toast, setToast] = useState({ open: false, msg: '', severity: 'success' });

  useEffect(() => {
    getDoc(RATE_DOC)
      .then(snap => { setRates((snap.exists() && snap.data().products) || {}); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setRows = (product, rows) => setRates(r => ({ ...r, [product]: rows }));
  const addRow    = (product)           => setRows(product, [...(rates[product] || []), blankRow()]);
  const removeRow = (product, idx)      => setRows(product, (rates[product] || []).filter((_, i) => i !== idx));
  const updateRow = (product, idx, field, val) =>
    setRows(product, (rates[product] || []).map((r, i) => i === idx ? { ...r, [field]: val } : r));

  const save = async () => {
    setSaving(true);
    // Drop entirely-empty rows so the store stays tidy.
    const clean = {};
    Object.entries(rates).forEach(([p, rows]) => {
      const kept = (rows || []).filter(r => r.from || r.to || r.basic !== '' || r.srcc !== '' || r.tc !== '');
      if (kept.length) clean[p] = kept;
    });
    try {
      await setDoc(RATE_DOC, { products: clean, updated_at: serverTimestamp() }, { merge: true });
      setRates(clean);
      setToast({ open: true, msg: 'Commission rates saved.', severity: 'success' });
    } catch (err) {
      setToast({ open: true, msg: `Could not save: ${err.message || err}`, severity: 'error' });
    }
    setSaving(false);
  };

  const products = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PRODUCT_LIST.filter(p => !q || p.label.toLowerCase().includes(q));
  }, [search]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 16 }}>Commission Rates</Typography>
          <Typography sx={{ fontSize: 12.5, color: '#6B7280', mt: 0.3 }}>
            Set the Standard commission rate per product across date ranges. A policy uses the period whose
            dates contain its <b>start date</b>. Leave <b>To</b> blank for an ongoing period. Products with no
            period fall back to the built-in default.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<SaveOutlinedIcon />} onClick={save} disabled={saving || loading}
          sx={{ textTransform: 'none', fontWeight: 700 }}>
          {saving ? 'Saving…' : 'Save all changes'}
        </Button>
      </Box>

      <TextField size="small" fullWidth placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)}
        InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon sx={{ fontSize: 18, color: '#9CA3AF' }} /></InputAdornment>) }}
        sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: '10px' } }} />

      {loading ? (
        <Skeleton variant="rounded" height={200} />
      ) : products.map(p => {
        const rows = rates[p.label] || [];
        const isOpen = openProduct === p.label;
        const def = defaultRate(p.mainClass);
        return (
          <Card key={p.label} sx={{ mb: 1.2, border: '1px solid rgba(56,163,224,0.14)' }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Box sx={{ px: 2, py: 1.4, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer',
                         '&:hover': { bgcolor: 'rgba(37,94,171,0.02)' } }}
                   onClick={() => setOpenProduct(o => o === p.label ? '' : p.label)}>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, flex: 1 }}>{p.label}</Typography>
                <Chip size="small" label={rows.length ? `${rows.length} period${rows.length === 1 ? '' : 's'}` : 'default only'}
                  sx={{ height: 22, fontSize: 11, fontWeight: 700,
                        bgcolor: rows.length ? 'rgba(37,94,171,0.10)' : 'rgba(0,0,0,0.05)',
                        color: rows.length ? '#255EAB' : '#9CA3AF' }} />
                {isOpen ? <ExpandLessIcon sx={{ color: '#9CA3AF' }} /> : <ExpandMoreIcon sx={{ color: '#9CA3AF' }} />}
              </Box>
              <Collapse in={isOpen} timeout={200} unmountOnExit>
                <Box sx={{ px: 2, pb: 2, pt: 0.5, borderTop: '1px solid rgba(56,163,224,0.08)' }}>
                  <Typography sx={{ fontSize: 11, color: '#9CA3AF', mb: 1 }}>
                    Default when no period matches — Basic {def.basic}% · SRCC {def.srcc}% · TC {def.tc}%
                  </Typography>
                  {rows.length > 0 && (
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.7fr 0.7fr 0.7fr 32px', gap: 1, mb: 0.6,
                               px: 0.3, '& > *': { fontSize: 10.5, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.3 } }}>
                      <Box>From</Box><Box>To (blank = ongoing)</Box><Box>Basic %</Box><Box>SRCC %</Box><Box>TC %</Box><Box />
                    </Box>
                  )}
                  {rows.map((r, idx) => (
                    <Box key={idx} sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.7fr 0.7fr 0.7fr 32px', gap: 1, mb: 0.8, alignItems: 'center' }}>
                      <TextField size="small" type="date" InputLabelProps={{ shrink: true }} value={r.from} onChange={e => updateRow(p.label, idx, 'from', e.target.value)} sx={{ '& input': { fontSize: 12 } }} />
                      <TextField size="small" type="date" InputLabelProps={{ shrink: true }} value={r.to} onChange={e => updateRow(p.label, idx, 'to', e.target.value)} sx={{ '& input': { fontSize: 12 } }} />
                      <TextField size="small" type="number" inputProps={{ step: 'any', inputMode: 'decimal' }} value={r.basic} onChange={e => updateRow(p.label, idx, 'basic', e.target.value)} sx={{ '& input': { fontSize: 12 } }} />
                      <TextField size="small" type="number" inputProps={{ step: 'any', inputMode: 'decimal' }} value={r.srcc} onChange={e => updateRow(p.label, idx, 'srcc', e.target.value)} sx={{ '& input': { fontSize: 12 } }} />
                      <TextField size="small" type="number" inputProps={{ step: 'any', inputMode: 'decimal' }} value={r.tc} onChange={e => updateRow(p.label, idx, 'tc', e.target.value)} sx={{ '& input': { fontSize: 12 } }} />
                      <IconButton size="small" onClick={() => removeRow(p.label, idx)} sx={{ color: '#dc2626' }}><DeleteOutlineIcon sx={{ fontSize: 18 }} /></IconButton>
                    </Box>
                  ))}
                  <Button size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />} onClick={() => addRow(p.label)}
                    sx={{ textTransform: 'none', mt: 0.5, color: '#255EAB' }}>Add rate period</Button>
                </Box>
              </Collapse>
            </CardContent>
          </Card>
        );
      })}

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.severity} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
