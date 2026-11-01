// Shared Bancassurance UI: theme, DataGrid (filters / sort / paging / Excel + PDF export), KPI cards, chips, policy drill-down.
import React, { useState, useMemo, useEffect } from 'react';
import { saveAs } from 'file-saver';
import { openFile } from '../storage';
import { lkr, num, round2 } from './core';
import brandLogo from '../InsureSAAS Logo.png';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableSortLabel from '@mui/material/TableSortLabel';
import Pagination from '@mui/material/Pagination';
import InputAdornment from '@mui/material/InputAdornment';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import SearchIcon from '@mui/icons-material/Search';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import CloseIcon from '@mui/icons-material/Close';

export const T = {
  primary: '#255EAB', accent: '#38A3E0', dark: '#0A1A3E', red: '#1D4E96', bg: '#F5F9FD', line: 'rgba(37,94,171,0.14)',
  active: '#FFE066', green: '#059669', amber: '#B45309', danger: '#DC2626', muted: '#6B7280',
};
export const btnPrimary = { background: `linear-gradient(135deg,${T.primary},${T.accent})`, color: '#fff', fontWeight: 700, textTransform: 'none', borderRadius: '10px', '&:hover': { background: 'linear-gradient(135deg,#1D4E96,#2E8BC9)' }, '&.Mui-disabled': { background: '#E5E7EB', color: '#9CA3AF' } };
export const btnOutline = { textTransform: 'none', fontWeight: 700, borderRadius: '10px', borderColor: 'rgba(37,94,171,0.4)', color: T.primary };

const STATUS_COLORS = {
  Paid: T.green, 'Fully received': T.green, Renewed: T.green, Approved: T.green, Posted: T.green, Matched: T.green, Resolved: T.green, Payable: T.green, Settled: T.green, Closed: T.green, Passed: T.green, Done: T.green, Completed: T.green,
  'Part paid': T.amber, 'Partly received': T.amber, Pending: T.amber, Draft: T.amber, 'On statement (Draft)': T.amber, 'On statement (Pending)': T.amber, 'On statement (Approved)': '#2563EB', 'Reversal requested': T.amber, Open: T.amber, 'In progress': T.amber, Scheduled: '#2563EB',
  Unpaid: T.danger, Outstanding: T.danger, Expired: T.danger, Rejected: T.danger, Unmatched: T.danger, Clawback: T.danger, Overpaid: '#7C3AED', 'Over received': '#7C3AED', Reversed: T.muted, Failed: T.danger, Overdue: T.danger, Critical: T.danger,
};
export function StatusChip({ value }) {
  if (!value) return null;
  const c = STATUS_COLORS[value] || (String(value).startsWith('On statement') ? T.amber : T.muted);
  return <Chip size="small" label={value} sx={{ height: 21, fontSize: 10.5, fontWeight: 700, color: c, bgcolor: 'transparent', border: `1px solid ${c}` }} />;
}

export function Kpi({ label, value, sub, color, onClick }) {
  return (
    <Box onClick={onClick} sx={{ p: 1.6, flex: '1 1 170px', minWidth: 160, bgcolor: '#fff', borderRadius: '14px', border: `1px solid ${T.line}`, cursor: onClick ? 'pointer' : 'default', '&:hover': onClick ? { boxShadow: '0 4px 16px rgba(37,94,171,0.12)' } : {} }}>
      <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Typography>
      <Typography sx={{ fontSize: 19, fontWeight: 800, color: color || T.dark, mt: 0.3, lineHeight: 1.2 }}>{value}</Typography>
      {sub && <Typography sx={{ fontSize: 11, color: '#9CA3AF', mt: 0.2 }}>{sub}</Typography>}
    </Box>
  );
}

export const fmtCell = (v, type) => {
  if (v === null || v === undefined || v === '') return type === 'money' ? '—' : '';
  if (type === 'money') return lkr(v);
  if (type === 'pct') return `${round2(v)}%`;
  if (type === 'int') return Number(v).toLocaleString();
  return String(v);
};

