import React, { useState } from 'react';
import {
  collection, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import { PRODUCTS } from '../config/products';
import { parseAutoCalc, buildAutoCalc, describeAutoCalc } from '../utils/autoCalc';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Switch from '@mui/material/Switch';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Tooltip from '@mui/material/Tooltip';
import Collapse from '@mui/material/Collapse';
import CircularProgress from '@mui/material/CircularProgress';

import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import FunctionsIcon from '@mui/icons-material/Functions';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';

const FIELD_TYPES = [
  'text', 'number', 'date', 'email', 'select', 'multiselect',
  'yesno', 'textarea', 'currency', 'file',
];

const TYPE_LABEL = {
  text:'Text', number:'Number', date:'Date', email:'Email',
  select:'Select', multiselect:'Multi-select', yesno:'Yes/No',
  textarea:'Textarea', currency:'Currency', file:'File Upload',
};

const PRESET_COLORS = [
  '#6366f1','#3B82F6','#0ea5e9','#f59e0b','#10B981',
  '#8b5cf6','#ef4444','#ec4899','#14b8a6','#f97316',
];

const DEFAULT_COMPARISON_ROWS = [
  'Annual Premium (LKR)', 'Basic Premium (LKR)', 'SRCC (LKR)',
  'Validity (days)', 'Special Conditions',
];

// Common section names suggested while building (the underwriting form reads the
// product-specific ones: Risk Information, Sum Insured, Covers Required, etc.).
const SECTION_SUGGESTIONS = [
  'Proposer Details', 'Period of Insurance', 'Risk Information', 'Sum Insured',
  'Covers Required', 'Additional Clauses', 'Underwriting Information', 'Premium',
];

// One-click starter section bundles — drop a ready-made section + common fields.
const STARTER_SECTIONS = [
  { name: 'Risk Information', icon: '🛡️', fields: [
    { label: 'Risk Description', type: 'textarea' },
    { label: 'Location / Address', type: 'text' },
  ]},
  { name: 'Sum Insured', icon: '💰', fields: [
    { label: 'Sum Insured (LKR)', type: 'currency', required: true },
  ]},
  { name: 'Covers Required', icon: '✅', fields: [
    { label: 'Basic Cover', type: 'yesno' },
    { label: 'Extended Cover', type: 'yesno' },
  ]},
  { name: 'Additional Clauses', icon: '📎', fields: [
    { label: 'Special Clause', type: 'yesno' },
  ]},
  { name: 'Underwriting Information', icon: '📋', fields: [
    { label: 'Claims History (3 yrs)', type: 'textarea' },
    { label: 'Previous Insurer', type: 'text' },
  ]},
];

// Single quick-add fields.
const QUICK_FIELDS = [
  { label: 'Sum Insured (LKR)', section: 'Sum Insured',        type: 'currency', required: true },
  { label: 'Basic Premium (LKR)', section: 'Premium',          type: 'currency' },
  { label: 'Period From',        section: 'Period of Insurance', type: 'date' },
  { label: 'Period To',          section: 'Period of Insurance', type: 'date' },
  { label: 'Name of Insured',    section: 'Proposer Details',   type: 'text', required: true },
  { label: 'Mobile No',          section: 'Proposer Details',   type: 'text' },
  { label: 'Email',              section: 'Proposer Details',   type: 'email' },
];

const WIZARD_STEPS = ['Basics', 'Sections & Fields', 'Auto-calculations', 'Review'];

const EMPTY_PRODUCT = {
  label: '', prefix: '', icon: '📋', color: '#6366f1',
  customerNameField: 'proposer_name',
  comparisonRows: [...DEFAULT_COMPARISON_ROWS],
  fields: [],
};

const EMPTY_FIELD = {
  name: '', label: '', section: '', type: 'text',
  required: false, options: '', accept: '',
  showIfField: '', showIfValue: '',
};

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

const NUMERIC_TYPES = ['number', 'currency'];

/* ── Small badge ──────────────────────────────────────────────────────────── */
function Badge({ label, color, bg }) {
  return (
    <Box component="span" sx={{
      display: 'inline-block', px: 1, py: 0.2, borderRadius: '6px',
      fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
      color, bgcolor: bg,
    }}>
      {label}
    </Box>
  );
}

/* ── Product card ─────────────────────────────────────────────────────────── */
function ProductCard({ product, onView, onEdit, onDelete, onClone, isAdmin }) {
  const sectionCount = [...new Set((product.fields || []).map(f => f.section).filter(Boolean))].length;
  return (
    <Card sx={{
      border: `1.5px solid ${product.isBuiltIn ? 'rgba(99,102,241,0.14)' : `${product.color}35`}`,
      transition: 'box-shadow 0.15s',
      '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,0.10)' },
    }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" alignItems="flex-start" spacing={1.5}>
          <Box sx={{
            width: 42, height: 42, borderRadius: '11px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, bgcolor: `${product.color}14`,
            border: `1.5px solid ${product.color}30`,
          }}>
            {product.icon || '📋'}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 0.4 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 13.5, color: '#0F172A', lineHeight: 1.3 }}>
                {product.label}
              </Typography>
              {product.isBuiltIn
                ? <Badge label="Built-in" color="#6B7280" bg="rgba(107,114,128,0.1)" />
                : <Badge label="Custom" color={product.color} bg={`${product.color}14`} />
              }
            </Stack>
            <Stack direction="row" spacing={0.8} flexWrap="wrap" sx={{ mb: 1 }}>
              <Chip label={product.prefix || '—'} size="small"
                sx={{ fontSize: 10.5, fontWeight: 700, height: 20, bgcolor: `${product.color}12`, color: product.color }} />
              <Chip label={`${(product.fields || []).length} fields`} size="small"
                sx={{ fontSize: 10.5, height: 20, bgcolor: 'rgba(0,0,0,0.05)', color: '#6B7280' }} />
              <Chip label={`${sectionCount} sections`} size="small"
                sx={{ fontSize: 10.5, height: 20, bgcolor: 'rgba(0,0,0,0.05)', color: '#6B7280' }} />
            </Stack>
            <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
              <Button size="small" variant="outlined" startIcon={<VisibilityOutlinedIcon sx={{ fontSize: 13 }} />}
                onClick={() => onView(product)}
                sx={{ fontSize: 11, py: 0.3, px: 1, borderColor: 'rgba(0,0,0,0.15)', color: '#6B7280', minWidth: 0 }}>
                View
              </Button>
              {isAdmin && (
                <Tooltip title="Start a new product from a copy of this one">
                  <Button size="small" variant="outlined" startIcon={<ContentCopyIcon sx={{ fontSize: 13 }} />}
                    onClick={() => onClone(product)}
                    sx={{ fontSize: 11, py: 0.3, px: 1, borderColor: 'rgba(99,102,241,0.35)', color: '#6366f1', minWidth: 0 }}>
                    Clone
                  </Button>
                </Tooltip>
              )}
              {!product.isBuiltIn && isAdmin && (
                <>
                  <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon sx={{ fontSize: 13 }} />}
                    onClick={() => onEdit(product)}
                    sx={{ fontSize: 11, py: 0.3, px: 1, borderColor: `${product.color}40`, color: product.color, minWidth: 0 }}>
                    Edit
                  </Button>
                  <IconButton size="small" onClick={() => onDelete(product)}
                    sx={{ color: '#3B82F6', '&:hover': { bgcolor: 'rgba(59,130,246,0.08)' } }}>
                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </>
              )}
            </Stack>
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

