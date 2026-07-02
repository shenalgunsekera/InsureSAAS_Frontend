import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { collection, getDocs, query, orderBy, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { textFields as UW_FIELDS } from './AddClientForm';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import ExcelJS from 'exceljs';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer
} from 'recharts';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Pagination from '@mui/material/Pagination';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

import BarChartIcon from '@mui/icons-material/BarChart';
import PieChartOutlineIcon from '@mui/icons-material/PieChartOutline';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import BookmarkOutlinedIcon from '@mui/icons-material/BookmarkOutlined';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import AddIcon from '@mui/icons-material/Add';
import TuneIcon from '@mui/icons-material/Tune';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import GridOnIcon from '@mui/icons-material/GridOn';
import ViewListIcon from '@mui/icons-material/ViewList';
import FunctionsIcon from '@mui/icons-material/Functions';

/* ── Palette ─────────────────────────────────────────────────────────────── */
const CHART_COLORS = ['#FF5A5A','#6366f1','#10B981','#f59e0b','#0ea5e9','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16'];

/* ── Field definitions ───────────────────────────────────────────────────── */
const uwType = (f) => (f.type === 'number' || f.type === 'currency') ? 'number' : (f.date ? 'date' : 'string');
// keys that exist on a client doc but aren't editable form fields
const CLIENT_SYSTEM_FIELDS = [
  { key: 'created_at',  label: 'Date Added',  type: 'date'   },
  { key: 'insurer',     label: 'Insurer',     type: 'string' },
  { key: 'main_class',  label: 'Main Class',  type: 'string' },
  { key: 'status',      label: 'Status',      type: 'string' },
];
// Base = every underwriting form field (so the report can use ALL of them) + system fields.
// Excludes derived/non-stored keys (date_added becomes created_at; year/month are derived).
const CLIENT_FIELDS = (() => {
  const skip = new Set(['date_added', 'policy_year', 'policy_month']);
  const base = UW_FIELDS.filter(f => !skip.has(f.name)).map(f => ({ key: f.name, label: f.label, type: uwType(f) }));
  const have = new Set(base.map(f => f.key));
  return [...base, ...CLIENT_SYSTEM_FIELDS.filter(f => !have.has(f.key))];
})();
// keys to hide from the dynamic field list (internal / file URLs / JSON blobs)
const isInternalKey = (k) =>
  k.startsWith('doc_') || k.endsWith('_doc_url') || k.endsWith('_text') ||
  ['id','updated_at','is_active','submitted_by','submitted_at','submitted_by_name','source_quote_id',
   'cover_responses','clause_responses','plan_premiums','endorsements','product_key',
   'date_added','policy_year','policy_month','rejection_reason','reviewed_by','reviewed_at'].includes(k);
const prettyKey = (k) => k.replace(/^(cover_|clause_|fi_)/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

const CLAIM_FIELDS = [
  { key: 'client_name',    label: 'Client Name',    type: 'string' },
  { key: 'claim_no',       label: 'Claim No',       type: 'string' },
  { key: 'insurer',        label: 'Insurer',        type: 'string' },
  { key: 'status',         label: 'Status',         type: 'string' },
  { key: 'claim_amount',   label: 'Claim Amount',   type: 'number' },
  { key: 'settled_amount', label: 'Settled Amount', type: 'number' },
  { key: 'product',        label: 'Product',        type: 'string' },
  { key: 'main_class',     label: 'Main Class',     type: 'string' },
];

// Quotation report fields — these map to the flattened quote rows built in loadData().
const QUOTE_FIELDS = [
  { key: 'reference',          label: 'Reference',          type: 'string' },
  { key: 'product',            label: 'Product',            type: 'string' },
  // Proposer / client
  { key: 'client_name',        label: 'Client',             type: 'string' },
  { key: 'customer_type',      label: 'Customer Type',      type: 'string' },
  { key: 'mobile',             label: 'Mobile',             type: 'string' },
  { key: 'email',              label: 'Email',              type: 'string' },
  { key: 'nic_no',             label: 'NIC / Reg No',       type: 'string' },
  { key: 'address',            label: 'Address',            type: 'string' },
  { key: 'city',               label: 'City',               type: 'string' },
  { key: 'district',           label: 'District',           type: 'string' },
  // Risk basics
  { key: 'sum_insured',        label: 'Sum Insured',        type: 'number' },
  { key: 'vehicle_no',         label: 'Vehicle No',         type: 'string' },
  { key: 'period_from',        label: 'Period From',        type: 'date'   },
  { key: 'period_to',          label: 'Period To',          type: 'date'   },
  // Status / outcome
  { key: 'status',             label: 'Status',             type: 'string' },
  { key: 'not_finalised',      label: 'Not Finalised',      type: 'string' },
  { key: 'not_finalised_at',   label: 'Marked On',          type: 'date'   },
  { key: 'selected_company',   label: 'Selected Insurer',   type: 'string' },
  { key: 'selected_premium',   label: 'Selected Premium',   type: 'number' },
  // Insurers & responses
  { key: 'insurers_sent',      label: 'Insurers Sent',      type: 'string' },
  { key: 'sent_count',         label: 'No. Sent',           type: 'number' },
  { key: 'insurers_responded', label: 'Insurers Responded', type: 'string' },
  { key: 'response_count',     label: 'No. Responses',      type: 'number' },
  { key: 'declined_count',     label: 'No. Declined',       type: 'number' },
  { key: 'lowest_premium',     label: 'Lowest Premium',     type: 'number' },
  // Audit
  { key: 'days_outstanding',   label: 'Days Outstanding',   type: 'number' },
  { key: 'created_by_name',    label: 'Created By',          type: 'string' },
  { key: 'created_at',         label: 'Date Created',        type: 'date'   },
];

const NUMBER_OPS = ['sum','avg','min','max','count'];
const FILTER_OPS = {
  string: ['equals','contains','starts with','not equals'],
  number: ['=','>','<','>=','<='],
  date:   ['after','before','between'],
};

const BUILTIN_TEMPLATES = [
  { id:'unfinalised_quotes', name:'Not Finalised Quotations', description:'Quotes where the customer went with another company (marked not finalised) — full quote detail', icon:'⏳', source:'quotes', fields:['reference','product','client_name','customer_type','mobile','email','nic_no','address','city','district','sum_insured','vehicle_no','period_from','period_to','status','not_finalised_at','selected_company','selected_premium','insurers_sent','sent_count','insurers_responded','response_count','declined_count','lowest_premium','days_outstanding','created_by_name','created_at'], groupBy:'', aggregations:[], filters:[{field:'not_finalised',op:'equals',value:'Yes'}], sortBy:'not_finalised_at', sortDir:'desc', viewMode:'flat', charts:[] },
];

/* ── Pure helpers ────────────────────────────────────────────────────────── */
function fmtNum(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  return isNaN(n) ? v : n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function parseNum(v) { const n = parseFloat(String(v||'').replace(/,/g,'')); return isNaN(n)?0:n; }
function fmtDate(v) {
  if (!v) return '—';
  if (v?.toDate) return v.toDate().toLocaleDateString('en-GB');
  const d = new Date(v); return isNaN(d)?v:d.toLocaleDateString('en-GB');
}

function computeAgg(op, vals) {
  if (!vals.length) return 0;
  if (op==='sum')   return vals.reduce((a,b)=>a+b,0);
  if (op==='avg')   return vals.reduce((a,b)=>a+b,0)/vals.length;
  if (op==='min')   return Math.min(...vals);
  if (op==='max')   return Math.max(...vals);
  if (op==='count') return vals.length;
  return 0;
}

function applyFilters(rows, filters, fieldList) {
  return rows.filter(row => {
    for (const f of filters) {
      const rawVal = row[f.field];
      if (f.value === '__next90__') {
        const now=new Date(); now.setHours(0,0,0,0);
        const end=new Date(now); end.setDate(end.getDate()+90);
        const d=rawVal?.toDate?rawVal.toDate():new Date(rawVal);
        if (isNaN(d)||d<now||d>end) return false; continue;
      }
      const field=(fieldList||[...CLIENT_FIELDS,...CLAIM_FIELDS,...QUOTE_FIELDS]).find(f2=>f2.key===f.field)
        // Unknown/dynamic field — infer string vs number from the first non-empty value.
        || { key:f.field, type:(rawVal!=='' && rawVal!=null && !isNaN(String(rawVal).replace(/,/g,'')))?'number':'string' };
      if (field.type==='string') {
        const val=(rawVal||'').toLowerCase(); const cmp=(f.value||'').toLowerCase();
        if (f.op==='equals'&&val!==cmp) return false;
        if (f.op==='not equals'&&val===cmp) return false;
        if (f.op==='contains'&&!val.includes(cmp)) return false;
        if (f.op==='starts with'&&!val.startsWith(cmp)) return false;
      } else if (field.type==='number') {
        const a=parseNum(rawVal); const b=parseNum(f.value);
        if (f.op==='='&&a!==b) return false;
        if (f.op==='>'&&a<=b) return false;
        if (f.op==='<'&&a>=b) return false;
        if (f.op==='>='&&a<b) return false;
        if (f.op==='<='&&a>b) return false;
      } else if (field.type==='date') {
        const d=rawVal?.toDate?rawVal.toDate():new Date(rawVal);
        if (isNaN(d)) return false;
        if (f.op==='after'&&f.value&&d<=new Date(f.value)) return false;
        if (f.op==='before'&&f.value&&d>=new Date(f.value)) return false;
        if (f.op==='between'&&f.value) {
          const [from,to]=f.value.split('|');
          const start=new Date(from); start.setHours(0,0,0,0);
          const end=new Date(to); end.setHours(23,59,59,999);
          if (d<start||d>end) return false;
        }
      }
    }
    return true;
  });
}

/* Aggregated: collapse groups into single summary rows */
function aggregated(rows, groupBy, aggs) {
  if (!groupBy||!aggs.length) return rows;
  const groups={};
  for (const row of rows) {
    const k=row[groupBy]||'(None)';
    if (!groups[k]) groups[k]={[groupBy]:k,_rows:[]};
    groups[k]._rows.push(row);
  }
  return Object.values(groups).map(g=>{
    const r={[groupBy]:g[groupBy]};
    for (const agg of aggs) {
      const vals=g._rows.map(x=>parseNum(x[agg.field]));
      r[`${agg.field}_${agg.op}`]=computeAgg(agg.op,vals);
    }
    return r;
  });
}

/* Subtotals: keep each individual row, inject subtotal + grand-total rows */
function withSubtotals(rows, groupBy, aggs) {
  if (!groupBy||!aggs.length) return rows.map(r=>({...r,_type:'data'}));
  const sorted=[...rows].sort((a,b)=>String(a[groupBy]||'').localeCompare(String(b[groupBy]||'')));
  const result=[]; let curGroup=null; let curRows=[];
  const pushSub=(grp,gRows)=>{
    const s={[groupBy]:grp,_type:'subtotal',_count:gRows.length};
    for (const agg of aggs){
      const vals=gRows.map(r=>parseNum(r[agg.field]));
      s[`${agg.field}_${agg.op}`]=computeAgg(agg.op,vals);
    }
    result.push(s);
  };
  for (const row of sorted){
    const g=row[groupBy]||'(None)';
    if (curGroup!==g){ if (curGroup!==null) pushSub(curGroup,curRows); curGroup=g; curRows=[]; }
    result.push({...row,_type:'data'}); curRows.push(row);
  }
  if (curGroup!==null) pushSub(curGroup,curRows);
  const gt={_type:'grandtotal',_count:rows.length};
  if (groupBy) gt[groupBy]='GRAND TOTAL';
  for (const agg of aggs){
    const vals=rows.map(r=>parseNum(r[agg.field]));
    gt[`${agg.field}_${agg.op}`]=computeAgg(agg.op,vals);
  }
  result.push(gt);
  return result;
}

/* Pivot: cross-tab rowField × colField → value */
function buildPivot(rows, rowField, colField, valueField, valueOp) {
  if (!rowField||!colField||!valueField) return { pivotRows:[], colValues:[] };
  const colValues=[...new Set(rows.map(r=>String(r[colField]||'(None)')))].sort().slice(0,20);
  const rowGroups={};
  for (const row of rows){
    const rk=String(row[rowField]||'(None)');
    const ck=String(row[colField]||'(None)');
    if (!rowGroups[rk]) rowGroups[rk]={};
    if (!rowGroups[rk][ck]) rowGroups[rk][ck]=[];
    rowGroups[rk][ck].push(parseNum(row[valueField]));
  }
  const pivotRows=Object.entries(rowGroups).map(([rk,cols])=>{
    const r={_rowLabel:rk,_type:'pivot'};
    let total=0;
    for (const cv of colValues){ const val=cols[cv]?computeAgg(valueOp,cols[cv]):0; r[`_p_${cv}`]=val; total+=val; }
    r._rowTotal=total; return r;
  });
  // Grand total row
  const gt={_rowLabel:'TOTAL',_type:'pivottotal'};
  for (const cv of colValues){
    const allVals=rows.filter(r=>String(r[colField]||'(None)')===cv).map(r=>parseNum(r[valueField]));
    gt[`_p_${cv}`]=computeAgg(valueOp,allVals);
  }
  gt._rowTotal=computeAgg(valueOp,rows.map(r=>parseNum(r[valueField])));
  pivotRows.push(gt);
  return { pivotRows, colValues };
}

function sortRows(rows, sortBy, sortDir) {
  if (!sortBy) return rows;
  return [...rows].sort((a,b)=>{
    if (a._type&&a._type!=='data') return 1;
    if (b._type&&b._type!=='data') return -1;
    const av=parseNum(a[sortBy])||0; const bv=parseNum(b[sortBy])||0;
    if (av!==bv) return sortDir==='asc'?av-bv:bv-av;
    const as=String(a[sortBy]||''); const bs=String(b[sortBy]||'');
    return sortDir==='asc'?as.localeCompare(bs):bs.localeCompare(as);
  });
}

/* ── PDF export with multiple chart captures ────────────────────────────── */
async function exportPDF(columns, rows, reportName, chartEls=[]) {
  const landscape=columns.length>6;
  const pdf=new jsPDF({orientation:landscape?'landscape':'portrait',unit:'mm'});
  const pageW=pdf.internal.pageSize.getWidth(); const pageH=pdf.internal.pageSize.getHeight();
  const dateStr=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});

  pdf.setFillColor(255,90,90); pdf.rect(0,0,pageW,26,'F');
  pdf.setFillColor(26,26,46);  pdf.rect(0,26,pageW,10,'F');
  pdf.setTextColor(255,255,255);
  pdf.setFontSize(15); pdf.setFont('helvetica','bold');
  pdf.text('InsureSAAS Insurance Brokers (Pvt) Ltd',pageW/2,11,{align:'center'});
  pdf.setFontSize(10); pdf.setFont('helvetica','normal');
  pdf.text(reportName,pageW/2,20,{align:'center'});
  pdf.setFontSize(8.5);
  pdf.text(`Generated: ${dateStr}  ·  ${rows.filter(r=>!r._type||r._type==='data').length} records`,pageW/2,32,{align:'center'});

  let Y=42;
  // Summary stat boxes
  const numCols=columns.filter(c=>c.type==='number').slice(0,4);
  if (numCols.length){
    const boxW=(pageW-20)/numCols.length;
    numCols.forEach((c,i)=>{
      const total=rows.filter(r=>!r._type||r._type==='data').reduce((a,r)=>a+parseNum(r[c.key]),0);
      const x=10+i*boxW;
      pdf.setFillColor(255,248,245); pdf.roundedRect(x,Y,boxW-3,18,2,2,'F');
      pdf.setDrawColor(255,139,90); pdf.setLineWidth(0.3); pdf.roundedRect(x,Y,boxW-3,18,2,2,'S');
      pdf.setTextColor(255,90,90); pdf.setFontSize(12); pdf.setFont('helvetica','bold');
      pdf.text(fmtNum(total),x+(boxW-3)/2,Y+10,{align:'center'});
      pdf.setTextColor(107,114,128); pdf.setFontSize(7.5); pdf.setFont('helvetica','normal');
      pdf.text(c.label,x+(boxW-3)/2,Y+16,{align:'center'});
    });
    Y+=24;
  }

  // All charts
  for (const chartEl of chartEls.filter(Boolean)) {
    if (Y>pageH-40) { pdf.addPage(); Y=15; }
    try {
      const canvas=await html2canvas(chartEl,{scale:2,backgroundColor:'#ffffff',logging:false});
      const imgData=canvas.toDataURL('image/png');
      const chartH=Math.min(60,(canvas.height/canvas.width)*(pageW-20));
      pdf.addImage(imgData,'PNG',10,Y,pageW-20,chartH);
      Y+=chartH+6;
    } catch { /* skip chart */ }
  }

  if (Y>pageH-60) { pdf.addPage(); Y=15; }

  autoTable(pdf,{
    startY:Y,
    head:[columns.map(c=>c.label)],
    body:rows.map(r=>{
      const isSub=r._type==='subtotal'; const isGT=r._type==='grandtotal';
      return columns.map(c=>{
        if (isSub||isGT) {
          const v=r[c.key]; if (v===null||v===undefined) return '';
          return typeof v==='number'?fmtNum(v):String(v);
        }
        const v=r[c.key];
        if (v===null||v===undefined) return '—';
        if (c.type==='date') return fmtDate(v);
        if (c.type==='number') return fmtNum(v);
        return String(v);
      });
    }),
    headStyles:{fillColor:[26,26,46],textColor:[255,255,255],fontStyle:'bold',fontSize:9,cellPadding:3},
    alternateRowStyles:{fillColor:[255,248,245]},
    styles:{fontSize:8.5,cellPadding:2.5,textColor:[26,26,46]},
    columnStyles:columns.reduce((acc,c,i)=>{if(c.type==='number')acc[i]={halign:'right'};return acc;},{}),
    didParseCell:(d)=>{
      const r=rows[d.row.index];
      if (!r) return;
      if (r._type==='subtotal'){d.cell.styles.fillColor=[230,230,255];d.cell.styles.fontStyle='bold';d.cell.styles.textColor=[60,60,200];}
      if (r._type==='grandtotal'){d.cell.styles.fillColor=[26,26,46];d.cell.styles.textColor=[255,255,255];d.cell.styles.fontStyle='bold';}
    },
    didDrawPage:()=>{
      pdf.setFontSize(7); pdf.setTextColor(180,180,180);
      pdf.text('InsureSAAS Insurance Brokers (Pvt) Ltd — Confidential',10,pageH-6);
      pdf.text(`Page ${pdf.getNumberOfPages()}`,pageW-10,pageH-6,{align:'right'});
    },
  });
  pdf.save(`${reportName.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.pdf`);
}

