import React, { useState, useRef } from 'react';
import { uploadFile, openFile } from '../storage';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import LinearProgress from '@mui/material/LinearProgress';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';

// Accepted for "other" documents — common office + image formats.
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.csv,.txt';
const MAX_MB = 20;

/** Normalise whatever is stored (array, JSON string, nothing) into a clean list. */
export function readOtherDocs(v) {
  let arr = v;
  if (typeof v === 'string') { try { arr = JSON.parse(v); } catch { arr = []; } }
  return Array.isArray(arr) ? arr.filter(d => d && typeof d.url === 'string' && /^https?:\/\//.test(d.url)) : [];
}

/**
 * "Other documents" — any number of extra files, each with its own name, on top of
 * the fixed document slots. Files upload as soon as they're picked; the parent only
 * stores the resulting list ([{ id, label, url, file_name, uploaded_at, uploaded_by }]).
 */
export default function OtherDocuments({ value, onChange, folder, uploadedBy = '', disabled = false, title = 'Other Documents' }) {
  const docs = readOtherDocs(value);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState('');
  const inputRef = useRef(null);

  const pick = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setErr('');
    const tooBig = files.find(f => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) { setErr(`"${tooBig.name}" is larger than ${MAX_MB} MB.`); return; }
    setBusy(true);
    const added = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const base = label.trim() || f.name.replace(/\.[^.]+$/, '');
        const name = files.length > 1 && label.trim() ? `${base} (${i + 1})` : base;
        setPct(0);
        const url = await uploadFile(f, folder, p => setPct(p), name);
        added.push({ id: `${Date.now()}_${i}`, label: name.slice(0, 120), url, file_name: f.name, uploaded_at: new Date().toISOString(), uploaded_by: uploadedBy });
      }
      onChange([...docs, ...added]);
      setLabel('');
    } catch (e) {
      if (added.length) onChange([...docs, ...added]);
      setErr(e?.message?.includes('retry') ? 'Network issue — please try again.' : 'Upload failed — please try again.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = (id) => {
    const d = docs.find(x => x.id === id);
    if (d && !window.confirm(`Remove "${d.label}" from this record?`)) return;
    onChange(docs.filter(x => x.id !== id));
  };
  const rename = (id, v) => onChange(docs.map(x => (x.id === id ? { ...x, label: v.slice(0, 120) } : x)));

  return (
    <Box sx={{ gridColumn: '1 / -1', mt: 1 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#374151', mb: 1 }}>
        {title} {docs.length > 0 && <Box component="span" sx={{ color: '#9CA3AF', fontWeight: 600 }}>({docs.length})</Box>}
      </Typography>
      {docs.map(d => (
        <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, mb: 0.8, borderRadius: '10px', border: '1px solid rgba(16,185,129,0.3)', bgcolor: 'rgba(16,185,129,0.04)' }}>
          <DescriptionOutlinedIcon sx={{ color: '#10B981', fontSize: 20, flexShrink: 0 }} />
          <TextField variant="standard" value={d.label} onChange={e => rename(d.id, e.target.value)} disabled={disabled}
            InputProps={{ disableUnderline: true, sx: { fontSize: 12.5, fontWeight: 600 } }} sx={{ flex: 1, minWidth: 0 }} />
          <Typography sx={{ fontSize: 10.5, color: '#9CA3AF', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: { xs: 'none', sm: 'block' } }}>{d.file_name}</Typography>
          <Button size="small" onClick={() => openFile(d.url)} sx={{ textTransform: 'none', fontSize: 11.5, minWidth: 0, color: '#10B981', fontWeight: 700 }}>View</Button>
          {!disabled && <Tooltip title="Remove"><IconButton size="small" onClick={() => remove(d.id)}><CloseIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>}
        </Box>
      ))}
      {!disabled && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField size="small" placeholder="Document name (e.g. Valuation report)" value={label} onChange={e => setLabel(e.target.value)}
            disabled={busy} sx={{ flex: 1, minWidth: 220, '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
          <Button variant="outlined" startIcon={<AddIcon />} disabled={busy} onClick={() => inputRef.current?.click()}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: '10px', borderColor: 'rgba(37,94,171,0.45)', color: '#255EAB' }}>
            {busy ? 'Uploading…' : 'Add document'}
          </Button>
          <input ref={inputRef} type="file" hidden multiple accept={ACCEPT} onChange={e => pick(e.target.files)} />
        </Box>
      )}
      {busy && <LinearProgress variant="determinate" value={pct} sx={{ mt: 0.8, height: 3, borderRadius: 2 }} />}
      {err && <Typography sx={{ fontSize: 11.5, color: '#DC2626', mt: 0.5 }}>{err}</Typography>}
      {!disabled && !busy && <Typography sx={{ fontSize: 10.5, color: '#9CA3AF', mt: 0.5 }}>Name it, then add one or more files (PDF, images, Word, Excel — max {MAX_MB} MB each).</Typography>}
    </Box>
  );
}

/** Read-only list for detail views. */
export function OtherDocumentsList({ value, emptyText = null }) {
  const docs = readOtherDocs(value);
  if (!docs.length) return emptyText;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
      {docs.map(d => (
        <Box key={d.id || d.url} onClick={() => openFile(d.url)}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.1, borderRadius: '10px', cursor: 'pointer', border: '1px solid rgba(16,185,129,0.3)', bgcolor: 'rgba(16,185,129,0.04)', '&:hover': { bgcolor: 'rgba(16,185,129,0.09)' } }}>
          <DescriptionOutlinedIcon sx={{ color: '#10B981', fontSize: 18 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</Typography>
            {d.file_name && <Typography sx={{ fontSize: 10.5, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.file_name}</Typography>}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
