// Upload Fields — rename or remove template columns and add custom fields, per upload type.
// Changes flow to: the downloadable template, upload validation, stored records (custom values),
// every register / tracker grid, the policy drill-down and Excel / PDF exports.
// Nothing posted is ever deleted: a removed field is hidden; its values stay on the records.
import React, { useEffect, useMemo, useState } from 'react';
import { saveAs } from 'file-saver';
import { useBanca, saveConfig } from '../store';
import { TEMPLATES, RECORD_OF, RECORD_LABEL, CUSTOM_TYPES, isLocked, effectiveTemplate, templateWorkbook, columnOrder } from '../templates';
import { SectionTitle, T, btnPrimary, btnOutline } from '../ui';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Switch from '@mui/material/Switch';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RestoreIcon from '@mui/icons-material/Restore';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';

const REGISTERS = ['master', 'gwp', 'renewals', 'payments', 'commission', 'claims', 'targets'];
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
const clone = (o) => JSON.parse(JSON.stringify(o || {}));

export function UploadFields() {
  const ctx = useBanca();
  const { config, me, reload, bank } = ctx;
  const isAdmin = me.role === 'admin';
  const [reg, setReg] = useState('master');
  const [fields, setFields] = useState(clone(config.fields));
  const [custom, setCustom] = useState(clone(config.custom_fields));
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { setFields(clone(config.fields)); setCustom(clone(config.custom_fields)); }, [config]);
  const dirty = JSON.stringify(fields) !== JSON.stringify(config.fields || {}) || JSON.stringify(custom) !== JSON.stringify(config.custom_fields || {});

  const fc = fields[reg] || { hidden: [], labels: {} };
  const setFc = (next) => setFields(f => ({ ...f, [reg]: { hidden: next.hidden || [], labels: next.labels || {}, ...(next.order && next.order.length ? { order: next.order } : {}) } }));
  // column order: drag a row by its handle (or use the arrows); templates, uploads and register grids follow it
  const order = useMemo(() => columnOrder(reg, { fields, custom_fields: custom }), [reg, fields, custom]);
  const [armed, setArmed] = useState(null); const [drag, setDrag] = useState(null); const [over, setOver] = useState(null);
  const move = (from, to) => {
    if (from === to || to < 0 || to >= order.length) return;
    const next = [...order]; const [k] = next.splice(from, 1); next.splice(to, 0, k); setFc({ ...fc, order: next });
  };
  const endDrag = () => { setArmed(null); setDrag(null); setOver(null); };
  // releasing the handle anywhere without dragging disarms the row (so text in its name box can still be selected)
  useEffect(() => { const up = () => setArmed(null); window.addEventListener('mouseup', up); return () => window.removeEventListener('mouseup', up); }, []);
  const rec = RECORD_OF[reg];
  const recFields = (rec && custom[rec]) || [];
  const setRecFields = (list) => setCustom(c => ({ ...c, [rec]: list }));
  const preview = useMemo(() => effectiveTemplate(reg, { fields, custom_fields: custom }), [reg, fields, custom]);

  // checks before saving: no blank / duplicate headers, dropdowns have options
  const problems = useMemo(() => {
    const out = [];
    for (const r of REGISTERS) {
      const cols = effectiveTemplate(r, { fields, custom_fields: custom }).cols;
      const seen = new Map();
      cols.forEach(c => { const h = c.header.trim().toLowerCase(); if (!h) out.push(`${TEMPLATES[r].label}: a column has no name`); else if (seen.has(h)) out.push(`${TEMPLATES[r].label}: two columns are called "${c.header}"`); seen.set(h, 1); });
    }
    for (const [rk, list] of Object.entries(custom)) (list || []).filter(f => !f.removed).forEach(f => {
      if (!String(f.label || '').trim()) out.push(`${RECORD_LABEL[rk]}: a custom field has no name`);
      if (f.type === 'select' && !(f.options || []).length) out.push(`${RECORD_LABEL[rk]}: dropdown "${f.label}" needs at least one option`);
    });
    return [...new Set(out)];
  }, [fields, custom]);

  const addField = () => {
    const existing = new Set(recFields.map(f => f.key));
    let base = 'field', n = recFields.length + 1, key = `${base}_${n}`;
    while (existing.has(key)) key = `${base}_${++n}`;
    setRecFields([...recFields, { key, label: '', type: 'text', options: [], required: false, created_at: new Date().toISOString(), created_by: me.name }]);
  };
  const setField = (i, patch) => setRecFields(recFields.map((f, j) => {
    if (j !== i) return f;
    const next = { ...f, ...patch };
    // a new field's storage key follows its first name; once saved the key never changes (records stay linked)
    if (patch.label !== undefined && !(config.custom_fields?.[rec] || []).some(x => x.key === f.key)) {
      const k = slug(patch.label) || f.key; const taken = recFields.some((x, m) => m !== i && x.key === k);
      next.key = taken ? `${k}_${i + 1}` : k;
    }
    return next;
  }));

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await saveConfig(ctx, { fields, custom_fields: custom }, 'Upload fields changed');
      setMsg({ s: 'success', t: 'Saved. Templates, uploads, registers and exports now use these fields.' }); reload();
    } catch (e) { setMsg({ s: 'error', t: e.message }); }
    setBusy(false);
  };
  const download = async () => { const buf = await templateWorkbook(reg, bank.name, { ...config, fields, custom_fields: custom }); saveAs(new Blob([buf]), `${bank.name}_${reg}_template_v1.xlsx`); };

  return (<>
    <SectionTitle sub="Rename or remove columns and add your own fields for each upload. Changes flow to the template download, upload checks, the registers and trackers, the policy drill-down and exports. Removing a field only hides it — values already uploaded are kept."
      right={isAdmin && <Stack direction="row" spacing={1}>
        {dirty && <Button onClick={() => { setFields(clone(config.fields)); setCustom(clone(config.custom_fields)); }} sx={{ textTransform: 'none' }}>Discard</Button>}
        <Button sx={btnPrimary} disabled={!dirty || busy || problems.length > 0} onClick={save}>{busy ? 'Saving…' : 'Save fields'}</Button>
      </Stack>}>Upload Fields</SectionTitle>
    {!isAdmin && <Alert severity="info" sx={{ mb: 1.5 }}>View only — an administrator changes upload fields.</Alert>}
    {msg && <Alert severity={msg.s} sx={{ mb: 1.5 }}>{msg.t}</Alert>}
    {problems.map(p => <Alert key={p} severity="warning" sx={{ mb: 0.8, py: 0 }}>{p}</Alert>)}

    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
      {REGISTERS.map(r => <Chip key={r} label={TEMPLATES[r].label} onClick={() => setReg(r)}
        sx={{ fontWeight: 700, bgcolor: reg === r ? T.dark : '#fff', color: reg === r ? '#fff' : T.dark, border: `1px solid ${reg === r ? T.dark : T.line}` }} />)}
    </Stack>

    <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: '16px', border: `1px solid ${T.line}`, mb: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: 15 }}>Standard columns — {TEMPLATES[reg].label}</Typography>
          <Typography sx={{ fontSize: 12, color: T.muted }}>{preview.cols.length} columns in the template. Drag a row by its handle to change the column order — the template, uploads and register grids follow it. Locked columns drive calculations and matching: they can be renamed, not removed. Files using the original names still upload.</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          {isAdmin && fc.order && <Button size="small" onClick={() => setFc({ ...fc, order: [] })} sx={{ textTransform: 'none' }}>Reset order</Button>}
          <Button size="small" startIcon={<FileDownloadOutlinedIcon />} variant="outlined" sx={btnOutline} onClick={download}>Preview template</Button>
        </Stack>
      </Stack>
      <Table size="small">
        <TableHead><TableRow>{['', 'In template', 'Column name', 'Original name', 'Type', ''].map((h, i) => <TableCell key={i} sx={{ fontWeight: 800, fontSize: 12 }}>{h}</TableCell>)}</TableRow></TableHead>
        <TableBody>{order.map((key, idx) => {
          const handle = isAdmin && (
            <TableCell sx={{ width: 76, px: 0.5, whiteSpace: 'nowrap' }}>
              <Tooltip title="Drag to reorder"><DragIndicatorIcon data-testid={`drag-${key}`} onMouseDown={() => setArmed(key)} sx={{ fontSize: 20, color: T.muted, cursor: 'grab', verticalAlign: 'middle' }} /></Tooltip>
              <IconButton size="small" aria-label={`Move ${key} up`} disabled={idx === 0} onClick={() => move(idx, idx - 1)} sx={{ p: 0.2 }}><KeyboardArrowUpIcon sx={{ fontSize: 18 }} /></IconButton>
              <IconButton size="small" aria-label={`Move ${key} down`} disabled={idx === order.length - 1} onClick={() => move(idx, idx + 1)} sx={{ p: 0.2 }}><KeyboardArrowDownIcon sx={{ fontSize: 18 }} /></IconButton>
            </TableCell>);
          const dnd = {
            draggable: armed === key,
            onDragStart: (e) => { setDrag(idx); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', key); },
            onDragOver: (e) => { if (drag === null) return; e.preventDefault(); if (over !== idx) setOver(idx); },
            onDrop: (e) => { e.preventDefault(); if (drag !== null) move(drag, idx); endDrag(); },
            onDragEnd: endDrag,
          };
          const dropLine = drag !== null && over === idx && drag !== idx ? { boxShadow: `inset 0 ${drag < idx ? -3 : 3}px 0 ${T.primary}` } : {};
          if (key.startsWith('cf:')) {
            const f = recFields.find(x => x.key === key.slice(3)) || { label: key.slice(3), type: 'text' };
            return (
              <TableRow key={key} data-testid={`row-${key}`} {...dnd} sx={{ bgcolor: drag === idx ? '#EEF5FC' : undefined, ...dropLine }}>
                {handle || <TableCell sx={{ width: 0, p: 0 }} />}
                <TableCell sx={{ width: 90 }}><Chip size="small" label="custom" sx={{ height: 20, fontSize: 10.5, fontWeight: 700 }} /></TableCell>
                <TableCell sx={{ fontSize: 14, fontWeight: 600 }}>{f.label || '(unnamed)'}<Typography component="span" sx={{ fontSize: 11, color: T.muted, ml: 1 }}>edit in Custom fields below</Typography></TableCell>
                <TableCell sx={{ fontSize: 12, color: T.muted }}>Custom field{f.required && <Chip size="small" label="required" sx={{ ml: 0.8, height: 18, fontSize: 10 }} />}</TableCell>
                <TableCell sx={{ fontSize: 12, color: T.muted }}>{f.type === 'select' ? (f.options || []).join(' / ') : (CUSTOM_TYPES.find(([v]) => v === f.type) || [null, 'Text'])[1]}</TableCell>
                <TableCell />
              </TableRow>
            );
          }
          const c = TEMPLATES[reg].cols.find(x => x.key === key);
          const locked = isLocked(reg, c.key); const on = locked || !(fc.hidden || []).includes(c.key);
          return (
            <TableRow key={c.key} data-testid={`row-${c.key}`} {...dnd} sx={{ opacity: on ? 1 : 0.5, bgcolor: drag === idx ? '#EEF5FC' : undefined, ...dropLine }}>
              {handle || <TableCell sx={{ width: 0, p: 0 }} />}
              <TableCell sx={{ width: 90 }}>{locked ? <Tooltip title="Required for calculations"><LockOutlinedIcon sx={{ fontSize: 18, color: T.muted, ml: 1 }} /></Tooltip>
                : <Switch size="small" checked={on} disabled={!isAdmin} onChange={e => setFc({ ...fc, hidden: e.target.checked ? (fc.hidden || []).filter(k => k !== c.key) : [...(fc.hidden || []), c.key] })} />}</TableCell>
              <TableCell><TextField size="small" fullWidth value={(fc.labels || {})[c.key] ?? c.header} disabled={!isAdmin || !on}
                onChange={e => setFc({ ...fc, labels: { ...(fc.labels || {}), [c.key]: e.target.value } })} /></TableCell>
              <TableCell sx={{ fontSize: 12, color: T.muted }}>{c.header}{c.required && <Chip size="small" label="required" sx={{ ml: 0.8, height: 18, fontSize: 10 }} />}</TableCell>
              <TableCell sx={{ fontSize: 12, color: T.muted }}>{c.type === 'enum' ? (c.options || []).join(' / ') : c.type === 'date' ? 'Date' : c.type === 'money' ? 'Amount' : 'Text'}</TableCell>
              <TableCell sx={{ width: 40 }}>{(fc.labels || {})[c.key] !== undefined && (fc.labels || {})[c.key] !== c.header && isAdmin &&
                <Tooltip title="Back to the original name"><IconButton size="small" onClick={() => { const l = { ...(fc.labels || {}) }; delete l[c.key]; setFc({ ...fc, labels: l }); }}><RestoreIcon fontSize="small" /></IconButton></Tooltip>}</TableCell>
            </TableRow>
          );
        })}</TableBody>
      </Table>
    </Box>

    {rec ? (
      <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: '16px', border: `1px solid ${T.line}` }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 15 }}>Custom fields — {RECORD_LABEL[rec]}</Typography>
            <Typography sx={{ fontSize: 12, color: T.muted }}>Added as template columns and as columns in the matching registers and trackers. A required field rejects rows left blank{rec === 'policy' ? ' (new business and renewals only)' : ''}.</Typography>
          </Box>
          {isAdmin && <Button size="small" startIcon={<AddIcon />} sx={btnPrimary} onClick={addField}>Add field</Button>}
        </Stack>
        {recFields.length === 0 && <Typography sx={{ fontSize: 13, color: T.muted, py: 2 }}>No custom fields yet.</Typography>}
        {recFields.map((f, i) => (
          <Stack key={f.key + i} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}
            sx={{ p: 1.2, mb: 1, borderRadius: '12px', bgcolor: f.removed ? '#F3F4F6' : '#FBFDFF', border: `1px solid ${T.line}`, opacity: f.removed ? 0.6 : 1 }}>
            <TextField size="small" label="Field name" value={f.label} disabled={!isAdmin || f.removed} onChange={e => setField(i, { label: e.target.value })} sx={{ flex: 2 }} />
            <TextField size="small" select label="Type" value={f.type} disabled={!isAdmin || f.removed} onChange={e => setField(i, { type: e.target.value })} sx={{ minWidth: 150 }}>
              {CUSTOM_TYPES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
            </TextField>
            {f.type === 'select' && <TextField size="small" label="Options (comma separated)" value={(f.options || []).join(', ')} disabled={!isAdmin || f.removed}
              onChange={e => setField(i, { options: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })} sx={{ flex: 2 }} />}
            <Stack direction="row" alignItems="center"><Switch size="small" checked={!!f.required} disabled={!isAdmin || f.removed} onChange={e => setField(i, { required: e.target.checked })} /><Typography sx={{ fontSize: 12 }}>Required</Typography></Stack>
            <Typography sx={{ fontSize: 11, color: T.muted, minWidth: 110 }}>key: {f.key}</Typography>
            {isAdmin && (f.removed
              ? <Tooltip title="Bring the field back (its old values reappear)"><IconButton size="small" onClick={() => setField(i, { removed: false })}><RestoreIcon fontSize="small" /></IconButton></Tooltip>
              : (config.custom_fields?.[rec] || []).some(x => x.key === f.key)
                ? <Tooltip title="Remove from templates and grids — values already uploaded are kept"><IconButton size="small" onClick={() => setField(i, { removed: true, removed_at: new Date().toISOString(), removed_by: me.name })}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                : <Tooltip title="Discard this unsaved field"><IconButton size="small" onClick={() => setRecFields(recFields.filter((_, j) => j !== i))}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>)}
          </Stack>
        ))}
      </Box>
    ) : <Alert severity="info">GWP Targets has no custom fields.</Alert>}
  </>);
}
