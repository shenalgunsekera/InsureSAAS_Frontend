import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { structureRate } from '../utils/commissionStructures';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import Paper from '@mui/material/Paper';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Skeleton from '@mui/material/Skeleton';
import Pagination from '@mui/material/Pagination';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';

const COMPANY = 'InsureSAAS Insurance Brokers (Pvt) Ltd';

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.ceil((d - new Date()) / 86400000);
}

function daysText(days) {
  if (days === null || days === undefined) return '—';
  if (days < 0) return `Expired ${Math.abs(days)}d ago`;
  return `${days}d left`;
}

const EXPORT_COLS = [
  { label: 'Client Name',  get: c => c.client_name || '' },
  { label: 'Policy No',    get: c => c.policy_no || '' },
  { label: 'Product',      get: c => c.product || '' },
  { label: 'Insurer',      get: c => c.insurance_provider || '' },
  { label: 'Expiry Date',  get: c => c.policy_period_to || '' },
  { label: 'Days Left',    get: c => daysText(c.daysLeft) },
  { label: 'Net Premium',  get: c => (c.net_premium ? Number(c.net_premium) : ''), num: true },
];

function exportRenewalsCSV(rows, title) {
  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [
    q('Renewals — ' + title),
    `${q(COMPANY)},${q(dateStr)}`,
    `${q('Total records')},${rows.length}`,
    '',
    EXPORT_COLS.map(c => q(c.label)).join(','),
  ];
  rows.forEach(r => {
    lines.push(EXPORT_COLS.map(c => {
      const v = c.get(r);
      if (c.num) return v === '' ? '' : Number(v).toFixed(2);
      return q(v);
    }).join(','));
  });
  const BOM = '﻿';
  const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `Renewals_${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
}

function exportRenewalsPDF(rows, title) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const dateStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  pdf.setFillColor(37, 94, 171); pdf.rect(0, 0, pageW, 26, 'F');
  pdf.setFillColor(10, 26, 62);  pdf.rect(0, 26, pageW, 10, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(15); pdf.setFont('helvetica', 'bold');
  pdf.text(COMPANY, pageW / 2, 11, { align: 'center' });
  pdf.setFontSize(10); pdf.setFont('helvetica', 'normal');
  pdf.text('Renewals — ' + title, pageW / 2, 20, { align: 'center' });
  pdf.setFontSize(8.5);
  pdf.text(`Generated: ${dateStr}  ·  ${rows.length} records`, pageW / 2, 32, { align: 'center' });

  autoTable(pdf, {
    startY: 42,
    head: [EXPORT_COLS.map(c => c.label)],
    body: rows.map(r => EXPORT_COLS.map(c => {
      const v = c.get(r);
      if (c.num) return v === '' ? '—' : Number(v).toLocaleString();
      return v === '' ? '—' : String(v);
    })),
    headStyles: { fillColor: [10, 26, 62], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, cellPadding: 3 },
    alternateRowStyles: { fillColor: [242, 247, 252] },
    styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [10, 26, 62] },
    columnStyles: { 6: { halign: 'right' } },
    didParseCell: (d) => {
      if (d.section !== 'body') return;
      const r = rows[d.row.index];
      if (r && d.column.index === 5 && r.daysLeft < 0) { d.cell.styles.textColor = [220, 38, 38]; d.cell.styles.fontStyle = 'bold'; }
    },
    didDrawPage: () => {
      pdf.setFontSize(7); pdf.setTextColor(180, 180, 180);
      pdf.text(`${COMPANY} — Confidential`, 10, pageH - 6);
      pdf.text(`Page ${pdf.getNumberOfPages()}`, pageW - 10, pageH - 6, { align: 'right' });
    },
  });
  pdf.save(`Renewals_${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

const RenewalsPage = () => {
  const [clients,  setClients]  = useState([]);
  const [structures, setStructures] = useState({}); // product label → commission structure
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');
  const [tab,      setTab]      = useState(0); // 0=expiring soon, 1=expired, 2=all
  const [rPage,    setRPage]    = useState(1);
  const [rPer,     setRPer]     = useState(15);

  useEffect(() => {
    const q = query(collection(db, 'clients'), orderBy('policy_period_to', 'asc'));
    getDocs(q).then(snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(c => !c.status || c.status === 'approved'));
    }).finally(() => setLoading(false));
    getDoc(doc(db, 'settings', 'commission_structures'))
      .then(s => { if (s.exists()) setStructures(s.data().products || {}); })
      .catch(() => {});
  }, []);

  // For a commission-structure product, the rate the policy moves to at renewal —
  // measured from the ORIGINAL policy's start date to this policy's expiry (the next
  // period's start). Returns { year, rate } or null when the product has no structure.
  const byId = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients]);
  const scaleInfo = (c) => {
    const v = structures[c.product];
    const segs = (v && v.segments) || (Array.isArray(v) ? v : null);
    if (!segs || !segs.length) return null;
    const root = c.root_policy_id ? (byId[c.root_policy_id] || c) : c;
    const hit = structureRate(segs, root.policy_period_from, c.policy_period_to);
    return { year: hit ? Math.floor(hit.months / 12) + 1 : null, rate: hit ? hit.rate : 0 };
  };

  const categorised = useMemo(() => {
    const withDays = clients
      .map(c => ({ ...c, daysLeft: daysLeft(c.policy_period_to) }))
      .filter(c => c.daysLeft !== null);
    return {
      expiring: withDays.filter(c => c.daysLeft >= 0 && c.daysLeft <= 60).sort((a,b) => a.daysLeft - b.daysLeft),
      expired:  withDays.filter(c => c.daysLeft < 0).sort((a,b) => b.daysLeft - a.daysLeft),
      all:      withDays.sort((a,b) => a.daysLeft - b.daysLeft),
    };
  }, [clients]);

  const lists = [categorised.expiring, categorised.expired, categorised.all];
  const fromT = fromDate ? new Date(fromDate).setHours(0, 0, 0, 0) : null;
  const toT   = toDate   ? new Date(toDate).setHours(23, 59, 59, 999) : null;
  const filtered = lists[tab].filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || (c.client_name||'').toLowerCase().includes(q) || (c.policy_no||'').toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (fromT || toT) {
      const t = new Date(c.policy_period_to).getTime();
      if (isNaN(t)) return false;
      if (fromT && t < fromT) return false;
      if (toT && t > toT) return false;
    }
    return true;
  });

  const tabName = ['Expiring Soon', 'Expired', 'All'][tab];

  const statusChip = (days) => {
    if (days < 0)   return { label: `Expired ${Math.abs(days)}d ago`, color: '#dc2626', bg: 'rgba(239,68,68,0.10)', icon: <ErrorOutlineIcon sx={{ fontSize: 13 }} /> };
    if (days <= 7)  return { label: `${days}d left`, color: '#dc2626', bg: 'rgba(239,68,68,0.10)', icon: <WarningAmberIcon sx={{ fontSize: 13 }} /> };
    if (days <= 30) return { label: `${days}d left`, color: '#d97706', bg: 'rgba(245,158,11,0.10)', icon: <WarningAmberIcon sx={{ fontSize: 13 }} /> };
    return          { label: `${days}d left`, color: '#059669', bg: 'rgba(16,185,129,0.10)', icon: <CheckCircleOutlineIcon sx={{ fontSize: 13 }} /> };
  };

  return (
    <Box className="page-enter" sx={{ maxWidth: 1000, mx: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 800 }}>Renewals Tracker</Typography>
      <Typography sx={{ fontSize: 13, color: '#9CA3AF', mb: 3 }}>
        Monitor upcoming and expired policy renewals
      </Typography>

      {/* Summary */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 3 }}>
        {[
          { label: 'Due within 7 days',  val: categorised.expiring.filter(c=>c.daysLeft<=7).length,  color:'#dc2626', bg:'rgba(239,68,68,0.08)' },
          { label: 'Due within 30 days', val: categorised.expiring.filter(c=>c.daysLeft<=30).length, color:'#d97706', bg:'rgba(245,158,11,0.08)' },
          { label: 'Due within 60 days', val: categorised.expiring.length,                           color:'#6366f1', bg:'rgba(99,102,241,0.08)' },
          { label: 'Expired',            val: categorised.expired.length,                            color:'#9CA3AF', bg:'rgba(107,114,128,0.08)' },
        ].map(s => (
          <Box key={s.label} sx={{ flex:1, p:2, borderRadius:'12px', bgcolor:s.bg }}>
            <Typography sx={{ fontSize:24, fontWeight:800, color:s.color }}>{s.val}</Typography>
            <Typography sx={{ fontSize:12, color:'#6B7280' }}>{s.label}</Typography>
          </Box>
        ))}
      </Stack>

      <Card>
        <CardContent sx={{ p:0, '&:last-child':{pb:0} }}>
          <Box sx={{ px:2.5, pt:2, pb:1, display:'flex', gap:2, alignItems:'center', flexWrap:'wrap' }}>
            <Tabs value={tab} onChange={(_,v)=>{ setTab(v); setRPage(1); }}
              sx={{ '& .MuiTab-root':{fontSize:12.5, fontWeight:600, textTransform:'none', color:'#9CA3AF'}, '& .Mui-selected':{color:'#255EAB'}, '& .MuiTabs-indicator':{background:'linear-gradient(90deg,#255EAB,#38A3E0)', height:2.5} }}>
              <Tab label={`Expiring Soon (${categorised.expiring.length})`} />
              <Tab label={`Expired (${categorised.expired.length})`} />
              <Tab label="All" />
            </Tabs>
            <Box sx={{ flex:1 }} />
            <TextField size="small" placeholder="Search client or policy…" value={search} onChange={e=>{ setSearch(e.target.value); setRPage(1); }} sx={{ minWidth:220 }} />
          </Box>

          {/* Date filter + exports */}
          <Box sx={{ px:2.5, pb:1.5, display:'flex', gap:1.5, alignItems:'center', flexWrap:'wrap' }}>
            <Typography sx={{ fontSize:12.5, color:'#6B7280', fontWeight:600 }}>Expiry between</Typography>
            <TextField size="small" type="date" label="From" InputLabelProps={{ shrink:true }}
              value={fromDate} onChange={e=>{ setFromDate(e.target.value); setRPage(1); }} sx={{ width:160 }} />
            <TextField size="small" type="date" label="To" InputLabelProps={{ shrink:true }}
              value={toDate} onChange={e=>{ setToDate(e.target.value); setRPage(1); }} sx={{ width:160 }} />
            {(fromDate || toDate) && (
              <Button size="small" onClick={()=>{ setFromDate(''); setToDate(''); setRPage(1); }}
                sx={{ textTransform:'none', color:'#9CA3AF', fontSize:12 }}>Clear</Button>
            )}
            <Box sx={{ flex:1 }} />
            <Button size="small" variant="outlined" startIcon={<FileDownloadOutlinedIcon sx={{ fontSize:16 }} />}
              disabled={!filtered.length} onClick={()=>exportRenewalsCSV(filtered, tabName)}
              sx={{ textTransform:'none', fontSize:12.5, fontWeight:600, borderColor:'#255EAB', color:'#255EAB', '&:hover':{ borderColor:'#0A1A3E', bgcolor:'rgba(37,94,171,0.04)' } }}>
              Export CSV
            </Button>
            <Button size="small" variant="contained" startIcon={<PictureAsPdfOutlinedIcon sx={{ fontSize:16 }} />}
              disabled={!filtered.length} onClick={()=>exportRenewalsPDF(filtered, tabName)}
              sx={{ textTransform:'none', fontSize:12.5, fontWeight:600, background:'linear-gradient(90deg,#255EAB,#38A3E0)', boxShadow:'none', '&:hover':{ boxShadow:'none', filter:'brightness(0.95)' } }}>
              Export PDF
            </Button>
          </Box>

          {loading ? (
            <Box sx={{ p:2.5 }}><Stack spacing={1}>{[1,2,3,4].map(i=><Skeleton key={i} height={40} sx={{borderRadius:'8px'}} />)}</Stack></Box>
          ) : (
            <TableContainer component={Paper} elevation={0}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Client Name','Policy No','Product','Insurer','Expiry Date','Days Left','Net Premium'].map(h=>(
                      <TableCell key={h}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} sx={{ textAlign:'center', color:'#9CA3AF', py:4 }}>No records found</TableCell></TableRow>
                  ) : filtered.slice((rPage-1)*rPer, rPage*rPer).map((c,i) => {
                    const s = statusChip(c.daysLeft);
                    return (
                      <TableRow key={c.id} sx={{ bgcolor: i%2===0?'#fff':'rgba(242,247,252,0.6)' }}>
                        <TableCell sx={{ fontWeight:600 }}>{c.client_name}</TableCell>
                        <TableCell sx={{ fontFamily:'monospace' }}>{c.policy_no||'—'}</TableCell>
                        <TableCell>
                          {c.product||'—'}
                          {(() => {
                            const si = scaleInfo(c);
                            if (!si) return null;
                            return (
                              <Chip size="small" label={si.year ? `Scale → Y${si.year}: ${si.rate}%` : `Scale ended: 0%`}
                                sx={{ ml: 0.8, height: 18, fontSize: 9.5, fontWeight: 700,
                                      bgcolor:'rgba(8,145,178,0.10)', color:'#0e7490' }} />
                            );
                          })()}
                        </TableCell>
                        <TableCell>{c.insurance_provider||'—'}</TableCell>
                        <TableCell>{c.policy_period_to||'—'}</TableCell>
                        <TableCell>
                          <Chip icon={s.icon} label={s.label} size="small"
                            sx={{ bgcolor:s.bg, color:s.color, fontWeight:700, fontSize:11 }} />
                        </TableCell>
                        <TableCell sx={{ fontWeight:700 }}>
                          {c.net_premium ? `LKR ${Number(c.net_premium).toLocaleString()}` : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {filtered.length > rPer && (
            <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', px:2.5, py:1.5, borderTop:'1px solid rgba(56,163,224,0.08)', flexWrap:'wrap', gap:1 }}>
              <Typography sx={{ fontSize:12.5, color:'#9CA3AF' }}>
                Showing {(rPage-1)*rPer+1}–{Math.min(rPage*rPer, filtered.length)} of {filtered.length}
              </Typography>
              <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                <Typography sx={{ fontSize:12.5, color:'#9CA3AF' }}>Rows:</Typography>
                <Select size="small" value={rPer} onChange={e=>{ setRPer(Number(e.target.value)); setRPage(1); }}
                  sx={{ fontSize:12, minWidth:65 }}>
                  {[10,15,25,50].map(n=><MenuItem key={n} value={n}>{n}</MenuItem>)}
                </Select>
              </Box>
              <Pagination count={Math.ceil(filtered.length/rPer)} page={rPage}
                onChange={(_,v)=>{ setRPage(v); window.scrollTo({top:0,behavior:'smooth'}); }}
                shape="rounded" size="small" />
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default RenewalsPage;