/* ── CSV export ──────────────────────────────────────────────────────────── */
function exportCSV(columns, rows, reportName) {
  const dateStr  = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'numeric' });
  const numCols  = columns.filter(c => c.type === 'number');
  const dataRows = rows.filter(r => !r._type || r._type === 'data');

  const q  = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const num = (v) => {
    const n = parseNum(v);
    return isNaN(n) ? '' : n.toFixed(2);
  };

  const lines = [
    // UTF-8 BOM handled by Blob — use plain ASCII separators to avoid Excel encoding issues
    q(reportName),
    `${q('InsureSAAS Insurance Brokers (Pvt) Ltd')},${q(dateStr)}`,
    `${q('Total records')},${dataRows.length}`,
    '',
  ];

  if (numCols.length) {
    lines.push(q('-- SUMMARY TOTALS --'));
    lines.push(numCols.map(c => q(c.label)).join(','));
    lines.push(numCols.map(c => num(dataRows.reduce((a, r) => a + parseNum(r[c.key]), 0))).join(','));
    lines.push('');
  }

  lines.push(columns.map(c => q(c.label)).join(','));

  rows.forEach(r => {
    const tag = r._type === 'subtotal' ? '[SUBTOTAL] ' : r._type === 'grandtotal' ? '[TOTAL] ' : '';
    lines.push(columns.map((c, i) => {
      const v = r[c.key];
      if (v === null || v === undefined || v === '') return (tag && i === 0) ? q(tag) : '';
      if (c.type === 'date')   return q((tag && i === 0 ? tag : '') + fmtDate(v));
      if (c.type === 'number') return num(v);
      return q((tag && i === 0 ? tag : '') + String(v));
    }).join(','));
  });

  // Prepend UTF-8 BOM so Excel opens with correct encoding
  const BOM  = '﻿';
  const blob = new Blob([BOM + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `${reportName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
}

/* ── Excel export — native charts via JSZip XML injection ────────────────── */
async function exportExcel(columns, rows, reportName, chartsWithData = []) {
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'InsureSAAS Insurance Brokers';
  wb.created  = new Date();
  const dateStr   = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  const dataRows  = rows.filter(r => !r._type || r._type === 'data');
  const numCols   = columns.filter(c => c.type === 'number');
  const maxColIdx = Math.min(columns.length, 26);

  const setCell = (ws, row, col, value, opts = {}) => {
    const cell = ws.getCell(row, col);
    cell.value = value;
    if (opts.fill)   cell.fill      = { type:'pattern', pattern:'solid', fgColor:{ argb: opts.fill } };
    if (opts.font)   cell.font      = { name:'Calibri', ...opts.font };
    if (opts.align)  cell.alignment = opts.align;
    if (opts.numFmt) cell.numFmt    = opts.numFmt;
    if (opts.border) cell.border    = opts.border;
    return cell;
  };

  /* ── SHEET 1: Summary ───────────────────────────────────────────────────── */
  const wsSummary = wb.addWorksheet('Summary', { pageSetup:{ orientation:'landscape', fitToPage:true } });
  const spanCols  = Math.max(maxColIdx, 8);

  wsSummary.mergeCells(1, 1, 1, spanCols);
  setCell(wsSummary, 1, 1, 'CEILAO INSURANCE BROKERS (PVT) LTD',
    { fill:'FF1A1A2E', font:{ bold:true, size:16, color:{argb:'FFFFFFFF'} }, align:{ horizontal:'center', vertical:'middle' } });
  wsSummary.getRow(1).height = 32;

  wsSummary.mergeCells(2, 1, 2, spanCols);
  setCell(wsSummary, 2, 1, reportName,
    { fill:'FF2D3748', font:{ bold:true, size:13, color:{argb:'FFFFFFFF'} }, align:{ horizontal:'center', vertical:'middle' } });
  wsSummary.getRow(2).height = 24;

  wsSummary.mergeCells(3, 1, 3, spanCols);
  setCell(wsSummary, 3, 1, `Generated: ${dateStr}   ·   ${dataRows.length} records`,
    { fill:'FFF8FAFC', font:{ size:9, color:{argb:'FF6B7280'} }, align:{ horizontal:'center' } });
  wsSummary.getRow(3).height = 14;
  wsSummary.getRow(4).height = 10;

  let sumRow = 5;
  if (numCols.length) {
    const boxCols = Math.min(numCols.length, 6);
    numCols.slice(0, boxCols).forEach((c, i) => {
      const total = dataRows.reduce((a, r) => a + parseNum(r[c.key]), 0);
      const col1  = i * 2 + 1;
      const col2  = col1 + 1;
      wsSummary.mergeCells(sumRow, col1, sumRow, col2);
      setCell(wsSummary, sumRow, col1, c.label,
        { fill:'FF374151', font:{ bold:true, size:9, color:{argb:'FFFF8B5A'} }, align:{ horizontal:'center', vertical:'middle' } });
      wsSummary.getRow(sumRow).height = 18;
      wsSummary.mergeCells(sumRow + 1, col1, sumRow + 1, col2);
      setCell(wsSummary, sumRow + 1, col1, total,
        { fill:'FFFFFFFF', font:{ bold:true, size:14, color:{argb:'FF1A1A2E'} }, align:{ horizontal:'center', vertical:'middle' }, numFmt:'#,##0.00',
          border:{ left:{style:'thin',color:{argb:'FFE5E7EB'}}, right:{style:'thin',color:{argb:'FFE5E7EB'}}, bottom:{style:'medium',color:{argb:'FFFF5A5A'}} } });
      wsSummary.getRow(sumRow + 1).height = 28;
    });
    sumRow += 3;
    wsSummary.getRow(sumRow).height = 10;
    sumRow++;
  }

  if (chartsWithData.length > 0) {
    wsSummary.mergeCells(sumRow, 1, sumRow, spanCols);
    setCell(wsSummary, sumRow, 1, `${chartsWithData.length} chart${chartsWithData.length > 1 ? 's' : ''} embedded below`,
      { fill:'FFEEF2FF', font:{ italic:true, size:9, color:{argb:'FF4338CA'} }, align:{ horizontal:'center' } });
    sumRow++;
    for (let i = 0; i < chartsWithData.length * 15; i++) wsSummary.getRow(sumRow + i).height = 16;
  }

  wsSummary.getColumn(1).width = 28;
  for (let i = 2; i <= spanCols; i++) wsSummary.getColumn(i).width = 18;

  /* ── SHEET 2: Data ──────────────────────────────────────────────────────── */
  const wsData = wb.addWorksheet('Data', { pageSetup:{ orientation:'landscape', fitToPage:true } });

  wsData.mergeCells(1, 1, 1, maxColIdx);
  setCell(wsData, 1, 1, `${reportName} — Full Data`,
    { fill:'FF1A1A2E', font:{ bold:true, size:13, color:{argb:'FFFFFFFF'} }, align:{ horizontal:'center', vertical:'middle' } });
  wsData.getRow(1).height = 24;

  wsData.mergeCells(2, 1, 2, maxColIdx);
  setCell(wsData, 2, 1, `${dateStr}   ·   ${dataRows.length} records`,
    { fill:'FF374151', font:{ size:9, color:{argb:'FFCBD5E1'} }, align:{ horizontal:'center' } });
  wsData.getRow(2).height = 14;
  wsData.getRow(3).height = 8;

  const headerRow = 4;
  wsData.getRow(headerRow).height = 22;
  columns.forEach((c, i) => {
    const cell = wsData.getCell(headerRow, i + 1);
    cell.value = c.label;
    cell.fill  = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1A1A2E' } };
    cell.font  = { bold:true, size:10, color:{ argb:'FFFF8B5A' }, name:'Calibri' };
    cell.alignment = { horizontal: c.type === 'number' ? 'right' : 'left', vertical:'middle' };
    cell.border = { bottom:{ style:'medium', color:{ argb:'FFFF5A5A' } } };
  });

  wsData.views = [{ state:'frozen', ySplit: headerRow }];
  wsData.autoFilter = { from:{ row:headerRow, column:1 }, to:{ row:headerRow, column:columns.length } };

  let dataRowNum = headerRow + 1;
  rows.forEach((row) => {
    const isSub = row._type === 'subtotal';
    const isGT  = row._type === 'grandtotal';
    const bgArgb   = isGT ? 'FF1A1A2E' : isSub ? 'FFEEF2FF' : dataRowNum % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF';
    const textArgb = isGT ? 'FFFFFFFF' : isSub ? 'FF4338CA' : 'FF374151';
    wsData.getRow(dataRowNum).height = 17;
    columns.forEach((c, i) => {
      const cell = wsData.getCell(dataRowNum, i + 1);
      const v = row[c.key];
      if (c.type === 'number') {
        cell.value  = (v !== null && v !== undefined) ? parseNum(v) : null;
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal:'right' };
      } else if (c.type === 'date') {
        cell.value = fmtDate(v);
        cell.alignment = { horizontal:'center' };
      } else {
        const prefix = isSub && i === 0 ? '↳ ' : isGT && i === 0 ? '▸ GRAND TOTAL  ' : '';
        cell.value = prefix + (v ?? '');
      }
      cell.fill   = { type:'pattern', pattern:'solid', fgColor:{ argb: bgArgb } };
      cell.font   = { size:9.5, bold: isSub || isGT, color:{ argb: textArgb }, name:'Calibri' };
      cell.border = { bottom:{ style:'hair', color:{ argb:'FFE5E7EB' } } };
    });
    dataRowNum++;
  });

  if (numCols.length && dataRows.length) {
    wsData.getRow(dataRowNum).height = 20;
    columns.forEach((c, i) => {
      const cell = wsData.getCell(dataRowNum, i + 1);
      if (c.type === 'number') {
        cell.value  = dataRows.reduce((a, r) => a + parseNum(r[c.key]), 0);
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal:'right' };
      } else if (i === 0) {
        cell.value = 'TOTAL';
      }
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF1A1A2E' } };
      cell.font = { bold:true, size:10, color:{ argb:'FFFFFFFF' }, name:'Calibri' };
    });
  }

  columns.forEach((c, i) => {
    const labelLen  = c.label.length;
    const baseWidth = c.type === 'number' ? Math.max(labelLen + 4, 16)
                    : c.type === 'date'   ? Math.max(labelLen + 2, 14)
                    : Math.max(labelLen + 6, 22);
    wsData.getColumn(i + 1).width = Math.min(baseWidth, 40);
  });

  /* ── SHEET 3: ChartData (source for native Excel charts) ────────────────── */
  if (chartsWithData.length > 0) {
    const wsCD = wb.addWorksheet('ChartData');
    chartsWithData.forEach((ch, ci) => {
      const catCol = ci * 3 + 1;
      const valCol = ci * 3 + 2;
      wsCD.getCell(1, catCol).value = 'Category';
      wsCD.getCell(1, valCol).value = ch.label || 'Value';
      (ch.data || []).slice(0, 50).forEach((d, di) => {
        wsCD.getCell(di + 2, catCol).value = String(d.name || '');
        wsCD.getCell(di + 2, valCol).value = typeof d.value === 'number' ? d.value : 0;
      });
    });
  }

  const buf = await wb.xlsx.writeBuffer();

  /* ── Native chart injection via JSZip ───────────────────────────────────── */
  if (chartsWithData.length === 0) {
    saveAs(new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `${reportName.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
    return;
  }

  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buf);

  const escX = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const colLetter = n => String.fromCharCode(64 + n);

  const buildChartXml = (chart, ci) => {
    const { type, label, data } = chart;
    const pts  = (data || []).slice(0, 50);
    const n    = pts.length;
    const catC = colLetter(ci * 3 + 1);
    const valC = colLetter(ci * 3 + 2);
    const catR = `ChartData!$${catC}$2:$${catC}$${n + 1}`;
    const valR = `ChartData!$${valC}$2:$${valC}$${n + 1}`;
    const ax1  = 1000 + ci * 10 + 1;
    const ax2  = 1000 + ci * 10 + 2;

    const catPts = pts.map((p,i) => `<c:pt idx="${i}"><c:v>${escX(String(p.name||''))}</c:v></c:pt>`).join('');
    const valPts = pts.map((p,i) => `<c:pt idx="${i}"><c:v>${Number(p.value)||0}</c:v></c:pt>`).join('');

    const catXml = `<c:cat><c:strRef><c:f>${catR}</c:f><c:strCache><c:ptCount val="${n}"/>${catPts}</c:strCache></c:strRef></c:cat>`;
    const valXml = `<c:val><c:numRef><c:f>${valR}</c:f><c:numCache><c:formatCode>#,##0</c:formatCode><c:ptCount val="${n}"/>${valPts}</c:numCache></c:numRef></c:val>`;

    const axes = `<c:catAx><c:axId val="${ax1}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="${ax2}"/></c:catAx><c:valAx><c:axId val="${ax2}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="${ax1}"/></c:valAx>`;
    const axRefs = `<c:axId val="${ax1}"/><c:axId val="${ax2}"/>`;

    let plotXml;
    if (type === 'pie') {
      plotXml = `<c:pieChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>${catXml}${valXml}</c:ser><c:firstSliceAng val="0"/></c:pieChart>`;
    } else if (type === 'line') {
      plotXml = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>${catXml}${valXml}<c:smooth val="0"/></c:ser><c:marker><c:symbol val="none"/></c:marker><c:smooth val="0"/>${axRefs}</c:lineChart>${axes}`;
    } else {
      plotXml = `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/>${catXml}${valXml}</c:ser>${axRefs}</c:barChart>${axes}`;
    }

    const titleXml = label
      ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" b="1"/><a:t>${escX(label)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
      : `<c:autoTitleDeleted val="1"/>`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:date1904 val="0"/><c:lang val="en-US"/><c:roundedCorners val="0"/>
  <c:chart>
    ${titleXml}
    <c:plotArea><c:layout/>${plotXml}</c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
    <c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
  </c:chart>
  <c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>
</c:chartSpace>`;
  };

  chartsWithData.forEach((ch, i) => {
    zip.file(`xl/charts/chart${i + 1}.xml`, buildChartXml(ch, i));
  });

  const CHART_START = sumRow; // 1-indexed ExcelJS row → 0-indexed for drawing
  const CHART_H = 15;
  const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${chartsWithData.map((_, i) => {
  const fr = CHART_START + 1 + i * CHART_H; // 0-indexed
  const tr = fr + CHART_H - 1;
  return `  <xdr:twoCellAnchor moveWithCells="1" sizeWithCells="1">
    <xdr:from><xdr:col>0</xdr:col><xdr:colOff>114300</xdr:colOff><xdr:row>${fr}</xdr:row><xdr:rowOff>114300</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>7</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${tr}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${i + 1}"/>
      </a:graphicData></a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>`;
}).join('\n')}
</xdr:wsDr>`;
  zip.file('xl/drawings/drawing1.xml', drawingXml);

  zip.file('xl/drawings/_rels/drawing1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${chartsWithData.map((_, i) => `  <Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${i + 1}.xml"/>`).join('\n')}
</Relationships>`);

  zip.file('xl/worksheets/_rels/sheet1.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`);

  const sheet1Raw = await zip.file('xl/worksheets/sheet1.xml').async('string');
  zip.file('xl/worksheets/sheet1.xml',
    sheet1Raw.includes('<drawing')
      ? sheet1Raw
      : sheet1Raw.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>'));

  let ct = await zip.file('[Content_Types].xml').async('string');
  if (!ct.includes('drawing+xml'))
    ct = ct.replace('</Types>', `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>\n</Types>`);
  chartsWithData.forEach((_, i) => {
    const pn = `/xl/charts/chart${i + 1}.xml`;
    if (!ct.includes(pn))
      ct = ct.replace('</Types>', `<Override PartName="${pn}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>\n</Types>`);
  });
  zip.file('[Content_Types].xml', ct);

  const finalBuf = await zip.generateAsync({ type:'arraybuffer', compression:'DEFLATE' });
  saveAs(
    new Blob([finalBuf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${reportName.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`
  );
}

/* ── Chart component ─────────────────────────────────────────────────────── */
function ReportChart({ chartCfg, data, groupByLabel, innerRef, onRemove, onUpdate, allFields }) {
  const { type, label } = chartCfg;
  // data is already pre-computed [{name, value}] — just use it directly
  const chartData = data.filter(d => d.name);
  const ChIcon = type==='pie'?PieChartOutlineIcon:type==='line'?ShowChartIcon:BarChartIcon;
  const yLabel = label || '';
  return (
    <Card sx={{ border:'1px solid rgba(255,139,90,0.12)', mb:2 }}>
      <CardContent ref={innerRef} sx={{ p:2.5 }}>
        <Stack direction={{ xs:'column', sm:'row' }} spacing={1} alignItems={{ sm:'center' }} sx={{ mb:1.5 }} flexWrap="wrap">
          <ChIcon sx={{ color:'#6366f1', fontSize:18, flexShrink:0 }} />
          <TextField size="small" value={label} onChange={e=>onUpdate({label:e.target.value})}
            variant="standard" placeholder="Chart title…"
            sx={{ flex:1, minWidth:120, '& input':{fontSize:13,fontWeight:700} }} />

          {/* Y axis field + aggregation — the clear bit the user picks */}
          {allFields && (
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography sx={{fontSize:11,color:'#9CA3AF',fontWeight:600}}>Y:</Typography>
              <Select size="small" value={chartCfg.field||''} onChange={e=>onUpdate({field:e.target.value})}
                sx={{fontSize:12,height:30,minWidth:140}}>
                {allFields.filter(f=>f.type==='number').map(f=>(
                  <MenuItem key={f.key} value={f.key} sx={{fontSize:12}}>{f.label}</MenuItem>
                ))}
              </Select>
              <Select size="small" value={chartCfg.aggOp||'sum'} onChange={e=>onUpdate({aggOp:e.target.value})}
                sx={{fontSize:12,height:30,width:70}}>
                {['sum','count','avg','min','max'].map(op=>(
                  <MenuItem key={op} value={op} sx={{fontSize:12}}>{op}</MenuItem>
                ))}
              </Select>
            </Stack>
          )}

          {/* Chart type */}
          <Stack direction="row" spacing={0.5}>
            {[['bar',<BarChartIcon sx={{fontSize:14}}/>],['pie',<PieChartOutlineIcon sx={{fontSize:14}}/>],['line',<ShowChartIcon sx={{fontSize:14}}/>]].map(([t,icon])=>(
              <Chip key={t} label={t} icon={icon} size="small" clickable onClick={()=>onUpdate({type:t})}
                sx={{ fontSize:10,height:26,fontWeight:700,
                      bgcolor:type===t?'rgba(99,102,241,0.12)':'transparent',
                      color:type===t?'#6366f1':'#9CA3AF',
                      border:`1px solid ${type===t?'rgba(99,102,241,0.35)':'rgba(0,0,0,0.08)'}` }} />
            ))}
          </Stack>
          {onRemove && <IconButton size="small" onClick={onRemove} sx={{ color:'#9CA3AF','&:hover':{color:'#ef4444'} }}><DeleteOutlineIcon fontSize="small"/></IconButton>}
        </Stack>
        {groupByLabel && (
          <Typography sx={{fontSize:11,color:'#9CA3AF',mb:1}}>
            X Axis: <strong style={{color:'#6366f1'}}>{groupByLabel}</strong>
            {chartCfg.field && <span> · Y Axis: <strong style={{color:'#FF5A5A'}}>{yLabel} ({chartCfg.aggOp||'sum'})</strong></span>}
          </Typography>
        )}
        <ResponsiveContainer width="100%" height={240}>
          {type==='pie'?(
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`}>
                {chartData.map((_,i)=><Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]}/>)}
              </Pie>
              <RTooltip formatter={v=>fmtNum(v)}/><Legend/>
            </PieChart>
          ):type==='line'?(
            <LineChart data={chartData} margin={{left:20,right:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)"/>
              <XAxis dataKey="name" tick={{fontSize:10}}/><YAxis tick={{fontSize:10}} tickFormatter={v=>fmtNum(v)} label={{value:label,angle:-90,position:'insideLeft',style:{fontSize:10,fill:'#9CA3AF'},offset:-5}}/>
              <RTooltip formatter={(v,_)=>[fmtNum(v),label]}/>
              <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2.5} dot={{r:4}}/>
            </LineChart>
          ):(
            <BarChart data={chartData} margin={{left:20,right:10,bottom:20}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)"/>
              <XAxis dataKey="name" tick={{fontSize:10}} angle={chartData.length>6?-25:0} textAnchor={chartData.length>6?'end':'middle'} interval={0}/>
              <YAxis tick={{fontSize:10}} tickFormatter={v=>fmtNum(v)} label={{value:label,angle:-90,position:'insideLeft',style:{fontSize:10,fill:'#9CA3AF'},offset:-5}}/>
              <RTooltip formatter={(v,_)=>[fmtNum(v),label]}/>
              <Bar dataKey="value" radius={[6,6,0,0]}>{chartData.map((_,i)=><Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]}/>)}</Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/* ════════════════ MAIN ════════════════ */
const ReportsPage = () => {
  const [tab, setTab] = useState(0);
  const [clients,    setClients]    = useState([]);
  const [claims,     setClaims]     = useState([]);
  const [quotes,     setQuotes]     = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  // Time period (by record creation date) — applied to whichever source is active.
  const [periodFrom, setPeriodFrom] = useState(null);
  const [periodTo,   setPeriodTo]   = useState(null);
  // Which date the period range filters on (clients): policy start, expiry, or date added.
  const [periodField, setPeriodField] = useState('policy_period_from');
  const [loading,    setLoading]    = useState(false);
  const [savedTemplates, setSavedTemplates] = useState([]);

  // Builder state
  const [source,       setSource]       = useState('clients');
  const [selFields,    setSelFields]    = useState(['client_name','insurance_provider','net_premium','total_invoice']);
  const [summaryFields, setSummaryFields] = useState([]); // numeric fields featured in the top stat cards
  const [groupBy,      setGroupBy]      = useState('');
  const [aggregations, setAggregations] = useState([]);
  const [filters,      setFilters]      = useState([]);
  const [sortBy,       setSortBy]       = useState('');
  const [sortDir,      setSortDir]      = useState('desc');
  const [viewMode,     setViewMode]     = useState('flat'); // flat|subtotals|aggregated|pivot
  const [charts,       setCharts]       = useState([]); // [{id,type,field,label}]
  // Pivot config
  const [pivotColField,  setPivotColField]  = useState('');
  const [pivotValField,  setPivotValField]  = useState('');
  const [pivotValOp,     setPivotValOp]     = useState('sum');

  // Results
  const [results,    setResults]    = useState(null);
  const [pivotData,  setPivotData]  = useState(null);
  const [rPage,      setRPage]      = useState(1);
  const R_PER_PAGE = 25;

  const [saveOpen,  setSaveOpen]  = useState(false);
  const [saveName,  setSaveName]  = useState('');
  const [saveDesc,  setSaveDesc]  = useState('');
  const [savingTpl, setSavingTpl] = useState(false);
  const [toast, setToast] = useState({ open:false, msg:'', severity:'success' });
  const showToast = (msg,severity='success') => setToast({open:true,msg,severity});

  // Chart refs (one per chart)
  const chartRefsMap = useRef({});
  const setChartRef = (id, el) => { chartRefsMap.current[id] = el; };

  const loadData = useCallback(async()=>{
    setLoading(true);
    const [cS,clS,qS]=await Promise.all([
      getDocs(query(collection(db,'clients'),orderBy('created_at','desc'))),
      getDocs(query(collection(db,'claims'), orderBy('created_at','desc'))),
      getDocs(query(collection(db,'quotes'), orderBy('created_at','desc'))),
    ]);
    setClients(cS.docs.map(d=>({id:d.id,...d.data()})));
    setClaims(clS.docs.map(d=>({id:d.id,...d.data()})));
    // Flatten quotes into report-friendly rows (a quote is "finalised" once
    // the broker converts it — status 'confirmed').
    setQuotes(qS.docs.map(d=>{
      const x=d.data(); const fd=x.form_data||{};
      const created=x.created_at?.toDate?x.created_at.toDate():(x.created_at?new Date(x.created_at):null);
      const resp=x.responses||[];
      const active=resp.filter(r=>!r.declined);
      const premiums=active.map(r=>Number(r.premium)||0).filter(n=>n>0);
      return {
        id:d.id,
        reference:x.reference||'',
        product:x.product_label||x.product_key||'',
        // Proposer / client
        client_name:fd.proposer_name||fd.company_name||fd.full_name||fd.client_name||'',
        customer_type:fd.customer_type||'',
        mobile:fd.mobile||fd.mobile_no||'',
        email:fd.email||'',
        nic_no:fd.nic_no||fd.business_reg||fd.nic_proof||'',
        address:fd.address||fd.property_address||fd.address_of_risk||fd.premises_address||'',
        city:fd.city||'',
        district:fd.district||'',
        // Risk basics
        sum_insured:Number(fd.sum_insured||fd.total_value||fd.market_value||fd.sum_assured||0)||'',
        vehicle_no:fd.vehicle_no||'',
        period_from:fd.period_from||fd.departure_date||fd.commencement_date||fd.loan_start||'',
        period_to:fd.period_to||fd.return_date||fd.expiry_date||fd.loan_end||'',
        // Status / outcome
        status:x.status||'',
        not_finalised:x.not_finalised?'Yes':'No',
        not_finalised_at:x.not_finalised_at||'',
        selected_company:x.selected_company||x.customer_selection?.company_name||'',
        selected_premium:Number(x.selected_premium||0)||'',
        // Insurers & responses
        insurers_sent:(x.sent_to||[]).map(c=>c.company_name).filter(Boolean).join(', '),
        sent_count:(x.sent_to||[]).length,
        insurers_responded:active.map(r=>r.company_name).filter(Boolean).join(', '),
        response_count:active.length,
        declined_count:resp.filter(r=>r.declined).length,
        lowest_premium:premiums.length?Math.min(...premiums):'',
        // Audit
        days_outstanding:created?Math.max(0,Math.round((Date.now()-created.getTime())/86400000)):'',
        created_by_name:x.created_by_name||'',
        created_at:x.created_at,
      };
    }));
    setDataLoaded(true); setLoading(false);
  },[]);

  const loadSaved = useCallback(async()=>{
    try{
      const snap=await getDocs(query(collection(db,'report_templates'),orderBy('created_at','desc')));
      setSavedTemplates(snap.docs.map(d=>({id:d.id,...d.data()})));
    } catch{}
  },[]);

  useEffect(()=>{loadData();loadSaved();},[loadData,loadSaved]);

  // Client fields = all underwriting form fields + system fields + any extra keys
  // actually present on the records (product-specific covers/clauses/risk fields).
  const clientFields = useMemo(() => {
    const have = new Set(CLIENT_FIELDS.map(f => f.key));
    const extras = [];
    for (const c of clients) {
      for (const k of Object.keys(c)) {
        if (have.has(k) || isInternalKey(k)) continue;
        have.add(k);
        const v = c[k];
        const type = (typeof v === 'number') || (typeof v === 'string' && v.trim() !== '' && !isNaN(v.replace(/,/g, ''))) ? 'number' : 'string';
        extras.push({ key: k, label: prettyKey(k), type });
      }
    }
    extras.sort((a, b) => a.label.localeCompare(b.label));
    return [...CLIENT_FIELDS, ...extras];
  }, [clients]);

  const fieldsFor = (src) => src === 'clients' ? clientFields : src === 'claims' ? CLAIM_FIELDS : QUOTE_FIELDS;
  const sourceFields = fieldsFor(source);

  // Compute report results from an explicit config + the current datasets/period.
  // Used by both the Run button and by running a template directly, so a template
  // run never depends on React state that hasn't updated yet.
  const buildResults = (cfg) => {
    const base = cfg.source==='clients'?clients:cfg.source==='claims'?claims:quotes;
    const from = periodFrom ? new Date(new Date(periodFrom).setHours(0,0,0,0)) : null;
    const to   = periodTo   ? new Date(new Date(periodTo).setHours(23,59,59,999)) : null;
    // Clients can filter on policy dates; claims/quotes only have a creation date.
    const dateField = cfg.source==='clients' ? (cfg.periodField||periodField) : 'created_at';
    const raw = (from||to) ? base.filter(r=>{
      const v=r[dateField]; const d=v?.toDate?v.toDate():(v?new Date(v):null);
      if(!d||isNaN(d)) return false;
      if(from && d<from) return false;
      if(to   && d>to)   return false;
      return true;
    }) : base;
    const filtered = applyFilters(raw, cfg.filters||[], fieldsFor(cfg.source));
    if (cfg.viewMode==='pivot')
      return { results: filtered, pivot: buildPivot(filtered,cfg.groupBy,cfg.pivotColField,cfg.pivotValField,cfg.pivotValOp) };
    if (cfg.viewMode==='aggregated')
      return { results: sortRows(aggregated(filtered,cfg.groupBy,cfg.aggregations),cfg.sortBy,cfg.sortDir), pivot: null };
    if (cfg.viewMode==='subtotals')
      return { results: withSubtotals(filtered,cfg.groupBy,cfg.aggregations), pivot: null };
    return { results: sortRows(filtered,cfg.sortBy,cfg.sortDir), pivot: null };
  };

  const runReport = () => {
    const { results, pivot } = buildResults({ source, filters, viewMode, groupBy, aggregations, sortBy, sortDir, pivotColField, pivotValField, pivotValOp, periodField });
    setResults(results); setPivotData(pivot); setRPage(1);
  };

  // Load a template into the builder AND run it immediately, then switch to the
  // Report Builder view so the results are shown without a second click.
  const loadTemplate = (tpl) => {
    const cfg = {
      source: tpl.source||'clients',
      fields: tpl.fields||[],
      groupBy: tpl.groupBy||'',
      aggregations: tpl.aggregations||[],
      filters: (tpl.filters||[]).filter(f=>f.value!=='__next90__'),
      sortBy: tpl.sortBy||'',
      sortDir: tpl.sortDir||'desc',
      viewMode: tpl.viewMode||'flat',
      charts: tpl.charts||[],
      pivotColField: tpl.pivotColField||'',
      pivotValField: tpl.pivotValField||'',
      pivotValOp: tpl.pivotValOp||'sum',
      periodField: tpl.periodField||'policy_period_from',
    };
    // reflect the template in the builder controls
    setSource(cfg.source); setSelFields(cfg.fields); setGroupBy(cfg.groupBy);
    setAggregations(cfg.aggregations); setFilters(cfg.filters); setSortBy(cfg.sortBy);
    setSortDir(cfg.sortDir); setViewMode(cfg.viewMode); setCharts(cfg.charts);
    setPivotColField(cfg.pivotColField); setPivotValField(cfg.pivotValField); setPivotValOp(cfg.pivotValOp);
    setSummaryFields(tpl.summaryFields||[]);
    setPeriodField(cfg.periodField);
    setSaveName(tpl.name||''); setSaveDesc(tpl.description||'');
    // compute + show results immediately
    if (tpl.id==='expiry_report') {
      const now=new Date(); now.setHours(0,0,0,0);
      const end=new Date(now); end.setDate(end.getDate()+90);
      const ex=clients.filter(r=>{const v=r.policy_period_to;const d=v?.toDate?v.toDate():new Date(v);return !isNaN(d)&&d>=now&&d<=end;});
      setResults(sortRows(ex,'policy_period_to','asc')); setPivotData(null);
    } else {
      const { results, pivot } = buildResults(cfg);
      setResults(results); setPivotData(pivot);
    }
    setRPage(1);
    setTab(1); // jump to Report Builder where results render
  };

  const handleSaveTpl = async()=>{
    if (!saveName.trim()) return; setSavingTpl(true);
    try {
      const tpl={name:saveName.trim(),description:saveDesc.trim(),source,fields:selFields,summaryFields,groupBy,aggregations,filters,sortBy,sortDir,viewMode,charts,pivotColField,pivotValField,pivotValOp,periodField,created_at:serverTimestamp()};
      await setDoc(doc(collection(db,'report_templates')),tpl);
      setSaveOpen(false); setSaveName(''); setSaveDesc(''); loadSaved(); showToast('Template saved!');
    } catch(err){showToast(err.message,'error');}
    setSavingTpl(false);
  };

  const handleDelTpl = async(id)=>{ await deleteDoc(doc(db,'report_templates',id)); setSavedTemplates(p=>p.filter(t=>t.id!==id)); showToast('Template deleted.','info'); };

  // displayCols for the flat/subtotals/aggregated table
  const displayCols = useMemo(()=>{
    if (!results) return [];
    if ((viewMode==='aggregated'||viewMode==='subtotals') && groupBy && aggregations.length) {
      const gf=sourceFields.find(f=>f.key===groupBy);
      const cols=[{key:groupBy,label:gf?.label||groupBy,type:'string'}];
      for (const agg of aggregations){
        const f=sourceFields.find(ff=>ff.key===agg.field);
        cols.push({key:`${agg.field}_${agg.op}`,label:`${f?.label||agg.field} (${agg.op})`,type:'number'});
      }
      if (viewMode==='subtotals'){
        const dataFields=selFields.map(k=>sourceFields.find(f=>f.key===k)).filter(Boolean);
        return [...new Map([...dataFields,...cols].map(c=>[c.key,c])).values()];
      }
      return cols;
    }
    return selFields.map(k=>sourceFields.find(f=>f.key===k)).filter(Boolean);
  },[results,viewMode,groupBy,aggregations,selFields,sourceFields]);

  // Grand total row appended to flat/aggregated views
  const grandTotalRow = useMemo(()=>{
    if (!results||!displayCols.some(c=>c.type==='number')) return null;
    const dataRows = results.filter(r=>!r._type||r._type==='data');
    if (!dataRows.length) return null;
    const row = { _type:'grandtotal' };
    displayCols.forEach(c=>{
      if (c.type==='number') row[c.key]=dataRows.reduce((a,r)=>a+parseNum(r[c.key]),0);
    });
    if (displayCols[0]) row[displayCols[0].key]='GRAND TOTAL';
    return row;
  },[results,displayCols]);

  const pagedResults = useMemo(()=>{
    if (!results) return [];
    if (viewMode==='subtotals') return results; // no pagination for subtotals
    const page = results.slice((rPage-1)*R_PER_PAGE,rPage*R_PER_PAGE);
    // Append grand total on the last page (or always in aggregated/flat)
    const isLastPage = rPage*R_PER_PAGE>=results.length;
    if (grandTotalRow&&(isLastPage||viewMode==='aggregated')) return [...page,grandTotalRow];
    return page;
  },[results,viewMode,rPage,grandTotalRow]);

  // Charts data — resolves correct aggregated key per view mode
  const chartsData = useMemo(()=>{
    if (!results||!charts.length) return {};
    const dataRows = results.filter(r=>!r._type||r._type==='data');
    return charts.reduce((acc,ch)=>{
      const rawField = ch.field.replace(/_(sum|count|avg|min|max)$/,'');
      // Find what aggregation op was configured for this field
      const aggOp = ch.aggOp || aggregations.find(a=>a.field===rawField)?.op || 'sum';
      const aggKey = `${rawField}_${aggOp}`; // the key that exists in aggregated/subtotal rows
      let data = [];

      if (viewMode==='aggregated') {
        const src = results.filter(r=>!r._type);
        data = src.slice(0,15).map(r=>({
          name: String(r[groupBy]||r[selFields[0]]||'').slice(0,22),
          value: parseNum(r[aggKey]??r[rawField]),
        }));
      } else if (viewMode==='subtotals') {
        const src = results.filter(r=>r._type==='subtotal');
        data = src.slice(0,15).map(r=>({
          name: String(r[groupBy]||'').slice(0,22),
          value: parseNum(r[aggKey]??r[rawField]),
        }));
      } else {
        // Flat mode: group + aggregate on-the-fly
        if (groupBy) {
          const groups = {};
          for (const row of dataRows) {
            const k = String(row[groupBy]||'(None)').slice(0,22);
            if (!groups[k]) groups[k]=[];
            groups[k].push(parseNum(row[rawField]));
          }
          data = Object.entries(groups)
            .map(([name,vals])=>({ name, value: computeAgg(aggOp,vals) }))
            .sort((a,b)=>b.value-a.value).slice(0,15);
        } else {
          data = dataRows.slice(0,15).map(r=>({
            name: String(r[selFields[0]]||'').slice(0,22),
            value: parseNum(r[rawField]),
          }));
        }
      }
      acc[ch.id] = data.filter(d=>d.value>0||d.name);
      return acc;
    },{});
  },[results,charts,groupBy,selFields,viewMode,aggregations]);

  const addChart = ()=>setCharts(p=>[...p,{id:Date.now().toString(),type:'bar',field:sourceFields.find(f=>f.type==='number')?.key||'',label:'New Chart'}]);
  const removeChart = (id)=>setCharts(p=>p.filter(c=>c.id!==id));
  const updateChart = (id,patch)=>setCharts(p=>p.map(c=>c.id===id?{...c,...patch}:c));

  const allChartEls = () => charts.map(c=>chartRefsMap.current[c.id]).filter(Boolean);

  const renderCell = (col, row) => {
    const v = row[col.key];
    if (v===null||v===undefined) return '—';
    if (col.type==='date') return fmtDate(v);
    if (col.type==='number') return fmtNum(v);
    return String(v);
  };

  const rowSx = (row) => {
    if (row._type==='grandtotal') return { bgcolor:'#1A1A2E','& td':{color:'#fff',fontWeight:800,borderBottom:'none'} };
    if (row._type==='subtotal')   return { bgcolor:'rgba(99,102,241,0.08)','& td':{color:'#4338ca',fontWeight:700,fontStyle:'italic'} };
    return { '&:nth-of-type(even)':{ bgcolor:'rgba(255,248,245,0.6)' }, '&:hover':{ bgcolor:'rgba(255,90,90,0.04)' } };
  };

  const totalDataRows = results ? results.filter(r=>!r._type||r._type==='data').length : 0;

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
    <Box className="page-enter" sx={{ maxWidth:1200, mx:'auto' }}>

      {/* Header */}
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} sx={{mb:3}}>
        <Box>
          <Typography variant="h5" sx={{fontWeight:800,mb:0.3}}>Reports</Typography>
          <Typography sx={{fontSize:13,color:'#9CA3AF'}}>Build custom reports with subtotals, pivot tables, multiple charts and exports</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button size="small" variant="outlined" startIcon={<RefreshIcon/>} onClick={loadData} disabled={loading}
            sx={{fontSize:12,borderColor:'rgba(255,139,90,0.35)',color:'#FF8B5A'}}>{loading?'Loading…':'Refresh'}</Button>
          {results&&<>
            <Button size="small" variant="outlined" startIcon={<PictureAsPdfOutlinedIcon/>}
              onClick={()=>exportPDF(displayCols,results,saveName||'Report',allChartEls())}
              sx={{fontSize:12,borderColor:'rgba(239,68,68,0.35)',color:'#ef4444'}}>Export PDF</Button>
            <Button size="small" variant="outlined" startIcon={<FileDownloadOutlinedIcon/>}
              onClick={()=>exportCSV(displayCols,results,saveName||'Report')}
              sx={{fontSize:12,borderColor:'rgba(16,185,129,0.35)',color:'#059669'}}>Export CSV</Button>
            <Button size="small" variant="outlined" startIcon={<FileDownloadOutlinedIcon/>}
              onClick={()=>exportExcel(displayCols,results,saveName||'Report',charts.map(ch=>({type:ch.type,label:ch.label,data:(chartsData[ch.id]||[]).filter(d=>d.name)})))}
              sx={{fontSize:12,borderColor:'rgba(99,102,241,0.35)',color:'#6366f1'}}>Export Excel</Button>
            <Button size="small" variant="contained" startIcon={<SaveOutlinedIcon/>} onClick={()=>setSaveOpen(true)} sx={{fontSize:12}}>Save Template</Button>
          </>}
        </Stack>
      </Stack>

      <Tabs value={tab} onChange={(_,v)=>setTab(v)} sx={{mb:2.5,borderBottom:'1px solid rgba(255,139,90,0.12)','& .MuiTab-root':{fontSize:13,fontWeight:600,textTransform:'none',color:'#9CA3AF'},'& .Mui-selected':{color:'#FF5A5A'},'& .MuiTabs-indicator':{background:'linear-gradient(90deg,#FF5A5A,#FF8B5A)',height:2.5}}}>
        <Tab icon={<BookmarkIcon sx={{fontSize:17}}/>} iconPosition="start" label={`Templates (${BUILTIN_TEMPLATES.length+savedTemplates.length})`}/>
        <Tab icon={<TuneIcon sx={{fontSize:17}}/>} iconPosition="start" label="Report Builder"/>
      </Tabs>

      {tab===1&&(
        <Stack direction={{xs:'column',lg:'row'}} spacing={2.5} alignItems="flex-start">

          {/* ── Config panel ── */}
          <Box sx={{width:{xs:'100%',lg:340},flexShrink:0}}>
            <Card sx={{border:'1px solid rgba(255,139,90,0.12)',mb:2}}>
              <CardContent sx={{p:2.5}}>

                {/* Source */}
                <Typography sx={{fontSize:11,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:0.8,mb:1}}>Data Source</Typography>
                <FormControl fullWidth size="small" sx={{mb:2.5}}>
                  <Select value={source} onChange={e=>{setSource(e.target.value);setSelFields([]);setGroupBy('');setAggregations([]);setFilters([]);setResults(null);setPivotData(null);}}>
                    <MenuItem value="clients">Underwriting (Clients)</MenuItem>
                    <MenuItem value="claims">Claims</MenuItem>
                    <MenuItem value="quotes">Quotations</MenuItem>
                  </Select>
                </FormControl>

                {/* Time period */}
                <Typography sx={{fontSize:11,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:0.8,mb:1}}>Time Period</Typography>
                {source==='clients' && (
                  <FormControl fullWidth size="small" sx={{mb:1}}>
                    <InputLabel sx={{fontSize:12}}>Period applies to</InputLabel>
                    <Select label="Period applies to" value={periodField} onChange={e=>setPeriodField(e.target.value)} sx={{fontSize:13}}>
                      <MenuItem value="policy_period_from" sx={{fontSize:13}}>Policy From (start date)</MenuItem>
                      <MenuItem value="policy_period_to"   sx={{fontSize:13}}>Policy Expiry</MenuItem>
                      <MenuItem value="created_at"         sx={{fontSize:13}}>Date Added</MenuItem>
                    </Select>
                  </FormControl>
                )}
                <Stack direction="row" spacing={1} sx={{mb:1}}>
                  <DatePicker label="From" value={periodFrom} onChange={setPeriodFrom}
                    slotProps={{textField:{size:'small',fullWidth:true}}}/>
                  <DatePicker label="To" value={periodTo} onChange={setPeriodTo}
                    slotProps={{textField:{size:'small',fullWidth:true}}}/>
                </Stack>
                <Stack direction="row" spacing={0.7} sx={{mb:2.5,flexWrap:'wrap',gap:0.7}}>
                  {[['This month',()=>{const n=new Date();return[new Date(n.getFullYear(),n.getMonth(),1),new Date(n.getFullYear(),n.getMonth()+1,0)];}],
                    ['Last 30 days',()=>{const t=new Date();const f=new Date();f.setDate(f.getDate()-30);return[f,t];}],
                    ['This year',()=>{const n=new Date();return[new Date(n.getFullYear(),0,1),new Date(n.getFullYear(),11,31)];}]].map(([lbl,fn])=>(
                    <Chip key={lbl} label={lbl} size="small" onClick={()=>{const[f,t]=fn();setPeriodFrom(f);setPeriodTo(t);}}
                      sx={{fontSize:10.5,cursor:'pointer',bgcolor:'rgba(99,102,241,0.08)',color:'#6366f1'}}/>
                  ))}
                  {(periodFrom||periodTo)&&(
                    <Chip label="Clear" size="small" onClick={()=>{setPeriodFrom(null);setPeriodTo(null);}}
                      sx={{fontSize:10.5,cursor:'pointer',bgcolor:'rgba(0,0,0,0.05)',color:'#6B7280'}}/>
                  )}
                </Stack>

                {/* Fields */}
                <Typography sx={{fontSize:11,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:0.8,mb:1}}>Fields to Show</Typography>
                <Box sx={{maxHeight:180,overflowY:'auto',border:'1px solid rgba(0,0,0,0.08)',borderRadius:'8px',p:1,mb:1}}>
                  {sourceFields.map(f=>(
                    <FormControlLabel key={f.key} control={<Checkbox size="small" checked={selFields.includes(f.key)} onChange={()=>setSelFields(p=>p.includes(f.key)?p.filter(k=>k!==f.key):[...p,f.key])} sx={{color:'#FF8B5A','&.Mui-checked':{color:'#FF5A5A'},p:0.5}}/>} label={<Typography sx={{fontSize:12}}>{f.label}</Typography>} sx={{display:'block',m:0,py:0.2}}/>
                  ))}
                </Box>
                <Stack direction="row" spacing={1} sx={{mb:2.5}}>
                  <Button size="small" onClick={()=>setSelFields(sourceFields.map(f=>f.key))} sx={{fontSize:10.5,color:'#6366f1',minWidth:0,p:0.3}}>Select all</Button>
                  <Button size="small" onClick={()=>setSelFields([])} sx={{fontSize:10.5,color:'#9CA3AF',minWidth:0,p:0.3}}>Clear</Button>
                </Stack>

                {/* Summary cards — choose which numeric totals appear in the top boxes */}
                <Typography sx={{fontSize:11,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:0.8,mb:1}}>Summary Cards (totals)</Typography>
                <Box sx={{maxHeight:140,overflowY:'auto',border:'1px solid rgba(0,0,0,0.08)',borderRadius:'8px',p:1,mb:0.5}}>
                  {sourceFields.filter(f=>f.type==='number').map(f=>(
                    <FormControlLabel key={f.key} control={<Checkbox size="small" checked={summaryFields.includes(f.key)} onChange={()=>setSummaryFields(p=>p.includes(f.key)?p.filter(k=>k!==f.key):[...p,f.key])} sx={{color:'#6366f1','&.Mui-checked':{color:'#6366f1'},p:0.5}}/>} label={<Typography sx={{fontSize:12}}>{f.label}</Typography>} sx={{display:'block',m:0,py:0.2}}/>
                  ))}
                </Box>
                <Typography sx={{fontSize:10.5,color:'#9CA3AF',mb:2.5}}>
                  {summaryFields.length ? `${summaryFields.length} chosen` : 'None chosen — defaults to the first 3 numeric fields shown.'}
                </Typography>

                {/* View Mode */}
                <Typography sx={{fontSize:11,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:0.8,mb:1}}>View Mode</Typography>
                <Stack spacing={0.8} sx={{mb:2.5}}>
                  {[
                    { value:'flat',       icon:<ViewListIcon sx={{fontSize:15}}/>, label:'Individual Records', desc:'Every row shown separately. No grouping.' },
                    { value:'subtotals',  icon:<FunctionsIcon sx={{fontSize:15}}/>, label:'Individual + Subtotals', desc:'Every row shown, PLUS a subtotal row after each group and a grand total at the bottom.' },
                    { value:'aggregated', icon:<TableChartOutlinedIcon sx={{fontSize:15}}/>, label:'Grouped Summary', desc:'One summary row per group showing sums/counts only.' },
                    { value:'pivot',      icon:<GridOnIcon sx={{fontSize:15}}/>, label:'Pivot Table', desc:'Cross-tab: row field × column field → aggregated value.' },
                  ].map(m=>(
                    <Box key={m.value} onClick={()=>setViewMode(m.value)} sx={{
                      p:1.2, borderRadius:'8px', cursor:'pointer',
                      border:`1.5px solid ${viewMode===m.value?'#6366f1':'rgba(0,0,0,0.08)'}`,
                      bgcolor: viewMode===m.value?'rgba(99,102,241,0.06)':'transparent',
                      transition:'all 0.15s',
                      '&:hover':{ borderColor:'#6366f1', bgcolor:'rgba(99,102,241,0.04)' },
                    }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Box sx={{color: viewMode===m.value?'#6366f1':'#9CA3AF'}}>{m.icon}</Box>
                        <Box>
                          <Typography sx={{fontSize:12,fontWeight:700,color: viewMode===m.value?'#6366f1':'#374151'}}>{m.label}</Typography>
                          <Typography sx={{fontSize:10.5,color:'#9CA3AF',lineHeight:1.4}}>{m.desc}</Typography>
                        </Box>
                      </Stack>
                    </Box>
                  ))}
                </Stack>

                {/* Group By (flat/subtotals/aggregated) */}
                {viewMode!=='pivot'&&(
                  <>
                    <Typography sx={{fontSize:11,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:0.8,mb:1}}>Group By</Typography>
                    <FormControl fullWidth size="small" sx={{mb:2.5}}>
                      <Select value={groupBy} onChange={e=>setGroupBy(e.target.value)}>
                        <MenuItem value="">None — show all rows</MenuItem>
                        {sourceFields.filter(f=>f.type==='string').map(f=><MenuItem key={f.key} value={f.key}>{f.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </>
                )}

                {/* Aggregations */}
                {(viewMode==='subtotals'||viewMode==='aggregated')&&groupBy&&(
                  <>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:0.5}}>
                      <Typography sx={{fontSize:11,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:0.8}}>
                        Summary Columns
                      </Typography>
                      <IconButton size="small" onClick={()=>setAggregations(p=>[...p,{field:sourceFields.find(f=>f.type==='number')?.key||'',op:'sum'}])} sx={{color:'#FF5A5A'}}><AddIcon fontSize="small"/></IconButton>
                    </Stack>
                    <Typography sx={{fontSize:11,color:'#9CA3AF',mb:1,lineHeight:1.5}}>
                      These add calculated columns to each group
                      {viewMode==='subtotals'?' (shown in the subtotal rows, not on individual records).':'.'}
                      {' '}Individual record values are shown as-is from "Fields to Show" above.
                    </Typography>
                    <Stack spacing={1} sx={{mb:2.5}}>
                      {aggregations.map((agg,i)=>(
                        <Stack key={i} direction="row" spacing={0.5} alignItems="center">
                          <FormControl size="small" sx={{flex:1}}>
                            <Select value={agg.field} onChange={e=>setAggregations(p=>p.map((a,idx)=>idx===i?{...a,field:e.target.value}:a))}>
                              {sourceFields.filter(f=>f.type==='number').map(f=><MenuItem key={f.key} value={f.key} sx={{fontSize:12}}>{f.label}</MenuItem>)}
                            </Select>
                          </FormControl>
                          <FormControl size="small" sx={{width:90}}>
                            <Select value={agg.op} onChange={e=>setAggregations(p=>p.map((a,idx)=>idx===i?{...a,op:e.target.value}:a))}>
                              <MenuItem value="sum"   sx={{fontSize:12}}>Sum (total)</MenuItem>
                              <MenuItem value="count" sx={{fontSize:12}}>Count (# records)</MenuItem>
                              <MenuItem value="avg"   sx={{fontSize:12}}>Average</MenuItem>
                              <MenuItem value="min"   sx={{fontSize:12}}>Minimum</MenuItem>
                              <MenuItem value="max"   sx={{fontSize:12}}>Maximum</MenuItem>
                            </Select>
                          </FormControl>
                          <IconButton size="small" onClick={()=>setAggregations(p=>p.filter((_,idx)=>idx!==i))} sx={{color:'#9CA3AF',flexShrink:0}}><DeleteOutlineIcon fontSize="small"/></IconButton>
                        </Stack>
                      ))}
                      {!aggregations.length&&<Typography sx={{fontSize:12,color:'#9CA3AF'}}>Click + to add a summary column</Typography>}
                    </Stack>
                  </>
                )}

                {/* Pivot config */}
                {viewMode==='pivot'&&(
                  <>
                    <Typography sx={{fontSize:11,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:0.8,mb:1}}>Pivot Settings</Typography>
                    <Stack spacing={1.2} sx={{mb:2.5}}>
                      <FormControl size="small" fullWidth><InputLabel sx={{fontSize:12}}>Row field</InputLabel><Select label="Row field" value={groupBy} onChange={e=>setGroupBy(e.target.value)}>{sourceFields.filter(f=>f.type==='string').map(f=><MenuItem key={f.key} value={f.key} sx={{fontSize:12}}>{f.label}</MenuItem>)}</Select></FormControl>
                      <FormControl size="small" fullWidth><InputLabel sx={{fontSize:12}}>Column field</InputLabel><Select label="Column field" value={pivotColField} onChange={e=>setPivotColField(e.target.value)}>{sourceFields.filter(f=>f.type==='string').map(f=><MenuItem key={f.key} value={f.key} sx={{fontSize:12}}>{f.label}</MenuItem>)}</Select></FormControl>
                      <FormControl size="small" fullWidth><InputLabel sx={{fontSize:12}}>Value field</InputLabel><Select label="Value field" value={pivotValField} onChange={e=>setPivotValField(e.target.value)}>{sourceFields.filter(f=>f.type==='number').map(f=><MenuItem key={f.key} value={f.key} sx={{fontSize:12}}>{f.label}</MenuItem>)}</Select></FormControl>
                      <FormControl size="small" fullWidth><InputLabel sx={{fontSize:12}}>Aggregation</InputLabel><Select label="Aggregation" value={pivotValOp} onChange={e=>setPivotValOp(e.target.value)}>{NUMBER_OPS.map(op=><MenuItem key={op} value={op} sx={{fontSize:12}}>{op}</MenuItem>)}</Select></FormControl>
                    </Stack>
                  </>
                )}

                {/* Quick date presets */}
                <Typography sx={{fontSize:11,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:0.8,mb:1}}>Quick Date Filter</Typography>
                <Stack direction="row" spacing={0.7} flexWrap="wrap" sx={{mb:2.5}}>
                  {[
                    {label:'This Month',fn:()=>{const n=new Date();return`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01|${new Date(n.getFullYear(),n.getMonth()+1,0).toISOString().slice(0,10)}`;}},
                    {label:'Last Month',fn:()=>{const n=new Date();const m=new Date(n.getFullYear(),n.getMonth()-1,1);return`${m.toISOString().slice(0,10)}|${new Date(n.getFullYear(),n.getMonth(),0).toISOString().slice(0,10)}`;}},
                    {label:'This Year', fn:()=>{const y=new Date().getFullYear();return`${y}-01-01|${y}-12-31`;}},
                    {label:'Last Year', fn:()=>{const y=new Date().getFullYear()-1;return`${y}-01-01|${y}-12-31`;}},
                  ].map(({label,fn})=>(
                    <Chip key={label} label={label} size="small" clickable onClick={()=>setFilters(p=>[...p.filter(f=>f.field!=='created_at'),{field:'created_at',op:'between',value:fn()}])}
                      sx={{fontSize:11,height:24,fontWeight:600,bgcolor:'rgba(99,102,241,0.08)',color:'#6366f1',border:'1px solid rgba(99,102,241,0.20)'}}/>
                  ))}
                  {filters.some(f=>f.field==='created_at')&&<Chip label="Clear date" size="small" clickable onClick={()=>setFilters(p=>p.filter(f=>f.field!=='created_at'))} sx={{fontSize:11,height:24,bgcolor:'rgba(239,68,68,0.07)',color:'#ef4444'}}/>}
                </Stack>

                {/* Filters */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:1}}>
                  <Typography sx={{fontSize:11,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:0.8}}>Filters</Typography>
                  <IconButton size="small" onClick={()=>setFilters(p=>[...p,{field:sourceFields[0].key,op:'equals',value:''}])} sx={{color:'#FF5A5A'}}><AddIcon fontSize="small"/></IconButton>
                </Stack>
                <Stack spacing={1.2} sx={{mb:2.5}}>
                  {filters.map((f,i)=>{
                    const fd=sourceFields.find(sf=>sf.key===f.field);
                    const ops=FILTER_OPS[fd?.type||'string'];
                    return(
                      <Box key={i} sx={{p:1.5,border:'1px solid rgba(0,0,0,0.08)',borderRadius:'8px'}}>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{mb:0.8}}>
                          <FormControl size="small" sx={{flex:1}}><Select value={f.field} onChange={e=>setFilters(p=>p.map((ff,idx)=>idx===i?{field:e.target.value,op:'equals',value:''}:ff))}>{sourceFields.map(sf=><MenuItem key={sf.key} value={sf.key} sx={{fontSize:12}}>{sf.label}</MenuItem>)}</Select></FormControl>
                          <IconButton size="small" onClick={()=>setFilters(p=>p.filter((_,idx)=>idx!==i))} sx={{color:'#9CA3AF'}}><DeleteOutlineIcon fontSize="small"/></IconButton>
                        </Stack>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                          <FormControl size="small" sx={{width:110,flexShrink:0}}><Select value={f.op} onChange={e=>setFilters(p=>p.map((ff,idx)=>idx===i?{...ff,op:e.target.value,value:''}:ff))}>{ops.map(op=><MenuItem key={op} value={op} sx={{fontSize:12}}>{op}</MenuItem>)}</Select></FormControl>
                          {fd?.type==='date' ? (
                            f.op==='between' ? (
                              <Stack direction="row" spacing={0.5} sx={{flex:1}} flexWrap="wrap">
                                <DatePicker
                                  label="From" value={f.value?.split('|')[0]?new Date(f.value.split('|')[0]):null}
                                  onChange={val=>{
                                    const to=f.value?.split('|')[1]||'';
                                    const from=val?val.toISOString().slice(0,10):'';
                                    setFilters(p=>p.map((ff,idx)=>idx===i?{...ff,value:`${from}|${to}`}:ff));
                                  }}
                                  slotProps={{textField:{size:'small',sx:{flex:1,minWidth:130,'& input':{fontSize:12}}}}}/>
                                <DatePicker
                                  label="To" value={f.value?.split('|')[1]?new Date(f.value.split('|')[1]):null}
                                  onChange={val=>{
                                    const from=f.value?.split('|')[0]||'';
                                    const to=val?val.toISOString().slice(0,10):'';
                                    setFilters(p=>p.map((ff,idx)=>idx===i?{...ff,value:`${from}|${to}`}:ff));
                                  }}
                                  slotProps={{textField:{size:'small',sx:{flex:1,minWidth:130,'& input':{fontSize:12}}}}}/>
                              </Stack>
                            ) : (
                              <DatePicker
                                value={f.value?new Date(f.value):null}
                                onChange={val=>setFilters(p=>p.map((ff,idx)=>idx===i?{...ff,value:val?val.toISOString().slice(0,10):''}:ff))}
                                slotProps={{textField:{size:'small',sx:{flex:1,'& input':{fontSize:12}}}}}/>
                            )
                          ) : (
                            <TextField size="small" value={f.value} onChange={e=>setFilters(p=>p.map((ff,idx)=>idx===i?{...ff,value:e.target.value}:ff))} placeholder="Value" sx={{flex:1,'& input':{fontSize:12}}}/>
                          )}
                        </Stack>
                      </Box>
                    );
                  })}
                  {!filters.length&&<Typography sx={{fontSize:12,color:'#9CA3AF'}}>No filters — showing all records</Typography>}
                </Stack>

                {/* Sort */}
                <Typography sx={{fontSize:11,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:0.8,mb:1}}>Sort</Typography>
                <Stack direction="row" spacing={1} sx={{mb:2.5}}>
                  <FormControl size="small" sx={{flex:1}}><InputLabel sx={{fontSize:12}}>Sort by</InputLabel><Select label="Sort by" value={sortBy} onChange={e=>setSortBy(e.target.value)}><MenuItem value="">None</MenuItem>{sourceFields.map(f=><MenuItem key={f.key} value={f.key} sx={{fontSize:12}}>{f.label}</MenuItem>)}</Select></FormControl>
                  <FormControl size="small" sx={{width:90}}><Select value={sortDir} onChange={e=>setSortDir(e.target.value)}><MenuItem value="asc">Asc</MenuItem><MenuItem value="desc">Desc</MenuItem></Select></FormControl>
                </Stack>

                {/* Charts */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{mb:1}}>
                  <Typography sx={{fontSize:11,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:0.8}}>Charts</Typography>
                  <Button size="small" startIcon={<AddIcon/>} onClick={addChart} sx={{fontSize:11,color:'#6366f1',minWidth:0}}>Add Chart</Button>
                </Stack>
                <Stack spacing={1} sx={{mb:2.5}}>
                  {charts.map((ch,i)=>(
                    <Box key={ch.id} sx={{p:1.2,border:'1px solid rgba(99,102,241,0.15)',borderRadius:'8px',bgcolor:'rgba(99,102,241,0.03)',display:'flex',alignItems:'center',gap:1}}>
                      <Typography sx={{fontSize:12,fontWeight:700,color:'#6366f1',flex:1}}>
                        Chart {i+1}: {sourceFields.find(f=>f.key===ch.field)?.label||'—'} ({ch.aggOp||'sum'})
                      </Typography>
                      <IconButton size="small" onClick={()=>removeChart(ch.id)} sx={{color:'#9CA3AF','&:hover':{color:'#ef4444'}}}><DeleteOutlineIcon fontSize="small"/></IconButton>
                    </Box>
                  ))}
                  {!charts.length&&<Typography sx={{fontSize:12,color:'#9CA3AF'}}>No charts — click "Add Chart"</Typography>}
                </Stack>

                <Button fullWidth variant="contained" size="large" startIcon={<PlayArrowIcon/>} onClick={runReport} disabled={!dataLoaded||loading||selFields.length===0} sx={{fontWeight:700,fontSize:14}}>
                  {loading?'Loading data…':'Run Report'}
                </Button>
              </CardContent>
            </Card>
          </Box>

          {/* ── Results ── */}
          <Box sx={{flex:1,minWidth:0}}>
            {!dataLoaded&&<Stack spacing={1}>{[1,2,3].map(i=><Skeleton key={i} height={56} sx={{borderRadius:'10px'}}/>)}</Stack>}

            {dataLoaded&&!results&&(
              <Box sx={{textAlign:'center',py:8,bgcolor:'rgba(255,90,90,0.03)',borderRadius:'16px',border:'1px dashed rgba(255,139,90,0.20)'}}>
                <Typography sx={{fontSize:40,mb:1}}>📊</Typography>
                <Typography sx={{fontWeight:700,fontSize:15,color:'#1A1A2E',mb:0.5}}>Configure and run your report</Typography>
                <Typography sx={{fontSize:13,color:'#9CA3AF'}}>Select fields, set a view mode, add filters, then click Run Report</Typography>
              </Box>
            )}

            {results&&(
              <>
                {/* Summary stats — featured fields are user-chosen (Summary Cards),
                    falling back to the first 3 numeric shown fields. */}
                <Box sx={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))',gap:1.5,mb:2}}>
                  {(() => {
                    const dataRows = results.filter(r=>!r._type||r._type==='data');
                    const chosen = summaryFields.length
                      ? summaryFields.map(k=>sourceFields.find(f=>f.key===k)).filter(Boolean)
                      : displayCols.filter(c=>c.type==='number').slice(0,3);
                    return [
                      {label:'Total Records',val:totalDataRows,color:'#6366f1',bg:'rgba(99,102,241,0.06)'},
                      ...chosen.map(c=>({
                        label:c.label,
                        val:fmtNum(dataRows.reduce((a,r)=>a+parseNum(r[c.key]),0)),
                        color:'#FF5A5A',bg:'rgba(255,90,90,0.05)',
                      })),
                    ];
                  })().map((s,i)=>(
                    <Box key={i} sx={{
                      position:'relative', p:1.6, pl:2, borderRadius:'12px', bgcolor:s.bg,
                      border:'1px solid rgba(0,0,0,0.05)', overflow:'hidden',
                      display:'flex', flexDirection:'column', justifyContent:'center', minHeight:74,
                    }}>
                      <Box sx={{position:'absolute',left:0,top:0,bottom:0,width:4,bgcolor:s.color,opacity:0.85}}/>
                      <Typography sx={{fontSize:10,fontWeight:700,color:'#6B7280',textTransform:'uppercase',letterSpacing:0.5,mb:0.4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.label}</Typography>
                      <Typography sx={{fontSize:20,fontWeight:800,color:s.color,lineHeight:1.1}}>{s.val}</Typography>
                    </Box>
                  ))}
                </Box>

                {/* Mode badge */}
                <Stack direction="row" spacing={1} sx={{mb:2}}>
                  <Chip size="small" label={{flat:'Flat View',subtotals:'Grouped + Subtotals',aggregated:'Aggregated',pivot:'Pivot Table'}[viewMode]}
                    sx={{fontSize:11,height:22,fontWeight:700,bgcolor:'rgba(99,102,241,0.10)',color:'#6366f1'}}/>
                  {groupBy&&<Chip size="small" label={`Grouped by ${sourceFields.find(f=>f.key===groupBy)?.label||groupBy}`} sx={{fontSize:11,height:22,bgcolor:'rgba(16,185,129,0.08)',color:'#059669'}}/>}
                </Stack>

                {/* Charts */}
                {charts.map(ch=>(
                  chartsData[ch.id]?.length>0&&(
                    <ReportChart key={ch.id} chartCfg={ch} data={chartsData[ch.id]}
                      groupByLabel={groupBy ? sourceFields.find(f=>f.key===groupBy)?.label : null}
                      allFields={sourceFields}
                      innerRef={el=>setChartRef(ch.id,el)}
                      onRemove={()=>removeChart(ch.id)}
                      onUpdate={patch=>updateChart(ch.id,patch)}/>
                  )
                ))}

                {/* Pivot Table */}
                {viewMode==='pivot'&&pivotData&&(
                  <Card sx={{border:'1px solid rgba(255,139,90,0.12)',mb:2}}>
                    <CardContent sx={{p:0,'&:last-child':{pb:0}}}>
                      <Box sx={{px:2.5,py:1.5,borderBottom:'1px solid rgba(255,139,90,0.08)'}}>
                        <Typography sx={{fontWeight:700,fontSize:14}}>
                          Pivot: {sourceFields.find(f=>f.key===groupBy)?.label} × {sourceFields.find(f=>f.key===pivotColField)?.label} → {sourceFields.find(f=>f.key===pivotValField)?.label} ({pivotValOp})
                        </Typography>
                      </Box>
                      <Box sx={{overflowX:'auto'}}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{bgcolor:'#1A1A2E'}}>
                              <TableCell sx={{color:'#FF8B5A',fontWeight:700,fontSize:11.5,whiteSpace:'nowrap',py:1.2}}>{sourceFields.find(f=>f.key===groupBy)?.label||groupBy}</TableCell>
                              {pivotData.colValues.map(cv=><TableCell key={cv} sx={{color:'#FF8B5A',fontWeight:700,fontSize:11.5,whiteSpace:'nowrap',py:1.2,textAlign:'right'}}>{cv}</TableCell>)}
                              <TableCell sx={{color:'#fff',fontWeight:800,fontSize:11.5,textAlign:'right',py:1.2}}>TOTAL</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {pivotData.pivotRows.map((row,i)=>(
                              <TableRow key={i} sx={row._type==='pivottotal'?{bgcolor:'#1A1A2E','& td':{color:'#fff',fontWeight:800}}:{
                                '&:nth-of-type(even)':{bgcolor:'rgba(255,248,245,0.6)'},
                                '&:hover':{bgcolor:'rgba(255,90,90,0.04)'},
                              }}>
                                <TableCell sx={{fontSize:12.5,fontWeight:row._type==='pivottotal'?800:600,py:1,whiteSpace:'nowrap'}}>{row._rowLabel}</TableCell>
                                {pivotData.colValues.map(cv=><TableCell key={cv} sx={{fontSize:12.5,py:1,textAlign:'right',fontFamily:'monospace'}}>{fmtNum(row[`_p_${cv}`])}</TableCell>)}
                                <TableCell sx={{fontSize:12.5,py:1,textAlign:'right',fontWeight:700,fontFamily:'monospace'}}>{fmtNum(row._rowTotal)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Box>
                    </CardContent>
                  </Card>
                )}

                {/* Flat / Subtotals / Aggregated table */}
                {viewMode!=='pivot'&&(
                  <Card sx={{border:'1px solid rgba(255,139,90,0.12)'}}>
                    <CardContent sx={{p:0,'&:last-child':{pb:0}}}>
                      <Box sx={{px:2.5,py:1.5,borderBottom:'1px solid rgba(255,139,90,0.08)',display:'flex',alignItems:'center',gap:1}}>
                        <TableChartOutlinedIcon sx={{color:'#9CA3AF',fontSize:18}}/>
                        <Typography sx={{fontWeight:700,fontSize:14}}>
                          Data ({totalDataRows} rows{viewMode==='subtotals'&&groupBy?', with subtotals':''})
                        </Typography>
                      </Box>
                      <Box sx={{overflowX:'auto'}}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{bgcolor:'#1A1A2E'}}>
                              {displayCols.map(c=><TableCell key={c.key} sx={{color:'#FF8B5A',fontWeight:700,fontSize:11.5,whiteSpace:'nowrap',borderBottom:'none',py:1.2,textAlign:c.type==='number'?'right':'left'}}>{c.label}</TableCell>)}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {pagedResults.map((row,i)=>(
                              <TableRow key={i} sx={rowSx(row)}>
                                {displayCols.map(c=>(
                                  <TableCell key={c.key} sx={{fontSize:12.5,py:1,borderBottom:'1px solid rgba(255,139,90,0.07)',textAlign:c.type==='number'?'right':'left',fontFamily:c.type==='number'?'monospace':'inherit'}}>
                                    {row._type==='subtotal'&&c===displayCols[0]?`↳ Subtotal: ${row[c.key]||''}`:
                                     row._type==='grandtotal'&&c===displayCols[0]?'GRAND TOTAL':
                                     renderCell(c,row)}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </Box>
                      {viewMode!=='subtotals'&&results.length>R_PER_PAGE&&(
                        <Box sx={{display:'flex',justifyContent:'center',py:1.5}}>
                          <Pagination count={Math.ceil(results.length/R_PER_PAGE)} page={rPage} onChange={(_,v)=>setRPage(v)} size="small"
                            sx={{'& .Mui-selected':{bgcolor:'rgba(255,90,90,0.12) !important',color:'#FF5A5A',fontWeight:700}}}/>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </Box>
        </Stack>
      )}

      {/* Templates tab — built-in + saved templates, each runs directly */}
      {tab===0&&(
        <Box>
          <Typography sx={{fontSize:11,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:1,mb:1.5}}>Built-in Reports</Typography>
          <Stack spacing={1.5} sx={{mb:3}}>
            {BUILTIN_TEMPLATES.map(tpl=>(
              <Card key={tpl.id} sx={{border:'1px solid rgba(255,139,90,0.12)'}}>
                <CardContent sx={{p:0,'&:last-child':{pb:0}}}>
                  <Box sx={{px:2.5,py:1.5,display:'flex',alignItems:'center',gap:1.5}}>
                    <Typography sx={{fontSize:22}}>{tpl.icon}</Typography>
                    <Box sx={{flex:1,minWidth:0}}>
                      <Typography sx={{fontWeight:700,fontSize:14}}>{tpl.name}</Typography>
                      <Typography sx={{fontSize:12,color:'#9CA3AF'}}>{tpl.description}</Typography>
                    </Box>
                    <Button size="small" variant="contained" startIcon={<PlayArrowIcon/>} onClick={()=>loadTemplate(tpl)} sx={{fontSize:12}}>Run</Button>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Stack>

          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{mb:1.5}}>
            <Typography sx={{fontSize:11,fontWeight:800,color:'#9CA3AF',textTransform:'uppercase',letterSpacing:1}}>My Saved Templates</Typography>
            <Button size="small" variant="outlined" startIcon={<TuneIcon sx={{fontSize:15}}/>} onClick={()=>setTab(1)} sx={{fontSize:11.5,borderColor:'rgba(99,102,241,0.35)',color:'#6366f1'}}>Open Report Builder</Button>
          </Stack>
          {savedTemplates.length===0?(
            <Box sx={{textAlign:'center',py:6,border:'1px dashed rgba(0,0,0,0.12)',borderRadius:'12px'}}>
              <BookmarkOutlinedIcon sx={{fontSize:42,color:'rgba(255,90,90,0.2)',mb:1}}/>
              <Typography sx={{fontWeight:700,color:'#374151',mb:0.5}}>No saved templates yet</Typography>
              <Typography sx={{fontSize:13,color:'#9CA3AF'}}>Open the Report Builder, design a report and click "Save Template" — it will appear here.</Typography>
            </Box>
          ):(
            <Stack spacing={1.5}>
              {savedTemplates.map(tpl=>(
                <Card key={tpl.id} sx={{border:'1px solid rgba(255,139,90,0.12)'}}>
                  <CardContent sx={{p:0,'&:last-child':{pb:0}}}>
                    <Box sx={{px:2.5,py:1.5,display:'flex',alignItems:'center',gap:1.5}}>
                      <Box sx={{flex:1,minWidth:0}}>
                        <Typography sx={{fontWeight:700,fontSize:14}}>{tpl.name}</Typography>
                        {tpl.description&&<Typography sx={{fontSize:12,color:'#9CA3AF'}}>{tpl.description}</Typography>}
                        <Stack direction="row" spacing={0.8} sx={{mt:0.5}} flexWrap="wrap">
                          <Chip label={tpl.source} size="small" sx={{fontSize:10,height:18,bgcolor:'rgba(99,102,241,0.08)',color:'#6366f1'}}/>
                          <Chip label={tpl.viewMode||'flat'} size="small" sx={{fontSize:10,height:18,bgcolor:'rgba(255,90,90,0.08)',color:'#FF5A5A'}}/>
                          {tpl.groupBy&&<Chip label={`By ${tpl.groupBy}`} size="small" sx={{fontSize:10,height:18,bgcolor:'rgba(16,185,129,0.08)',color:'#059669'}}/>}
                          {tpl.charts?.length>0&&<Chip label={`${tpl.charts.length} chart${tpl.charts.length!==1?'s':''}`} size="small" sx={{fontSize:10,height:18,bgcolor:'rgba(99,102,241,0.08)',color:'#6366f1'}}/>}
                        </Stack>
                      </Box>
                      <Stack direction="row" spacing={0.8}>
                        <Button size="small" variant="contained" startIcon={<PlayArrowIcon/>} onClick={()=>loadTemplate(tpl)} sx={{fontSize:12}}>Run</Button>
                        <Tooltip title="Delete"><IconButton size="small" onClick={()=>handleDelTpl(tpl.id)} sx={{color:'#9CA3AF','&:hover':{color:'#ef4444'}}}><DeleteOutlineIcon fontSize="small"/></IconButton></Tooltip>
                      </Stack>
                    </Box>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          )}
        </Box>
      )}

      {/* Save dialog */}
      <Dialog open={saveOpen} onClose={()=>setSaveOpen(false)} maxWidth="xs" fullWidth PaperProps={{sx:{borderRadius:'16px'}}}>
        <DialogTitle sx={{fontWeight:700}}>Save Report Template</DialogTitle>
        <DialogContent sx={{pt:1.5}}><Stack spacing={2}><TextField label="Template Name *" fullWidth size="small" value={saveName} onChange={e=>setSaveName(e.target.value)}/><TextField label="Description" fullWidth size="small" value={saveDesc} onChange={e=>setSaveDesc(e.target.value)}/></Stack></DialogContent>
        <DialogActions sx={{px:3,py:2}}>
          <Button onClick={()=>setSaveOpen(false)} variant="outlined" sx={{borderColor:'#e0e0e0',color:'#6B7280'}}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveTpl} disabled={!saveName.trim()||savingTpl}>{savingTpl?'Saving…':'Save'}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={3500} onClose={()=>setToast(t=>({...t,open:false}))}>
        <Alert severity={toast.severity} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </Box>
    </LocalizationProvider>
  );
};

export default ReportsPage;