/* ── Field row in editor ──────────────────────────────────────────────────── */
function FieldRow({ field, idx, onEdit, onRemove }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1} sx={{
      px: 1.5, py: 0.8, borderRadius: '8px', bgcolor: 'rgba(0,0,0,0.025)',
      border: '1px solid rgba(0,0,0,0.07)', mb: 0.5,
    }}>
      <DragIndicatorIcon sx={{ fontSize: 15, color: '#CBD5E1', cursor: 'grab', flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A' }}>
          {field.label}
          {field.autoCalc && (
            <Box component="span" sx={{ ml: 0.6, fontSize: 9.5, fontWeight: 700, color: '#3B82F6', bgcolor: 'rgba(59,130,246,0.10)', px: 0.6, py: 0.1, borderRadius: '5px' }}>
              ƒ auto
            </Box>
          )}
        </Typography>
        <Typography sx={{ fontSize: 10.5, color: '#9CA3AF' }}>
          {field.name} · {TYPE_LABEL[field.type] || field.type}
          {field.required ? ' · Required' : ''}
          {field.showIf ? ` · if ${field.showIf.field}=${field.showIf.value}` : ''}
          {field.autoCalc ? ` · = ${describeAutoCalc(field.autoCalc)}` : ''}
        </Typography>
      </Box>
      <Chip label={TYPE_LABEL[field.type] || field.type} size="small"
        sx={{ fontSize: 10, height: 18, bgcolor: 'rgba(99,102,241,0.08)', color: '#6366f1' }} />
      <IconButton size="small" onClick={() => onEdit(idx)} sx={{ color: '#6366f1' }}>
        <EditOutlinedIcon sx={{ fontSize: 14 }} />
      </IconButton>
      <IconButton size="small" onClick={() => onRemove(idx)} sx={{ color: '#3B82F6' }}>
        <DeleteOutlineIcon sx={{ fontSize: 14 }} />
      </IconButton>
    </Stack>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
const ProductsManager = () => {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const [customList, setCustomList]   = useState([]);
  const [loading,    setLoading]      = useState(true);
  const [editOpen,   setEditOpen]     = useState(false);
  const [editKey,    setEditKey]      = useState(null);
  const [form,       setForm]         = useState(EMPTY_PRODUCT);
  const [wizStep,    setWizStep]      = useState(0);
  const [fieldDlg,   setFieldDlg]     = useState(false);
  const [editFldIdx, setEditFldIdx]   = useState(-1);
  const [fieldForm,  setFieldForm]    = useState(EMPTY_FIELD);
  const [viewProd,   setViewProd]     = useState(null);
  const [deleteTgt,  setDeleteTgt]    = useState(null);
  const [saving,     setSaving]       = useState(false);
  const [snack,      setSnack]        = useState({ open: false, msg: '', severity: 'success' });
  const [openSections, setOpenSections] = useState({});
  const [autoCfg,    setAutoCfg]      = useState({}); // field name → { on, mode, sources, rate }

  React.useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'products'),
      snap => { setCustomList(snap.docs.map(d => ({ key: d.id, ...d.data() }))); setLoading(false); },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  const builtIn = Object.entries(PRODUCTS).map(([key, val]) => ({ key, ...val, isBuiltIn: true }));
  const custom  = customList.map(p => ({ ...p, isBuiltIn: false }));
  const all     = [...builtIn, ...custom];

  const toast = (msg, severity = 'success') => setSnack({ open: true, msg, severity });

  const resetWizard = () => { setWizStep(0); setOpenSections({}); setAutoCfg({}); };

  const openAdd = () => {
    setEditKey(null);
    setForm({ ...EMPTY_PRODUCT, comparisonRows: [...DEFAULT_COMPARISON_ROWS], fields: [] });
    resetWizard();
    setEditOpen(true);
  };

  const openEdit = (p) => {
    setEditKey(p.key);
    setForm({
      label: p.label || '', prefix: p.prefix || '',
      icon: p.icon || '📋', color: p.color || '#6366f1',
      customerNameField: p.customerNameField || 'proposer_name',
      comparisonRows: [...(p.comparisonRows || [])],
      fields: (p.fields || []).map(f => ({ ...f })),
    });
    resetWizard();
    setEditOpen(true);
  };

  // Clone — start a brand-new product pre-loaded from an existing one.
  const cloneFrom = (p) => {
    setEditKey(null);
    setForm({
      label: '', prefix: '',
      icon: p.icon || '📋', color: p.color || '#6366f1',
      customerNameField: p.customerNameField || 'proposer_name',
      comparisonRows: [...(p.comparisonRows || DEFAULT_COMPARISON_ROWS)],
      fields: (p.fields || []).map(f => ({ ...f })),
    });
    resetWizard();
    setEditOpen(true);
    toast(`Cloned from “${p.label}” — give it a new name & prefix`, 'info');
  };

  const handleSave = async () => {
    if (!form.label.trim()) { setWizStep(0); return toast('Product name is required', 'error'); }
    if (!form.prefix.trim()) { setWizStep(0); return toast('Prefix is required (e.g. TRV)', 'error'); }
    if (form.fields.length === 0) { setWizStep(1); return toast('Add at least one form field', 'error'); }
    setSaving(true);
    try {
      const key = editKey || slugify(form.label) || `product_${Date.now()}`;
      await setDoc(doc(db, 'products', key), {
        label:             form.label.trim(),
        prefix:            form.prefix.trim().toUpperCase(),
        icon:              form.icon.trim() || '📋',
        color:             form.color || '#6366f1',
        customerNameField: form.customerNameField.trim() || 'proposer_name',
        comparisonRows:    form.comparisonRows.filter(r => r.trim()),
        fields:            form.fields,
        isCustom:          true,
        updated_at:        serverTimestamp(),
        ...(!editKey ? { created_at: serverTimestamp() } : {}),
      });
      toast(editKey ? 'Product updated' : 'Product created');
      setEditOpen(false);
    } catch (e) {
      toast('Save failed: ' + e.message, 'error');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTgt) return;
    try {
      await deleteDoc(doc(db, 'products', deleteTgt.key));
      toast('Product deleted');
    } catch { toast('Delete failed', 'error'); }
    setDeleteTgt(null);
  };

  // ── Comparison rows ────────────────────────────────────────────────────────
  const addRow = () => setForm(f => ({ ...f, comparisonRows: [...f.comparisonRows, ''] }));
  const updateRow = (i, v) => setForm(f => {
    const r = [...f.comparisonRows]; r[i] = v; return { ...f, comparisonRows: r };
  });
  const removeRow = (i) => setForm(f => ({ ...f, comparisonRows: f.comparisonRows.filter((_, j) => j !== i) }));

  // ── Fields ─────────────────────────────────────────────────────────────────
  const groupedFields = {};
  (form.fields || []).forEach((f, i) => {
    const sec = f.section || 'General';
    if (!groupedFields[sec]) groupedFields[sec] = [];
    groupedFields[sec].push({ ...f, _idx: i });
  });

  const uniqueName = (base, taken) => {
    let name = base || `field_${Date.now()}`;
    let n = 2;
    while (taken.has(name)) { name = `${base}_${n}`; n++; }
    return name;
  };

  const openAddField = (defaultSection = '') => {
    setEditFldIdx(-1);
    setFieldForm({ ...EMPTY_FIELD, section: defaultSection });
    setFieldDlg(true);
  };

  const openEditField = (idx) => {
    const f = form.fields[idx];
    setEditFldIdx(idx);
    setFieldForm({
      name: f.name || '', label: f.label || '', section: f.section || '',
      type: f.type || 'text', required: !!f.required,
      options: (f.options || []).join(', '), accept: f.accept || '',
      showIfField: f.showIf?.field || '', showIfValue: f.showIf?.value || '',
    });
    setFieldDlg(true);
  };

  const saveField = () => {
    if (!fieldForm.label.trim()) return toast('Field label is required', 'error');
    const name = (fieldForm.name.trim() || slugify(fieldForm.label)) || `field_${Date.now()}`;
    const newField = {
      name, label: fieldForm.label.trim(),
      section: fieldForm.section.trim() || 'General',
      type: fieldForm.type,
      ...(fieldForm.required ? { required: true } : {}),
      ...(['select', 'multiselect'].includes(fieldForm.type) && fieldForm.options
        ? { options: fieldForm.options.split(',').map(o => o.trim()).filter(Boolean) } : {}),
      ...(fieldForm.type === 'file' && fieldForm.accept ? { accept: fieldForm.accept.trim() } : {}),
      ...(fieldForm.showIfField && fieldForm.showIfValue
        ? { showIf: { field: fieldForm.showIfField.trim(), value: fieldForm.showIfValue.trim() } } : {}),
    };
    setForm(f => {
      const fields = [...f.fields];
      if (editFldIdx >= 0) {
        // preserve any auto-calc already configured for this field
        if (f.fields[editFldIdx]?.autoCalc && NUMERIC_TYPES.includes(newField.type)) newField.autoCalc = f.fields[editFldIdx].autoCalc;
        fields[editFldIdx] = newField;
      } else fields.push(newField);
      return { ...f, fields };
    });
    setFieldDlg(false);
  };

  const removeField = (idx) => setForm(f => ({ ...f, fields: f.fields.filter((_, i) => i !== idx) }));

  // ── Shortcuts ──────────────────────────────────────────────────────────────
  const addStarterSection = (tpl) => {
    setForm(f => {
      const taken = new Set(f.fields.map(x => x.name));
      const added = [];
      tpl.fields.forEach(tf => {
        const base = slugify(tf.label);
        if ([...taken].some(n => n === base)) return; // skip dup label in same product
        const name = uniqueName(base, taken);
        taken.add(name);
        added.push({ name, label: tf.label, section: tpl.name, type: tf.type, ...(tf.required ? { required: true } : {}) });
      });
      if (!added.length) return f;
      return { ...f, fields: [...f.fields, ...added] };
    });
    setOpenSections(s => ({ ...s, [tpl.name]: true }));
    toast(`Added “${tpl.name}” section`);
  };

  const addQuickField = (qf) => {
    setForm(f => {
      const taken = new Set(f.fields.map(x => x.name));
      const base = slugify(qf.label);
      if (taken.has(base)) { return f; }
      const name = uniqueName(base, taken);
      return { ...f, fields: [...f.fields, { name, label: qf.label, section: qf.section, type: qf.type, ...(qf.required ? { required: true } : {}) }] };
    });
    toast(`Added “${qf.label}”`);
  };

  // ── Auto-calc helpers (sum or percentage) ──────────────────────────────────
  const numericFields = (form.fields || []).map((f, i) => ({ ...f, _idx: i })).filter(f => NUMERIC_TYPES.includes(f.type));

  // Current editor config for a field — local override, else derived from its formula.
  const getCfg = (f) => autoCfg[f.name] || { on: !!f.autoCalc, ...parseAutoCalc(f.autoCalc) };

  // Merge a change and write the resulting formula back onto the field.
  const updateAuto = (name, patch) => {
    const cur = autoCfg[name] || (() => {
      const fld = form.fields.find(x => x.name === name);
      return { on: !!fld?.autoCalc, ...parseAutoCalc(fld?.autoCalc) };
    })();
    const next = { ...cur, ...patch };
    setAutoCfg(prev => ({ ...prev, [name]: next }));
    setForm(fm => ({
      ...fm,
      fields: fm.fields.map(x => {
        if (x.name !== name) return x;
        const c = { ...x };
        const formula = next.on ? buildAutoCalc(next) : null;
        if (formula) c.autoCalc = formula; else delete c.autoCalc;
        return c;
      }),
    }));
  };

  const toggleAutoSource = (field, srcName) => {
    const cfg = getCfg(field);
    const sources = cfg.sources.includes(srcName) ? cfg.sources.filter(n => n !== srcName) : [...cfg.sources, srcName];
    updateAuto(field.name, { on: true, sources });
  };

  // ── Wizard navigation ──────────────────────────────────────────────────────
  const stepValid = (step) => {
    if (step === 0) return form.label.trim() && form.prefix.trim();
    if (step === 1) return form.fields.length > 0;
    return true;
  };
  const goNext = () => {
    if (!stepValid(wizStep)) {
      if (wizStep === 0) return toast('Enter a product name and prefix first', 'error');
      if (wizStep === 1) return toast('Add at least one field to continue', 'error');
    }
    setWizStep(s => Math.min(s + 1, WIZARD_STEPS.length - 1));
  };
  const goBack = () => setWizStep(s => Math.max(s - 1, 0));

  // ── View product details ───────────────────────────────────────────────────
  const viewSections = viewProd ? [...new Set((viewProd.fields || []).map(f => f.section).filter(Boolean))] : [];

  const inputSx = { '& .MuiInputBase-root': { fontSize: 13 } };

  return (
    <Box>
      {/* Header */}
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Insurance Products</Typography>
          <Typography sx={{ fontSize: 13, color: '#9CA3AF' }}>
            {builtIn.length} built-in · {custom.length} custom
          </Typography>
        </Box>
        {isAdmin && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}
            sx={{ fontSize: 13, background: 'linear-gradient(135deg,#3B82F6,#6366f1)', boxShadow: '0 4px 12px rgba(59,130,246,0.25)' }}>
            Add Product
          </Button>
        )}
      </Stack>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 1.5 }}>
          {all.map(p => (
            <ProductCard key={p.key} product={p} isAdmin={isAdmin}
              onView={setViewProd} onEdit={openEdit} onDelete={setDeleteTgt} onClone={cloneFrom} />
          ))}
        </Box>
      )}

      {/* ── View dialog (read-only) ── */}
      <Dialog open={!!viewProd} onClose={() => setViewProd(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ fontSize: 22 }}>{viewProd?.icon}</Box>
          {viewProd?.label}
          {viewProd?.isBuiltIn
            ? <Badge label="Built-in" color="#6B7280" bg="rgba(107,114,128,0.1)" />
            : <Badge label="Custom" color={viewProd?.color} bg={`${viewProd?.color}14`} />}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Chip label={`Prefix: ${viewProd?.prefix}`} size="small"
              sx={{ fontWeight: 700, bgcolor: `${viewProd?.color}14`, color: viewProd?.color }} />
            <Chip label={`${(viewProd?.fields || []).length} fields`} size="small" />
            <Chip label={`${viewSections.length} sections`} size="small" />
          </Stack>
          {viewProd?.comparisonRows?.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#6B7280', mb: 0.8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Comparison Rows
              </Typography>
              {viewProd.comparisonRows.map((r, i) => (
                <Typography key={i} sx={{ fontSize: 12.5, py: 0.3, borderBottom: '1px solid rgba(0,0,0,0.05)', color: '#374151' }}>
                  {r}
                </Typography>
              ))}
            </Box>
          )}
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#6B7280', mb: 0.8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Form Sections
          </Typography>
          {viewSections.map(sec => {
            const sFields = (viewProd?.fields || []).filter(f => f.section === sec);
            return (
              <Box key={sec} sx={{ mb: 1.5, p: 1.5, borderRadius: '10px', bgcolor: 'rgba(0,0,0,0.025)', border: '1px solid rgba(0,0,0,0.07)' }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#374151', mb: 0.8 }}>{sec} ({sFields.length})</Typography>
                {sFields.slice(0, 4).map(f => (
                  <Typography key={f.name} sx={{ fontSize: 11.5, color: '#6B7280', py: 0.2 }}>
                    {f.label} <span style={{ color: '#9CA3AF' }}>({TYPE_LABEL[f.type] || f.type}{f.required ? ', req' : ''}{f.autoCalc ? ', auto' : ''})</span>
                  </Typography>
                ))}
                {sFields.length > 4 && <Typography sx={{ fontSize: 11, color: '#9CA3AF' }}>+{sFields.length - 4} more…</Typography>}
              </Box>
            );
          })}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          {isAdmin && (
            <Button onClick={() => { const p = viewProd; setViewProd(null); cloneFrom(p); }}
              startIcon={<ContentCopyIcon sx={{ fontSize: 15 }} />} sx={{ color: '#6366f1' }}>
              Clone
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setViewProd(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Add / Edit WIZARD ── */}
      <Dialog open={editOpen} onClose={() => !saving && setEditOpen(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ pb: 1 }}>
          {editKey ? 'Edit Product' : 'Create a Product'}
          <Typography sx={{ fontSize: 12.5, color: '#9CA3AF', fontWeight: 400 }}>
            Build the form your team fills in for this product. It flows straight to quotations and the underwriting page.
          </Typography>
        </DialogTitle>
        <Box sx={{ px: 3 }}>
          <Stepper activeStep={wizStep} alternativeLabel
            sx={{ '& .MuiStepLabel-label': { fontSize: 12, fontWeight: 600 },
                  '& .Mui-active .MuiStepIcon-root': { color: '#3B82F6' },
                  '& .Mui-completed .MuiStepIcon-root': { color: '#10B981' } }}>
            {WIZARD_STEPS.map((s, i) => (
              <Step key={s} completed={wizStep > i && stepValid(i)}>
                <StepLabel onClick={() => (i < wizStep || stepValid(wizStep)) && setWizStep(i)}
                  sx={{ cursor: 'pointer' }}>{s}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>
        <DialogContent sx={{ p: 0 }}>

          {/* ── Step 0: Basics ── */}
          {wizStep === 0 && (
            <Box sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField fullWidth label="Product Name *" size="small" value={form.label}
                    onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                    helperText="e.g. Travel Insurance" />
                  <TextField label="Prefix *" size="small" value={form.prefix}
                    onChange={e => setForm(f => ({ ...f, prefix: e.target.value.toUpperCase().slice(0, 6) }))}
                    helperText="2-6 chars, e.g. TRV" sx={{ minWidth: 120 }} />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField label="Icon (emoji)" size="small" value={form.icon}
                    onChange={e => setForm(f => ({ ...f, icon: e.target.value.slice(0, 4) }))}
                    helperText="Paste an emoji, e.g. ✈️" sx={{ minWidth: 130 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#6B7280', mb: 0.8 }}>Color</Typography>
                    <Stack direction="row" spacing={0.8} flexWrap="wrap">
                      {PRESET_COLORS.map(c => (
                        <Box key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                          sx={{
                            width: 26, height: 26, borderRadius: '7px', bgcolor: c, cursor: 'pointer',
                            border: form.color === c ? '2.5px solid #0F172A' : '2px solid transparent',
                            transition: 'border 0.15s',
                          }} />
                      ))}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 0.5 }}>
                        <input type="color" value={form.color}
                          onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                          style={{ width: 26, height: 26, border: 'none', borderRadius: 7, cursor: 'pointer', padding: 0 }} />
                      </Box>
                    </Stack>
                  </Box>
                </Stack>
                <TextField fullWidth label="Customer Name Field" size="small" value={form.customerNameField}
                  onChange={e => setForm(f => ({ ...f, customerNameField: e.target.value }))}
                  helperText="The field name that holds the customer's name (default: proposer_name)" />

                {/* Start-from shortcut */}
                {!editKey && (
                  <Box sx={{ p: 2, borderRadius: '12px', bgcolor: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)' }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                      <ContentCopyIcon sx={{ fontSize: 16, color: '#6366f1' }} />
                      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#4338ca' }}>Shortcut — start from an existing product</Typography>
                    </Stack>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Copy fields from…</InputLabel>
                      <Select label="Copy fields from…" value=""
                        onChange={e => { const p = all.find(x => x.key === e.target.value); if (p) cloneFrom(p); }}>
                        {all.map(p => <MenuItem key={p.key} value={p.key} sx={{ fontSize: 13 }}>{p.icon} {p.label} ({(p.fields || []).length} fields)</MenuItem>)}
                      </Select>
                    </FormControl>
                    {form.fields.length > 0 && (
                      <Typography sx={{ fontSize: 11.5, color: '#6B7280', mt: 1 }}>
                        {form.fields.length} field{form.fields.length !== 1 ? 's' : ''} loaded — continue to edit them in the next step.
                      </Typography>
                    )}
                  </Box>
                )}

                {/* Preview */}
                {form.label && (
                  <Box sx={{ p: 2, borderRadius: '10px', bgcolor: `${form.color}10`, border: `1.5px solid ${form.color}25`, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ fontSize: 24 }}>{form.icon}</Box>
                    <Box>
                      <Typography sx={{ fontWeight: 700, fontSize: 14, color: form.color }}>{form.label}</Typography>
                      <Typography sx={{ fontSize: 12, color: '#9CA3AF' }}>
                        Prefix: <strong>{form.prefix || '—'}</strong> · Reference: <strong>{form.prefix || 'XX'}-YYYYMMDD-XXXX-NAME</strong>
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Stack>
            </Box>
          )}

          {/* ── Step 1: Sections & Fields ── */}
          {wizStep === 1 && (
            <Box sx={{ p: 3 }}>
              {/* Shortcuts */}
              <Box sx={{ mb: 2, p: 1.5, borderRadius: '12px', bgcolor: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.18)' }}>
                <Stack direction="row" alignItems="center" spacing={0.8} sx={{ mb: 1 }}>
                  <BoltOutlinedIcon sx={{ fontSize: 16, color: '#6366f1' }} />
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>Quick add — starter sections</Typography>
                </Stack>
                <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                  {STARTER_SECTIONS.map(tpl => (
                    <Chip key={tpl.name} label={`${tpl.icon} ${tpl.name}`} size="small" onClick={() => addStarterSection(tpl)}
                      sx={{ fontSize: 11.5, cursor: 'pointer', bgcolor: '#fff', border: '1px solid rgba(99,102,241,0.4)', color: '#b45309', '&:hover': { bgcolor: 'rgba(99,102,241,0.12)' } }} />
                  ))}
                </Stack>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#b45309', mb: 0.8 }}>Quick add — common fields</Typography>
                <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                  {QUICK_FIELDS.map(qf => (
                    <Chip key={qf.label} label={`+ ${qf.label}`} size="small" onClick={() => addQuickField(qf)}
                      sx={{ fontSize: 11, cursor: 'pointer', bgcolor: '#fff', border: '1px solid rgba(99,102,241,0.35)', color: '#6366f1', '&:hover': { bgcolor: 'rgba(99,102,241,0.10)' } }} />
                  ))}
                </Stack>
              </Box>

              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: 13, color: '#6B7280' }}>
                  {form.fields.length} field{form.fields.length !== 1 ? 's' : ''} across {Object.keys(groupedFields).length} section{Object.keys(groupedFields).length !== 1 ? 's' : ''}
                </Typography>
                <Button size="small" variant="outlined" startIcon={<AddIcon sx={{ fontSize: 15 }} />}
                  onClick={() => openAddField()}
                  sx={{ fontSize: 12, borderColor: 'rgba(59,130,246,0.35)', color: '#3B82F6' }}>
                  Add Custom Field
                </Button>
              </Stack>

              {Object.entries(groupedFields).map(([section, fields]) => (
                <Box key={section} sx={{ mb: 2 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between"
                    onClick={() => setOpenSections(s => ({ ...s, [section]: !s[section] }))}
                    sx={{ cursor: 'pointer', p: 1, borderRadius: '8px', bgcolor: 'rgba(15,23,42,0.06)', mb: 0.5 }}>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>
                      {section} <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({fields.length})</span>
                    </Typography>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Tooltip title="Add field to this section">
                        <IconButton size="small" onClick={e => { e.stopPropagation(); openAddField(section); }}
                          sx={{ color: '#3B82F6', '&:hover': { bgcolor: 'rgba(59,130,246,0.08)' } }}>
                          <AddIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                      {openSections[section]
                        ? <ExpandLessIcon sx={{ fontSize: 16, color: '#6B7280' }} />
                        : <ExpandMoreIcon sx={{ fontSize: 16, color: '#6B7280' }} />}
                    </Stack>
                  </Stack>
                  <Collapse in={openSections[section] !== false}>
                    {fields.map(f => (
                      <FieldRow key={f._idx} field={f} idx={f._idx}
                        onEdit={openEditField} onRemove={removeField} />
                    ))}
                  </Collapse>
                </Box>
              ))}

              {form.fields.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 4, color: '#9CA3AF' }}>
                  <Typography sx={{ fontSize: 13 }}>No fields yet. Use a starter section above, or "Add Custom Field".</Typography>
                </Box>
              )}
            </Box>
          )}

          {/* ── Step 2: Auto-calculations ── */}
          {wizStep === 2 && (
            <Box sx={{ p: 3 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <FunctionsIcon sx={{ fontSize: 18, color: '#3B82F6' }} />
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Auto-calculated totals</Typography>
              </Stack>
              <Typography sx={{ fontSize: 12.5, color: '#6B7280', mb: 2 }}>
                Make a number field fill itself in — no formulas to type. Pick <strong>Add up</strong> (e.g. a Sum Insured total)
                or <strong>Percentage</strong> (e.g. VAT = 18% of premium, or premium = 2.5% of sum insured), then tick the fields.
                It computes by itself on both the quotation and underwriting forms.
              </Typography>

              {numericFields.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4, color: '#9CA3AF' }}>
                  <Typography sx={{ fontSize: 13 }}>
                    No number or currency fields yet. Add some in the previous step (e.g. a "Sum Insured" total and the values that make it up).
                  </Typography>
                </Box>
              ) : (
                <Stack spacing={1.5}>
                  {numericFields.map(f => {
                    const cfg = getCfg(f);
                    const on = cfg.on;
                    const isPct = cfg.mode === 'pct';
                    const others = numericFields.filter(o => o.name !== f.name);
                    const labelFor = (n) => numericFields.find(x => x.name === n)?.label || n;
                    return (
                      <Box key={f.name} sx={{ p: 1.5, borderRadius: '12px', border: `1px solid ${on ? 'rgba(59,130,246,0.30)' : 'rgba(0,0,0,0.08)'}`, bgcolor: on ? 'rgba(59,130,246,0.03)' : '#fff' }}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between">
                          <Box>
                            <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{f.label}</Typography>
                            <Typography sx={{ fontSize: 11, color: '#9CA3AF' }}>{f.section} · {TYPE_LABEL[f.type]}</Typography>
                          </Box>
                          <FormControlLabel
                            control={<Switch size="small" checked={on} onChange={e => updateAuto(f.name, { on: e.target.checked })} />}
                            label={<Typography sx={{ fontSize: 12, fontWeight: 600, color: on ? '#3B82F6' : '#6B7280' }}>Auto-calculate</Typography>}
                            sx={{ mr: 0 }} />
                        </Stack>
                        <Collapse in={on}>
                          {others.length === 0 ? (
                            <Typography sx={{ fontSize: 11.5, color: '#9CA3AF', mt: 1 }}>Add more number/currency fields to calculate from.</Typography>
                          ) : (
                            <Box sx={{ mt: 1, pt: 1, borderTop: '1px dashed rgba(0,0,0,0.08)' }}>
                              {/* Mode toggle */}
                              <Stack direction="row" spacing={0.8} sx={{ mb: 1 }}>
                                {[['sum', 'Add up'], ['pct', 'Percentage']].map(([m, lbl]) => (
                                  <Chip key={m} label={lbl} size="small" onClick={() => updateAuto(f.name, { on: true, mode: m })}
                                    sx={{ fontSize: 11.5, cursor: 'pointer', fontWeight: 600,
                                          ...(cfg.mode === m ? { bgcolor: 'rgba(59,130,246,0.12)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.4)' }
                                                             : { bgcolor: '#fff', color: '#6B7280', border: '1px solid rgba(0,0,0,0.15)' }) }} />
                                ))}
                                {isPct && (
                                  <TextField size="small" type="number" placeholder="Rate" value={cfg.rate}
                                    onChange={e => updateAuto(f.name, { on: true, mode: 'pct', rate: e.target.value })}
                                    InputProps={{ endAdornment: <Typography sx={{ fontSize: 12, color: '#6B7280' }}>%</Typography> }}
                                    sx={{ width: 110, '& .MuiInputBase-root': { fontSize: 12.5 } }} />
                                )}
                              </Stack>
                              <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: '#6B7280', mb: 0.5 }}>
                                {isPct ? 'Take the percentage of:' : 'Add up these fields:'}
                              </Typography>
                              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0 }}>
                                {others.map(o => (
                                  <FormControlLabel key={o.name}
                                    control={<Checkbox size="small" checked={cfg.sources.includes(o.name)} onChange={() => toggleAutoSource(f, o.name)} />}
                                    label={<Typography sx={{ fontSize: 12 }}>{o.label}</Typography>} />
                                ))}
                              </Box>
                              {cfg.sources.length > 0 && (
                                <Typography sx={{ fontSize: 11.5, color: '#3B82F6', fontWeight: 600, mt: 0.5 }}>
                                  {f.label} = {describeAutoCalc(buildAutoCalc(cfg), labelFor)}
                                </Typography>
                              )}
                            </Box>
                          )}
                        </Collapse>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Box>
          )}

          {/* ── Step 3: Review ── */}
          {wizStep === 3 && (
            <Box sx={{ p: 3 }}>
              <Box sx={{ p: 2, borderRadius: '12px', bgcolor: `${form.color}0D`, border: `1.5px solid ${form.color}25`, display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Box sx={{ fontSize: 28 }}>{form.icon}</Box>
                <Box sx={{ flex: 1 }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 15, color: form.color }}>{form.label || 'Untitled product'}</Typography>
                  <Typography sx={{ fontSize: 12, color: '#9CA3AF' }}>
                    Prefix <strong>{form.prefix || '—'}</strong> · {form.fields.length} fields · {Object.keys(groupedFields).length} sections
                    {numericFields.some(f => f.autoCalc) ? ` · ${numericFields.filter(f => f.autoCalc).length} auto-calc` : ''}
                  </Typography>
                </Box>
              </Box>

              {/* Sections summary */}
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#6B7280', mb: 0.8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sections</Typography>
              <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                {Object.entries(groupedFields).map(([sec, fields]) => (
                  <Chip key={sec} label={`${sec} · ${fields.length}`} size="small"
                    sx={{ fontSize: 11.5, bgcolor: 'rgba(0,0,0,0.05)', color: '#374151' }} />
                ))}
                {Object.keys(groupedFields).length === 0 && (
                  <Typography sx={{ fontSize: 12.5, color: '#ef4444' }}>No fields added — go back to step 2.</Typography>
                )}
              </Stack>

              {/* Auto-calc summary */}
              {numericFields.some(f => f.autoCalc) && (
                <>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#6B7280', mb: 0.8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Auto-calculations</Typography>
                  <Box sx={{ mb: 2 }}>
                    {numericFields.filter(f => f.autoCalc).map(f => (
                      <Typography key={f.name} sx={{ fontSize: 12.5, color: '#374151', py: 0.3 }}>
                        <strong style={{ color: '#3B82F6' }}>{f.label}</strong> = {describeAutoCalc(f.autoCalc, (n) => numericFields.find(x => x.name === n)?.label || n)}
                      </Typography>
                    ))}
                  </Box>
                </>
              )}

              {/* Comparison rows */}
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#6B7280', mb: 0.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Comparison Rows
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: '#9CA3AF', mb: 1 }}>
                Row labels shown in the quote comparison table sent to customers.
              </Typography>
              <Stack spacing={1} sx={{ mb: 1.5 }}>
                {form.comparisonRows.map((row, i) => (
                  <Stack key={i} direction="row" spacing={1} alignItems="center">
                    <TextField fullWidth size="small" value={row} placeholder="e.g. Annual Premium (LKR)"
                      onChange={e => updateRow(i, e.target.value)} sx={inputSx} />
                    <IconButton size="small" onClick={() => removeRow(i)} sx={{ color: '#3B82F6', flexShrink: 0 }}>
                      <DeleteOutlineIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Stack>
                ))}
              </Stack>
              <Button size="small" variant="outlined" startIcon={<AddIcon sx={{ fontSize: 15 }} />}
                onClick={addRow}
                sx={{ fontSize: 12, borderColor: 'rgba(99,102,241,0.35)', color: '#6366f1' }}>
                Add Row
              </Button>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(99,102,241,0.10)' }}>
          <Button onClick={() => setEditOpen(false)} disabled={saving} sx={{ color: '#6B7280' }}>Cancel</Button>
          <Box sx={{ flex: 1 }} />
          {wizStep > 0 && (
            <Button onClick={goBack} disabled={saving} variant="outlined"
              sx={{ borderColor: 'rgba(0,0,0,0.15)', color: '#6B7280' }}>Back</Button>
          )}
          {wizStep < WIZARD_STEPS.length - 1 ? (
            <Button variant="contained" onClick={goNext}
              sx={{ background: 'linear-gradient(135deg,#3B82F6,#6366f1)', minWidth: 110 }}>
              Next
            </Button>
          ) : (
            <Button variant="contained" onClick={handleSave} disabled={saving}
              sx={{ background: 'linear-gradient(135deg,#10B981,#059669)', minWidth: 130 }}>
              {saving ? 'Saving…' : editKey ? 'Save Changes' : 'Create Product'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ── Add / Edit field dialog ── */}
      <Dialog open={fieldDlg} onClose={() => setFieldDlg(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editFldIdx >= 0 ? 'Edit Field' : 'Add Field'}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField fullWidth label="Field Label *" size="small" value={fieldForm.label}
                onChange={e => {
                  const label = e.target.value;
                  setFieldForm(f => ({
                    ...f, label,
                    name: f.name || slugify(label),
                  }));
                }}
                helperText="e.g. Name of Insured" />
              <TextField label="Field Name" size="small" value={fieldForm.name}
                onChange={e => setFieldForm(f => ({ ...f, name: slugify(e.target.value) }))}
                helperText="Auto from label" sx={{ minWidth: 180 }} />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField fullWidth label="Section" size="small" value={fieldForm.section}
                onChange={e => setFieldForm(f => ({ ...f, section: e.target.value }))}
                helperText="e.g. Proposer Details" />
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Type</InputLabel>
                <Select label="Type" value={fieldForm.type}
                  onChange={e => setFieldForm(f => ({ ...f, type: e.target.value }))}>
                  {FIELD_TYPES.map(t => <MenuItem key={t} value={t} sx={{ fontSize: 13 }}>{TYPE_LABEL[t]}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>
            {/* Section suggestions */}
            <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
              {SECTION_SUGGESTIONS.map(s => (
                <Chip key={s} label={s} size="small" onClick={() => setFieldForm(f => ({ ...f, section: s }))}
                  variant={fieldForm.section === s ? 'filled' : 'outlined'}
                  sx={{ fontSize: 10.5, cursor: 'pointer', height: 22,
                        ...(fieldForm.section === s ? { bgcolor: 'rgba(99,102,241,0.12)', color: '#6366f1' } : { color: '#6B7280' }) }} />
              ))}
            </Stack>
            <FormControlLabel control={
              <Switch checked={fieldForm.required}
                onChange={e => setFieldForm(f => ({ ...f, required: e.target.checked }))} size="small" />
            } label={<Typography sx={{ fontSize: 13 }}>Required field</Typography>} />
            {['select', 'multiselect'].includes(fieldForm.type) && (
              <TextField fullWidth label="Options (comma-separated)" size="small" value={fieldForm.options}
                onChange={e => setFieldForm(f => ({ ...f, options: e.target.value }))}
                helperText="e.g. Individual, Corporate" />
            )}
            {fieldForm.type === 'file' && (
              <TextField fullWidth label="Accepted file types" size="small" value={fieldForm.accept}
                onChange={e => setFieldForm(f => ({ ...f, accept: e.target.value }))}
                helperText="e.g. pdf,jpg,jpeg,png" />
            )}
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#6B7280', mb: 1 }}>
                Show condition (optional)
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField fullWidth label="If field name equals…" size="small" value={fieldForm.showIfField}
                  onChange={e => setFieldForm(f => ({ ...f, showIfField: e.target.value }))}
                  helperText="Field name, e.g. customer_type" />
                <TextField fullWidth label="…this value" size="small" value={fieldForm.showIfValue}
                  onChange={e => setFieldForm(f => ({ ...f, showIfValue: e.target.value }))}
                  helperText="e.g. Individual" />
              </Stack>
            </Box>
            {NUMERIC_TYPES.includes(fieldForm.type) && (
              <Typography sx={{ fontSize: 11.5, color: '#9CA3AF' }}>
                Tip: to make this a total of other fields, finish here and use the <strong>Auto-calculations</strong> step.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setFieldDlg(false)}>Cancel</Button>
          <Button variant="contained" onClick={saveField}
            sx={{ background: 'linear-gradient(135deg,#3B82F6,#6366f1)' }}>
            {editFldIdx >= 0 ? 'Update Field' : 'Add Field'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete confirm ── */}
      <Dialog open={!!deleteTgt} onClose={() => setDeleteTgt(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Product?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: '#374151' }}>
            Delete <strong>{deleteTgt?.label}</strong>? Any quotes that used this product will still
            display correctly, but this product will no longer be available for new quotes.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteTgt(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack(s => ({ ...s, open: false }))}>
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack(s => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ProductsManager;
