import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import {
  collection, addDoc, getDocs, query, orderBy, onSnapshot,
  doc, updateDoc, deleteDoc, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import { PRODUCTS as STATIC_PRODUCTS } from '../config/products';
import { COUNTRIES } from '../config/countries';
import emailjs from '@emailjs/browser';
import { uploadFile as uploadToCloudinary, openFile } from '../storage';
import { generateComparisonPdf } from '../utils/comparisonPdf';
import { evaluateAutoCalc, describeAutoCalc } from '../utils/autoCalc';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Autocomplete from '@mui/material/Autocomplete';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import Paper from '@mui/material/Paper';
import Collapse from '@mui/material/Collapse';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Checkbox from '@mui/material/Checkbox';

import Pagination from '@mui/material/Pagination';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

import AddIcon from '@mui/icons-material/Add';
import SendIcon from '@mui/icons-material/Send';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PendingOutlinedIcon from '@mui/icons-material/PendingOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const EMAILJS_SERVICE           = process.env.REACT_APP_EMAILJS_SERVICE_ID           || '';
const EMAILJS_TEMPLATE          = process.env.REACT_APP_EMAILJS_TEMPLATE_ID          || '';
const EMAILJS_CUSTOMER_TEMPLATE = process.env.REACT_APP_EMAILJS_CUSTOMER_TEMPLATE_ID || EMAILJS_TEMPLATE;
const EMAILJS_KEY               = process.env.REACT_APP_EMAILJS_PUBLIC_KEY           || '';

// Initialise once — must be after all imports
if (EMAILJS_KEY) emailjs.init({ publicKey: EMAILJS_KEY });

const DRAFT_KEY = 'insuresaas_draft_quote';

/* ── form validation ─────────────────────────────────────────────────────── */
function validateForm(product, values, allProducts = STATIC_PRODUCTS) {
  const def = allProducts[product];
  const errors  = {};
  const missing = [];
  const invalid = [];

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  def.fields.forEach(f => {
    if (f.autoCalc) return;
    if (f.type === 'file') return;
    if (f.type === 'plantable') return;
    // skip fields hidden by showIf
    if (f.showIf && values[f.showIf.field] !== f.showIf.value) return;

    const raw = values[f.name];
    const val = raw?.toString().trim() ?? '';

    if (f.required && !val) {
      errors[f.name] = 'Required';
      missing.push(f.label);
      return;
    }

    if (val && (f.type === 'number' || f.type === 'currency')) {
      if (isNaN(Number(val)) || val === '') {
        errors[f.name] = 'Must be a number';
        invalid.push(`${f.label} — must be a number`);
      }
    }

    if (val && f.type === 'email' && !EMAIL_RE.test(val)) {
      errors[f.name] = 'Invalid email address';
      invalid.push(`${f.label} — invalid email address`);
    }
  });

  return { errors, missing, invalid };
}

/* ── generate reference number ────────────────────────────────────────────── */
function genRef(productKey, customerName, allProducts = STATIC_PRODUCTS) {
  const prefix = allProducts[productKey]?.prefix || 'QT';
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const uid = Math.random().toString(36).substring(2, 6).toUpperCase();
  const name = (customerName || '').replace(/[^A-Za-z0-9]/g, '').substring(0, 12).toUpperCase() || 'UNKNOWN';
  return `${prefix}-${ymd}-${uid}-${name}`;
}

/* ── dynamic product form ─────────────────────────────────────────────────── */
function ProductForm({ product, values, onChange, errors = {}, allProducts = STATIC_PRODUCTS }) {
  const [fileUploading, setFileUploading] = useState({});
  const [fileErrors,    setFileErrors]    = useState({});
  const def = allProducts[product];
  if (!def) return null;

  // Group fields by section
  const sections = [];
  let currentSection = { name: null, fields: [] };
  def.fields.forEach(f => {
    if (f.section !== currentSection.name) {
      if (currentSection.fields.length) sections.push({ ...currentSection });
      currentSection = { name: f.section, fields: [f] };
    } else {
      currentSection.fields.push(f);
    }
  });
  if (currentSection.fields.length) sections.push(currentSection);

  const isVisible = (f) => {
    if (!f.showIf) return true;
    if (f.showIf.notZero) {
      const v = values[f.showIf.field];
      return !!v && v !== '0' && Number(v) > 0;
    }
    return values[f.showIf.field] === f.showIf.value;
  };

  const renderField = (f) => {
    if (!isVisible(f)) return null;
    const isFullWidth = f.fullWidth || f.type === 'textarea' || f.name === 'remarks' || f.name === 'address' || f.name === 'address_of_risk' || f.name === 'operations_description' || f.name === 'goods_description' || f.name === 'product_description';
    const gridStyle = isFullWidth ? { gridColumn: '1 / -1' } : {};
    const hasErr  = !!errors[f.name];
    const errMsg  = errors[f.name];

    // Multi-select (chips)
    if (f.multiSelect || f.type === 'multiselect') {
      const selected = values[f.name] ? values[f.name].split(',').map(s => s.trim()).filter(Boolean) : [];
      return (
        <Box key={f.name} sx={{ gridColumn: '1 / -1' }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: hasErr ? '#ef4444' : '#6B7280', mb: 0.8 }}>
            {f.label}{f.required ? ' *' : ''}
            {hasErr && <Box component="span" sx={{ ml: 1, fontSize: 11, color: '#ef4444' }}>— {errMsg}</Box>}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, p: hasErr ? 1 : 0, borderRadius: '8px', border: hasErr ? '1px solid #ef4444' : 'none' }}>
            {(f.options || []).map(opt => (
              <Chip key={opt} label={opt} size="small" clickable
                onClick={() => {
                  const next = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt];
                  onChange(f.name, next.join(', '));
                }}
                sx={{
                  bgcolor: selected.includes(opt) ? 'rgba(59,130,246,0.12)' : 'rgba(0,0,0,0.05)',
                  color: selected.includes(opt) ? '#3B82F6' : '#6B7280',
                  border: selected.includes(opt) ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                  fontWeight: selected.includes(opt) ? 700 : 400,
                }} />
            ))}
          </Box>
        </Box>
      );
    }

    // Country searchable select
    if (f.type === 'country-select') {
      const selected = COUNTRIES.find(c => c.name === values[f.name]) || null;
      return (
        <Autocomplete key={f.name} sx={gridStyle}
          options={COUNTRIES}
          getOptionLabel={c => c.name}
          value={selected}
          onChange={(_, c) => {
            onChange(f.name, c?.name || '');
            // auto-fill dial code for phone fields if this country field affects them
            if (c && f.affectsPhoneCode) {
              onChange('telephone_code', c.dialCode);
              onChange('mobile_code', c.dialCode);
            }
          }}
          renderOption={(props, c) => (
            <li {...props} key={c.code}>
              <Box component="span" sx={{ mr: 1, fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' }}>{c.dialCode}</Box>
              {c.name}
            </li>
          )}
          renderInput={params => (
            <TextField {...params} size="small" fullWidth
              label={f.label + (f.required ? ' *' : '')}
              error={hasErr} helperText={errMsg} />
          )}
        />
      );
    }

    // Date
    if (f.type === 'date') {
      return (
        <DatePicker key={f.name}
          label={f.label + (f.required ? ' *' : '')}
          value={values[f.name] ? new Date(values[f.name]) : null}
          onChange={v => onChange(f.name, v ? v.toISOString().split('T')[0] : '')}
          slotProps={{
            textField: {
              size: 'small', fullWidth: true,
              error: hasErr, helperText: errMsg,
            },
          }}
          sx={gridStyle} />
      );
    }

    // Select (includes yesno)
    if (f.options || f.type === 'yesno' || f.type === 'select') {
      const opts = f.type === 'yesno' ? ['Yes', 'No'] : (f.options || []);
      return (
        <FormControl key={f.name} size="small" fullWidth sx={gridStyle} error={hasErr}>
          <InputLabel>{f.label}{f.required ? ' *' : ''}</InputLabel>
          <Select value={values[f.name] || ''} label={f.label + (f.required ? ' *' : '')}
            onChange={e => onChange(f.name, e.target.value)}>
            {opts.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
          </Select>
          {hasErr && <FormHelperText>{errMsg}</FormHelperText>}
        </FormControl>
      );
    }

    // Textarea
    if (f.type === 'textarea') {
      return (
        <TextField key={f.name} size="small" fullWidth multiline rows={3}
          label={f.label + (f.required ? ' *' : '')}
          value={values[f.name] || ''}
          onChange={e => onChange(f.name, e.target.value)}
          error={hasErr} helperText={errMsg}
          sx={{ gridColumn: '1 / -1' }} />
      );
    }

    // Auto-calculated (sum or percentage)
    if (f.autoCalc) {
      const total = evaluateAutoCalc(f.autoCalc, values);
      if (String(total) !== String(Number(values[f.name] || 0))) {
        setTimeout(() => onChange(f.name, total ? String(total) : ''), 0);
      }
      const labelFor = (n) => def.fields.find(x => x.name === n)?.label || n;
      return (
        <TextField key={f.name} size="small" fullWidth
          label={f.label + ' (Auto-calculated)'}
          value={total ? total.toLocaleString() : ''}
          InputProps={{ readOnly: true }}
          helperText={describeAutoCalc(f.autoCalc, labelFor)}
          sx={{ ...gridStyle, '& .MuiInputBase-input': { color: '#3B82F6', fontWeight: 700 } }} />
      );
    }

    // Phone fields — dial-code selector + number input
    if (f.name === 'telephone' || f.name === 'mobile') {
      const codeKey  = f.name + '_code';
      const codeVal  = values[codeKey] || '+94';
      const codeObj  = COUNTRIES.find(c => c.dialCode === codeVal) || null;
      return (
        <Box key={f.name} sx={{ ...gridStyle, display: 'flex', gap: 0.8, alignItems: 'flex-start' }}>
          <Autocomplete
            options={COUNTRIES}
            getOptionLabel={c => c.dialCode}
            value={codeObj}
            onChange={(_, c) => onChange(codeKey, c?.dialCode || '')}
            disableClearable
            sx={{ width: 120, flexShrink: 0 }}
            renderOption={(props, c) => (
              <li {...props} key={c.code} style={{ fontSize: 12 }}>
                <Box component="span" sx={{ fontWeight: 700, mr: 0.5 }}>{c.dialCode}</Box>
                <Box component="span" sx={{ color: '#9CA3AF' }}>{c.name}</Box>
              </li>
            )}
            renderInput={params => (
              <TextField {...params} size="small" label="Code"
                inputProps={{ ...params.inputProps, style: { fontSize: 13 } }} />
            )}
          />
          <TextField size="small" fullWidth
            label={f.label + (f.required ? ' *' : '')}
            type="tel"
            value={values[f.name] || ''}
            onChange={e => onChange(f.name, e.target.value)}
            error={hasErr} helperText={errMsg}
            inputProps={{ maxLength: 9, placeholder: '7XXXXXXXX' }} />
        </Box>
      );
    }

    // File upload
    if (f.type === 'file') {
      const url   = values[f.name] || '';
      const fname = values[f.name + '_filename'] || '';
      const busy  = fileUploading[f.name];
      const accept = (f.accept || 'pdf,jpg,jpeg,png').split(',').map(e => `.${e}`).join(',');
      return (
        <Box key={f.name} sx={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 2, p: 1.5, borderRadius: '8px', border: '1px dashed rgba(59,130,246,0.25)', bgcolor: 'rgba(59,130,246,0.02)' }}>
          <Button component="label" variant="outlined" size="small" disabled={busy}
            sx={{ flexShrink: 0, borderColor: url ? '#22c55e' : 'rgba(59,130,246,0.5)', color: url ? '#22c55e' : '#3B82F6', textTransform: 'none', fontSize: 12, minWidth: 110 }}>
            {busy ? 'Uploading…' : url ? 'Replace' : 'Upload'}
            <input type="file" hidden accept={accept}
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                setFileUploading(prev => ({ ...prev, [f.name]: true }));
                setFileErrors(prev => ({ ...prev, [f.name]: '' }));
                try {
                  const prefix = allProducts[product]?.prefix || 'QT';
                  const safeName = (values.proposer_name || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
                  const uploadedUrl = await uploadToCloudinary(file, `insuresaas/quotation-docs/${prefix}-${safeName}`, undefined, f.label);
                  onChange(f.name, uploadedUrl);
                  onChange(f.name + '_filename', file.name);
                } catch (err) {
                  const isRetry = err.message?.includes('retry-limit') || err.message?.includes('retry time');
                  setFileErrors(prev => ({ ...prev, [f.name]: isRetry ? 'Network issue — please try again.' : 'Upload failed.' }));
                }
                setFileUploading(prev => ({ ...prev, [f.name]: false }));
              }} />
          </Button>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{f.label}</Typography>
            {url ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3 }}>
                <CheckCircleIcon sx={{ color: '#22c55e', fontSize: 14 }} />
                <Typography component="a" href={url} target="_blank" rel="noopener noreferrer"
                  sx={{ fontSize: 11, color: '#22c55e', textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                  {fname || 'View document'}
                </Typography>
              </Box>
            ) : fileErrors[f.name] ? (
              <Typography sx={{ fontSize: 11, color: '#ef4444', mt: 0.3 }}>
                ⚠ {fileErrors[f.name]}
              </Typography>
            ) : (
              <Typography sx={{ fontSize: 11, color: '#9CA3AF', mt: 0.3 }}>
                Accepted: {(f.accept || 'pdf, jpg, png').toUpperCase()}
              </Typography>
            )}
          </Box>
        </Box>
      );
    }

    // Plan cover table (Group Medical and similar multi-plan products)
    if (f.type === 'plantable') {
      const planCount = Math.max(parseInt(values.no_of_plans) || 1, 1);
      let planData = [];
      try { planData = JSON.parse(values[f.name] || '[]'); } catch (_) {}
      while (planData.length < planCount) planData.push({ plan: planData.length + 1 });
      planData = planData.slice(0, planCount);
      const updateCell = (pi, fieldName, val) => {
        const next = planData.map((r, i) => i === pi ? { ...r, [fieldName]: val } : r);
        onChange(f.name, JSON.stringify(next));
      };
      return (
        <Box key={f.name} sx={{ gridColumn: '1 / -1' }}>
          <Box sx={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid rgba(59,130,246,0.15)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
              <thead>
                <tr style={{ background: 'rgba(59,130,246,0.07)' }}>
                  <th style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 70 }}>Plan</th>
                  {f.planFields.map(pf => (
                    <th key={pf.name} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4, minWidth: 160 }}>{pf.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {planData.map((row, pi) => (
                  <tr key={pi} style={{ background: pi % 2 === 0 ? '#fff' : '#fafafa', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#3B82F6' }}>Plan {pi + 1}</td>
                    {f.planFields.map(pf => (
                      <td key={pf.name} style={{ padding: '6px 10px' }}>
                        <TextField
                          size="small" type="number" fullWidth
                          placeholder="0"
                          value={row[pf.name] || ''}
                          onChange={e => updateCell(pi, pf.name, e.target.value)}
                          InputProps={{ startAdornment: <Box component="span" sx={{ color: '#9CA3AF', mr: 0.5, fontSize: 11 }}>LKR</Box> }}
                          sx={{ '& .MuiInputBase-root': { fontSize: 12.5 } }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </Box>
      );
    }

    // Currency, email, number, text
    return (
      <TextField key={f.name} size="small" fullWidth
        label={f.label + (f.required ? ' *' : '')}
        type={f.type === 'currency' ? 'number' : (f.type === 'email' ? 'email' : (f.type === 'number' ? 'number' : 'text'))}
        value={values[f.name] || ''}
        onChange={e => onChange(f.name, e.target.value)}
        error={hasErr} helperText={errMsg}
        inputProps={f.maxLength ? { maxLength: f.maxLength } : undefined}
        InputProps={f.type === 'currency' ? { startAdornment: <Box component="span" sx={{ color: '#9CA3AF', mr: 0.5, fontSize: 12 }}>LKR</Box> } : undefined}
        sx={gridStyle} />
    );
  };

  return (
    <Box>
      {sections.map(sec => {
        const sectionHasError = sec.fields.some(f => errors[f.name] && isVisible(f));
        return (
        <Box key={sec.name || 'default'} sx={{ mb: 3 }}>
          {sec.name && (
            <Typography sx={{
              fontSize: 11, fontWeight: 800,
              color: sectionHasError ? '#ef4444' : '#3B82F6',
              textTransform: 'uppercase', letterSpacing: 1, mb: 1.5, pb: 0.5,
              borderBottom: `1px solid ${sectionHasError ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.12)'}`,
              display: 'flex', alignItems: 'center', gap: 0.8,
            }}>
              {sectionHasError && <WarningAmberRoundedIcon sx={{ fontSize: 13 }} />}
              {sec.name}
            </Typography>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {sec.fields.map(f => renderField(f))}
          </Box>
          {/* "Add Other Cover" — shown at the bottom of every Covers Required section */}
          {['Covers Required', 'Cover Required', 'Additional Clauses'].includes(sec.name) && (() => {
            const storeKey = sec.name === 'Additional Clauses' ? 'extra_clauses' : 'extra_covers';
            let extras = [];
            try { extras = JSON.parse(values[storeKey] || '[]'); } catch {}
            return (
              <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed rgba(99,102,241,0.2)' }}>
                {extras.map((item, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
                    <TextField size="small" placeholder={sec.name === 'Additional Clauses' ? 'Clause name…' : 'Cover name…'}
                      value={item.name} fullWidth
                      onChange={e => {
                        const updated = extras.map((x, i) => i === idx ? { ...x, name: e.target.value } : x);
                        onChange(storeKey, JSON.stringify(updated));
                      }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 13 } }} />
                    {['Yes', 'No'].map(opt => (
                      <Box key={opt} onClick={() => {
                        const updated = extras.map((x, i) => i === idx ? { ...x, value: opt } : x);
                        onChange(storeKey, JSON.stringify(updated));
                      }} sx={{
                        px: 1.5, py: 0.7, borderRadius: '8px', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, flexShrink: 0,
                        border: `1.5px solid ${item.value === opt ? '#3B82F6' : 'rgba(0,0,0,0.12)'}`,
                        bgcolor: item.value === opt ? 'rgba(59,130,246,0.08)' : 'transparent',
                        color: item.value === opt ? '#3B82F6' : '#9CA3AF', transition: 'all 0.15s',
                      }}>{opt}</Box>
                    ))}
                    <Box onClick={() => {
                      const updated = extras.filter((_, i) => i !== idx);
                      onChange(storeKey, JSON.stringify(updated));
                    }} sx={{ cursor: 'pointer', color: '#ef4444', fontSize: 16, px: 0.5, flexShrink: 0, lineHeight: 1 }}>✕</Box>
                  </Box>
                ))}
                <Box onClick={() => onChange(storeKey, JSON.stringify([...extras, { name: '', value: 'Yes' }]))}
                  sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.5, cursor: 'pointer',
                        fontSize: 12, fontWeight: 700, color: '#6366f1', '&:hover': { color: '#3B82F6' } }}>
                  + Add {sec.name === 'Additional Clauses' ? 'Other Clause' : 'Other Cover'}
                </Box>
              </Box>
            );
          })()}
        </Box>
        );
      })}
    </Box>
  );
}

/* ── quote row ─────────────────────────────────────────────────────────────── */
function QuoteRow({ quote, onSelect, tab, onDelete, onResend, isManager, allProducts = STATIC_PRODUCTS }) {
  const [open, setOpen] = useState(false);
  const product = allProducts[quote.product_key];
  const sentCount = quote.sent_to?.length || 0;
  const respondedCount = quote.responses?.length || 0;

  const created = quote.created_at?.toDate?.()
    ? quote.created_at.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  const hasSelection = !!quote.customer_selection;

  return (
    <Card sx={{ mb: 1.5, border: `1px solid ${hasSelection ? 'rgba(16,185,129,0.35)' : 'rgba(99,102,241,0.12)'}`, boxShadow: hasSelection ? '0 0 0 2px rgba(16,185,129,0.08)' : 'none' }}>
      {hasSelection && (
        <Box sx={{ background: 'linear-gradient(90deg,#059669,#10B981)', px: 2.5, py: 0.9, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ fontSize: 16 }}>🏆</Box>
          <Typography sx={{ fontWeight: 700, fontSize: 12.5, color: '#fff' }}>
            Customer selected <strong>{quote.customer_selection.company_name}</strong>
          </Typography>
          <Typography sx={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', ml: 'auto' }}>
            {new Date(quote.customer_selection.selected_at).toLocaleString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
          </Typography>
        </Box>
      )}
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        <Box sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5,
                    cursor: 'pointer', '&:hover': { bgcolor: 'rgba(59,130,246,0.02)' } }}
             onClick={() => setOpen(o => !o)}>
          <Box sx={{ width: 38, height: 38, borderRadius: '10px', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: product?.color ? `${product.color}18` : 'rgba(59,130,246,0.08)',
                      fontSize: 18 }}>
            {product?.icon || '📋'}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.3 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>
                {quote.reference}
              </Typography>
              <Chip label={product?.label || quote.product_key} size="small"
                sx={{ bgcolor: 'rgba(59,130,246,0.08)', color: '#3B82F6', fontWeight: 600, fontSize: 10 }} />
              {hasSelection && (
                <Chip label={`🏆 ${quote.customer_selection.company_name}`} size="small"
                  sx={{ bgcolor: 'rgba(16,185,129,0.12)', color: '#059669', fontWeight: 700, fontSize: 10 }} />
              )}
            </Stack>
            <Typography sx={{ fontSize: 11.5, color: '#9CA3AF' }}>
              {created} · By {quote.created_by_name}
              {tab === 'received' && ` · ${respondedCount}/${sentCount} received`}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            {(tab === 'received' || tab === 'sent') && sentCount > 0 && (
              <Chip
                label={`${respondedCount}/${sentCount} received`}
                size="small"
                sx={{
                  bgcolor: respondedCount === sentCount ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.10)',
                  color:   respondedCount === sentCount ? '#059669' : '#d97706',
                  fontWeight: 700, fontSize: 11,
                }}
              />
            )}
            {tab === 'compare' && (
              <Button size="small" variant="outlined" startIcon={<CompareArrowsIcon />}
                onClick={e => { e.stopPropagation(); onSelect(quote); }}
                sx={{ fontSize: 11, py: 0.4, borderColor: 'rgba(99,102,241,0.3)', color: '#6366f1', flexShrink: 0 }}>
                Compare
              </Button>
            )}
            {open ? <ExpandLessIcon sx={{ color: '#9CA3AF' }} /> : <ExpandMoreIcon sx={{ color: '#9CA3AF' }} />}
          </Stack>
        </Box>

        <Collapse in={open} timeout={220} unmountOnExit>
          <Box sx={{ px: 2.5, pb: 2, pt: 0.5, borderTop: '1px solid rgba(99,102,241,0.08)' }}>
            {/* Form data summary — only show labelled, non-file, non-URL fields */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 1.5, mb: 2 }}>
              {(product?.fields || [])
                .filter(f =>
                  f.type !== 'file' &&
                  f.type !== 'plantable' &&
                  f.section !== 'Introducer' &&
                  f.name !== 'insuresaas_ib_file_no'
                )
                .map(f => {
                  const v = quote.form_data?.[f.name];
                  if (!v || typeof v === 'object') return null;
                  if (typeof v === 'string' && v.startsWith('http')) return null;
                  return (
                    <Box key={f.name}>
                      <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {f.label}
                      </Typography>
                      <Typography sx={{ fontSize: 12.5, color: '#0F172A', fontWeight: 500 }}>{String(v)}</Typography>
                    </Box>
                  );
                })
                .filter(Boolean)
                .slice(0, 8)
              }
            </Box>

            {/* Sent to */}
            {quote.sent_to?.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.8 }}>
                  Sent to
                </Typography>
                <Stack direction="row" spacing={0.8} flexWrap="wrap">
                  {quote.sent_to.map(c => {
                    const responded = quote.responses?.some(r => r.company_id === c.company_id);
                    return (
                      <Chip key={c.company_id}
                        icon={responded ? <CheckCircleOutlineIcon sx={{ fontSize: '14px !important' }} /> : <PendingOutlinedIcon sx={{ fontSize: '14px !important' }} />}
                        label={c.company_name} size="small"
                        sx={{
                          bgcolor: responded ? 'rgba(16,185,129,0.10)' : 'rgba(245,158,11,0.08)',
                          color:   responded ? '#059669' : '#d97706',
                          fontWeight: 600, fontSize: 11,
                        }} />
                    );
                  })}
                </Stack>
              </Box>
            )}

            {/* Responses preview */}
            {quote.responses?.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.8 }}>
                  Received quotes
                </Typography>
                <Stack spacing={1}>
                  {quote.responses.map(r => (
                    <Box key={r.id} sx={{ p: 1.5, borderRadius: '10px', bgcolor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)' }}>
                      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                        <Typography sx={{ fontWeight: 700, fontSize: 13 }}>{r.company_name}</Typography>
                        <Typography sx={{ fontWeight: 800, fontSize: 14, color: '#3B82F6' }}>
                          LKR {Number(r.premium || 0).toLocaleString()}
                        </Typography>
                      </Stack>
                      {r.quote_file_url && (
                        <Button size="small" onClick={() => openFile(r.quote_file_url)}
                          sx={{ fontSize: 11, mt: 0.5, color: '#6366f1', p: 0 }}>
                          View uploaded quote →
                        </Button>
                      )}
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
              {isManager && quote.sent_to?.length > 0 && (
                <Button size="small" variant="outlined"
                  onClick={e => { e.stopPropagation(); onResend(quote); }}
                  sx={{ fontSize: 11, borderColor: 'rgba(99,102,241,0.35)', color: '#6366f1' }}>
                  ↺ Resend Emails
                </Button>
              )}
              <Button size="small" color="error" variant="outlined"
                onClick={e => { e.stopPropagation(); onDelete(quote); }}
                sx={{ fontSize: 11, borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444', ml: 'auto' }}>
                Delete Quote
              </Button>
            </Box>

          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

/* Parse extra custom covers/clauses stored as JSON in form_data */
function parseDynamicExtras(formData, storeKey) {
  try {
    return (JSON.parse(formData?.[storeKey] || '[]'))
      .filter(c => c.name?.trim() && c.value === 'Yes')
      .map(c => ({
        name: storeKey + '_' + c.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
        label: c.name,
        type: 'yesno',
      }));
  } catch { return []; }
}

/* ── comparison view ──────────────────────────────────────────────────────── */
function ComparisonView({ quote, onBack, onConfirm, allProducts = STATIC_PRODUCTS }) {
  const product   = allProducts[quote?.product_key];
  const allResponses = quote?.responses || [];
  // Insurers who declined the request are kept out of the comparison/premium math
  // and selection — they're listed separately so the broker sees why.
  const responses        = allResponses.filter(r => !r.declined);
  const declinedResponses = allResponses.filter(r => r.declined);
  const extraCovers  = parseDynamicExtras(quote?.form_data, 'extra_covers');
  const extraClauses = parseDynamicExtras(quote?.form_data, 'extra_clauses');
  const coverFields  = [
    ...(product?.fields || []).filter(f => ['Covers Required', 'Cover Required'].includes(f.section) && f.type === 'yesno' && quote?.form_data?.[f.name] === 'Yes'),
    ...extraCovers,
  ];
  const clauseFields = [
    ...(product?.fields || []).filter(f => f.section === 'Additional Clauses' && f.type === 'yesno' && quote?.form_data?.[f.name] === 'Yes'),
    ...extraClauses,
  ];
  const isPlansProduct = !!product?.hasPlans;
  const planCount = isPlansProduct ? Math.max(parseInt(quote?.form_data?.no_of_plans) || 1, 1) : 0;

  // ── Broker response-edit state ──────────────────────────────────────────────
  const [editTarget,       setEditTarget]       = useState(null);
  const [editForm,         setEditForm]         = useState({});
  const [editCoverResp,    setEditCoverResp]    = useState({});
  const [editClauseResp,   setEditClauseResp]   = useState({});
  const [editSaving,       setEditSaving]       = useState(false);
  const [exportingExcel,   setExportingExcel]   = useState(false);
  const [exportingPdf,     setExportingPdf]     = useState(false);
  const [exportError,      setExportError]      = useState('');

  const openEdit = (r) => {
    setEditTarget(r);
    setEditForm({
      basic_premium:   r.basic_premium?.toString()  || '',
      srcc_premium:    r.srcc_premium?.toString()   || '',
      tc_premium:      r.tc_premium?.toString()     || '',
      admin_fee:       r.admin_fee?.toString()      || '',
      vat_amount:      r.vat_amount?.toString()     || '',
      other_premium:   r.other_premium?.toString()  || '',
      deductible:      r.deductible     || '',
      excesses:        r.excesses       || '',
      commission_type: r.commission_type || '',
      validity_days:   r.validity_days?.toString()  || '',
      notes:           r.notes          || '',
    });
    setEditCoverResp(r.cover_responses   ? JSON.parse(JSON.stringify(r.cover_responses))  : {});
    setEditClauseResp(r.clause_responses ? JSON.parse(JSON.stringify(r.clause_responses)) : {});
  };

  const setECover  = (name, key, val) => setEditCoverResp(prev  => ({ ...prev, [name]: { ...(prev[name]  || {}), [key]: val } }));
  const setEClause = (name, key, val) => setEditClauseResp(prev => ({ ...prev, [name]: { ...(prev[name] || {}), [key]: val } }));

  const saveEdit = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    try {
      const snap = await (await import('firebase/firestore')).getDoc(
        (await import('firebase/firestore')).doc(db, 'quotes', quote.id)
      );
      if (snap.exists()) {
        const updated = (snap.data().responses || []).map(r => {
          if (r.company_id !== editTarget.company_id) return r;
          const premiumFields = isPlansProduct
            ? { plan_premiums: r.plan_premiums, premium: (r.plan_premiums || []).reduce((s, p) => s + (Number(p.total) || 0), 0) }
            : (() => {
                const bp = Number(editForm.basic_premium) || 0;
                const sp = Number(editForm.srcc_premium)  || 0;
                const tc = Number(editForm.tc_premium)    || 0;
                const af = Number(editForm.admin_fee)     || 0;
                const vt = Number(editForm.vat_amount)    || 0;
                const op = Number(editForm.other_premium) || 0;
                return { basic_premium: bp, srcc_premium: sp, tc_premium: tc, admin_fee: af, vat_amount: vt, other_premium: op, premium: bp + sp + tc + af + vt + op };
              })();
          return {
            ...r,
            ...premiumFields,
            deductible:       editForm.deductible,
            excesses:         editForm.excesses,
            commission_type:  editForm.commission_type,
            validity_days:    editForm.validity_days,
            notes:            editForm.notes,
            cover_responses:  editCoverResp,
            clause_responses: editClauseResp,
            edited_by_broker: true,
            broker_edited_at: new Date().toISOString(),
          };
        });
        await updateDoc(doc(db, 'quotes', quote.id), { responses: updated, updated_at: serverTimestamp() });
      }
      setEditTarget(null);
    } catch (err) { console.error('Edit save failed:', err); }
    setEditSaving(false);
  };
  const [custEmail,  setCustEmail]  = useState('');
  const [sending,    setSending]    = useState(false);
  const [sendDone,   setSendDone]   = useState(false);
  const [sendError,  setSendError]  = useState('');

  const sendToCustomer = async () => {
    if (!custEmail.trim()) return;
    setSending(true);
    try {
      // Build an HTML comparison table for the customer
      const headerCells = responses.map(r => `<th style="background:#3B82F6;color:#fff;padding:10px 14px;font-size:13px;">${r.company_name}</th>`).join('');
      const fmt = n => n ? Number(n).toLocaleString() : '—';
      // Premium breakdown rows — shown to customer, commission excluded
      const breakdownRows = isPlansProduct
        ? Array.from({ length: planCount }, (_, pi) => [
            `<tr><td colspan="${responses.length + 1}" style="background:#0891b2;color:#fff;padding:7px 14px;font-weight:800;font-size:12px;">Plan ${pi + 1}</td></tr>`,
            ...([
              ['Basic Premium (LKR)', r => fmt(r.plan_premiums?.[pi]?.basic)],
              ['Tax (LKR)',           r => fmt(r.plan_premiums?.[pi]?.tax)],
              ['Plan Total (LKR)',    r => `<strong style="color:#0891b2">${fmt(r.plan_premiums?.[pi]?.total)}</strong>`],
            ].map(([label, getter], i) =>
              `<tr style="background:${i%2===0?'#F0F9FF':'#fff'}"><td style="padding:8px 14px 8px 22px;font-weight:600;color:#374151;">${label}</td>${responses.map(r => `<td style="padding:8px 14px;text-align:right;">${getter(r)}</td>`).join('')}</tr>`
            )),
          ].join('')).join('') +
          `<tr style="background:#E0F2FE"><td style="padding:8px 14px;font-weight:800;color:#0891b2;">Grand Total (LKR)</td>${responses.map(r => `<td style="padding:8px 14px;text-align:right;"><strong style="color:#0891b2">${fmt(r.premium)}</strong></td>`).join('')}</tr>`
        : [
            ['Basic Premium (LKR)', r => fmt(r.basic_premium)],
            ['SRCC (LKR)',          r => fmt(r.srcc_premium)],
            ['TC (LKR)',            r => fmt(r.tc_premium)],
            ['Admin Fee (LKR)',     r => fmt(r.admin_fee)],
            ['VAT (LKR)',           r => fmt(r.vat_amount)],
            ['Other (LKR)',         r => fmt(r.other_premium)],
            ['Total Premium (LKR)', r => `<strong style="color:#3B82F6">${fmt(r.premium)}</strong>`],
          ].map(([label, getter], i) =>
            `<tr style="background:${i%2===0?'#EFF6FF':'#fff'}"><td style="padding:8px 14px;font-weight:600;color:#374151;">${label}</td>${responses.map(r => `<td style="padding:8px 14px;text-align:right;">${getter(r)}</td>`).join('')}</tr>`
          ).join('');
      const deductiblesRow = `<tr style="background:#EFF6FF"><td style="padding:8px 14px;font-weight:600;color:#374151;">Deductibles</td>${responses.map(r => `<td style="padding:8px 14px;color:#4B5563;">${r.deductible||'—'}</td>`).join('')}</tr>`;
      const excessRow      = `<tr><td style="padding:8px 14px;font-weight:600;color:#374151;">Excesses</td>${responses.map(r => `<td style="padding:8px 14px;color:#4B5563;">${r.excesses||'—'}</td>`).join('')}</tr>`;
      const validityRow    = `<tr style="background:#EFF6FF"><td style="padding:8px 14px;font-weight:600;color:#374151;">Validity (days)</td>${responses.map(r => `<td style="padding:8px 14px;color:#4B5563;text-align:center;">${r.validity_days||'—'}</td>`).join('')}</tr>`;
      // Covers section (static + dynamic custom covers)
      const cvFields = [
        ...(product?.fields || []).filter(f => ['Covers Required','Cover Required'].includes(f.section) && f.type === 'yesno' && quote.form_data?.[f.name] === 'Yes'),
        ...parseDynamicExtras(quote.form_data, 'extra_covers'),
      ];
      const clFields = [
        ...(product?.fields || []).filter(f => f.section === 'Additional Clauses' && f.type === 'yesno' && quote.form_data?.[f.name] === 'Yes'),
        ...parseDynamicExtras(quote.form_data, 'extra_clauses'),
      ];
      const sectionHeader = (label) => `<tr><td colspan="${responses.length+1}" style="background:#0F172A;padding:10px 14px;font-size:11px;font-weight:800;color:#6366f1;text-transform:uppercase;letter-spacing:1px;">${label}</td></tr>`;
      const coverRows = cvFields.length > 0 ? sectionHeader('Covers Required') + cvFields.map((f,i) => {
        const cells = responses.map(r => {
          const cr = r.cover_responses?.[f.name];
          const p = cr?.provided || '—';
          const c = p === 'Yes' ? '#059669' : p === 'No' ? '#dc2626' : '#9CA3AF';
          const t = cr?.terms ? `<br/><span style="font-size:10px;color:#9CA3AF;">${cr.terms}</span>` : '';
          return `<td style="padding:8px 14px;text-align:center;"><span style="font-weight:700;color:${c};">${p}</span>${t}</td>`;
        }).join('');
        return `<tr style="background:${i%2===0?'#fff':'#EFF6FF'}"><td style="padding:8px 14px 8px 22px;font-weight:600;color:#374151;font-size:12px;">${f.label}</td>${cells}</tr>`;
      }).join('') : '';
      const clauseRows = clFields.length > 0 ? sectionHeader('Additional Clauses') + clFields.map((f,i) => {
        const cells = responses.map(r => {
          const cr = r.clause_responses?.[f.name];
          const p = cr?.provided || '—';
          const c = p === 'Yes' ? '#059669' : p === 'No' ? '#dc2626' : '#9CA3AF';
          const t = cr?.terms ? `<br/><span style="font-size:10px;color:#9CA3AF;">${cr.terms}</span>` : '';
          return `<td style="padding:8px 14px;text-align:center;"><span style="font-weight:700;color:${c};">${p}</span>${t}</td>`;
        }).join('');
        return `<tr style="background:${i%2===0?'#fff':'#EFF6FF'}"><td style="padding:8px 14px 8px 22px;font-weight:600;color:#374151;font-size:12px;">${f.label}</td>${cells}</tr>`;
      }).join('') : '';
      const isImg = (url) => url && /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(url);
      const docRow = `<tr style="background:#F9F9FB"><td style="padding:10px 14px;font-weight:600;color:#374151;">Uploaded Quote</td>${
        responses.map(r => r.quote_file_url
          ? isImg(r.quote_file_url)
            ? `<td style="padding:8px 14px;text-align:center;"><a href="${r.quote_file_url}" target="_blank"><img src="${r.quote_file_url}" alt="Quote" style="max-width:140px;max-height:100px;border-radius:6px;border:1px solid #E5E7EB;" /></a></td>`
            : `<td style="padding:8px 14px;text-align:center;"><a href="${r.quote_file_url}" target="_blank" style="display:inline-block;background:#6366f1;color:#fff;padding:7px 16px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;">View PDF ↗</a></td>`
          : `<td style="padding:8px 14px;text-align:center;color:#9CA3AF;font-size:12px;">Not uploaded</td>`
        ).join('')
      }</tr>`;

      const tableHtml = `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;border-radius:10px;overflow:hidden;"><thead><tr><th style="background:#0F172A;color:#6366f1;padding:10px 14px;font-size:13px;text-align:left;">Field</th>${headerCells}</tr></thead><tbody>${breakdownRows}${deductiblesRow}${excessRow}${validityRow}${coverRows}${clauseRows}${docRow}</tbody></table>`;

      // Selection buttons + PDF download link for email (table-based for Outlook/Gmail compatibility)
      const baseUrl = window.location.origin;
      const selectionSection = `
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:2px solid #ffe0d4;">
          <tr><td style="padding:20px 0;text-align:center;">
            <p style="margin:0 0 10px;color:#0F172A;font-size:15px;font-weight:700;font-family:Arial,sans-serif;">Select Your Preferred Insurer</p>
            <p style="margin:0 0 18px;color:#6B7280;font-size:13px;font-family:Arial,sans-serif;">Click the company you would like to proceed with:</p>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto 18px;">
              <tr>
                ${responses.map(r => `
                <td style="padding:3px;">
                  <table cellpadding="0" cellspacing="0"><tr>
                    <td align="center" bgcolor="#3B82F6" style="border-radius:8px;">
                      <a href="${baseUrl}/quote-select?qid=${quote.id}&cid=${encodeURIComponent(r.company_id)}&cn=${encodeURIComponent(r.company_name)}" target="_blank"
                         style="display:inline-block;background:#3B82F6;color:#ffffff;padding:11px 20px;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;font-family:Arial,sans-serif;">
                        Go with ${r.company_name} &#8594;
                      </a>
                    </td>
                  </tr></table>
                </td>`).join('')}
              </tr>
            </table>
            <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
              <td align="center" bgcolor="#0F172A" style="border-radius:8px;">
                <a href="${baseUrl}/comparison-pdf?qid=${quote.id}" target="_blank"
                   style="display:inline-block;background:#0F172A;color:#ffffff;padding:10px 24px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;font-family:Arial,sans-serif;">
                  Download PDF Comparison
                </a>
              </td>
            </tr></table>
          </td></tr>
        </table>`;

      if (!EMAILJS_SERVICE || !EMAILJS_CUSTOMER_TEMPLATE || !EMAILJS_KEY) {
        throw new Error('EmailJS not configured — check REACT_APP_EMAILJS_* environment variables.');
      }
      await emailjs.send(
        EMAILJS_SERVICE,
        EMAILJS_CUSTOMER_TEMPLATE,
        {
          to_email:      custEmail.trim(),
          to_name:       'Valued Client',
          reference:     quote.reference,
          product:       product?.label || quote.product_key,
          table_html:    tableHtml + selectionSection,
          company_count: responses.length,
        },
        { publicKey: EMAILJS_KEY }
      );
      setSendDone(true);
      setTimeout(() => setSendDone(false), 4000);
    } catch (err) {
      const msg = err?.text || err?.message || JSON.stringify(err);
      console.error('Customer email error:', msg);
      setSendError(msg);
      setTimeout(() => setSendError(''), 8000);
    }
    setSending(false);
  };

  // ── helpers shared by the Excel export ─────────────────────────────────────
  const colCount = responses.length + 1;
  const today    = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // ── Export Excel ────────────────────────────────────────────────────────────
  const exportExcel = async () => {
    setExportingExcel(true);
    setExportError('');
    try {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator   = 'InsureSAAS';
    wb.created   = new Date();
    const ws = wb.addWorksheet('Quote Comparison', { pageSetup: { orientation: 'landscape', fitToPage: true } });
    ws.columns = [{ width: 34 }, ...responses.map(() => ({ width: 24 }))];

    const DARK  = 'FF0F172A';
    const RED   = 'FF3B82F6';
    const AMBER = 'FF6366f1';
    const WHITE = 'FFFFFFFF';
    const LIGHT = 'FFEFF6FF';
    const GREY  = 'FFF9FAFB';

    const mergedRow = (text, bg, fg, sz, h = 20, align = 'center') => {
      const r = ws.addRow([text, ...Array(colCount - 1).fill('')]);
      ws.mergeCells(r.number, 1, r.number, colCount);
      r.height = h;
      const c = r.getCell(1);
      c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      c.font      = { bold: true, color: { argb: fg }, size: sz, name: 'Calibri' };
      c.alignment = { horizontal: align, vertical: 'middle', indent: align === 'left' ? 2 : 0, wrapText: false };
      return r;
    };

    const addSection = (label) => {
      // Spacer row
      const sp = ws.addRow(Array(colCount).fill(''));
      sp.height = 6;
      sp.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }; });
      // Section header
      mergedRow(label, DARK, AMBER, 9, 18, 'left');
    };

    const addDataRow = (label, values, isTotal = false, isInternal = false, rowIdx = 0) => {
      const r = ws.addRow([label, ...values]);
      r.height = isTotal ? 20 : 17;
      const sides = { style: 'thin', color: { argb: 'FFE5E7EB' } };
      r.eachCell((cell, ci) => {
        const bg = isTotal ? RED : isInternal ? 'FFEEF2FF' : rowIdx % 2 === 0 ? WHITE : LIGHT;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font = {
          bold: ci === 1 || isTotal,
          color: { argb: isTotal ? WHITE : isInternal ? 'FF4F46E5' : DARK },
          size: isTotal ? 10.5 : 9.5, name: 'Calibri',
        };
        cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle', wrapText: true, indent: ci === 1 ? 2 : 0 };
        cell.border = { top: { style: 'hair', color: { argb: 'FFF3F4F6' } }, bottom: { style: 'hair', color: { argb: 'FFF3F4F6' } }, left: sides, right: sides };
      });
    };

    // ── Title block ──
    mergedRow('INSURESAAS LTD', RED, WHITE, 15, 30, 'center');
    mergedRow('INSURANCE SAAS PLATFORM  ·  Sri Lanka', DARK, AMBER, 9, 18, 'center');

    // ── Reference info block ──
    mergedRow('QUOTE COMPARISON REPORT', GREY, DARK, 11, 22, 'center');
    mergedRow(`Reference: ${quote.reference}   |   Product: ${product?.label || ''}   |   Date: ${today}`, GREY, 'FF6B7280', 9, 16, 'center');

    // Spacer
    const sp0 = ws.addRow(Array(colCount).fill(''));
    sp0.height = 4;

    // ── Company header row ──
    const compRow = ws.addRow(['FIELD', ...responses.map(r => r.company_name + (r.edited_by_broker ? ' ✎' : ''))]);
    compRow.height = 24;
    compRow.eachCell((cell, ci) => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: ci === 1 ? DARK : RED } };
      cell.font      = { bold: true, color: { argb: AMBER }, size: 10, name: 'Calibri' };
      cell.alignment = { horizontal: ci === 1 ? 'left' : 'center', vertical: 'middle', indent: ci === 1 ? 2 : 0 };
      cell.border    = { bottom: { style: 'medium', color: { argb: RED } } };
    });

    // ── Premium Breakdown ──
    addSection('PREMIUM BREAKDOWN');
    if (isPlansProduct) {
      for (let pi = 0; pi < planCount; pi++) {
        mergedRow(`Plan ${pi + 1}`, 'FF0891b2', WHITE, 9, 16, 'left');
        [
          ['Basic Premium (LKR)', r => r.plan_premiums?.[pi]?.basic ? Number(r.plan_premiums[pi].basic).toLocaleString() : '—'],
          ['Tax (LKR)',           r => r.plan_premiums?.[pi]?.tax   ? Number(r.plan_premiums[pi].tax).toLocaleString()   : '—'],
          ['Plan Total (LKR)',    r => Number(r.plan_premiums?.[pi]?.total || 0).toLocaleString()],
        ].forEach(([label, getter], i) => addDataRow(label, responses.map(getter), label.startsWith('Plan Total'), false, i));
      }
      addDataRow('GRAND TOTAL (LKR)', responses.map(r => Number(r.premium || 0).toLocaleString()), true);
    } else {
      [
        ['Basic Premium (LKR)',  'basic_premium'],
        ['SRCC (LKR)',           'srcc_premium'],
        ['TC (LKR)',             'tc_premium'],
        ['Admin Fee (LKR)',      'admin_fee'],
        ['VAT (LKR)',            'vat_amount'],
        ['Other (LKR)',          'other_premium'],
      ].forEach(([label, key], i) => addDataRow(label, responses.map(r => r[key] ? Number(r[key]).toLocaleString() : '—'), false, false, i));
      addDataRow('TOTAL PREMIUM (LKR)', responses.map(r => Number(r.premium || 0).toLocaleString()), true);
    }

    // ── Deductibles & Validity ──
    addSection('DEDUCTIBLES, EXCESSES & VALIDITY');
    addDataRow('Deductibles',    responses.map(r => r.deductible    || '—'), false, false, 0);
    addDataRow('Excesses',       responses.map(r => r.excesses      || '—'), false, false, 1);
    addDataRow('Validity (days)',responses.map(r => r.validity_days  || '—'), false, false, 2);

    // ── Commission (broker only) ──
    addSection('COMMISSION — INTERNAL USE ONLY');
    addDataRow('Commission Type', responses.map(r => r.commission_type || '—'), false, true, 0);

    // ── Covers Required ──
    if (coverFields.length > 0) {
      addSection('COVERS REQUIRED');
      coverFields.forEach((f, i) => {
        const vals = responses.map(r => {
          const cr = r.cover_responses?.[f.name];
          return cr?.provided ? `${cr.provided}${cr.terms ? ` — ${cr.terms}` : ''}` : '—';
        });
        addDataRow(f.label, vals, false, false, i);
      });
    }

    // ── Additional Clauses ──
    if (clauseFields.length > 0) {
      addSection('ADDITIONAL CLAUSES');
      clauseFields.forEach((f, i) => {
        const vals = responses.map(r => {
          const cr = r.clause_responses?.[f.name];
          return cr?.provided ? `${cr.provided}${cr.terms ? ` — ${cr.terms}` : ''}` : '—';
        });
        addDataRow(f.label, vals, false, false, i);
      });
    }

    // ── Notes ──
    addSection('NOTES / TERMS & CONDITIONS');
    addDataRow('Notes', responses.map(r => r.notes || '—'), false, false, 0);

    // ── Insurer quote documents ──
    addSection('UPLOADED QUOTATION DOCUMENTS');
    addDataRow('Document Link', responses.map(r => r.quote_file_url ? r.quote_file_url : 'Not uploaded'), false, false, 0);
    // Make the document link cells actual hyperlinks
    const docRow = ws.lastRow;
    responses.forEach((r, ci) => {
      if (r.quote_file_url) {
        const cell = docRow.getCell(ci + 2);
        cell.value = { text: 'Open Document ↗', hyperlink: r.quote_file_url, tooltip: r.quote_file_url };
        cell.font  = { ...cell.font, color: { argb: 'FF6366F1' }, underline: true };
      }
    });

    ws.addRow([]);

    // ── Footer ──
    const foot1 = ws.addRow([`InsureSAAS Ltd  ·  Insurance SaaS Platform  ·  Sri Lanka`, ...responses.map(() => '')]);
    ws.mergeCells(foot1.number, 1, foot1.number, colCount);
    foot1.height = 16;
    foot1.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
    foot1.getCell(1).font      = { size: 9, color: { argb: AMBER }, name: 'Calibri' };
    foot1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    const foot2 = ws.addRow([`CONFIDENTIAL — This comparison report is prepared for internal use. Commission details are not shared with clients.`, ...responses.map(() => '')]);
    ws.mergeCells(foot2.number, 1, foot2.number, colCount);
    foot2.height = 14;
    foot2.getCell(1).fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
    foot2.getCell(1).font      = { size: 8, color: { argb: 'FFD1D5DB' }, italic: true, name: 'Calibri' };
    foot2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    const buf  = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = dlUrl;
    a.download = `InsureSAAS_Comparison_${quote.reference}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(dlUrl), 1000);
    } catch (err) {
      console.error('Excel export error:', err);
      setExportError(err?.message || 'Excel export failed — please try again.');
    }
    setExportingExcel(false);
  };

  // ── Export PDF (broker) ─────────────────────────────────────────────────────
  const exportPdf = async () => {
    setExportingPdf(true);
    setExportError('');
    try {
      await generateComparisonPdf({ quote, product, responses, audience: 'broker' });
    } catch (err) {
      console.error('PDF export error:', err);
      setExportError(err?.message || 'PDF export failed — please try again.');
    }
    setExportingPdf(false);
  };

  if (!quote) return null;

  return (
    <Box>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack} variant="outlined"
          sx={{ fontSize: 12, borderColor: 'rgba(99,102,241,0.3)', color: '#6366f1' }}>
          Back
        </Button>
        <Typography sx={{ fontWeight: 800, fontSize: 18 }}>
          Quote Comparison — {quote.reference}
        </Typography>
        <Chip label={product?.label} sx={{ bgcolor: 'rgba(59,130,246,0.08)', color: '#3B82F6', fontWeight: 700 }} />
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" size="small"
          startIcon={exportingExcel ? <CircularProgress size={12} color="inherit" /> : <FileDownloadOutlinedIcon />}
          onClick={exportExcel} disabled={exportingExcel}
          sx={{ fontSize: 12, borderColor: 'rgba(99,102,241,0.3)', color: '#6366f1' }}>
          {exportingExcel ? 'Exporting…' : 'Export Excel'}
        </Button>
        <Button variant="outlined" size="small"
          startIcon={exportingPdf ? <CircularProgress size={12} color="inherit" /> : <FileDownloadOutlinedIcon />}
          onClick={exportPdf} disabled={exportingPdf}
          sx={{ fontSize: 12, borderColor: 'rgba(99,102,241,0.3)', color: '#6366f1' }}>
          {exportingPdf ? 'Generating PDF…' : 'Export PDF'}
        </Button>
      </Stack>
      {exportError && (
        <Alert severity="error" sx={{ mb: 2, fontSize: 12 }} onClose={() => setExportError('')}>
          {exportError}
        </Alert>
      )}

      {/* ── Send comparison to customer ── */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, alignItems: 'center', flexWrap: 'wrap',
                  p: 2, borderRadius: '12px', bgcolor: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)' }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#6366f1', flexShrink: 0 }}>
          📧 Send to Customer
        </Typography>
        <TextField size="small" placeholder="customer@email.com" type="email"
          value={custEmail} onChange={e => setCustEmail(e.target.value)}
          sx={{ flex: 1, minWidth: 220,
            '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
        <Button variant="contained" size="small" disabled={sending || !custEmail.trim()}
          onClick={sendToCustomer}
          sx={{ background: sendDone ? 'linear-gradient(135deg,#10B981,#059669)' : 'linear-gradient(135deg,#6366f1,#818cf8)',
                fontSize: 12, flexShrink: 0, minWidth: 130 }}>
          {sending ? 'Sending…' : sendDone ? '✓ Sent!' : 'Send Comparison'}
        </Button>
      </Box>
      {sendError && (
        <Alert severity="error" sx={{ mb: 2, fontSize: 12 }}>
          Email failed: {sendError}
        </Alert>
      )}

      {/* Customer selection indicator */}
      {quote.customer_selection && (
        <Alert icon="🏆" severity="success" sx={{ mb: 2.5, fontWeight: 600, fontSize: 13 }}>
          <strong>Customer's Preferred Insurer: {quote.customer_selection.company_name}</strong>
          <Box component="span" sx={{ ml: 1.5, fontSize: 12, color: '#4B5563', fontWeight: 400 }}>
            — selected on {new Date(quote.customer_selection.selected_at).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
          </Box>
        </Alert>
      )}

      {responses.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography sx={{ color: '#9CA3AF' }}>No responses received yet for this quote.</Typography>
        </Box>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(99,102,241,0.12)', borderRadius: '14px', mb: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, minWidth: 180 }}>Field</TableCell>
                {responses.map(r => {
                  const isSelected = quote.customer_selection?.company_id === r.company_id;
                  return (
                  <TableCell key={r.id} align="center" sx={{ fontWeight: 700, minWidth: 160, bgcolor: isSelected ? 'rgba(16,185,129,0.06)' : 'transparent' }}>
                    <Box>
                      <Typography sx={{ fontWeight: 800, fontSize: 13 }}>{r.company_name}</Typography>
                      {isSelected && <Box component="span" sx={{ fontSize: 10, color: '#059669', fontWeight: 700, bgcolor: 'rgba(16,185,129,0.12)', px: 1, py: 0.2, borderRadius: '10px', display: 'inline-block', mt: 0.3 }}>🏆 Customer's Choice</Box>}

                      {r.quote_file_url && (
                        <Button size="small" onClick={() => openFile(r.quote_file_url)}
                          sx={{ fontSize: 10, p: 0, color: '#6366f1', minWidth: 'auto' }}>
                          View Quote ↗
                        </Button>
                      )}
                    </Box>
                  </TableCell>
                  );
                })}
              </TableRow>
            </TableHead>
            <TableBody>
              {/* Premium breakdown rows */}
              {isPlansProduct ? (
                <>
                  <TableRow>
                    <TableCell colSpan={responses.length + 1}
                      sx={{ background: '#0891b2', color: '#fff', fontWeight: 800, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', py: 1.2 }}>
                      Per-Plan Premiums
                    </TableCell>
                  </TableRow>
                  {Array.from({ length: planCount }, (_, pi) => (
                    <React.Fragment key={pi}>
                      <TableRow sx={{ bgcolor: 'rgba(8,145,178,0.07)' }}>
                        <TableCell colSpan={responses.length + 1}
                          sx={{ fontWeight: 800, color: '#0891b2', fontSize: 12, py: 0.8, pl: 2 }}>
                          Plan {pi + 1}
                        </TableCell>
                      </TableRow>
                      {[
                        { key: 'basic', label: 'Basic Premium (LKR)' },
                        { key: 'tax',   label: 'Tax (LKR)' },
                        { key: 'total', label: 'Plan Total (LKR)', bold: true },
                      ].map((row, ri) => (
                        <TableRow key={row.key} sx={{ bgcolor: ri % 2 === 0 ? '#fff' : 'rgba(8,145,178,0.03)' }}>
                          <TableCell sx={{ fontWeight: row.bold ? 700 : 500, color: row.bold ? '#0891b2' : '#374151', fontSize: 12.5, pl: 4 }}>
                            {row.label}
                          </TableCell>
                          {responses.map(r => (
                            <TableCell key={r.id} align="center"
                              sx={{ fontWeight: row.bold ? 700 : 400, color: row.bold ? '#0891b2' : '#374151', fontSize: 12.5 }}>
                              {r.plan_premiums?.[pi]?.[row.key] ? Number(r.plan_premiums[pi][row.key]).toLocaleString() : '—'}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                  <TableRow sx={{ bgcolor: 'rgba(8,145,178,0.10)' }}>
                    <TableCell sx={{ fontWeight: 800, color: '#0891b2' }}>Grand Total (LKR)</TableCell>
                    {responses.map(r => (
                      <TableCell key={r.id} align="center" sx={{ fontWeight: 800, color: '#0891b2', fontSize: 15 }}>
                        {Number(r.premium || 0).toLocaleString()}
                      </TableCell>
                    ))}
                  </TableRow>
                </>
              ) : (
                <>
                  {[
                    { key: 'basic_premium', label: 'Basic Premium (LKR)' },
                    { key: 'srcc_premium',  label: 'SRCC (LKR)' },
                    { key: 'tc_premium',    label: 'TC (LKR)' },
                    { key: 'admin_fee',     label: 'Admin Fee (LKR)' },
                    { key: 'vat_amount',    label: 'VAT (LKR)' },
                    { key: 'other_premium', label: 'Other (LKR)' },
                  ].map((row, i) => (
                    <TableRow key={row.key} sx={{ bgcolor: i % 2 === 0 ? 'rgba(239,246,255,0.4)' : '#fff' }}>
                      <TableCell sx={{ fontWeight: 600, color: '#374151', fontSize: 12.5 }}>{row.label}</TableCell>
                      {responses.map(r => (
                        <TableCell key={r.id} align="center" sx={{ fontSize: 12.5 }}>
                          {r[row.key] ? Number(r[row.key]).toLocaleString() : '—'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  <TableRow sx={{ bgcolor: 'rgba(59,130,246,0.06)' }}>
                    <TableCell sx={{ fontWeight: 800, color: '#3B82F6' }}>Total Premium (LKR)</TableCell>
                    {responses.map(r => (
                      <TableCell key={r.id} align="center" sx={{ fontWeight: 800, color: '#3B82F6', fontSize: 15 }}>
                        {Number(r.premium || 0).toLocaleString()}
                      </TableCell>
                    ))}
                  </TableRow>
                </>
              )}
              {/* Commission — broker internal only */}
              <TableRow sx={{ bgcolor: 'rgba(99,102,241,0.04)' }}>
                <TableCell sx={{ fontWeight: 600 }}>
                  <Stack direction="row" spacing={0.8} alignItems="center">
                    <span>Commission Type</span>
                    <Chip label="Internal" size="small"
                      sx={{ fontSize: 9, height: 16, bgcolor: 'rgba(99,102,241,0.12)', color: '#6366f1', fontWeight: 700 }} />
                  </Stack>
                </TableCell>
                {responses.map(r => (
                  <TableCell key={r.id} align="center" sx={{ fontSize: 12.5, color: '#6366f1', fontWeight: 600 }}>
                    {r.commission_type || '—'}
                  </TableCell>
                ))}
              </TableRow>
              {/* Deductibles & Excesses & Validity */}
              {[
                { key: 'deductible',   label: 'Deductibles' },
                { key: 'excesses',     label: 'Excesses' },
                { key: 'validity_days', label: 'Validity (days)' },
              ].map((row, i) => (
                <TableRow key={row.key} sx={{ bgcolor: i % 2 === 0 ? 'rgba(107,114,128,0.04)' : '#fff' }}>
                  <TableCell sx={{ fontWeight: 600, color: '#374151', fontSize: 12.5 }}>{row.label}</TableCell>
                  {responses.map(r => (
                    <TableCell key={r.id} align="center" sx={{ fontSize: 12.5, color: '#4B5563' }}>
                      {r[row.key] || '—'}
                    </TableCell>
                  ))}
                </TableRow>
              ))}

              {/* Covers Required */}
              {coverFields.length > 0 && (
                <>
                  <TableRow>
                    <TableCell colSpan={responses.length + 1}
                      sx={{ background: '#0F172A', color: '#6366f1', fontWeight: 800, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', py: 1.2 }}>
                      Covers Required
                    </TableCell>
                  </TableRow>
                  {coverFields.map((f, i) => (
                    <TableRow key={f.name} sx={{ bgcolor: i % 2 === 0 ? '#fff' : 'rgba(239,246,255,0.5)' }}>
                      <TableCell sx={{ fontWeight: 600, color: '#374151', fontSize: 12.5, pl: 3 }}>{f.label}</TableCell>
                      {responses.map(r => {
                        const cr = r.cover_responses?.[f.name];
                        const p = cr?.provided || '';
                        return (
                          <TableCell key={r.id} align="center">
                            {p ? (
                              <Box>
                                <Box component="span" sx={{
                                  display: 'inline-block', px: 1.2, py: 0.3, borderRadius: '12px', fontSize: 11.5, fontWeight: 700,
                                  bgcolor: p === 'Yes' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.10)',
                                  color: p === 'Yes' ? '#059669' : '#dc2626',
                                }}>{p}</Box>
                                {cr?.terms && <Typography sx={{ fontSize: 10, color: '#9CA3AF', mt: 0.3, maxWidth: 160 }}>{cr.terms}</Typography>}
                              </Box>
                            ) : <Typography sx={{ color: '#D1D5DB', fontSize: 13 }}>—</Typography>}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </>
              )}

              {/* Additional Clauses */}
              {clauseFields.length > 0 && (
                <>
                  <TableRow>
                    <TableCell colSpan={responses.length + 1}
                      sx={{ background: '#0F172A', color: '#6366f1', fontWeight: 800, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', py: 1.2 }}>
                      Additional Clauses
                    </TableCell>
                  </TableRow>
                  {clauseFields.map((f, i) => (
                    <TableRow key={f.name} sx={{ bgcolor: i % 2 === 0 ? '#fff' : 'rgba(239,246,255,0.5)' }}>
                      <TableCell sx={{ fontWeight: 600, color: '#374151', fontSize: 12.5, pl: 3 }}>{f.label}</TableCell>
                      {responses.map(r => {
                        const cr = r.clause_responses?.[f.name];
                        const p = cr?.provided || '';
                        return (
                          <TableCell key={r.id} align="center">
                            {p ? (
                              <Box>
                                <Box component="span" sx={{
                                  display: 'inline-block', px: 1.2, py: 0.3, borderRadius: '12px', fontSize: 11.5, fontWeight: 700,
                                  bgcolor: p === 'Yes' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.10)',
                                  color: p === 'Yes' ? '#059669' : '#dc2626',
                                }}>{p}</Box>
                                {cr?.terms && <Typography sx={{ fontSize: 10, color: '#9CA3AF', mt: 0.3, maxWidth: 160 }}>{cr.terms}</Typography>}
                              </Box>
                            ) : <Typography sx={{ color: '#D1D5DB', fontSize: 13 }}>—</Typography>}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </>
              )}

              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Notes / T&Cs</TableCell>
                {responses.map(r => (
                  <TableCell key={r.id} sx={{ fontSize: 12, color: '#6B7280', whiteSpace: 'pre-wrap' }}>
                    {r.notes || '—'}
                  </TableCell>
                ))}
              </TableRow>
              {/* Quote images */}
              <TableRow sx={{ bgcolor: 'rgba(99,102,241,0.03)' }}>
                <TableCell sx={{ fontWeight: 700 }}>Uploaded Quote Document</TableCell>
                {responses.map(r => {
                  const isImage = r.quote_file_url &&
                    /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(r.quote_file_url);
                  return (
                    <TableCell key={r.id} align="center">
                      {r.quote_file_url ? (
                        <Box>
                          {isImage ? (
                            <Box component="a" href={r.quote_file_url} onClick={e => { e.preventDefault(); openFile(r.quote_file_url); }} rel="noopener noreferrer">
                              <Box component="img"
                                src={r.quote_file_url}
                                alt={`${r.company_name} quote`}
                                sx={{
                                  width: '100%', maxWidth: 180, maxHeight: 140,
                                  objectFit: 'contain', borderRadius: '10px',
                                  border: '1px solid rgba(99,102,241,0.20)',
                                  display: 'block', mx: 'auto', mb: 1,
                                  cursor: 'pointer',
                                  '&:hover': { opacity: 0.88 },
                                }} />
                            </Box>
                          ) : null}
                          <Chip
                            label={isImage ? 'Open full size ↗' : 'View PDF ↗'}
                            size="small" clickable
                            component="a" href={r.quote_file_url} onClick={e => { e.preventDefault(); openFile(r.quote_file_url); }}
                            target="_blank"
                            sx={{ bgcolor: 'rgba(99,102,241,0.10)', color: '#6366f1', fontWeight: 600, fontSize: 11 }} />
                        </Box>
                      ) : <Typography sx={{ fontSize: 12, color: '#9CA3AF' }}>Not uploaded</Typography>}
                    </TableCell>
                  );
                })}
              </TableRow>
              {/* Broker edit row */}
              <TableRow sx={{ bgcolor: 'rgba(99,102,241,0.04)' }}>
                <TableCell sx={{ fontWeight: 700, color: '#6366f1' }}>Edit Response</TableCell>
                {responses.map(r => (
                  <TableCell key={r.id} align="center">
                    <Button size="small" variant="outlined"
                      onClick={() => openEdit(r)}
                      sx={{ fontSize: 11, py: 0.4, borderColor: '#6366f1', color: '#6366f1' }}>
                      ✏️ Edit
                    </Button>
                    {r.edited_by_broker && (
                      <Typography sx={{ fontSize: 9.5, color: '#9CA3AF', mt: 0.3 }}>Broker edited</Typography>
                    )}
                  </TableCell>
                ))}
              </TableRow>
              {/* Select winner */}
              <TableRow sx={{ bgcolor: 'rgba(16,185,129,0.04)' }}>
                <TableCell sx={{ fontWeight: 700, color: '#059669' }}>Select this quote</TableCell>
                {responses.map(r => (
                  <TableCell key={r.id} align="center">
                    <Button variant="contained" size="small" color="success"
                      onClick={() => onConfirm(quote, r)}
                      sx={{ fontSize: 11.5, py: 0.5 }}>
                      Go with {r.company_name}
                    </Button>
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* ── Declined insurers ──────────────────────────────────────────────── */}
      {declinedResponses.length > 0 && (
        <Box sx={{ mb: 3, p: 2, borderRadius: '14px', border: '1px solid rgba(107,114,128,0.25)', bgcolor: 'rgba(107,114,128,0.04)' }}>
          <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#4B5563', textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>
            Declined to Quote ({declinedResponses.length})
          </Typography>
          <Stack spacing={1}>
            {declinedResponses.map(r => (
              <Box key={r.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 1.2, borderRadius: '10px', bgcolor: '#fff', border: '1px solid rgba(0,0,0,0.06)' }}>
                <Chip label="Declined" size="small"
                  sx={{ fontWeight: 700, fontSize: 11, bgcolor: 'rgba(239,68,68,0.10)', color: '#dc2626', flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{r.company_name}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: '#6B7280' }}>{r.decline_reason || 'Outside underwriting guidelines'}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {/* ── Broker edit dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} maxWidth="md" fullWidth
        PaperProps={{ sx: { maxHeight: '90vh' } }}>
        <DialogTitle sx={{ pb: 1, fontWeight: 800 }}>
          ✏️ Edit Response — {editTarget?.company_name}
        </DialogTitle>
        <DialogContent dividers sx={{ pt: 2 }}>
          <Alert severity="info" sx={{ mb: 2.5, fontSize: 12 }}>
            All changes are saved directly to the comparison. A "Broker edited" note will appear on this response.
          </Alert>

          {/* Premium Breakdown */}
          <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>
            Premium Breakdown
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2.5 }}>
            {[
              { key: 'basic_premium', label: 'Basic Premium (LKR)' },
              { key: 'srcc_premium',  label: 'SRCC (LKR)'          },
              { key: 'tc_premium',    label: 'TC (LKR)'             },
              { key: 'admin_fee',     label: 'Admin Fee (LKR)'      },
              { key: 'vat_amount',    label: 'VAT (LKR)'            },
              { key: 'other_premium', label: 'Other (LKR)'          },
            ].map(({ key, label }) => (
              <TextField key={key} size="small" fullWidth label={label} type="number"
                value={editForm[key] || ''}
                onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} />
            ))}
          </Box>

          {/* Deductibles / Excesses / Validity */}
          <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>
            Deductibles, Excesses & Validity
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, mb: 2.5 }}>
            <TextField size="small" fullWidth label="Deductibles"
              value={editForm.deductible || ''}
              onChange={e => setEditForm(f => ({ ...f, deductible: e.target.value }))} />
            <TextField size="small" fullWidth label="Excesses"
              value={editForm.excesses || ''}
              onChange={e => setEditForm(f => ({ ...f, excesses: e.target.value }))} />
            <TextField size="small" fullWidth label="Validity (days)" type="number"
              value={editForm.validity_days || ''}
              onChange={e => setEditForm(f => ({ ...f, validity_days: e.target.value }))} />
          </Box>

          {/* Commission */}
          <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1, mb: 1 }}>
            Commission Type (Broker Only)
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 2.5 }}>
            {['Standard', 'Special'].map(opt => (
              <Box key={opt} onClick={() => setEditForm(f => ({ ...f, commission_type: opt }))}
                sx={{ flex: 1, py: 1, textAlign: 'center', borderRadius: '8px', cursor: 'pointer',
                  border: `1.5px solid ${editForm.commission_type === opt ? '#6366f1' : 'rgba(0,0,0,0.12)'}`,
                  bgcolor: editForm.commission_type === opt ? 'rgba(99,102,241,0.08)' : 'transparent',
                  color: editForm.commission_type === opt ? '#6366f1' : '#6B7280',
                  fontWeight: editForm.commission_type === opt ? 700 : 400, fontSize: 13 }}>
                {opt}
              </Box>
            ))}
          </Box>

          {/* Covers Required */}
          {coverFields.length > 0 && (
            <>
              <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>
                Covers Required
              </Typography>
              <Box sx={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: '10px', overflow: 'hidden', mb: 2.5 }}>
                {coverFields.map((f, i) => {
                  const cr = editCoverResp[f.name] || { provided: '', terms: '' };
                  return (
                    <Box key={f.name} sx={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr', gap: 1.5, alignItems: 'center', p: 1.2, bgcolor: i % 2 === 0 ? '#fff' : 'rgba(239,246,255,0.5)', borderBottom: i < coverFields.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{f.label}</Typography>
                      <Select size="small" value={cr.provided} displayEmpty fullWidth
                        onChange={e => setECover(f.name, 'provided', e.target.value)}>
                        <MenuItem value="">—</MenuItem>
                        <MenuItem value="Yes">Yes</MenuItem>
                        <MenuItem value="No">No</MenuItem>
                      </Select>
                      <TextField size="small" placeholder="Special terms…" fullWidth
                        value={cr.terms}
                        onChange={e => setECover(f.name, 'terms', e.target.value)}
                        sx={{ '& .MuiInputBase-root': { fontSize: 12 } }} />
                    </Box>
                  );
                })}
              </Box>
            </>
          )}

          {/* Additional Clauses */}
          {clauseFields.length > 0 && (
            <>
              <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>
                Additional Clauses
              </Typography>
              <Box sx={{ border: '1px solid rgba(0,0,0,0.08)', borderRadius: '10px', overflow: 'hidden', mb: 2.5 }}>
                {clauseFields.map((f, i) => {
                  const cr = editClauseResp[f.name] || { provided: '', terms: '' };
                  return (
                    <Box key={f.name} sx={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr', gap: 1.5, alignItems: 'center', p: 1.2, bgcolor: i % 2 === 0 ? '#fff' : 'rgba(239,246,255,0.5)', borderBottom: i < clauseFields.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{f.label}</Typography>
                      <Select size="small" value={cr.provided} displayEmpty fullWidth
                        onChange={e => setEClause(f.name, 'provided', e.target.value)}>
                        <MenuItem value="">—</MenuItem>
                        <MenuItem value="Yes">Yes</MenuItem>
                        <MenuItem value="No">No</MenuItem>
                      </Select>
                      <TextField size="small" placeholder="Terms…" fullWidth
                        value={cr.terms}
                        onChange={e => setEClause(f.name, 'terms', e.target.value)}
                        sx={{ '& .MuiInputBase-root': { fontSize: 12 } }} />
                    </Box>
                  );
                })}
              </Box>
            </>
          )}

          {/* Notes */}
          <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: 1, mb: 1 }}>
            Notes / Terms & Conditions
          </Typography>
          <TextField size="small" fullWidth multiline rows={3}
            value={editForm.notes || ''}
            onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button variant="outlined" onClick={() => setEditTarget(null)}
            sx={{ borderColor: '#e0e0e0', color: '#6B7280' }}>Cancel</Button>
          <Button variant="contained" onClick={saveEdit} disabled={editSaving}
            sx={{ background: 'linear-gradient(135deg,#6366f1,#818cf8)', minWidth: 130 }}>
            {editSaving ? 'Saving…' : 'Save All Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/* ── main page ────────────────────────────────────────────────────────────── */
const QuotationsPage = () => {
  const { user, userProfile, allProducts: ctxProducts } = useAuth();
  const allP = ctxProducts || STATIC_PRODUCTS;
  const productList = useMemo(
    () => Object.entries(allP).map(([key, val]) => ({ key, ...val })),
    [allP],
  );
  const [tab,           setTab]           = useState(0);
  const [qPage,         setQPage]         = useState(1);
  const Q_PER_PAGE = 15;
  const [product,       setProduct]       = useState('fire');
  const [quotes,        setQuotes]        = useState([]);
  const [companies,     setCompanies]     = useState([]);
  const [newQuoteOpen,  setNewQuoteOpen]  = useState(false);
  const [sendOpen,      setSendOpen]      = useState(false);
  const [formValues,    setFormValues]    = useState({});
  const [selectedCos,   setSelectedCos]  = useState([]);
  const [saving,        setSaving]        = useState(false);
  const [sending,       setSending]       = useState(false);
  const [pendingQuote,  setPendingQuote]  = useState(null);
  const [compareQuote,  setCompareQuote]  = useState(null);
  const [dateFrom,      setDateFrom]      = useState(null);
  const [dateTo,        setDateTo]        = useState(null);
  const [toast,         setToast]         = useState({ open: false, msg: '', severity: 'success' });
  const [filterProduct,  setFilterProduct]  = useState('all');
  const [filterStatus,   setFilterStatus]   = useState('all');
  const [deleteTarget,   setDeleteTarget]   = useState(null);
  const [deleting,       setDeleting]       = useState(false);
  const [fieldErrors,    setFieldErrors]    = useState({});
  const [valIssues,      setValIssues]      = useState({ missing: [], invalid: [] });
  const [valOpen,        setValOpen]        = useState(false);
  const [insurerCatTab,  setInsurerCatTab]  = useState('all');
  const [insurerSearch,  setInsurerSearch]  = useState('');
  const [draftBanner,    setDraftBanner]    = useState(null);
  const [restoreOpen,    setRestoreOpen]    = useState(false);
  const [restoreItems,   setRestoreItems]   = useState([]);
  const [restoreRunning, setRestoreRunning] = useState(false);
  const [restoreDone,    setRestoreDone]    = useState(false);
  const [hasDraft,       setHasDraft]       = useState(() => {
    try { const s = sessionStorage.getItem(DRAFT_KEY); return !!(s && Object.keys(JSON.parse(s).formValues || {}).length > 0); }
    catch (_) { return false; }
  });
  const draftTimerRef  = useRef(null);
  const formValuesRef  = useRef(formValues);
  const productRef     = useRef(product);
  useEffect(() => { formValuesRef.current = formValues; }, [formValues]);
  useEffect(() => { productRef.current = product; }, [product]);

  const flushDraftSave = useCallback(() => {
    if (Object.keys(formValuesRef.current).length === 0) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ product: productRef.current, formValues: formValuesRef.current, savedAt: new Date().toISOString() }));
      setHasDraft(true);
    } catch (_) {}
  }, []);

  // Auto-save draft to localStorage while form is open
  useEffect(() => {
    if (!newQuoteOpen) return;
    if (Object.keys(formValues).length === 0) return;
    clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ product, formValues, savedAt: new Date().toISOString() }));
        setHasDraft(true);
      } catch (_) {}
    }, 800);
    return () => clearTimeout(draftTimerRef.current);
  }, [formValues, product, newQuoteOpen]);

  // Load companies
  useEffect(() => {
    getDocs(collection(db, 'insurance_companies'))
      .then(snap => setCompanies(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, []);

  // Real-time quotes listener
  useEffect(() => {
    const q = query(collection(db, 'quotes'), orderBy('created_at', 'desc'));
    const unsub = onSnapshot(
      q,
      snap => { setQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() }))); },
      () => { /* permission or network error — keep local optimistic state */ }
    );
    return unsub;
  }, []);

  const filteredQuotes = useMemo(() => {
    let list = quotes;
    if (dateFrom) list = list.filter(q => q.created_at?.toDate?.() >= dateFrom);
    if (dateTo)   list = list.filter(q => q.created_at?.toDate?.() <= dateTo);
    if (filterProduct !== 'all') list = list.filter(q => q.product_key === filterProduct);
    if (filterStatus  !== 'all') list = list.filter(q => q.status === filterStatus);
    return list;
  }, [quotes, dateFrom, dateTo, filterProduct, filterStatus]);

  const sentQuotes     = filteredQuotes.filter(q => (q.sent_to?.length || 0) > 0);
  const receivedQuotes = filteredQuotes.filter(q => (q.responses?.length || 0) > 0);
  const compareQuotes  = receivedQuotes; // only quotes with at least 1 response can be compared

  const setField = useCallback((name, val) => {
    setFormValues(v => ({ ...v, [name]: val }));
    setFieldErrors(e => { const n = { ...e }; delete n[name]; return n; });
  }, []);

  const handleCreateQuote = async () => {
    const { errors, missing, invalid } = validateForm(product, formValues, allP);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setValIssues({ missing, invalid });
      setValOpen(true);
      return;
    }
    setFieldErrors({});

    setSaving(true);
    try {
      const customerName = formValues[allP[product]?.customerNameField || ''] || '';
      const reference = genRef(product, customerName, allP);
      const ref = await addDoc(collection(db, 'quotes'), {
        reference,
        product_key:     product,
        product_label:   allP[product]?.label || product,
        form_data:       { ...formValues, insuresaas_ib_file_no: reference },
        status:          'draft',
        sent_to:         [],
        responses:       [],
        created_by:      user?.uid || '',
        created_by_name: userProfile?.full_name || user?.email?.split('@')[0] || 'Unknown',
        created_at:      serverTimestamp(),
        updated_at:      serverTimestamp(),
      });
      // Optimistic update — add draft to local state immediately
      setQuotes(prev => [{
        id: ref.id, reference, product_key: product,
        product_label: allP[product]?.label || product,
        form_data: { ...formValues, insuresaas_ib_file_no: reference }, status: 'draft',
        sent_to: [], responses: [],
        created_by_name: userProfile?.full_name || '',
        created_at: { toDate: () => new Date() },
      }, ...prev]);
      setPendingQuote({ id: ref.id, reference, form_data: { ...formValues, insuresaas_ib_file_no: reference }, product_key: product });
      setNewQuoteOpen(false);
      setSendOpen(true);
      setFormValues({});
      setDraftBanner(null);
      setHasDraft(false);
      try { sessionStorage.removeItem(DRAFT_KEY); } catch (_) {}
    } catch (err) {
      setToast({ open: true, msg: err.message, severity: 'error' });
    }
    setSaving(false);
  };

  const handleSendQuotes = async () => {
    if (!selectedCos.length) { setToast({ open: true, msg: 'Select at least one insurance company', severity: 'error' }); return; }
    setSending(true);
    try {
      const responseBase = `${window.location.origin}/quote-respond`;
      const sentTo = [];
      const emailFailures = [];
      for (const co of selectedCos) {
        const responseUrl = `${responseBase}?qid=${pendingQuote.id}&cid=${co.id}&cn=${encodeURIComponent(co.name)}`;
        sentTo.push({ company_id: co.id, company_name: co.name, company_email: co.email, sent_at: new Date().toISOString(), responded: false });

        if (EMAILJS_SERVICE && EMAILJS_TEMPLATE && EMAILJS_KEY) {
          if (!co.email) {
            emailFailures.push(`${co.name}: no email address on file`);
          } else {
            const productLabel = allP[pendingQuote.product_key]?.label || pendingQuote.product_key;
            const productFields = allP[pendingQuote.product_key]?.fields || [];
            const formData      = pendingQuote.form_data || {};
            const noFields      = new Set(
              productFields.filter(f => f.type === 'yesno' && formData[f.name] === 'No').map(f => f.name)
            );
            const formEntries = Object.entries(formData).filter(([k, v]) => {
              if (!v) return false;
              if (typeof v === 'string' && v.startsWith('http')) return false;
              if (k === 'insuresaas_ib_file_no') return false;
              const fd = productFields.find(f => f.name === k);
              if (!fd) return false;
              if (fd.section === 'Introducer') return false;
              if (fd.section === 'Document Uploads') return false;
              if (fd.type === 'file') return false;
              if (fd.type === 'yesno' && v === 'No') return false;
              if (fd.showIf && noFields.has(fd.showIf.field)) return false;
              return true;
            });
            const details = formEntries.length
              ? formEntries.map(([k, v]) => {
                  const field = productFields.find(f => f.name === k);
                  const display = Array.isArray(v) ? v.join(', ') : String(v);
                  return `${field?.label || k}: ${display}`;
                }).join('\n')
              : 'No additional details provided.';
            try {
              await emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, {
                to_name:       co.name,
                to_email:      co.email,
                reference:     pendingQuote.reference,
                product:       productLabel,
                response_link: responseUrl,
                details,
              }, { publicKey: EMAILJS_KEY });
            } catch (emailErr) {
              const msg = emailErr?.text || emailErr?.message || 'Unknown error';
              emailFailures.push(`${co.name}: ${msg}`);
            }
          }
        }
      }

      await updateDoc(doc(db, 'quotes', pendingQuote.id), {
        sent_to: sentTo, status: 'sent', updated_at: serverTimestamp(),
      });

      // Optimistic update — mark as sent in local state immediately
      setQuotes(prev => prev.map(q =>
        q.id === pendingQuote.id ? { ...q, sent_to: sentTo, status: 'sent' } : q
      ));

      setSendOpen(false);
      setSelectedCos([]);
      setPendingQuote(null);
      if (emailFailures.length > 0) {
        setToast({ open: true, msg: `Quote saved. Email failed for: ${emailFailures.join('; ')}`, severity: 'warning' });
      } else {
        setToast({ open: true, msg: `Quote request sent to ${sentTo.length} insurer${sentTo.length > 1 ? 's' : ''}!`, severity: 'success' });
      }
      setTab(0);
    } catch (err) {
      setToast({ open: true, msg: err.message, severity: 'error' });
    }
    setSending(false);
  };

  const handleResendEmails = async (quote) => {
    if (!EMAILJS_SERVICE || !EMAILJS_TEMPLATE || !EMAILJS_KEY) {
      setToast({ open: true, msg: 'EmailJS not configured — cannot send emails.', severity: 'error' });
      return;
    }
    const sentTo = quote.sent_to || [];
    if (!sentTo.length) return;
    setToast({ open: true, msg: 'Resending emails…', severity: 'info' });
    const responseBase = `${window.location.origin}/quote-respond`;
    const productLabel = allP[quote.product_key]?.label || quote.product_key;
    let sent = 0;
    const failures = [];
    for (const co of sentTo) {
      const company = companies.find(c => c.id === co.company_id);
      const email = company?.email || co.company_email;
      if (!email) { failures.push(`${co.company_name}: no email`); continue; }
      const responseUrl = `${responseBase}?qid=${quote.id}&cid=${co.company_id}&cn=${encodeURIComponent(co.company_name)}`;
      try {
        await emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, {
          to_name:       co.company_name,
          to_email:      email,
          reference:     quote.reference,
          product:       productLabel,
          response_link: responseUrl,
          details:       'This is a resent quote request. Please use the link above to submit your quotation.',
        }, { publicKey: EMAILJS_KEY });
        sent++;
      } catch (err) {
        failures.push(`${co.company_name}: ${err?.text || err?.message || 'error'}`);
      }
    }
    if (failures.length) {
      setToast({ open: true, msg: `Resent ${sent}. Failed: ${failures.join('; ')}`, severity: failures.length === sentTo.length ? 'error' : 'warning' });
    } else {
      setToast({ open: true, msg: `Emails resent to ${sent} insurer${sent > 1 ? 's' : ''}!`, severity: 'success' });
    }
  };

  const handleConfirmQuote = async (quote, response) => {
    await updateDoc(doc(db, 'quotes', quote.id), {
      status: 'confirmed',
      selected_company: response.company_name,
      selected_premium: response.premium,
      updated_at: serverTimestamp(),
    });
    setToast({ open: true, msg: `${response.company_name} selected. Forwarding to Underwriting…`, severity: 'success' });
    setCompareQuote(null);
    setTimeout(() => {
      const fd         = quote.form_data || {};
      const productCfg = STATIC_PRODUCTS[quote.product_key || ''];

      // Product label matches the PRODUCTS config label (used by underwriting dropdown)
      const productLabel = productCfg?.label || quote.product_label || 'Other';

      // Coverage = sub-type detail (what was selected within the product)
      const coverageDetail = fd.type_of_cover || fd.plan_type || fd.marine_type
        || fd.liability_cover_type || fd.policy_type || '';

      // Collect ALL document URLs from the quotation form_data
      const quotationDocUrls = {};
      Object.entries(fd).forEach(([k, v]) => {
        if (k.startsWith('doc_') && v && typeof v === 'string' && v.startsWith('http')) {
          quotationDocUrls[k] = v;
        }
      });

      // Collect ALL cover/clause selections from form_data (yesno fields)
      const coverSelections = {};
      Object.entries(fd).forEach(([k, v]) => {
        if ((k.startsWith('cover_') || k.startsWith('clause_')) && v) {
          coverSelections[k] = v;
        }
      });

      const prefill = {
        _quote_id: quote.id,

        // ── Spread ALL quotation form data first so every product-specific
        //    field (covers, clauses, FI fields, risk fields, docs) carries over
        ...fd,

        // ── Overrides: remap field names that differ between quotation + underwriting forms ──

        // Reference — use the quotation's auto-generated reference as the InsureSAAS File No.
        insuresaas_ib_file_no:  quote.reference || fd.insuresaas_ib_file_no || '',
        introducer_code:    fd.introducer         || '',
        manager:            fd.manager            || '',

        // Insurance Company
        product:            productLabel,
        insurance_provider: response.company_name,

        // Proposer Details (quotation uses different field names)
        client_name:        fd.proposer_name || fd.company_name || fd.full_name || '',
        customer_type:      fd.customer_type === 'Corporate' ? 'Company' : (fd.customer_type || ''),
        nic_proof:          fd.nic_no      || '',
        business_registration: fd.business_reg || '',
        svat_proof:         fd.vat_no      || '',
        street1:            fd.address || fd.property_address || fd.address_of_risk || fd.premises_address || '',
        mobile_no:          fd.mobile  || '',

        // Period of Insurance
        coverage:           coverageDetail,
        policy_type:        quote.product_label || '',
        policy_period_from: fd.period_from  || fd.departure_date || fd.loan_start || fd.commencement_date || '',
        policy_period_to:   fd.period_to    || fd.return_date    || fd.loan_end   || fd.expiry_date       || '',

        // Sum Insured
        sum_insured: String(fd.sum_insured || fd.total_value || fd.market_value || fd.sum_assured || fd.limit_per_occurrence || fd.cyber_limit || fd.cover_limit || fd.hospitalization_cover || ''),

        // Motor-specific name remaps
        vehicle_number: fd.vehicle_no || '',

        // Premium from insurer response (overrides any raw fd values)
        basic_premium:  String(response.basic_premium || response.premium || ''),
        srcc_premium:   String(response.srcc_premium  || ''),
        tc_premium:     String(response.tc_premium    || ''),
        admin_fees:     String(response.admin_fee     || ''),
        vat_fee:        String(response.vat_amount    || ''),
        net_premium:    String(response.basic_premium || response.premium || ''),
        total_invoice:  String(response.premium       || ''),

        // Deductibles from insurer response
        deductible: response.deductible || '',
        excesses:   response.excesses   || '',

        // Commission from insurer response
        commission_type:  response.commission_type         || '',
        commission_basic: String(response.commission_basic || ''),
        commission_srcc:  String(response.commission_srcc  || ''),
        commission_tc:    String(response.commission_tc    || ''),

        // Group medical
        plan_premiums: response.plan_premiums ? JSON.stringify(response.plan_premiums) : '',

        // Insurer's uploaded document → quotation slot
        ...(response.doc_url ? { quotation_doc_url: response.doc_url } : {}),

        // Insurer's cover/clause responses (stored as JSON for reference)
        cover_responses:  response.cover_responses  ? JSON.stringify(response.cover_responses)  : '',
        clause_responses: response.clause_responses ? JSON.stringify(response.clause_responses) : '',

        // Insurer fee/tax fields
        other_premium:     String(response.other_premium     || ''),
        policy_fees:       String(response.policy_fees       || ''),
        cess:              String(response.cess              || ''),
        road_safety_fee:   String(response.road_safety_tax   || ''),
        stamp_duty:        String(response.stamp_fee         || ''),
        nbl:               String(response.nbl               || ''),
        ssc_levy:          String(response.ssc_levy          || ''),
        validity_days:     String(response.validity_days     || ''),

        // Proposer postal code
        postal_code: fd.postal_code || '',

        // Notes from insurer
        notes: response.special_conditions || response.notes || '',
      };

      // Use sessionStorage instead of URL param — Firebase Storage URLs are long
      // and a large quotation (29 clauses, 6 docs, etc.) easily breaks URL limits
      sessionStorage.setItem('uw_prefill', JSON.stringify(prefill));
      window.location.href = '/underwriting';
    }, 1500);
  };

  const handleDeleteQuote = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'quotes', deleteTarget.id));
      setQuotes(prev => prev.filter(q => q.id !== deleteTarget.id));
      setToast({ open: true, msg: 'Quote deleted.', severity: 'info' });
    } catch (err) {
      setToast({ open: true, msg: err.message, severity: 'error' });
    }
    setDeleteTarget(null);
    setDeleting(false);
  };

  /* ── Restore quotations — accepts JSON files OR a single CSV ───────────── */
  const handleRestoreFilesSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    let items = [];

    for (const f of files) {
      if (f.name.endsWith('.csv')) {
        // Parse the QUOTATIONS_IMPORT.csv — produces one item per row
        await new Promise(resolve => {
          Papa.parse(f, {
            header: true, skipEmptyLines: true,
            complete: ({ data }) => {
              data.forEach(row => {
                if (!row.reference) return;
                items.push({
                  file: { name: row.reference }, // use reference as display name
                  valid: true,
                  data: {
                    reference:          row.reference || '',
                    product_key:        row.product_key || '',
                    main_class:         row.main_class || '',
                    client_name:        row.client_name || '',
                    client_mobile:      row.client_mobile || '',
                    status:             row.status || 'sent',
                    customer_selection: row.customer_selection || '',
                    responses:          [],
                  },
                  status: 'pending',
                  sourceType: 'csv',
                });
              });
              resolve();
            },
            error: () => {
              items.push({ file: f, valid: false, error: 'CSV parse failed' });
              resolve();
            },
          });
        });
      } else if (f.name.endsWith('.json')) {
        try {
          const text = await f.text();
          const data = JSON.parse(text);
          if (!data.reference) { items.push({ file: f, valid: false, error: 'Missing reference field' }); continue; }
          items.push({ file: f, valid: true, data, status: 'pending', sourceType: 'json' });
        } catch {
          items.push({ file: f, valid: false, error: 'Invalid JSON' });
        }
      }
    }

    setRestoreItems(items);
    setRestoreDone(false);
    setRestoreOpen(true);
  };

  const runRestore = async () => {
    const toRestore = restoreItems.filter(x => x.valid && x.status !== 'done');
    setRestoreRunning(true);

    // Fetch existing quotes once for matching
    const existingSnap = await getDocs(collection(db, 'quotes'));
    const existingMap = {};
    existingSnap.docs.forEach(d => { existingMap[d.data().reference] = d.id; });

    const updated = [...restoreItems];
    let created = 0; let updated_count = 0;

    // Process in batches of 400 (Firestore batch limit is 500)
    const BATCH_SIZE = 400;
    for (let i = 0; i < toRestore.length; i += BATCH_SIZE) {
      const chunk = toRestore.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      const chunkIndices = [];

      for (const item of chunk) {
        const idx = updated.findIndex(x =>
          x.file.name === item.file.name && x.data?.reference === item.data?.reference
        );
        const payload = {
          reference:          item.data.reference || '',
          product_key:        item.data.product_key || '',
          main_class:         item.data.main_class || '',
          client_name:        item.data.client_name || '',
          client_mobile:      item.data.client_mobile || '',
          status:             item.data.status || 'sent',
          customer_selection: item.data.customer_selection || '',
          responses:          item.data.responses || [],
          // Ensure restored quotes appear in the Sent tab
          sent_to: item.data.sent_to?.length ? item.data.sent_to : ['restored'],
        };
        const existingId = existingMap[item.data.reference];
        if (existingId) {
          batch.update(doc(db, 'quotes', existingId), payload);
          chunkIndices.push({ idx, action: 'updated' });
          updated_count++;
        } else {
          const newRef = doc(collection(db, 'quotes'));
          batch.set(newRef, { ...payload, created_at: serverTimestamp() });
          chunkIndices.push({ idx, action: 'created' });
          created++;
        }
      }

      try {
        await batch.commit();
        chunkIndices.forEach(({ idx, action }) => {
          if (idx !== -1) updated[idx] = { ...updated[idx], status: 'done', action };
        });
      } catch (err) {
        chunkIndices.forEach(({ idx }) => {
          if (idx !== -1) updated[idx] = { ...updated[idx], status: 'error', error: err.message };
        });
      }
      setRestoreItems([...updated]);
    }

    setRestoreRunning(false);
    setRestoreDone(true);
    setToast({
      open: true,
      msg: `${created} created · ${updated_count} updated`,
      severity: 'success',
    });
  };

  const tabQuotes = [sentQuotes, receivedQuotes, compareQuotes];

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box className="page-enter" sx={{ maxWidth: 1100, mx: 'auto' }}>

        {/* Header */}
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ mb: 3 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.3 }}>Quotations</Typography>
            <Typography sx={{ fontSize: 13, color: '#9CA3AF' }}>
              Request, track and compare quotes from insurance companies
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: { xs: 1.5, sm: 0 } }}>
            {hasDraft && (
              <Chip
                label="Resume draft"
                size="small"
                onClick={() => {
                  try {
                    const saved = sessionStorage.getItem(DRAFT_KEY);
                    if (saved) {
                      const parsed = JSON.parse(saved);
                      setDraftBanner(parsed);
                      setProduct(parsed.product || 'fire');
                      setFormValues({});
                      setNewQuoteOpen(true);
                    }
                  } catch (_) {}
                }}
                sx={{
                  fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  bgcolor: 'rgba(59,130,246,0.10)', color: '#2563eb',
                  border: '1.5px solid rgba(59,130,246,0.30)',
                  '&:hover': { bgcolor: 'rgba(59,130,246,0.18)' },
                }}
                icon={<span style={{ fontSize: 14, marginLeft: 6 }}>💾</span>}
              />
            )}
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />}
              onClick={() => document.getElementById('quote-restore-input').click()}
              sx={{ fontSize: 12, borderColor: 'rgba(99,102,241,0.35)', color: '#6366f1',
                    '&:hover': { borderColor: '#6366f1', bgcolor: 'rgba(99,102,241,0.06)' } }}>
              Restore Backup
            </Button>
            <input id="quote-restore-input" type="file" multiple accept=".json,.csv" style={{ display: 'none' }}
              onChange={handleRestoreFilesSelect} />
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => {
              try {
                const saved = sessionStorage.getItem(DRAFT_KEY);
                if (saved) {
                  const parsed = JSON.parse(saved);
                  if (parsed && Object.keys(parsed.formValues || {}).length > 0) {
                    setDraftBanner(parsed);
                    setProduct(parsed.product || 'fire');
                    setFormValues({});
                    setNewQuoteOpen(true);
                    return;
                  }
                }
              } catch (_) {}
              setDraftBanner(null);
              setFormValues({});
              setNewQuoteOpen(true);
            }}>
              New Quote Request
            </Button>
          </Stack>
        </Stack>

        {/* Stats row */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
          {[
            { label: 'Sent',     val: sentQuotes.length,     color: '#d97706', bg: 'rgba(245,158,11,0.08)' },
            { label: 'Received', val: receivedQuotes.length, color: '#059669', bg: 'rgba(16,185,129,0.08)' },
          ].map(s => (
            <Box key={s.label} sx={{ flex: 1, p: 2, borderRadius: '12px', bgcolor: s.bg, border: `1px solid ${s.bg}` }}>
              <Typography sx={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.val}</Typography>
              <Typography sx={{ fontSize: 12, color: '#6B7280' }}>{s.label}</Typography>
            </Box>
          ))}

          {/* Date filters */}
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flex: 2 }}>
            <DatePicker label="From" value={dateFrom} onChange={setDateFrom}
              slotProps={{ textField: { size: 'small', sx: { minWidth: 150 } } }} />
            <DatePicker label="To" value={dateTo} onChange={setDateTo}
              slotProps={{ textField: { size: 'small', sx: { minWidth: 150 } } } } />
            {(dateFrom || dateTo) && (
              <Button size="small" onClick={() => { setDateFrom(null); setDateTo(null); }}
                sx={{ fontSize: 12, color: '#9CA3AF', flexShrink: 0 }}>Clear</Button>
            )}
          </Box>
        </Stack>

        {/* Product + Status filters */}
        <Stack direction="row" spacing={1.5} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Product Type</InputLabel>
            <Select value={filterProduct} label="Product Type" onChange={e => setFilterProduct(e.target.value)}>
              <MenuItem value="all">All Products</MenuItem>
              {productList.map(p => <MenuItem key={p.key} value={p.key}>{p.icon} {p.label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Status</InputLabel>
            <Select value={filterStatus} label="Status" onChange={e => setFilterStatus(e.target.value)}>
              <MenuItem value="all">All Status</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="sent">Sent</MenuItem>
              <MenuItem value="partial">Partial</MenuItem>
              <MenuItem value="confirmed">Confirmed</MenuItem>
            </Select>
          </FormControl>
          {(filterProduct !== 'all' || filterStatus !== 'all') && (
            <Button size="small" onClick={() => { setFilterProduct('all'); setFilterStatus('all'); }}
              sx={{ fontSize: 12, color: '#9CA3AF' }}>Clear Filters</Button>
          )}
        </Stack>

        {/* Compare view */}
        {compareQuote ? (
          <ComparisonView quote={compareQuote} onBack={() => setCompareQuote(null)} onConfirm={handleConfirmQuote} allProducts={allP} />
        ) : (
          <>
            <Tabs value={tab} onChange={(_, v) => { setTab(v); setQPage(1); }} sx={{
              mb: 2.5, borderBottom: '1px solid rgba(99,102,241,0.12)',
              '& .MuiTab-root': { fontSize: 13, fontWeight: 600, textTransform: 'none', color: '#9CA3AF' },
              '& .Mui-selected': { color: '#3B82F6' },
              '& .MuiTabs-indicator': { background: 'linear-gradient(90deg,#3B82F6,#6366f1)', height: 2.5 },
            }}>
              <Tab label={`Sent (${sentQuotes.length})`} />
              <Tab label={`Received (${receivedQuotes.length})`} />
              <Tab label={`Compare (${compareQuotes.length})`} />
            </Tabs>

            {tabQuotes[tab].length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 6 }}>
                <Typography sx={{ color: '#9CA3AF', fontWeight: 600 }}>
                  {tab === 0 ? 'No sent quote requests yet.' : tab === 1 ? 'No responses received yet.' : 'No quotes with responses to compare yet.'}
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: '#C4B5B0', mt: 0.5 }}>
                  {tab === 0 ? 'Click "New Quote Request" to get started.' : tab === 1 ? 'Responses appear here once insurers submit their quotes.' : 'Quotes move here once at least one insurer responds.'}
                </Typography>
              </Box>
            ) : (
              <>
                {tabQuotes[tab].slice((qPage-1)*Q_PER_PAGE, qPage*Q_PER_PAGE).map(q => (
                  <QuoteRow key={q.id} quote={q}
                    tab={tab === 0 ? 'sent' : tab === 1 ? 'received' : 'compare'}
                    onSelect={setCompareQuote}
                    onDelete={q => setDeleteTarget(q)}
                    onResend={handleResendEmails}
                    isManager={userProfile?.role === 'manager' || userProfile?.role === 'admin'}
                    allProducts={allP} />
                ))}
                {tabQuotes[tab].length > Q_PER_PAGE && (
                  <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', pt:2.5, flexWrap:'wrap', gap:1 }}>
                    <Typography sx={{ fontSize:12.5, color:'#9CA3AF' }}>
                      Showing {(qPage-1)*Q_PER_PAGE+1}–{Math.min(qPage*Q_PER_PAGE, tabQuotes[tab].length)} of {tabQuotes[tab].length}
                    </Typography>
                    <Pagination count={Math.ceil(tabQuotes[tab].length/Q_PER_PAGE)} page={qPage}
                      onChange={(_, v) => { setQPage(v); window.scrollTo({top:0,behavior:'smooth'}); }}
                      shape="rounded" size="small" />
                  </Box>
                )}
              </>
            )}
          </>
        )}

        {/* ── New Quote Dialog ── */}
        <Dialog open={newQuoteOpen} onClose={() => { flushDraftSave(); setNewQuoteOpen(false); }} maxWidth="md" fullWidth>
          <DialogTitle>
            New Quote Request
          </DialogTitle>
          <DialogContent sx={{ pt: 2.5 }}>
            {/* Draft restore banner */}
            {draftBanner && (
              <Alert
                severity="info"
                sx={{ mb: 2.5, fontSize: 13, alignItems: 'center', '& .MuiAlert-message': { width: '100%' } }}
                icon={<span style={{ fontSize: 18 }}>💾</span>}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: 13, color: '#1e40af' }}>Unsaved draft found</Typography>
                    <Typography sx={{ fontSize: 12, color: '#3b82f6' }}>
                      {allP[draftBanner.product]?.label || draftBanner.product} · saved {new Date(draftBanner.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="contained"
                      sx={{ fontSize: 12, background: 'linear-gradient(135deg,#3b82f6,#2563eb)', boxShadow: 'none', py: 0.5 }}
                      onClick={() => {
                        setProduct(draftBanner.product || 'fire');
                        setFormValues(draftBanner.formValues || {});
                        setFieldErrors({});
                        setDraftBanner(null);
                      }}>
                      Restore Draft
                    </Button>
                    <Button size="small" variant="outlined"
                      sx={{ fontSize: 12, borderColor: '#93c5fd', color: '#2563eb', py: 0.5 }}
                      onClick={() => {
                        setDraftBanner(null);
                        setFormValues({});
                        setHasDraft(false);
                        try { sessionStorage.removeItem(DRAFT_KEY); } catch (_) {}
                      }}>
                      Start Fresh
                    </Button>
                  </Stack>
                </Box>
              </Alert>
            )}
            {/* Product selector */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
              {productList.map(p => (
                <Chip key={p.key} label={`${p.icon} ${p.label}`} clickable
                  onClick={() => { setProduct(p.key); setFieldErrors({}); }}
                  sx={{
                    fontWeight: 700, fontSize: 12.5,
                    bgcolor: product === p.key ? `${p.color}18` : 'rgba(0,0,0,0.04)',
                    color:   product === p.key ? p.color : '#6B7280',
                    border:  product === p.key ? `1.5px solid ${p.color}50` : '1.5px solid transparent',
                    transition: 'all 0.15s ease',
                  }}
                />
              ))}
            </Box>

            <ProductForm product={product} values={formValues} onChange={setField} errors={fieldErrors} allProducts={allP} />
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(99,102,241,0.10)' }}>
            <Button onClick={() => { flushDraftSave(); setNewQuoteOpen(false); }} variant="outlined"
              sx={{ borderColor: '#e0e0e0', color: '#6B7280' }}>Cancel</Button>
            <Button variant="contained" onClick={handleCreateQuote} disabled={saving}>
              {saving ? 'Saving…' : 'Save & Select Insurers →'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Send to Insurers Dialog ── */}
        <Dialog open={sendOpen} onClose={() => { setSendOpen(false); setInsurerCatTab('all'); setInsurerSearch(''); }} maxWidth="sm" fullWidth
          PaperProps={{ sx: { maxHeight:'88vh' } }}>
          <DialogTitle sx={{ display:'flex', alignItems:'center', gap:1.5 }}>
            <SendIcon sx={{ color:'#6366f1', fontSize:20 }} />
            Select Insurance Companies
          </DialogTitle>
          <DialogContent sx={{ pt:2, display:'flex', flexDirection:'column', gap:0 }}>
            {companies.length === 0 ? (
              <Alert severity="info" sx={{ fontSize:12 }}>
                No insurance companies configured. Add them in the Admin Panel → Insurance Companies tab.
              </Alert>
            ) : (() => {
              const CAT_COLORS = {
                'Motor':     { bg:'rgba(59,130,246,0.10)',  color:'#2563eb'  },
                'Non Motor': { bg:'rgba(16,185,129,0.10)', color:'#059669'  },
                'Life':      { bg:'rgba(139,92,246,0.10)', color:'#7c3aed'  },
              };

              // Dynamic categories from actual data
              const dialogCats = [...new Set(companies.map(c => c.category || '').filter(Boolean))].sort();

              const visible = companies.filter(c => {
                if (insurerCatTab !== 'all' && (c.category || '') !== insurerCatTab) return false;
                if (!insurerSearch) return true;
                const q = insurerSearch.toLowerCase();
                return [c.name, c.email].some(v => (v||'').toLowerCase().includes(q));
              });

              const isSelected = (c) => selectedCos.some(s => s.id === c.id);
              const toggle = (c) => setSelectedCos(prev =>
                isSelected(c) ? prev.filter(s => s.id !== c.id) : [...prev, c]
              );
              const selectAll = () => setSelectedCos(prev => [...prev, ...visible.filter(c => !isSelected(c))]);
              const clearAll  = () => setSelectedCos(prev => prev.filter(s => !visible.some(v => v.id === s.id)));

              return (
                <Box>
                  {/* Category tabs — auto-generated from actual data */}
                  <Stack direction="row" spacing={0.8} sx={{ mb:1.5, flexWrap:'wrap', gap:0.8 }}>
                    {['all', ...dialogCats].map(c => {
                      const cc  = c === 'all' ? { bg:'rgba(37,99,235,0.10)',color:'#2563EB' } : (CAT_COLORS[c] || { bg:'rgba(107,114,128,0.10)', color:'#6B7280' });
                      const cnt = c === 'all' ? companies.length : companies.filter(co => (co.category||'') === c).length;
                      return (
                        <Chip key={c} label={`${c === 'all' ? 'All' : c} (${cnt})`} size="small" clickable
                          onClick={() => setInsurerCatTab(c)}
                          sx={{ fontSize:11.5, fontWeight:700, height:26,
                            bgcolor: insurerCatTab===c ? cc.bg : 'transparent',
                            color:   insurerCatTab===c ? cc.color : '#9CA3AF',
                            border:  insurerCatTab===c ? `1.5px solid ${cc.color}` : '1.5px solid rgba(107,114,128,0.20)',
                          }} />
                      );
                    })}
                  </Stack>

                  {/* Search */}
                  <TextField size="small" fullWidth placeholder="Search by company or email…"
                    value={insurerSearch} onChange={e => setInsurerSearch(e.target.value)}
                    sx={{ mb:1.5, '& .MuiOutlinedInput-root': { borderRadius:'10px', fontSize:13 } }} />

                  {/* Select all / clear */}
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb:1, px:0.5 }}>
                    <Typography sx={{ fontSize:12, color:'#9CA3AF' }}>
                      {visible.length} shown · {selectedCos.length} selected
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" sx={{ fontSize:11, color:'#6366f1', p:0 }} onClick={selectAll}>Select all visible</Button>
                      {selectedCos.length > 0 && (
                        <Button size="small" sx={{ fontSize:11, color:'#9CA3AF', p:0 }} onClick={clearAll}>Clear visible</Button>
                      )}
                    </Stack>
                  </Stack>

                  {/* Company list */}
                  <Box sx={{ maxHeight:320, overflowY:'auto', border:'1px solid rgba(99,102,241,0.12)', borderRadius:'12px' }}>
                    {visible.length === 0 ? (
                      <Box sx={{ textAlign:'center', py:3 }}>
                        <Typography sx={{ fontSize:13, color:'#9CA3AF' }}>No companies match this filter.</Typography>
                      </Box>
                    ) : visible.map((co, i) => {
                      const sel = isSelected(co);
                      const cc  = CAT_COLORS[co.category] || { bg:'rgba(107,114,128,0.08)', color:'#6B7280' };
                      return (
                        <Box key={co.id} onClick={() => toggle(co)}
                          sx={{
                            display:'flex', alignItems:'center', gap:1.5,
                            px:2, py:1.2, cursor:'pointer',
                            bgcolor: sel ? 'rgba(37,99,235,0.04)' : i%2===0 ? '#fff' : 'rgba(239,246,255,0.5)',
                            borderBottom: i < visible.length-1 ? '1px solid rgba(99,102,241,0.06)' : 'none',
                            transition:'background 0.1s',
                            '&:hover': { bgcolor:'rgba(37,99,235,0.06)' },
                          }}>
                          <Checkbox size="small" checked={sel}
                            sx={{ p:0.3, color: sel ? '#2563EB' : '#D1D5DB', '&.Mui-checked':{ color:'#2563EB' } }} />
                          <Box sx={{ flex:1, minWidth:0 }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography sx={{ fontWeight:600, fontSize:13 }}>{co.name}</Typography>
                              {co.category && (
                                <Chip label={co.category} size="small"
                                  sx={{ fontSize:9.5, height:16, fontWeight:700, bgcolor:cc.bg, color:cc.color }} />
                              )}
                            </Stack>
                            <Typography sx={{ fontSize:11.5, color:'#9CA3AF', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {co.email}
                            </Typography>
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              );
            })()}
            {!EMAILJS_SERVICE && (
              <Alert severity="warning" sx={{ fontSize:12, mt:2 }}>
                EmailJS is not configured — quotes will be saved but emails won't be sent automatically.
              </Alert>
            )}
          </DialogContent>
          <DialogActions sx={{ px:3, py:2, borderTop:'1px solid rgba(99,102,241,0.10)' }}>
            <Button onClick={() => setSendOpen(false)} variant="outlined"
              sx={{ borderColor:'#e0e0e0', color:'#6B7280' }}>Cancel</Button>
            <Button variant="contained" startIcon={sending ? <CircularProgress size={14} color="inherit" /> : <SendIcon />}
              onClick={handleSendQuotes} disabled={sending || !selectedCos.length}>
              {sending ? 'Sending…' : `Send to ${selectedCos.length} insurer${selectedCos.length !== 1 ? 's' : ''}`}
            </Button>
          </DialogActions>
        </Dialog>

        {/* ── Validation errors dialog ── */}
        <Dialog open={valOpen} onClose={() => setValOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
            <WarningAmberRoundedIcon sx={{ color: '#f59e0b', fontSize: 22 }} />
            <span>Please fix these issues</span>
          </DialogTitle>
          <DialogContent>
            {valIssues.missing.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: 0.6, mb: 1 }}>
                  Required fields not filled
                </Typography>
                {valIssues.missing.map(label => (
                  <Box key={label} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.6 }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#ef4444', mt: 0.7, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 13 }}>{label}</Typography>
                  </Box>
                ))}
              </Box>
            )}
            {valIssues.invalid.length > 0 && (
              <Box>
                <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: 0.6, mb: 1 }}>
                  Invalid values
                </Typography>
                {valIssues.invalid.map(msg => (
                  <Box key={msg} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.6 }}>
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#d97706', mt: 0.7, flexShrink: 0 }} />
                    <Typography sx={{ fontSize: 13 }}>{msg}</Typography>
                  </Box>
                ))}
              </Box>
            )}
            <Typography sx={{ fontSize: 12, color: '#9CA3AF', mt: 2 }}>
              Fields with issues are highlighted in red on the form.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button variant="contained" onClick={() => setValOpen(false)}
              sx={{ background: 'linear-gradient(135deg,#3B82F6,#6366f1)', minWidth: 100 }}>
              OK, fix them
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ color: '#ef4444' }}>Delete Quote?</DialogTitle>
          <DialogContent>
            <Typography sx={{ fontSize: 13 }}>
              Are you sure you want to delete quote <strong>{deleteTarget?.reference}</strong>? This cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteTarget(null)} sx={{ color: '#6B7280' }}>Cancel</Button>
            <Button variant="contained" color="error" onClick={handleDeleteQuote} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar open={toast.open} autoHideDuration={5000} onClose={() => setToast(t => ({ ...t, open: false }))}>
          <Alert severity={toast.severity} variant="filled">{toast.msg}</Alert>
        </Snackbar>

        {/* ── Restore Quotations Dialog ── */}
        <Dialog open={restoreOpen} onClose={() => !restoreRunning && setRestoreOpen(false)} maxWidth="sm" fullWidth
          PaperProps={{ sx: { borderRadius: '16px' } }}>
          <DialogTitle sx={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 1 }}>
            <FileDownloadOutlinedIcon sx={{ color: '#6366f1' }} />
            Restore Quotations from Backup
            <Typography component="span" sx={{ fontSize: 12, color: '#9CA3AF', ml: 'auto', fontWeight: 400 }}>
              {restoreItems.filter(x => x.valid).length} valid · {restoreItems.filter(x => !x.valid).length} invalid
            </Typography>
          </DialogTitle>
          <DialogContent sx={{ pt: 1 }}>
            <Typography sx={{ fontSize: 13, color: '#6B7280', mb: 1 }}>
              Select <strong>QUOTATIONS_IMPORT.csv</strong> for bulk restore (all quotes in one file), or select individual <strong>quote_data.json</strong> files for full restore with responses. Existing quotes update; new ones are created.
            </Typography>
            {restoreItems.filter(x => x.valid).length > 0 && (
              <Box sx={{ p: 1.5, mb: 1.5, borderRadius: '8px', bgcolor: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#6366f1' }}>
                  {restoreItems.filter(x => x.valid).length} quotes ready to restore in one batch
                </Typography>
              </Box>
            )}
            <Stack spacing={0.8}>
              {restoreItems.map((item, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.2,
                                   bgcolor: item.valid ? 'rgba(99,102,241,0.04)' : 'rgba(239,68,68,0.04)',
                                   border: `1px solid ${item.valid ? 'rgba(99,102,241,0.15)' : 'rgba(239,68,68,0.15)'}`,
                                   borderRadius: '8px' }}>
                  {item.status === 'done'
                    ? <CheckCircleOutlineIcon sx={{ fontSize: 16, color: '#059669', flexShrink: 0 }} />
                    : item.status === 'error' || !item.valid
                    ? <span style={{ fontSize: 14, flexShrink: 0 }}>✗</span>
                    : <span style={{ fontSize: 14, flexShrink: 0 }}>📄</span>}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.valid ? item.data.reference : item.file.name}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: '#9CA3AF' }}>
                      {item.valid
                        ? `${item.data.product_key || ''} · ${item.data.client_name || ''} · ${(item.data.responses || []).length} responses`
                        : item.error}
                      {item.action && <span style={{ color: '#059669', marginLeft: 6 }}>✓ {item.action}</span>}
                      {item.status === 'error' && <span style={{ color: '#dc2626', marginLeft: 6 }}>Failed: {item.error}</span>}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <Button onClick={() => setRestoreOpen(false)} disabled={restoreRunning} variant="outlined"
              sx={{ borderColor: '#e0e0e0', color: '#6B7280', fontSize: 13 }}>
              {restoreDone ? 'Close' : 'Cancel'}
            </Button>
            {!restoreDone && (
              <Button variant="contained" onClick={runRestore}
                disabled={restoreRunning || restoreItems.filter(x => x.valid).length === 0}
                sx={{ fontSize: 13, background: 'linear-gradient(135deg,#6366f1,#818cf8)' }}>
                {restoreRunning ? 'Restoring…' : `Restore ${restoreItems.filter(x => x.valid).length} Quotes`}
              </Button>
            )}
          </DialogActions>
        </Dialog>

      </Box>
    </LocalizationProvider>
  );
};

export default QuotationsPage;
