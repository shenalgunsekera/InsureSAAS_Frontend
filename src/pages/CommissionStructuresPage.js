import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { PRODUCTS } from '../config/products';
import { expandLadder, totalMonths, structureRate, rateAtMonths } from '../utils/commissionStructures';

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
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Divider from '@mui/material/Divider';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import TrendingDownOutlinedIcon from '@mui/icons-material/TrendingDownOutlined';

const STRUCT_DOC = doc(db, 'settings', 'commission_structures');
const blankSeg = () => ({ unit: 'year', length: '1', rate: '' });

const daysLeft = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.ceil((d - new Date()) / 86400000);
};
const daysText = (n) => (n === null ? '—' : n < 0 ? `Expired ${Math.abs(n)}d ago` : `${n}d to renewal`);
const daysColor = (n) => (n === null ? '#9CA3AF' : n < 0 ? '#dc2626' : n <= 30 ? '#d97706' : '#059669');

export default function CommissionStructuresPage() {
  const [structs, setStructs] = useState({}); // { [productLabel]: [segments] }
  const [customProducts, setCustomProducts] = useState({});
  const [clients, setClients] = useState([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [openTrack, setOpenTrack] = useState('');
  const [toast, setToast] = useState({ open: false, msg: '', severity: 'success' });

  useEffect(() => {
    let alive = true;
    Promise.all([
      getDoc(STRUCT_DOC),
      getDocs(collection(db, 'products')),
      getDocs(collection(db, 'clients')),
    ]).then(([sSnap, pSnap, cSnap]) => {
      if (!alive) return;
      const products = (sSnap.exists() && sSnap.data().products) || {};
      const map = {};
      Object.entries(products).forEach(([label, v]) => {
        map[label] = Array.isArray(v) ? v : (Array.isArray(v?.segments) ? v.segments : []);
      });
      setStructs(map);
      const cp = {}; pSnap.forEach(d => { cp[d.id] = { ...d.data() }; }); setCustomProducts(cp);
      setClients(cSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.status || c.status === 'approved'));
    }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // All product labels — built-in + custom (created in Admin) — deduped & sorted.
  const productLabels = useMemo(() => {
    const all = { ...PRODUCTS, ...customProducts };
    const labels = Object.values(all).filter(p => p && !p.hidden && p.label).map(p => p.label);
    return Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b));
  }, [customProducts]);

  const hasStructure = (label) => (structs[label] || []).some(s => s.rate !== '' && Number(s.length) > 0);

  const setSegs   = (segs)      => setStructs(s => ({ ...s, [selected]: segs }));
  const addSeg    = ()          => setSegs([...(structs[selected] || []), blankSeg()]);
  const removeSeg = (idx)       => setSegs((structs[selected] || []).filter((_, i) => i !== idx));
  const updateSeg = (idx, field, val) =>
    setSegs((structs[selected] || []).map((r, i) => i === idx ? { ...r, [field]: val } : r));

  const save = async () => {
    setSaving(true);
    const clean = {};
    Object.entries(structs).forEach(([label, segs]) => {
      const kept = (segs || [])
        .filter(s => s.rate !== '' && s.rate != null && Number(s.length) > 0)
        .map(s => ({ unit: s.unit === 'month' ? 'month' : 'year', length: Number(s.length) || 1, rate: Number(s.rate) || 0 }));
      if (kept.length) clean[label] = { segments: kept };
    });
    try {
      await setDoc(STRUCT_DOC, { products: clean, updated_at: serverTimestamp() }, { merge: true });
      setToast({ open: true, msg: 'Commission structures saved.', severity: 'success' });
    } catch (err) {
      setToast({ open: true, msg: `Could not save: ${err.message || err}`, severity: 'error' });
    }
    setSaving(false);
  };

  const structuredLabels = productLabels.filter(hasStructure);

  // Policies to track under a structured product: the latest period per renewal
  // family (so each policy appears once), with its scale position and renewal timing.
  const byId = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients]);
  const policiesFor = (label) => {
    const groups = {};
    clients.filter(c => c.product === label).forEach(c => {
      const root = c.root_policy_id || c.id;
      const g = groups[root];
      if (!g || new Date(c.policy_period_from || 0) > new Date(g.policy_period_from || 0)) groups[root] = c;
    });
    return Object.values(groups).sort((a, b) => (new Date(a.policy_period_to || 0)) - (new Date(b.policy_period_to || 0)));
  };
  const scaleFor = (c, segs) => {
    const root = c.root_policy_id ? (byId[c.root_policy_id] || c) : c;
    const cur = structureRate(segs, root.policy_period_from, c.policy_period_from);
    const curMonths = cur ? cur.months : 0;
    const nxt = rateAtMonths(segs, curMonths + 12); // the rate one year on (next renewal)
    return {
      year: Math.floor(curMonths / 12) + 1,
      rate: cur ? cur.rate : 0,
      nextRate: nxt ? nxt.rate : 0,
    };
  };

  const segs = structs[selected] || [];
  const ladder = expandLadder(segs.filter(s => s.rate !== '' && Number(s.length) > 0));

  return (
    <Box className="page-enter" sx={{ maxWidth: 1000, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>Commission Structures</Typography>
          <Typography sx={{ fontSize: 13, color: '#9CA3AF', mt: 0.3 }}>
            Declining commission scales — the rate steps down each policy year (or month). Set up a product's
            scale, then track its policies and upcoming renewals below.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<SaveOutlinedIcon />} onClick={save} disabled={saving || loading}
          sx={{ textTransform: 'none', fontWeight: 700 }}>
          {saving ? 'Saving…' : 'Save all changes'}
        </Button>
      </Box>

      {loading ? (
        <Skeleton variant="rounded" height={220} sx={{ mt: 2 }} />
      ) : (
        <>
          {/* ── Part 1 — set up a structure ─────────────────────────── */}
          <Card sx={{ mt: 2, border: '1px solid rgba(56,163,224,0.16)' }}>
            <CardContent>
              <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#0e7490', textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5 }}>
                1 · Set up a structure
              </Typography>
              <FormControl fullWidth size="small" sx={{ mb: selected ? 2 : 0 }}>
                <InputLabel>Choose a product</InputLabel>
                <Select label="Choose a product" value={selected} onChange={e => setSelected(e.target.value)}>
                  <MenuItem value=""><em>— select a product —</em></MenuItem>
                  {productLabels.map(l => (
                    <MenuItem key={l} value={l} sx={{ fontSize: 13 }}>
                      {l}{hasStructure(l) ? '  •' : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {selected && (
                <Box>
                  {segs.length > 0 && (
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 32px', gap: 1, mb: 0.6, px: 0.3,
                               '& > *': { fontSize: 10.5, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.3 } }}>
                      <Box>Unit</Box><Box>How many</Box><Box>Rate %</Box><Box />
                    </Box>
                  )}
                  {segs.map((s, idx) => (
                    <Box key={idx} sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 32px', gap: 1, mb: 0.8, alignItems: 'center' }}>
                      <Select size="small" value={s.unit} onChange={e => updateSeg(idx, 'unit', e.target.value)} sx={{ fontSize: 12 }}>
                        <MenuItem value="year" sx={{ fontSize: 12 }}>Year(s)</MenuItem>
                        <MenuItem value="month" sx={{ fontSize: 12 }}>Month(s)</MenuItem>
                      </Select>
                      <TextField size="small" type="number" inputProps={{ min: 1, step: 1, inputMode: 'numeric' }} value={s.length}
                        onChange={e => updateSeg(idx, 'length', e.target.value)} sx={{ '& input': { fontSize: 12 } }} />
                      <TextField size="small" type="number" inputProps={{ step: 'any', inputMode: 'decimal' }} value={s.rate}
                        onChange={e => updateSeg(idx, 'rate', e.target.value)}
                        InputProps={{ endAdornment: <InputAdornment position="end" sx={{ '& p': { fontSize: 11 } }}>%</InputAdornment> }}
                        sx={{ '& input': { fontSize: 12 } }} />
                      <IconButton size="small" onClick={() => removeSeg(idx)} sx={{ color: '#dc2626' }}><DeleteOutlineIcon sx={{ fontSize: 18 }} /></IconButton>
                    </Box>
                  ))}
                  <Button size="small" startIcon={<AddIcon sx={{ fontSize: 16 }} />} onClick={addSeg}
                    sx={{ textTransform: 'none', mt: 0.5, color: '#255EAB' }}>Add step</Button>

                  {ladder.length > 0 && (
                    <Box sx={{ mt: 1.5, pt: 1.2, borderTop: '1px dashed rgba(56,163,224,0.18)' }}>
                      <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.4, mb: 0.8 }}>Preview</Typography>
                      <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap' }}>
                        {ladder.map((step, i) => (
                          <Box key={i} sx={{ px: 1, py: 0.5, borderRadius: '8px', bgcolor: 'rgba(37,94,171,0.06)', border: '1px solid rgba(37,94,171,0.15)' }}>
                            <Typography sx={{ fontSize: 10, color: '#6B7280', fontWeight: 700 }}>{step.label}</Typography>
                            <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#255EAB' }}>{step.rate}%</Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}
                  <Typography sx={{ fontSize: 11, color: '#9CA3AF', mt: 1.5 }}>Remember to <b>Save all changes</b> after editing.</Typography>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* ── Part 2 — track structured products + their policies ──── */}
          <Box sx={{ mt: 3, mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TrendingDownOutlinedIcon sx={{ fontSize: 20, color: '#0e7490' }} />
            <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#0e7490', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              2 · Products with a structure ({structuredLabels.length})
            </Typography>
          </Box>

          {structuredLabels.length === 0 ? (
            <Typography sx={{ color: '#9CA3AF', fontSize: 13 }}>No products have a commission structure yet. Set one up above.</Typography>
          ) : structuredLabels.map(label => {
            const lsegs = (structs[label] || []).filter(s => s.rate !== '' && Number(s.length) > 0);
            const lad = expandLadder(lsegs);
            const months = totalMonths(lsegs);
            const span = months >= 12 && months % 12 === 0 ? `${months / 12} yr` : `${months} mo`;
            const pol = policiesFor(label);
            const isOpen = openTrack === label;
            return (
              <Card key={label} sx={{ mb: 1.2, border: '1px solid rgba(8,145,178,0.18)' }}>
                <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                  <Box sx={{ px: 2, py: 1.4, display: 'flex', alignItems: 'center', gap: 1.5, cursor: 'pointer',
                             '&:hover': { bgcolor: 'rgba(8,145,178,0.03)' } }}
                       onClick={() => setOpenTrack(o => o === label ? '' : label)}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 700, flex: 1 }}>{label}</Typography>
                    <Chip size="small" label={`${lad.length} steps · ${span}`}
                      sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(8,145,178,0.10)', color: '#0e7490' }} />
                    <Chip size="small" label={`${pol.length} polic${pol.length === 1 ? 'y' : 'ies'}`}
                      sx={{ height: 22, fontSize: 11, fontWeight: 700, bgcolor: 'rgba(37,94,171,0.10)', color: '#255EAB' }} />
                    {isOpen ? <ExpandLessIcon sx={{ color: '#9CA3AF' }} /> : <ExpandMoreIcon sx={{ color: '#9CA3AF' }} />}
                  </Box>
                  <Collapse in={isOpen} timeout={200} unmountOnExit>
                    <Box sx={{ px: 2, pb: 2, pt: 0.5, borderTop: '1px solid rgba(8,145,178,0.10)' }}>
                      {/* scale ladder */}
                      <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap', mb: 1.5 }}>
                        {lad.map((step, i) => (
                          <Box key={i} sx={{ px: 1, py: 0.4, borderRadius: '8px', bgcolor: 'rgba(37,94,171,0.06)', border: '1px solid rgba(37,94,171,0.15)' }}>
                            <Typography sx={{ fontSize: 9.5, color: '#6B7280', fontWeight: 700 }}>{step.label}</Typography>
                            <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#255EAB' }}>{step.rate}%</Typography>
                          </Box>
                        ))}
                      </Box>
                      <Divider sx={{ mb: 1 }} />
                      {/* policies under this product */}
                      {pol.length === 0 ? (
                        <Typography sx={{ fontSize: 12.5, color: '#9CA3AF' }}>No policies created for this product yet.</Typography>
                      ) : (
                        <>
                          <Box sx={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 0.9fr 0.7fr 1.1fr', gap: 1, px: 0.3, mb: 0.5,
                                     '& > *': { fontSize: 10, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.3 } }}>
                            <Box>Client</Box><Box>Policy No</Box><Box>Year · Rate</Box><Box>Next</Box><Box>Renewal</Box>
                          </Box>
                          {pol.map(c => {
                            const sc = scaleFor(c, lsegs);
                            const dl = daysLeft(c.policy_period_to);
                            return (
                              <Box key={c.id} sx={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr 0.9fr 0.7fr 1.1fr', gap: 1, px: 0.3, py: 0.7,
                                                    alignItems: 'center', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                                <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#0A1A3E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.client_name || '—'}</Typography>
                                <Typography sx={{ fontSize: 11.5, fontFamily: 'monospace', color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.policy_no || '—'}</Typography>
                                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#255EAB' }}>{sc.year ? `Y${sc.year} · ${sc.rate}%` : `${sc.rate}%`}</Typography>
                                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#0e7490' }}>{sc.nextRate}%</Typography>
                                <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: daysColor(dl) }}>{daysText(dl)}</Typography>
                              </Box>
                            );
                          })}
                        </>
                      )}
                    </Box>
                  </Collapse>
                </CardContent>
              </Card>
            );
          })}
        </>
      )}

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.severity} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