/* ── Excel export: Summary + Detail sheets with working formulas ── */
const colLetter = (n) => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export async function exportExcel({ title, bankName, columns, rows, filtersText, groupKey, fileName }) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook(); wb.creator = 'InsureSAAS Insurance Brokers';
  const cols = columns.filter(c => !c.noExport);
  const sum = wb.addWorksheet('Summary');
  const det = wb.addWorksheet('Detail');
  det.addRow(cols.map(c => c.label)).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  det.getRow(1).eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1A3E' } }; });
  rows.forEach(r => det.addRow(cols.map(c => { const v = c.exportValue ? c.exportValue(r) : r[c.key]; return c.type === 'money' || c.type === 'int' || c.type === 'pct' ? (v === '' || v === null || v === undefined ? null : num(v)) : (v ?? ''); })));
  const last = rows.length + 1;
  const totalRow = det.addRow(cols.map((c, i) => (i === 0 ? 'TOTAL' : c.type === 'money' ? { formula: `SUBTOTAL(9,${colLetter(i)}2:${colLetter(i)}${last})` } : '')));
  totalRow.font = { bold: true };
  cols.forEach((c, i) => { det.getColumn(i + 1).width = Math.min(40, Math.max(12, (c.label || '').length + 4)); if (c.type === 'money') det.getColumn(i + 1).numFmt = '#,##0.00'; });
  det.views = [{ state: 'frozen', ySplit: 1 }];
  det.autoFilter = { from: 'A1', to: `${colLetter(cols.length - 1)}1` };

  sum.addRow([`InsureSAAS Banca — ${title}`]).font = { bold: true, size: 14 };
  sum.addRow(['InsureSAAS Insurance Brokers (Pvt) Ltd — Bancassurance']);
  sum.addRow(['Generated', new Date().toLocaleString('en-GB')]);
  sum.addRow(['Filters', filtersText || 'None']);
  sum.addRow(['Version', 'Live (not an approved report version)']);
  sum.addRow(['Rows', rows.length]);
  sum.addRow([]);
  const money = cols.map((c, i) => ({ c, i })).filter(x => x.c.type === 'money');
  const gi = groupKey ? cols.findIndex(c => c.key === groupKey) : -1;
  if (gi >= 0) {
    const hdr = sum.addRow([cols[gi].label, 'Count', ...money.map(m => m.c.label)]); hdr.font = { bold: true };
    const groups = [...new Set(rows.map(r => String(r[groupKey] ?? '')))].sort();
    const start = sum.rowCount + 1;
    groups.forEach(g => {
      const L = colLetter(gi);
      sum.addRow([g, { formula: `COUNTIF(Detail!${L}2:${L}${last},A${sum.rowCount + 1})` },
        ...money.map(m => ({ formula: `SUMIF(Detail!${L}2:${L}${last},A${sum.rowCount + 1},Detail!${colLetter(m.i)}2:${colLetter(m.i)}${last})` }))]);
    });
    const end = sum.rowCount;
    const t = sum.addRow(['Grand total', { formula: `SUM(B${start}:B${end})` }, ...money.map((m, k) => ({ formula: `SUM(${colLetter(k + 2)}${start}:${colLetter(k + 2)}${end})` }))]);
    t.font = { bold: true };
  } else {
    sum.addRow(['Measure', 'Total']).font = { bold: true };
    money.forEach(m => sum.addRow([m.c.label, { formula: `SUBTOTAL(9,Detail!${colLetter(m.i)}2:${colLetter(m.i)}${last})` }]));
  }
  sum.getColumn(1).width = 34; for (let i = 2; i < 3 + money.length; i++) { sum.getColumn(i).width = 18; sum.getColumn(i).numFmt = '#,##0.00'; }
  sum.getColumn(2).numFmt = '#,##0.##';
  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileName || title.replace(/\W+/g, '_')}.xlsx`);
}

/* ── PDF export with InsureSAAS branding ── */
const imgData = (src) => new Promise((res) => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); res({ data: c.toDataURL('image/png'), w: i.naturalWidth, h: i.naturalHeight }); }; i.onerror = () => res(null); i.src = src; });
export async function exportPdf({ title, bankName, columns, rows, filtersText, fileName, version }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const l1 = await imgData(brandLogo);
  pdf.setFillColor(10, 26, 62); pdf.rect(0, 0, W, 22, 'F');
  if (l1) pdf.addImage(l1.data, 'PNG', 8, 3, 16 * l1.w / l1.h, 16);
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(13); pdf.setFont('helvetica', 'bold');
  pdf.text('InsureSAAS Insurance Brokers', W / 2, 10, { align: 'center' });
  pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.text(`InsureSAAS Banca — ${title}`, W / 2, 16, { align: 'center' });
  pdf.setTextColor(80, 80, 80); pdf.setFontSize(8);
  pdf.text(`Generated ${new Date().toLocaleString('en-GB')}   ·   Version: ${version || 'Live'}   ·   Filters: ${filtersText || 'None'}`, 8, 28);
  const cols = columns.filter(c => !c.noExport && !c.noPdf).slice(0, 14);
  const totals = cols.map((c, i) => (i === 0 ? 'TOTAL' : c.type === 'money' ? lkr(rows.reduce((s, r) => s + num(c.exportValue ? c.exportValue(r) : r[c.key]), 0)) : ''));
  autoTable(pdf, {
    startY: 31, head: [cols.map(c => c.label)],
    body: rows.map(r => cols.map(c => fmtCell(c.exportValue ? c.exportValue(r) : r[c.key], c.type))),
    foot: [totals], showFoot: 'lastPage',
    styles: { fontSize: 7, cellPadding: 1.4 }, headStyles: { fillColor: [37, 94, 171], textColor: 255 }, footStyles: { fillColor: [10, 26, 62], textColor: 255, fontStyle: 'bold' },
    columnStyles: Object.fromEntries(cols.map((c, i) => [i, c.type === 'money' || c.type === 'int' ? { halign: 'right' } : {}])),
    didDrawPage: () => { pdf.setFontSize(7); pdf.setTextColor(150); pdf.text(`InsureSAAS Insurance Brokers (Pvt) Ltd · InsureSAAS Banca — Confidential   ·   Page ${pdf.internal.getNumberOfPages()}`, 8, pdf.internal.pageSize.getHeight() - 5); },
  });
  pdf.save(`${fileName || title.replace(/\W+/g, '_')}.pdf`);
}

/* ── DataGrid ── */
export function DataGrid({ title, rows, columns, filterKeys = ['branch', 'insurer', 'class'], dateKey, dateLabel = 'Date', chips, searchKeys,
  onRowClick, exportName, groupKey, defaultSort, toolbar, pageSize = 50, emptyText = 'No records', bankName = 'Bank', rowSx, dense = true, initialChip = 0, onExport }) {
  const [q, setQ] = useState('');
  const [ms, setMs] = useState({});
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [chip, setChip] = useState(initialChip);
  const [sort, setSort] = useState(defaultSort || null);
  const [page, setPage] = useState(1);
  const fKeys = useMemo(() => filterKeys.filter(k => rows.some(r => r[k] !== undefined)), [filterKeys, rows]);
  const options = useMemo(() => Object.fromEntries(fKeys.map(k => [k, [...new Set(rows.map(r => r[k]).filter(Boolean))].sort()])), [fKeys, rows]);
  const sKeys = searchKeys || columns.filter(c => !c.type || c.type === 'text').map(c => c.key);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = rows.filter(r =>
      (!s || sKeys.some(k => String(r[k] ?? '').toLowerCase().includes(s)))
      && fKeys.every(k => !(ms[k] && ms[k].length) || ms[k].includes(r[k]))
      && (!dateKey || ((!from || (r[dateKey] && r[dateKey] >= from)) && (!to || (r[dateKey] && r[dateKey] <= to))))
      && (!chips || !chips[chip] || chips[chip].test(r)));
    if (sort) {
      const col = columns.find(c => c.key === sort.key);
      const val = (r) => (col?.sortValue ? col.sortValue(r) : r[sort.key]);
      out = [...out].sort((a, b) => {
        const x = val(a), y = val(b);
        const c = (col && ['money', 'int', 'pct'].includes(col.type)) ? num(x) - num(y) : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
        return sort.dir === 'asc' ? c : -c;
      });
    }
    return out;
  }, [rows, q, ms, from, to, chip, chips, sort, columns, fKeys, sKeys, dateKey]);
  useEffect(() => { setPage(1); }, [q, ms, from, to, chip, rows.length]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages);
  const shown = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const totals = useMemo(() => Object.fromEntries(columns.filter(c => c.type === 'money').map(c => [c.key, round2(filtered.reduce((s, r) => s + num(c.exportValue ? c.exportValue(r) : r[c.key]), 0))])), [filtered, columns]);
  const filtersText = [q && `Search "${q}"`, ...fKeys.filter(k => ms[k]?.length).map(k => `${k}: ${ms[k].join(', ')}`), (from || to) && `${dateLabel} ${from || '…'} → ${to || '…'}`, chips && chips[chip] && chips[chip].label !== 'All' && chips[chip].label].filter(Boolean).join('; ');
  const exp = (kind) => { if (onExport) onExport(kind, filtered.length); return (kind === 'xlsx' ? exportExcel : exportPdf)({ title, bankName, columns, rows: filtered, filtersText, groupKey, fileName: exportName }); };

  return (
    <Box>
      <Box sx={{ p: 1.2, bgcolor: '#fff', border: `1px solid ${T.line}`, borderRadius: '12px 12px 0 0', borderBottom: 'none' }}>
        <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, mb: 0.8 }}>Filters to view</Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
          <TextField size="small" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} sx={{ width: 220 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 17, color: T.primary }} /></InputAdornment> }} />
          {fKeys.map(k => (
            <Autocomplete key={k} multiple size="small" options={options[k]} value={ms[k] || []} onChange={(_, v) => setMs(m => ({ ...m, [k]: v }))}
              limitTags={1} sx={{ minWidth: 170, maxWidth: 260 }} renderInput={(p) => <TextField {...p} label={k === 'class' ? 'Class' : k[0].toUpperCase() + k.slice(1)} />} />
          ))}
          {dateKey && <>
            <TextField size="small" type="date" label={`${dateLabel} from`} value={from} onChange={e => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 155 }} />
            <TextField size="small" type="date" label="to" value={to} onChange={e => setTo(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 155 }} />
          </>}
          <Box sx={{ flex: 1 }} />
          {toolbar}
          <Button size="small" startIcon={<FileDownloadOutlinedIcon />} onClick={() => exp('xlsx')} sx={{ textTransform: 'none' }}>Excel</Button>
          <Button size="small" startIcon={<PictureAsPdfOutlinedIcon />} onClick={() => exp('pdf')} sx={{ textTransform: 'none' }}>PDF</Button>
        </Stack>
        {chips && (
          <Stack direction="row" spacing={0.8} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
            {chips.map((c, i) => (
              <Chip key={c.label} label={`${c.label}${c.count !== undefined ? ` (${c.count})` : ` (${rows.filter(c.test).length})`}`} onClick={() => setChip(i)} size="small"
                sx={{ fontWeight: 700, bgcolor: chip === i ? T.dark : '#F3F4F6', color: chip === i ? '#fff' : '#374151' }} />
            ))}
          </Stack>
        )}
      </Box>
      <TableContainer sx={{ bgcolor: '#fff', border: `1px solid ${T.line}`, maxHeight: '64vh' }}>
        <Table size={dense ? 'small' : 'medium'} stickyHeader>
          <TableHead>
            {columns.some(c => c.group) && (
              <TableRow>
                {columns.reduce((acc, c) => { const g = c.group || ''; const last = acc[acc.length - 1]; if (last && last.g === g) last.n++; else acc.push({ g, n: 1 }); return acc; }, []).map((b, i) => (
                  <TableCell key={i} colSpan={b.n} align="center" sx={{ py: 0.4, fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', bgcolor: b.g ? T.dark : '#1E1E2E', color: '#fff', borderRight: '2px solid #fff' }}>{b.g}</TableCell>
                ))}
              </TableRow>
            )}
            <TableRow>
            {columns.map(c => (
              <TableCell key={c.key} align={['money', 'int', 'pct'].includes(c.type) ? 'right' : 'left'}
                sx={{ fontWeight: 800, fontSize: 11.5, bgcolor: '#1E1E2E', color: '#C8C8D8', whiteSpace: 'nowrap', minWidth: c.width, top: columns.some(x => x.group) ? 27 : 0 }}>
                {c.noSort ? c.label : (
                  <TableSortLabel active={sort?.key === c.key} direction={sort?.key === c.key ? sort.dir : 'asc'}
                    onClick={() => setSort(s => ({ key: c.key, dir: s?.key === c.key && s.dir === 'asc' ? 'desc' : 'asc' }))}>{c.label}</TableSortLabel>
                )}
              </TableCell>
            ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length} sx={{ textAlign: 'center', py: 5, color: '#9CA3AF' }}>{emptyText}</TableCell></TableRow>
            ) : shown.map((r, i) => (
              <TableRow key={r.id || i} hover onClick={onRowClick ? () => onRowClick(r) : undefined} sx={{ cursor: onRowClick ? 'pointer' : 'default', ...(rowSx ? rowSx(r) : {}) }}>
                {columns.map(c => (
                  <TableCell key={c.key} align={['money', 'int', 'pct'].includes(c.type) ? 'right' : 'left'}
                    sx={{ fontSize: 12, whiteSpace: c.wrap ? 'normal' : 'nowrap', color: c.type === 'money' && num(r[c.key]) < 0 ? T.danger : undefined }}>
                    {c.render ? c.render(r) : fmtCell(r[c.key], c.type)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {shown.length > 0 && Object.keys(totals).length > 0 && (
              <TableRow sx={{ '& td': { fontWeight: 800, bgcolor: '#F5F9FD', position: 'sticky', bottom: 0 } }}>
                {columns.map((c, i) => <TableCell key={c.key} align={c.type === 'money' ? 'right' : 'left'} sx={{ fontSize: 12 }}>{i === 0 ? `Total (${filtered.length})` : c.type === 'money' ? lkr(totals[c.key]) : ''}</TableCell>)}
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1, bgcolor: '#fff', border: `1px solid ${T.line}`, borderTop: 'none', borderRadius: '0 0 12px 12px' }}>
        <Typography sx={{ fontSize: 11.5, color: T.muted }}>{filtered.length ? `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)} of ${filtered.length}` : '0 records'}{filtered.length !== rows.length ? ` (filtered from ${rows.length})` : ''}</Typography>
        {pages > 1 && <Pagination size="small" count={pages} page={safePage} onChange={(_, v) => setPage(v)} />}
      </Stack>
    </Box>
  );
}

/* ── policy drill-down (read-only; corrections go through reversal) ── */
export function PolicyDrawer({ policy, model, batches, files, onClose, onOpenPolicy }) {
  if (!policy) return null;
  const p = policy;
  const batchName = (id) => { const b = (batches || []).find(x => x.id === id); return b ? `${b.file_name || id} (${b.status})` : id; };
  const fileFor = (bid) => (files || []).find(f => (f.batch_ids || []).includes(bid));
  const Field = ({ k, v }) => (<Box sx={{ minWidth: 150, mb: 1 }}><Typography sx={{ fontSize: 10.5, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase' }}>{k}</Typography><Typography sx={{ fontSize: 13, fontWeight: 600 }}>{v === '' || v === null || v === undefined ? '—' : v}</Typography></Box>);
  const Src = ({ bid }) => { const f = fileFor(bid); return <>{batchName(bid)}{f && <Button size="small" onClick={() => openFile(f.url)} sx={{ textTransform: 'none', fontSize: 11, ml: 0.5, py: 0 }}>source doc</Button>}</>; };
  const prev = p.renewal_of && model.byId.get(p.renewal_of); const next = p.renewed_by && model.byId.get(p.renewed_by);
  return (
    <Drawer anchor="right" open={!!policy} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', md: 760 } } }}>
      <Box sx={{ p: 2.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box><Typography sx={{ fontSize: 18, fontWeight: 800 }}>{p.policy_no} · {p.customer}</Typography>
            <Typography sx={{ fontSize: 12, color: T.muted }}>Policy period {p.id} · {p.insurer} · {p.branch || '—'} · {p.class || '—'}</Typography></Box>
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Stack>
        <Stack direction="row" spacing={0.8} sx={{ my: 1.2 }} useFlexGap flexWrap="wrap">
          <StatusChip value={p.pay_status} /><StatusChip value={p.comm_status} /><StatusChip value={p.pmf_status} /><StatusChip value={p.renewal_status} />
        </Stack>
        <Stack direction="row" flexWrap="wrap" columnGap={2}>
          <Field k="Inception" v={p.inception} /><Field k="Expiry" v={p.expiry} /><Field k="Sum insured" v={p.sum_insured ? lkr(p.sum_insured) : ''} />
          <Field k="Address" v={p.address} /><Field k="Telephone" v={p.telephone} />
          <Field k="Facility No" v={p.facility_no} /><Field k="Vehicle Reg No" v={p.vehicle_no} /><Field k="Pay Type" v={p.pay_type} />
        </Stack>
        {p.custom && Object.keys(p.custom).length > 0 && (
          <Stack direction="row" flexWrap="wrap" columnGap={2}>
            {Object.entries(p.custom).map(([k, v]) => { const f = ((model.config?.custom_fields || {}).policy || []).find(x => x.key === k); return <Field key={k} k={(f ? f.label : k) + (f && f.removed ? ' (removed field)' : '')} v={typeof v === 'number' ? v.toLocaleString() : v} />; })}
          </Stack>
        )}
        <Divider sx={{ my: 1 }} />
        <Stack direction="row" flexWrap="wrap" columnGap={2}>
          <Field k="Net basic" v={lkr(p.net_basic)} /><Field k="Net SRCC" v={lkr(p.net_srcc)} /><Field k="Net TC" v={lkr(p.net_tc)} /><Field k="Net total premium" v={lkr(p.net_total)} />
          <Field k="Premium received" v={lkr(p.paid)} /><Field k="Outstanding" v={lkr(p.outstanding)} /><Field k="Age (from commencement)" v={p.age_days !== null ? `${p.age_days} days (${p.age_bucket})` : ''} />
          <Field k="Commission expected" v={lkr(p.exp_comm)} /><Field k="Commission received" v={lkr(p.comm_received)} /><Field k="Commission balance" v={lkr(p.comm_balance)} />
          <Field k="Bank allocation" v={lkr(p.pmf_alloc)} /><Field k="Bank paid" v={lkr(p.pmf_paid)} /><Field k="InsureSAAS share" v={lkr(p.broker_share)} />
        </Stack>
        {(prev || next) && <Typography sx={{ fontSize: 12, mt: 1 }}>
          {prev && <>Renewal of <Button size="small" onClick={() => onOpenPolicy(prev)} sx={{ textTransform: 'none' }}>{prev.policy_no} ({prev.inception} → {prev.expiry})</Button></>}
          {next && <>Renewed by <Button size="small" onClick={() => onOpenPolicy(next)} sx={{ textTransform: 'none' }}>{next.policy_no} ({next.inception} → {next.expiry})</Button></>}
        </Typography>}
        {[
          ['Transactions', p.txns, ['type', 'effective_date', 'gwp_month', 'basic', 'srcc', 'tc', 'total', 'gross_premium', 'comm_total', 'remarks', 'batch_id'], ['Type', 'Effective', 'GWP month', 'Basic', 'SRCC', 'TC', 'Total', 'Incl. taxes', 'Exp. comm', 'Remarks', 'Source batch']],
          ['Premium receipts', p.receipts, ['date', 'type', 'alloc_amount', 'reference', 'batch_id'], ['Date', 'Type', 'Amount', 'Reference', 'Source batch']],
          ['Commission receipts', p.comms, ['date', 'amount', 'component', 'reference', 'batch_id'], ['Date', 'Amount', 'Component', 'Reference', 'Source batch']],
          ['Claims', p.claims, ['claim_ref', 'status', 'estimate', 'paid', 'outstanding_claim'], ['Claim', 'Status', 'Estimate', 'Paid', 'Outstanding']],
        ].map(([t, list, keys, labels]) => (
          <Box key={t} sx={{ mt: 2 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 800, color: T.primary, textTransform: 'uppercase', letterSpacing: 0.8, mb: 0.5 }}>{t} ({list.length})</Typography>
            {list.length > 0 && <Table size="small"><TableHead><TableRow>{labels.map(l => <TableCell key={l} sx={{ fontSize: 11, fontWeight: 700 }}>{l}</TableCell>)}</TableRow></TableHead>
              <TableBody>{[...list].sort((a, b) => String(a.date || a.effective_date || '').localeCompare(String(b.date || b.effective_date || ''))).map((x, i) => (
                <TableRow key={x.id || i}>{keys.map(k => <TableCell key={k} sx={{ fontSize: 11.5 }}>{k === 'batch_id' ? <Src bid={x.batch_id} /> : ['basic', 'srcc', 'tc', 'total', 'comm_total', 'alloc_amount', 'amount', 'estimate', 'paid', 'outstanding_claim'].includes(k) ? lkr(x[k]) : k === 'gross_premium' ? (x[k] === undefined ? '' : lkr(x[k])) : (x[k] ?? '')}</TableCell>)}</TableRow>
              ))}</TableBody></Table>}
          </Box>
        ))}
        <Typography sx={{ fontSize: 11, color: '#9CA3AF', mt: 2 }}>Read-only. Corrections are made by reversing the source batch (Batch History) and posting a corrected file.</Typography>
      </Box>
    </Drawer>
  );
}

export function SectionTitle({ children, sub, right }) {
  return (
    <Stack direction="row" alignItems="flex-end" justifyContent="space-between" sx={{ mb: 1.5 }}>
      <Box>
        <Typography sx={{ fontSize: 20, fontWeight: 800, color: T.dark }}>{children}</Typography>
        {sub && <Typography sx={{ fontSize: 12.5, color: T.muted }}>{sub}</Typography>}
      </Box>
      {right}
    </Stack>
  );
}
