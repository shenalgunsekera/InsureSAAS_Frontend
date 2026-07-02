import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, doc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import { useNavigate } from 'react-router-dom';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import logoUrl from '../InsureSAAS Logo.png';
import { textFields as UW_FIELDS } from './AddClientForm';
import { exportHeader } from '../utils/csvHeaders';
import PendingApprovals from './PendingApprovals';
import CreateAccountModal from './CreateAccountModal';
import InsuranceCompaniesManager from './InsuranceCompaniesManager';
import ModuleAccessManager from './ModuleAccessManager';
import DevicesManager from './DevicesManager';
import UsersManager from './UsersManager';
import ProductsManager from './ProductsManager';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Collapse from '@mui/material/Collapse';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import LinearProgress from '@mui/material/LinearProgress';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import BackupOutlinedIcon from '@mui/icons-material/BackupOutlined';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import GroupAddOutlinedIcon from '@mui/icons-material/GroupAddOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import FolderZipOutlinedIcon from '@mui/icons-material/FolderZipOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DevicesOtherIcon from '@mui/icons-material/DevicesOther';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';

/* ── colour maps ─────────────────────────────────────────────────────────── */
const PRIORITY_COLORS = {
  Low:      { bg: 'rgba(16,185,129,0.10)', color: '#059669' },
  Medium:   { bg: 'rgba(245,158,11,0.12)', color: '#d97706' },
  High:     { bg: 'rgba(255,90,90,0.12)',  color: '#FF5A5A' },
  Critical: { bg: 'rgba(139,0,0,0.12)',    color: '#8B0000' },
};
const STATUS_COLORS = {
  Open:        { bg: 'rgba(99,102,241,0.12)',  color: '#6366f1' },
  'In Progress':{ bg: 'rgba(245,158,11,0.12)', color: '#d97706' },
  Resolved:    { bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  Closed:      { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' },
};

/* ── ExcelJS ARGB palette ────────────────────────────────────────────────── */
const XL = {
  coral: 'FFFF5A5A', orange: 'FFFF8B5A', dark: 'FF1A1A2E',
  grey: 'FF6B7280', peach: 'FFFFF8F5', border: 'FFFFD4C0',
  white: 'FFFFFFFF', gold: 'FFFFD45A',
};

function xlFill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

/* ── build per-client workbook ──────────────────────────────────────────── */
async function buildClientWorkbook(client, logoBase64, ExcelJS) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'InsureSAAS Insurance Brokers';
  wb.created = new Date();

  const ws = wb.addWorksheet('Client Info');

  let logoId = null;
  if (logoBase64) {
    try { logoId = wb.addImage({ base64: logoBase64, extension: 'png' }); } catch { /* skip */ }
  }

  ws.columns = [{ width: 26 }, { width: 38 }];

  // Header block rows 1-4
  ws.mergeCells('A1:B4');
  const hCell = ws.getCell('A1');
  hCell.value = '';
  hCell.fill = xlFill(XL.coral);
  ws.getRow(1).height = 18; ws.getRow(2).height = 18;
  ws.getRow(3).height = 18; ws.getRow(4).height = 18;

  if (logoId !== null) {
    ws.addImage(logoId, { tl: { col: 0.3, row: 0.2 }, ext: { width: 100, height: 50 } });
  }

  ws.mergeCells('A5:B5');
  const cCell = ws.getCell('A5');
  cCell.value = 'CEILAO INSURANCE BROKERS (PVT) LTD';
  cCell.fill = xlFill(XL.dark);
  cCell.font = { bold: true, size: 12, color: { argb: XL.white }, name: 'Calibri' };
  cCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(5).height = 22;

  ws.mergeCells('A6:B6');
  const tCell = ws.getCell('A6');
  const fileNo = client.insuresaas_ib_file_no || client.id;
  tCell.value = `CLIENT RECORD — FILE NO: ${fileNo}`;
  tCell.fill = xlFill(XL.orange);
  tCell.font = { bold: true, size: 11, color: { argb: XL.white }, name: 'Calibri' };
  tCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(6).height = 20;

  ws.mergeCells('A7:B7');
  const dCell = ws.getCell('A7');
  dCell.value = `Exported: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
  dCell.fill = xlFill(XL.peach);
  dCell.font = { size: 9.5, color: { argb: XL.grey }, name: 'Calibri' };
  dCell.alignment = { horizontal: 'center' };
  ws.getRow(7).height = 15;
  ws.getRow(8).height = 8;

  let row = 9;
  const sections = [
    { title: 'GENERAL INFORMATION', fields: [
      ['Client Name',        client.client_name],
      ['Insurance Type',     client.insurance_type],
      ['Customer Type',      client.customer_type],
      ['Product',            client.product],
      ['Insurance Provider', client.insurance_provider],
      ['Insurer',            client.insurer],
      ['Branch',             client.branch],
      ['Main Class',         client.main_class],
      ['Vehicle Number',     client.vehicle_number],
      ['InsureSAAS File No.', client.insuresaas_ib_file_no],
      ['Introducer Code',    client.introducer_code],
      ['NIC Proof',          client.nic_proof],
      ['DOB Proof',          client.dob_proof],
      ['Business Reg.',      client.business_registration],
      ['SVAT Proof',         client.svat_proof],
      ['VAT Proof',          client.vat_proof],
    ]},
    { title: 'ADDRESS', fields: [
      ['Street 1',  client.street1],
      ['Street 2',  client.street2],
      ['City',      client.city],
      ['District',  client.district],
      ['Province',  client.province],
    ]},
    { title: 'CONTACT', fields: [
      ['Mobile No',      client.mobile_no],
      ['Telephone',      client.telephone],
      ['Email',          client.email],
      ['Contact Person', client.contact_person],
      ['Social Media',   client.social_media],
    ]},
    { title: 'POLICY', fields: [
      ['Policy Type',        client.policy_type],
      ['Policy No',          client.policy_no],
      ['Policy',             client.policy_],
      ['Policy Period From', client.policy_period_from],
      ['Policy Period To',   client.policy_period_to],
      ['Coverage',           client.coverage],
    ]},
    { title: 'FINANCIALS', fields: [
      ['SI Currency',    client.sum_insured_currency || 'LKR'],
      ['Sum Insured',    client.sum_insured],
      ['Basic Premium',  client.basic_premium],
      ['SRCC Premium',   client.srcc_premium],
      ['TC Premium',     client.tc_premium],
      ['Net Premium',    client.net_premium],
      ['Stamp Duty',     client.stamp_duty],
      ['Admin Fees',     client.admin_fees],
      ['Road Safety Fee',client.road_safety_fee],
      ['Policy Fee',     client.policy_fee],
      ['VAT Fee',        client.vat_fee],
      ['Total Premium',  client.total_invoice],
      ['Commission Type',client.commission_type],
      ['Commission Basic',client.commission_basic],
      ['Commission SRCC', client.commission_srcc],
      ['Commission TC',   client.commission_tc],
    ]},
    { title: 'DOCUMENTS (URLs)', fields: [
      ['Policyholder Doc',     client.policyholder_doc_url],
      ['Proposal Form Doc',    client.proposal_form_doc_url],
      ['Quotation Doc',        client.quotation_doc_url],
      ['CR Copy Doc',          client.cr_copy_doc_url],
      ['Schedule Doc',         client.schedule_doc_url],
      ['Invoice/Debit Doc',    client.invoice_doc_url],
      ['Payment Receipt Doc',  client.payment_receipt_doc_url],
      ['NIC/BR Doc',           client.nic_br_doc_url],
    ]},
  ];

  sections.forEach(sec => {
    // Section header
    ws.mergeCells(row, 1, row, 2);
    const sh = ws.getCell(row, 1);
    sh.value = sec.title;
    sh.fill = xlFill(XL.dark);
    sh.font = { bold: true, size: 9.5, color: { argb: XL.gold }, name: 'Calibri' };
    sh.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    ws.getRow(row).height = 18;
    row++;

    sec.fields.forEach(([label, value], i) => {
      const bg = i % 2 === 1 ? XL.peach : XL.white;
      const lc = ws.getCell(row, 1);
      lc.value = label;
      lc.fill = xlFill(bg);
      lc.font = { size: 10, color: { argb: XL.grey }, name: 'Calibri' };
      lc.alignment = { vertical: 'middle', indent: 1 };
      lc.border = { bottom: { style: 'hair', color: { argb: XL.border } } };

      const vc = ws.getCell(row, 2);
      vc.value = value || '—';
      vc.fill = xlFill(bg);
      vc.font = { size: 10, bold: label.includes('Total') || label.includes('Net'), color: { argb: XL.dark }, name: 'Calibri' };
      vc.alignment = { vertical: 'middle', indent: 1, wrapText: true };
      vc.border = { bottom: { style: 'hair', color: { argb: XL.border } } };

      ws.getRow(row).height = 17;
      row++;
    });
    ws.getRow(row).height = 6;
    row++;
  });

  return wb.xlsx.writeBuffer();
}

/* ── Document field map ──────────────────────────────────────────────────── */
const DOC_FIELDS = [
  { label: 'policyholder',     key: 'policyholder_doc_url' },
  { label: 'proposal_form',    key: 'proposal_form_doc_url' },
  { label: 'quotation',        key: 'quotation_doc_url' },
  { label: 'cr_copy',          key: 'cr_copy_doc_url' },
  { label: 'schedule',         key: 'schedule_doc_url' },
  { label: 'invoice',          key: 'invoice_doc_url' },
  { label: 'payment_receipt',  key: 'payment_receipt_doc_url' },
  { label: 'nic_br',           key: 'nic_br_doc_url' },
];

// CSV import/backup columns — derived from the underwriting form so every field
// (incl. new ones like debit_note_no) is backed up automatically and stays in sync.
// Re-import maps by column name; date_added preserves the original created_at.
const CLIENT_IMPORT_COLS = (() => {
  const skip = new Set(['policy_year', 'policy_month']); // derived, not stored
  const fromForm = UW_FIELDS.map(f => f.name).filter(n => !skip.has(n));
  const extras = ['insurer', 'vehicle_make', 'vehicle_model', 'dob_proof', 'vat_proof']; // aliases/legacy keys
  return [...new Set([...fromForm, ...extras])];
})();

/* Fetch one URL and return ArrayBuffer, or null on failure. */
async function fetchFile(url) {
  if (!url) return null;
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 45_000);
    const resp  = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const buf = await resp.arrayBuffer();
    return buf.byteLength > 0 ? buf : null;
  } catch { return null; }
}

/* Extract original file extension from a URL */
function extFromUrl(url) {
  if (!url) return 'bin';
  const clean = url.split('?')[0].split('#')[0];
  const last = clean.split('/').pop() || '';
  const dot = last.lastIndexOf('.');
  if (dot === -1) return 'bin';
  return last.slice(dot + 1).toLowerCase().slice(0, 5) || 'bin';
}

async function fetchLogoBase64() {
  try {
    const resp = await fetch(logoUrl);
    const blob = await resp.blob();
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onloadend = () => res(r.result.split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

/* Returns array of { filename, buf } — each doc in its original format.
   Also returns urlLines for the fallback document_links.txt             */
async function fetchClientDocs(client) {
  const files = [];
  const urlLines = [];

  // Standard UW document fields
  for (const { label, key } of DOC_FIELDS) {
    const url = client[key];
    if (!url) continue;
    urlLines.push(`${label}: ${url}`);
    const buf = await fetchFile(url);
    if (buf) files.push({ filename: `${label}.${extFromUrl(url)}`, buf });
  }

  // Product-specific doc_ fields (doc_vehicle_reg, doc_photos_of_risk, etc.)
  const standardKeys = new Set(DOC_FIELDS.map(f => f.key));
  for (const [key, url] of Object.entries(client)) {
    if (!key.startsWith('doc_') || !url || typeof url !== 'string' || !url.startsWith('http')) continue;
    if (standardKeys.has(key)) continue;
    const label = key.replace(/^doc_/, '');
    urlLines.push(`${label}: ${url}`);
    const buf = await fetchFile(url);
    if (buf) files.push({ filename: `${label}.${extFromUrl(url)}`, buf });
  }

  return { files, urlLines };
}

/* QUOTATIONS_IMPORT.csv columns — matches the restore CSV parser */
const QUOTE_IMPORT_COLS = [
  'reference','product_key','main_class','client_name','client_mobile',
  'status','customer_selection',
];

/* Build QUOTATIONS_IMPORT.csv — each row = one quote (no responses) */
function buildQuotationsImportCsv(quotes) {
  const header = QUOTE_IMPORT_COLS.join(',');
  const rows = quotes.map(q =>
    QUOTE_IMPORT_COLS.map(col => {
      const v = q[col] ?? '';
      const s = String(v).replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    }).join(',')
  );
  return [header, ...rows].join('\r\n');
}

/* Build the root CLIENTS_IMPORT.csv — ready for direct re-import.
   Dynamically includes all doc_ URL fields and extra premium fields
   so a full restore preserves every document link and all data. */
function buildClientsImportCsv(clients) {
  // Standard UW doc URL columns
  const STD_DOC_COLS = [
    'policyholder_doc_url','proposal_form_doc_url','quotation_doc_url','cr_copy_doc_url',
    'schedule_doc_url','invoice_doc_url','payment_receipt_doc_url','nic_br_doc_url',
  ];
  // Collect any product-specific doc_ URL fields present across all clients
  const extraDocCols = new Set();
  clients.forEach(c => {
    Object.keys(c).forEach(k => {
      if (k.startsWith('doc_') && !STD_DOC_COLS.includes(k) && c[k] && typeof c[k] === 'string' && c[k].startsWith('http')) {
        extraDocCols.add(k);
      }
    });
  });

  // Build full column list without duplicates
  const seen = new Set();
  const cols = [
    ...CLIENT_IMPORT_COLS,
    'other_premium', 'validity_days',
    ...STD_DOC_COLS,
    ...Array.from(extraDocCols),
  ].filter(c => { if (seen.has(c)) return false; seen.add(c); return true; });

  const header = cols.map(exportHeader).join(',');
  const rows = clients.map(c => {
    const createdDate = c.created_at?.toDate ? c.created_at.toDate() : c.created_at ? new Date(c.created_at) : null;
    const dateAdded = createdDate && !isNaN(createdDate) ? createdDate.toISOString().slice(0, 10) : '';
    return cols.map(col => {
      const v = col === 'date_added' ? dateAdded : (c[col] ?? '');
      const s = String(v).replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    }).join(',');
  });
  return [header, ...rows].join('\r\n');
}

/* Build QUOTATIONS_DATA.xlsx with one row per quote + responses sheet */
async function buildQuotationsWorkbook(quotes, ExcelJS) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'InsureSAAS Insurance Brokers';
  wb.created = new Date();

  // Sheet 1 — summary
  const ws = wb.addWorksheet('Quotations');
  ws.columns = [
    { header: 'Reference',          key: 'reference',         width: 18 },
    { header: 'Product',            key: 'product_key',       width: 16 },
    { header: 'Main Class',         key: 'main_class',        width: 14 },
    { header: 'Client Name',        key: 'client_name',       width: 24 },
    { header: 'Mobile',             key: 'client_mobile',     width: 16 },
    { header: 'Status',             key: 'status',            width: 14 },
    { header: 'Customer Selection', key: 'customer_selection',width: 22 },
    { header: 'Created',            key: 'created_at',        width: 20 },
    { header: 'Insurer Count',      key: 'insurer_count',     width: 14 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
  quotes.forEach(q => {
    ws.addRow({
      reference:          q.reference || '',
      product_key:        q.product_key || '',
      main_class:         q.main_class || '',
      client_name:        q.client_name || '',
      client_mobile:      q.client_mobile || '',
      status:             q.status || '',
      customer_selection: q.customer_selection || '',
      created_at:         q.created_at?.toDate?.()?.toLocaleDateString('en-GB') || '',
      insurer_count:      (q.responses || []).length,
    });
  });

  // Sheet 2 — responses
  const ws2 = wb.addWorksheet('Responses');
  ws2.columns = [
    { header: 'Reference',     key: 'reference',     width: 18 },
    { header: 'Company',       key: 'company_name',  width: 24 },
    { header: 'Premium',       key: 'premium',       width: 14 },
    { header: 'Submitted At',  key: 'submitted_at',  width: 20 },
    { header: 'Document URL',  key: 'doc_url',       width: 60 },
  ];
  ws2.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws2.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF5A5A' } };
  quotes.forEach(q => {
    (q.responses || []).forEach(r => {
      ws2.addRow({
        reference:    q.reference || '',
        company_name: r.company_name || '',
        premium:      r.premium || '',
        submitted_at: r.submitted_at || '',
        doc_url:      r.doc_url || '',
      });
    });
  });

  return wb.xlsx.writeBuffer();
}

/* ── ticket chip helpers ─────────────────────────────────────────────────── */
function PriorityChip({ p }) {
  const c = PRIORITY_COLORS[p] || PRIORITY_COLORS.Low;
  return <Chip label={p} size="small" sx={{ bgcolor: c.bg, color: c.color, fontWeight: 700, fontSize: 11 }} />;
}
function StatusChip({ s }) {
  const c = STATUS_COLORS[s] || STATUS_COLORS.Open;
  return <Chip label={s} size="small" sx={{ bgcolor: c.bg, color: c.color, fontWeight: 700, fontSize: 11 }} />;
}

/* ── TicketCard ──────────────────────────────────────────────────────────── */
function TicketCard({ ticket, onSave, onDelete }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(ticket.status);
  const [notes, setNotes] = useState(ticket.admin_notes || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await onSave(ticket.id, { status, admin_notes: notes, updated_at: serverTimestamp() });
    setSaving(false);
  };

  const created = ticket.created_at?.toDate?.()
    ? ticket.created_at.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

  return (
    <Card sx={{ mb: 1.5, border: '1px solid rgba(255,139,90,0.12)' }}>
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        {/* collapsed header */}
        <Box
          onClick={() => setOpen(o => !o)}
          sx={{ px: 2.5, py: 1.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 1.5,
                '&:hover': { bgcolor: 'rgba(255,90,90,0.02)' } }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14, color: '#1A1A2E', mb: 0.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {ticket.subject}
            </Typography>
            <Stack direction="row" spacing={0.8} alignItems="center" flexWrap="wrap">
              <StatusChip s={ticket.status} />
              <PriorityChip p={ticket.priority} />
              <Chip label={ticket.category} size="small" sx={{ bgcolor: 'rgba(99,102,241,0.08)', color: '#6366f1', fontWeight: 600, fontSize: 11 }} />
              <Typography sx={{ fontSize: 11, color: '#9CA3AF' }}>by {ticket.created_by_name} · {created}</Typography>
            </Stack>
          </Box>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <IconButton size="small" onClick={e => { e.stopPropagation(); onDelete(ticket.id); }}
              sx={{ color: 'rgba(239,68,68,0.4)', '&:hover': { color: '#ef4444', bgcolor: 'rgba(239,68,68,0.08)' } }}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
            {open ? <ExpandLessIcon sx={{ color: '#9CA3AF' }} /> : <ExpandMoreIcon sx={{ color: '#9CA3AF' }} />}
          </Stack>
        </Box>

        {/* expanded body */}
        <Collapse in={open} timeout={220} unmountOnExit>
          <Box sx={{ px: 2.5, pb: 2.5, pt: 0.5, borderTop: '1px solid rgba(255,139,90,0.08)' }}>
            <Typography sx={{ fontSize: 13, color: '#374151', mb: 2, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {ticket.description}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="flex-start">
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel sx={{ fontSize: 12 }}>Status</InputLabel>
                <Select value={status} label="Status" onChange={e => setStatus(e.target.value)} sx={{ fontSize: 13 }}>
                  {['Open', 'In Progress', 'Resolved', 'Closed'].map(s => (
                    <MenuItem key={s} value={s} sx={{ fontSize: 13 }}>{s}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Admin Notes / Response" multiline minRows={2}
                value={notes} onChange={e => setNotes(e.target.value)}
                size="small" fullWidth
                sx={{ '& textarea': { fontSize: 13 }, '& label': { fontSize: 12 } }}
              />
              <Button variant="contained" size="small" startIcon={<SaveOutlinedIcon />}
                onClick={save} disabled={saving}
                sx={{ whiteSpace: 'nowrap', flexShrink: 0, alignSelf: 'flex-end' }}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </Stack>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

/* ── main AdminPanel ─────────────────────────────────────────────────────── */
const AdminPanel = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();

  const [tab,        setTab]        = useState(0);
  const [tickets,    setTickets]    = useState([]);
  const [ticketLoad, setTicketLoad] = useState(true);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [backupOpen,    setBackupOpen]    = useState(false);
  const [reditRequests, setReditRequests] = useState([]);
  const [reditLoading,  setReditLoading]  = useState(false);
  const [backupState,   setBackupState]   = useState({ step: '', progress: 0, done: false });
  const [createAccOpen, setCreateAccOpen] = useState(false);
  const [toast, setToast] = useState({ open: false, msg: '', severity: 'success' });

  // Work hours state
  const [workSessions,  setWorkSessions]  = useState([]);
  const [workLoading,   setWorkLoading]   = useState(false);
  const [workDateFrom,  setWorkDateFrom]  = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10); });
  const [workDateTo,    setWorkDateTo]    = useState(() => new Date().toISOString().slice(0,10));
  const [workEmployee,  setWorkEmployee]  = useState('all');

  const isManager = userProfile?.role === 'manager' || userProfile?.role === 'admin';
  const isAdmin   = userProfile?.role === 'admin';
  const isPrivileged = isManager;

  // Admin guard — only redirect after profile has loaded and is definitively non-privileged
  useEffect(() => {
    if (userProfile && !isPrivileged) navigate('/');
  }, [userProfile, isPrivileged, navigate]);

  const loadTickets = useCallback(async () => {
    setTicketLoad(true);
    try {
      const q = query(collection(db, 'tickets'), orderBy('created_at', 'desc'));
      const snap = await getDocs(q);
      setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { /* ignore */ }
    setTicketLoad(false);
  }, []);

  const loadWorkSessions = useCallback(async () => {
    setWorkLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'work_sessions'), orderBy('clock_in', 'desc')));
      setWorkSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { /* ignore */ }
    setWorkLoading(false);
  }, []);

  const exportWorkHoursExcel = async (rows) => {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'InsureSAAS Insurance Brokers';
    wb.created = new Date();
    const ws = wb.addWorksheet('Work Hours', { pageSetup: { orientation: 'landscape' } });
    const dateStr = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });

    // Header
    ws.mergeCells('A1:G1');
    const h1 = ws.getCell('A1');
    h1.value = 'CEILAO INSURANCE BROKERS (PVT) LTD'; h1.font = { bold:true, size:14, color:{argb:'FFFFFFFF'}, name:'Calibri' };
    h1.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF1A1A2E'} }; h1.alignment = { horizontal:'center', vertical:'middle' };
    ws.getRow(1).height = 26;

    ws.mergeCells('A2:G2');
    const h2 = ws.getCell('A2');
    h2.value = 'Employee Work Hours Report'; h2.font = { bold:true, size:12, color:{argb:'FFFFFFFF'}, name:'Calibri' };
    h2.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFF5A5A'} }; h2.alignment = { horizontal:'center', vertical:'middle' };
    ws.getRow(2).height = 22;

    ws.mergeCells('A3:G3');
    const h3 = ws.getCell('A3');
    h3.value = `Generated: ${dateStr}  |  ${rows.length} sessions`; h3.font = { size:9, color:{argb:'FF9CA3AF'}, name:'Calibri' };
    h3.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFFF8F5'} }; h3.alignment = { horizontal:'center' };
    ws.getRow(3).height = 14;
    ws.getRow(4).height = 8;

    // Summary per employee
    const empTotals = {};
    rows.forEach(r => {
      const k = r.user_name || r.user_email || r.user_id;
      if (!empTotals[k]) empTotals[k] = { sessions: 0, minutes: 0 };
      empTotals[k].sessions++;
      empTotals[k].minutes += r.duration_minutes || 0;
    });
    let sr = 5;
    ws.mergeCells(`A${sr}:G${sr}`);
    const sh = ws.getCell(`A${sr}`);
    sh.value = 'SUMMARY BY EMPLOYEE'; sh.font = { bold:true, size:10, color:{argb:'FFFF8B5A'}, name:'Calibri' };
    sh.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF1A1A2E'} }; sh.alignment = { horizontal:'center' };
    ws.getRow(sr).height = 18; sr++;

    ['Employee','Sessions','Total Hours','Avg Hours/Session'].forEach((label, i) => {
      const cell = ws.getCell(sr, i + 1);
      cell.value = label; cell.font = { bold:true, size:10, color:{argb:'FFFFFFFF'}, name:'Calibri' };
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF374151'} }; cell.alignment = { horizontal: i > 0 ? 'right' : 'left', vertical:'middle' };
    });
    ws.getRow(sr).height = 18; sr++;

    Object.entries(empTotals).forEach(([emp, data], ri) => {
      const bg = ri % 2 === 0 ? 'FFFFF8F5' : 'FFFFFFFF';
      const hours = (data.minutes / 60).toFixed(2);
      const avg   = (data.minutes / data.sessions / 60).toFixed(2);
      [emp, data.sessions, hours, avg].forEach((v, i) => {
        const cell = ws.getCell(sr, i + 1);
        cell.value = typeof v === 'string' ? v : Number(v);
        if (i > 0) { cell.numFmt = i === 1 ? '0' : '0.00'; cell.alignment = { horizontal:'right' }; }
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:bg} };
        cell.font = { size:10, name:'Calibri' };
        cell.border = { bottom:{ style:'hair', color:{argb:'FFFFD4C0'} } };
      });
      sr++;
    });
    sr++; // spacer

    // Detail headers
    const detailHeaders = ['Employee','Email','Date','Clock In','Clock Out','Duration (hrs)','Notes'];
    detailHeaders.forEach((label, i) => {
      const cell = ws.getCell(sr, i + 1);
      cell.value = label; cell.font = { bold:true, size:10, color:{argb:'FFFF8B5A'}, name:'Calibri' };
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF1A1A2E'} }; cell.alignment = { horizontal: i >= 3 ? 'center' : 'left', vertical:'middle' };
    });
    ws.getRow(sr).height = 20; sr++;

    // Detail rows
    rows.forEach((r, ri) => {
      const bg = ri % 2 === 0 ? 'FFFFF8F5' : 'FFFFFFFF';
      const ci = r.clock_in?.toDate ? r.clock_in.toDate() : null;
      const co = r.clock_out?.toDate ? r.clock_out.toDate() : null;
      const fmtTime = (d) => d ? d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) : '—';
      const hrs = r.duration_minutes != null ? (r.duration_minutes / 60).toFixed(2) : '—';
      [r.user_name||'—', r.user_email||'—', r.date||'—', fmtTime(ci), fmtTime(co), hrs, r.notes||''].forEach((v, i) => {
        const cell = ws.getCell(sr, i + 1);
        cell.value = v;
        if (i >= 3 && i <= 5) cell.alignment = { horizontal:'center' };
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:bg} };
        cell.font = { size:9.5, name:'Calibri', color:{argb:'FF1A1A2E'} };
        if (!co && i === 4) cell.font = { ...cell.font, color:{argb:'FFf59e0b'}, bold:true };
        cell.border = { bottom:{ style:'hair', color:{argb:'FFFFD4C0'} } };
      });
      ws.getRow(sr).height = 17; sr++;
    });

    // Column widths
    [28, 28, 12, 12, 12, 16, 30].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.views = [{ state:'frozen', ySplit: sr - rows.length - 1 }];

    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `work_hours_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const loadReditRequests = useCallback(async () => {
    setReditLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'quote_redit_requests'), orderBy('requested_at', 'desc')));
      setReditRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { /* ignore */ }
    setReditLoading(false);
  }, []);

  const handleReditDecision = async (reqId, decision) => {
    const approvedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await updateDoc(doc(db, 'quote_redit_requests', reqId), {
      status:          decision,
      ...(decision === 'approved' ? { approved_until: approvedUntil } : {}),
      reviewed_by:     userProfile?.full_name || userProfile?.email || '',
      reviewed_at:     serverTimestamp(),
    });
    setReditRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: decision } : r));
    setToast({ open: true, msg: `Re-edit request ${decision}.`, severity: decision === 'approved' ? 'success' : 'info' });
  };

  useEffect(() => { loadTickets(); }, [loadTickets]);
  useEffect(() => { if (tab === 6) loadReditRequests(); }, [tab, loadReditRequests]);
  useEffect(() => { if (tab === 8) loadWorkSessions(); }, [tab, loadWorkSessions]);

  const saveTicket = async (id, updates) => {
    await updateDoc(doc(db, 'tickets', id), updates);
    setTickets(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    setToast({ open: true, msg: 'Ticket updated.', severity: 'success' });
  };

  const deleteTicket = async (id) => {
    await deleteDoc(doc(db, 'tickets', id));
    setTickets(prev => prev.filter(t => t.id !== id));
    setToast({ open: true, msg: 'Ticket deleted.', severity: 'info' });
  };

  const filteredTickets = tickets.filter(t => {
    if (filterStatus !== 'All' && t.status !== filterStatus) return false;
    if (filterPriority !== 'All' && t.priority !== filterPriority) return false;
    return true;
  });

  const stats = {
    total:      tickets.length,
    open:       tickets.filter(t => t.status === 'Open').length,
    inProgress: tickets.filter(t => t.status === 'In Progress').length,
    resolved:   tickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length,
  };

  /* ── backup ── */
  const runBackup = async () => {
    setBackupOpen(true);
    setBackupState({ step: 'Loading records…', progress: 0, done: false });

    try {
      // ── 1. Load all data ──────────────────────────────────────────────────
      const [clientSnap, quoteSnap] = await Promise.all([
        getDocs(query(collection(db, 'clients'),    orderBy('created_at', 'desc'))),
        getDocs(query(collection(db, 'quotes'),     orderBy('created_at', 'desc'))),
      ]);
      const clients = clientSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const quotes  = quoteSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const total   = clients.length + quotes.length;

      setBackupState({ step: 'Loading company logo…', progress: 2, done: false });
      const logoBase64 = await fetchLogoBase64();

      const masterZip = new JSZip();
      const clientsFolder = masterZip.folder('clients');
      const quotesFolder  = masterZip.folder('quotations');
      const bulkFolder    = masterZip.folder('bulk_documents');

      // ── 2. Clients ────────────────────────────────────────────────────────
      for (let i = 0; i < clients.length; i++) {
        const c = clients[i];
        const fileNo   = (c.insuresaas_ib_file_no || c.id).toString().replace(/[^a-zA-Z0-9_-]/g, '_');
        const safeName = (c.client_name || 'Unknown').replace(/[^a-zA-Z0-9 _-]/g, '').trim();
        const folder   = clientsFolder.folder(`${fileNo}_${safeName}`);

        setBackupState({
          step: `Clients ${i + 1}/${clients.length}: ${c.client_name || fileNo}`,
          progress: 4 + Math.round((i / total) * 78),
          done: false,
        });

        // Per-client detailed Excel
        try {
          const xlBuf = await buildClientWorkbook(c, logoBase64, ExcelJS);
          folder.file('info.xlsx', xlBuf);
        } catch { /* skip */ }

        // Documents — saved individually in original format
        try {
          const { files, urlLines } = await fetchClientDocs(c);
          files.forEach(({ filename, buf }) => {
            folder.file(filename, buf);
            // Also add to flat bulk_documents folder: {fileNo}_{name}_{doctype}.ext
            bulkFolder.file(`${fileNo}_${safeName}_${filename}`, buf);
          });
          if (urlLines.length > 0)
            folder.file('document_links.txt', urlLines.join('\n'));
        } catch { /* skip */ }
      }

      // ── 3. Quotations ─────────────────────────────────────────────────────
      for (let i = 0; i < quotes.length; i++) {
        const q   = quotes[i];
        const ref = (q.reference || q.id).replace(/[^a-zA-Z0-9_-]/g, '_');
        const folder = quotesFolder.folder(ref);

        setBackupState({
          step: `Quotations ${i + 1}/${quotes.length}: ${q.reference || ref}`,
          progress: 4 + Math.round(((clients.length + i) / total) * 78),
          done: false,
        });

        // Quote data as JSON — full structure including form values and all responses
        folder.file('quote_data.json', JSON.stringify({
          reference:          q.reference,
          product_key:        q.product_key,
          main_class:         q.main_class,
          client_name:        q.client_name,
          client_mobile:      q.client_mobile,
          status:             q.status,
          customer_selection: q.customer_selection,
          created_at:         q.created_at?.toDate?.()?.toISOString() || '',
          values:             q.values || {},
          responses:          q.responses || [],
        }, null, 2));

        // Download insurer response documents
        for (const r of (q.responses || [])) {
          if (!r.doc_url) continue;
          const buf = await fetchFile(r.doc_url);
          if (buf) {
            const co = (r.company_name || 'insurer').replace(/[^a-zA-Z0-9_-]/g, '_');
            folder.file(`response_${co}.${extFromUrl(r.doc_url)}`, buf);
            bulkFolder.file(`${ref}_response_${co}.${extFromUrl(r.doc_url)}`, buf);
          }
        }

        // Download quotation form documents (vehicle images, risk photos, etc.)
        const formValues = q.values || {};
        for (const [key, val] of Object.entries(formValues)) {
          if (!key.startsWith('doc_') || !val || typeof val !== 'string') continue;
          if (!val.startsWith('http')) continue;
          const buf = await fetchFile(val);
          if (buf) {
            const docLabel = key.replace(/^doc_/, '').replace(/_url$/, '');
            const filename = `form_${docLabel}.${extFromUrl(val)}`;
            folder.file(filename, buf);
            bulkFolder.file(`${ref}_${filename}`, buf);
          }
        }
      }

      // ── 4. Root import files ──────────────────────────────────────────────
      setBackupState({ step: 'Building import files…', progress: 83, done: false });

      // CLIENTS_IMPORT.csv — drop directly into Underwriting → Import CSV
      masterZip.file('CLIENTS_IMPORT.csv', buildClientsImportCsv(clients));

      // QUOTATIONS_IMPORT.csv — drop into Quotations → Restore Backup (CSV)
      masterZip.file('QUOTATIONS_IMPORT.csv', buildQuotationsImportCsv(quotes));

      // QUOTATIONS_DATA.xlsx — full quotations summary with responses
      try {
        const qBuf = await buildQuotationsWorkbook(quotes, ExcelJS);
        masterZip.file('QUOTATIONS_DATA.xlsx', qBuf);
      } catch { /* skip */ }

      // README so anyone opening the ZIP understands the structure
      masterZip.file('README.txt', [
        'CEILAO INSURANCE BROKERS — FULL DATA BACKUP',
        `Date: ${new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })}`,
        '',
        'FOLDER STRUCTURE',
        '────────────────',
        'CLIENTS_IMPORT.csv      → Upload to Underwriting → Import CSV to restore all client records',
        'QUOTATIONS_IMPORT.csv   → Upload to Quotations → Restore Backup (CSV) to restore all quotes',
        'QUOTATIONS_DATA.xlsx    → Full quotations summary including all insurer responses',
        'clients/{FileNo}_{Name}/',
        '  info.xlsx             → Detailed client record (formatted)',
        '  policyholder.pdf      → Original documents in their original format',
        '  proposal_form.pdf',
        '  quotation.pdf',
        '  cr_copy.pdf / .jpg',
        '  schedule.pdf',
        '  invoice.pdf',
        '  payment_receipt.pdf',
        '  nic_br.pdf / .jpg',
        'quotations/{Reference}/',
        '  quote_data.json       → Complete quote including form values, doc URLs, and all insurer responses',
        '  response_{Insurer}.pdf → Insurer-submitted quote documents',
        '  form_{doctype}.pdf/.jpg → Quotation form documents (vehicle images, risk photos, etc.)',
        'bulk_documents/         → All documents flat-named for easy bulk access',
        '  {FileNo}_{Name}_{doctype}.{ext}',
        '',
        'RECOVERY STEPS',
        '──────────────',
        '1. Client data:    Underwriting → Import CSV → upload CLIENTS_IMPORT.csv',
        '2. Quotations:     Quotations → Restore Backup → upload QUOTATIONS_IMPORT.csv',
        '   (for full response data use the quote_data.json files)',
        '3. Documents:      Already downloaded in each folder. Re-upload to Firebase Storage',
        '                   and update the URLs in each client/quote record if needed.',
        '4. Reference:      Use QUOTATIONS_DATA.xlsx for a full formatted quotations summary.',
      ].join('\n'));

      // ── 5. Generate final ZIP ─────────────────────────────────────────────
      setBackupState({ step: 'Compressing backup…', progress: 87, done: false });

      const blob = await masterZip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
        meta => setBackupState(s => ({ ...s, progress: 87 + Math.round(meta.percent * 0.12) }))
      );

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      saveAs(blob, `insuresaas_backup_${dateStr}.zip`);
      setBackupState({
        step: `Backup complete! ${clients.length} clients · ${quotes.length} quotations`,
        progress: 100,
        done: true,
      });

    } catch (err) {
      setBackupState({ step: `Error: ${err.message}`, progress: 0, done: true });
    }
  };

  return (
    <Box className="page-enter" sx={{ maxWidth: 1000, mx: 'auto' }}>
      <Typography variant="h5" sx={{ mb: 0.5, fontWeight: 800 }}>Admin Panel</Typography>
      <Typography sx={{ fontSize: 13, color: '#9CA3AF', mb: 3 }}>
        Manage support tickets and back up client data.
      </Typography>

      <Tabs
        value={tab} onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 3, borderBottom: '1px solid rgba(255,139,90,0.12)',
          '& .MuiTab-root': { fontSize: 13, fontWeight: 600, textTransform: 'none', color: '#9CA3AF' },
          '& .Mui-selected': { color: '#FF5A5A' },
          '& .MuiTabs-indicator': { background: 'linear-gradient(90deg,#FF5A5A,#FF8B5A)', height: 2.5 },
        }}
      >
        <Tab icon={<ConfirmationNumberOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label={`Tickets${stats.open ? ` (${stats.open})` : ''}`} />
        <Tab icon={<HourglassEmptyIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Pending Approvals" />
        <Tab icon={<GroupAddOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Accounts" />
        <Tab icon={<BusinessOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Insurers" />
        <Tab icon={<LockOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Module Access" />
        <Tab icon={<BackupOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Data Backup" />
        <Tab icon={<EditOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start"
          label={`Re-edit Requests${reditRequests.filter(r => r.status === 'pending').length ? ` (${reditRequests.filter(r => r.status === 'pending').length})` : ''}`} />
        <Tab icon={<DevicesOtherIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Devices" />
        <Tab icon={<AccessTimeIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Work Hours" />
        <Tab icon={<CategoryOutlinedIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Products" />
      </Tabs>

      {/* ── TICKETS TAB ── */}
      {tab === 0 && (
        <Box>
          {/* stats */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
            {[
              { label: 'Total',       val: stats.total,      color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
              { label: 'Open',        val: stats.open,       color: '#FF5A5A', bg: 'rgba(255,90,90,0.08)' },
              { label: 'In Progress', val: stats.inProgress, color: '#d97706', bg: 'rgba(245,158,11,0.08)' },
              { label: 'Resolved',    val: stats.resolved,   color: '#059669', bg: 'rgba(16,185,129,0.08)' },
            ].map(s => (
              <Box key={s.label} sx={{ flex: 1, p: 2, borderRadius: '12px', bgcolor: s.bg, border: `1px solid ${s.bg}` }}>
                <Typography sx={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</Typography>
                <Typography sx={{ fontSize: 12, color: '#6B7280' }}>{s.label}</Typography>
              </Box>
            ))}
          </Stack>

          {/* filters */}
          <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} flexWrap="wrap">
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel sx={{ fontSize: 12 }}>Status</InputLabel>
              <Select value={filterStatus} label="Status" onChange={e => setFilterStatus(e.target.value)} sx={{ fontSize: 13 }}>
                {['All', 'Open', 'In Progress', 'Resolved', 'Closed'].map(s => (
                  <MenuItem key={s} value={s} sx={{ fontSize: 13 }}>{s}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel sx={{ fontSize: 12 }}>Priority</InputLabel>
              <Select value={filterPriority} label="Priority" onChange={e => setFilterPriority(e.target.value)} sx={{ fontSize: 13 }}>
                {['All', 'Low', 'Medium', 'High', 'Critical'].map(p => (
                  <MenuItem key={p} value={p} sx={{ fontSize: 13 }}>{p}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button size="small" variant="outlined" onClick={loadTickets}
              sx={{ fontSize: 12, borderColor: 'rgba(255,139,90,0.3)', color: '#FF8B5A' }}>
              Refresh
            </Button>
          </Stack>

          {ticketLoad
            ? <Typography sx={{ color: '#9CA3AF', fontSize: 13 }}>Loading tickets…</Typography>
            : filteredTickets.length === 0
              ? <Box sx={{ textAlign: 'center', py: 6 }}>
                  <ConfirmationNumberOutlinedIcon sx={{ fontSize: 40, color: 'rgba(255,90,90,0.2)', mb: 1 }} />
                  <Typography sx={{ color: '#9CA3AF' }}>No tickets found.</Typography>
                </Box>
              : filteredTickets.map(t => (
                  <TicketCard key={t.id} ticket={t} onSave={saveTicket} onDelete={deleteTicket} />
                ))
          }
        </Box>
      )}

      {/* ── PENDING APPROVALS TAB ── */}
      {tab === 1 && <PendingApprovals />}

      {/* ── ACCOUNTS TAB ── */}
      {tab === 2 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Employee Accounts</Typography>
              <Typography sx={{ fontSize: 12, color: '#9CA3AF' }}>Manage staff roles and create login credentials</Typography>
            </Box>
            <Button variant="contained" startIcon={<GroupAddOutlinedIcon />}
              onClick={() => setCreateAccOpen(true)} sx={{ fontSize: 13 }}>
              Create Account
            </Button>
          </Box>
          <UsersManager currentUserId={user?.uid} isAdmin={isAdmin} />
          <CreateAccountModal
            open={createAccOpen}
            onClose={() => setCreateAccOpen(false)}
            onCreated={() => { setToast({ open: true, msg: 'Account created successfully!', severity: 'success' }); }}
          />
        </Box>
      )}

      {/* ── INSURERS TAB ── */}
      {tab === 3 && <InsuranceCompaniesManager />}

      {/* ── MODULE ACCESS TAB ── */}
      {tab === 4 && <ModuleAccessManager />}

      {/* ── BACKUP TAB (admin only) ── */}
      {tab === 5 && !isAdmin && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography sx={{ color: '#9CA3AF' }}>Data backup is restricted to admin accounts.</Typography>
        </Box>
      )}
      {tab === 5 && isAdmin && (
        <Box>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                <Box sx={{
                  width: 48, height: 48, borderRadius: '12px', flexShrink: 0,
                  background: 'linear-gradient(135deg,#FF5A5A,#FF8B5A)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FolderZipOutlinedIcon sx={{ color: '#fff', fontSize: 22 }} />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 700, fontSize: 15, mb: 0.5 }}>Full Data Backup</Typography>
                  <Typography sx={{ fontSize: 13, color: '#6B7280', mb: 1.5, lineHeight: 1.6 }}>
                    Downloads a complete ZIP — clients, quotations and all documents in their original format, plus a ready-to-import CSV to restore everything.
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap">
                    {[
                      '📄 CLIENTS_IMPORT.csv — direct re-import',
                      '📊 QUOTATIONS_DATA.xlsx — all quotes',
                      '📁 clients/ — docs in original format',
                      '📁 quotations/ — responses + docs',
                      '📁 bulk_documents/ — all files flat',
                    ].map(t => (
                      <Chip key={t} label={t} size="small"
                        sx={{ bgcolor: 'rgba(255,90,90,0.07)', color: '#FF5A5A', fontWeight: 600, fontSize: 11 }} />
                    ))}
                  </Stack>
                  <Button
                    variant="contained" startIcon={<BackupOutlinedIcon />}
                    onClick={runBackup}
                    sx={{ fontSize: 13 }}
                  >
                    Backup All Clients
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* ── Backup Progress Dialog ── */}
      <Dialog open={backupOpen} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {backupState.done
            ? <CheckCircleOutlineIcon sx={{ color: '#10B981' }} />
            : <BackupOutlinedIcon sx={{ color: '#FF8B5A' }} />
          }
          {backupState.done ? 'Backup Complete' : 'Backing Up…'}
        </DialogTitle>
        <DialogContent sx={{ pt: 1, pb: 3 }}>
          <Typography sx={{ fontSize: 13, color: '#374151', mb: 2 }}>{backupState.step}</Typography>
          <LinearProgress
            variant="determinate" value={backupState.progress}
            sx={{ height: 8, borderRadius: 4,
                  '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#FF5A5A,#FF8B5A)' },
                  bgcolor: 'rgba(255,90,90,0.10)' }}
          />
          <Typography sx={{ fontSize: 11, color: '#9CA3AF', mt: 1, textAlign: 'right' }}>
            {backupState.progress}%
          </Typography>
          {backupState.done && (
            <Button fullWidth variant="outlined" sx={{ mt: 2, fontSize: 13 }}
              onClick={() => { setBackupOpen(false); setBackupState({ step: '', progress: 0, done: false }); }}>
              Close
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* ── RE-EDIT REQUESTS TAB ── */}
      {tab === 6 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Re-edit Requests</Typography>
              <Typography sx={{ fontSize: 13, color: '#9CA3AF' }}>
                Insurance companies requesting permission to edit a submitted quote response
              </Typography>
            </Box>
            <Button size="small" variant="outlined" onClick={loadReditRequests}
              sx={{ borderColor: 'rgba(255,139,90,0.3)', color: '#FF8B5A', fontSize: 12 }}>
              Refresh
            </Button>
          </Box>

          {reditLoading ? (
            <Typography sx={{ color: '#9CA3AF', fontSize: 13 }}>Loading…</Typography>
          ) : reditRequests.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <EditOutlinedIcon sx={{ fontSize: 40, color: 'rgba(255,90,90,0.2)', mb: 1 }} />
              <Typography sx={{ color: '#9CA3AF' }}>No re-edit requests yet.</Typography>
            </Box>
          ) : reditRequests.map(r => {
            const statusMap = {
              pending:  { color: '#d97706', bg: 'rgba(245,158,11,0.08)',  label: 'Pending' },
              approved: { color: '#059669', bg: 'rgba(16,185,129,0.08)', label: 'Approved' },
              denied:   { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   label: 'Denied' },
            };
            const s = statusMap[r.status] || statusMap.pending;
            const requestedAt = r.requested_at?.toDate?.()?.toLocaleString('en-GB') || '—';

            return (
              <Card key={r.id} sx={{ mb: 1.5, border: '1px solid rgba(255,139,90,0.12)' }}>
                <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{r.company_name}</Typography>
                        <Chip label={s.label} size="small"
                          sx={{ bgcolor: s.bg, color: s.color, fontWeight: 700, fontSize: 10 }} />
                      </Stack>
                      <Typography sx={{ fontSize: 12, color: '#6B7280', mb: 0.5 }}>
                        Quote: <strong>{r.quote_ref}</strong> · {r.product} · {requestedAt}
                      </Typography>
                      <Box sx={{ p: 1.5, borderRadius: '8px', bgcolor: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.06)', mt: 1 }}>
                        <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5 }}>
                          Reason
                        </Typography>
                        <Typography sx={{ fontSize: 13 }}>{r.reason}</Typography>
                      </Box>
                    </Box>
                    {r.status === 'pending' && (
                      <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                        <Button variant="contained" size="small" startIcon={<CheckIcon />}
                          onClick={() => handleReditDecision(r.id, 'approved')}
                          sx={{ background: 'linear-gradient(135deg,#10B981,#059669)', fontSize: 12 }}>
                          Approve
                        </Button>
                        <Button variant="outlined" size="small" startIcon={<CloseIcon />}
                          onClick={() => handleReditDecision(r.id, 'denied')}
                          sx={{ borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 12 }}>
                          Deny
                        </Button>
                      </Stack>
                    )}
                    {r.status === 'approved' && (
                      <Typography sx={{ fontSize: 11, color: '#059669', fontWeight: 600, flexShrink: 0 }}>
                        ✓ Approved<br/>
                        <Box component="span" sx={{ fontSize: 10, color: '#9CA3AF', fontWeight: 400 }}>
                          by {r.reviewed_by}
                        </Box>
                      </Typography>
                    )}
                    {r.status === 'denied' && (
                      <Typography sx={{ fontSize: 11, color: '#ef4444', fontWeight: 600, flexShrink: 0 }}>
                        ✗ Denied
                      </Typography>
                    )}
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {/* ── DEVICES TAB ── */}
      {tab === 7 && (
        <Box>
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Device Management</Typography>
            <Typography sx={{ fontSize: 13, color: '#9CA3AF' }}>
              Track every device that logs into the system and control access with Lockdown Mode
            </Typography>
          </Box>
          <DevicesManager />
        </Box>
      )}

      {/* ── WORK HOURS TAB ── */}
      {tab === 8 && (() => {
        const filtered = workSessions.filter(s => {
          const inRange = (!workDateFrom || s.date >= workDateFrom) && (!workDateTo || s.date <= workDateTo);
          const byEmp   = workEmployee === 'all' || (s.user_name || s.user_email) === workEmployee;
          return inRange && byEmp;
        });
        const employees = [...new Set(workSessions.map(s => s.user_name || s.user_email || s.user_id))].sort();
        const totalMins = filtered.reduce((a, s) => a + (s.duration_minutes || 0), 0);
        const openSessions = filtered.filter(s => !s.clock_out).length;

        return (
          <Box>
            <Stack direction={{ xs:'column', sm:'row' }} justifyContent="space-between" alignItems={{ sm:'center' }} sx={{ mb: 3 }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Employee Work Hours</Typography>
                <Typography sx={{ fontSize: 13, color: '#9CA3AF' }}>Track daily clock-in / clock-out for all staff</Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" startIcon={<RefreshIcon sx={{ fontSize: 15 }} />}
                  onClick={loadWorkSessions} disabled={workLoading}
                  sx={{ fontSize: 12, borderColor: 'rgba(255,139,90,0.35)', color: '#FF8B5A' }}>
                  {workLoading ? 'Loading…' : 'Refresh'}
                </Button>
                <Button size="small" variant="outlined" startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 15 }} />}
                  onClick={() => exportWorkHoursExcel(filtered)}
                  sx={{ fontSize: 12, borderColor: 'rgba(99,102,241,0.35)', color: '#6366f1' }}>
                  Export Excel
                </Button>
              </Stack>
            </Stack>

            {/* Filters */}
            <Stack direction={{ xs:'column', sm:'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
              <TextField type="date" size="small" label="From" value={workDateFrom} onChange={e => setWorkDateFrom(e.target.value)}
                InputLabelProps={{ shrink: true }} sx={{ minWidth: 150 }} />
              <TextField type="date" size="small" label="To" value={workDateTo} onChange={e => setWorkDateTo(e.target.value)}
                InputLabelProps={{ shrink: true }} sx={{ minWidth: 150 }} />
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel sx={{ fontSize: 13 }}>Employee</InputLabel>
                <Select label="Employee" value={workEmployee} onChange={e => setWorkEmployee(e.target.value)} sx={{ fontSize: 13 }}>
                  <MenuItem value="all">All Employees</MenuItem>
                  {employees.map(e => <MenuItem key={e} value={e} sx={{ fontSize: 13 }}>{e}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>

            {/* Summary stats */}
            <Stack direction={{ xs:'column', sm:'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
              {[
                { label: 'Total Sessions', val: filtered.length, color: '#6366f1', bg: 'rgba(99,102,241,0.08)' },
                { label: 'Total Hours', val: `${(totalMins / 60).toFixed(1)} hrs`, color: '#FF5A5A', bg: 'rgba(255,90,90,0.07)' },
                { label: 'Avg Hours/Session', val: filtered.length ? `${(totalMins / filtered.length / 60).toFixed(1)} hrs` : '—', color: '#10B981', bg: 'rgba(16,185,129,0.07)' },
                { label: 'Currently Clocked In', val: openSessions, color: '#f59e0b', bg: 'rgba(245,158,11,0.07)' },
              ].map((s, i) => (
                <Box key={i} sx={{ p: 1.5, borderRadius: '10px', bgcolor: s.bg, border: `1px solid ${s.bg}`, minWidth: 130 }}>
                  <Typography sx={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</Typography>
                  <Typography sx={{ fontSize: 11, color: '#6B7280' }}>{s.label}</Typography>
                </Box>
              ))}
            </Stack>

            {/* Table */}
            <Card sx={{ border: '1px solid rgba(255,139,90,0.12)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#1A1A2E' }}>
                    {['Employee', 'Email', 'Date', 'Clock In', 'Clock Out', 'Duration', 'Notes'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', color: '#FF8B5A', fontWeight: 700, textAlign: 'left', whiteSpace: 'nowrap', fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && !workLoading && (
                    <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#9CA3AF' }}>No sessions found for the selected filters.</td></tr>
                  )}
                  {workLoading && (
                    <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#9CA3AF' }}>Loading…</td></tr>
                  )}
                  {filtered.map((s, i) => {
                    const ci = s.clock_in?.toDate ? s.clock_in.toDate() : null;
                    const co = s.clock_out?.toDate ? s.clock_out.toDate() : null;
                    const fmtT = d => d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
                    const dur  = s.duration_minutes != null ? `${Math.floor(s.duration_minutes / 60)}h ${s.duration_minutes % 60}m` : null;
                    const active = !co;
                    return (
                      <tr key={s.id} style={{ background: i % 2 === 0 ? '#FFF8F5' : '#fff' }}>
                        <td style={{ padding: '9px 14px', fontWeight: 600 }}>{s.user_name || '—'}</td>
                        <td style={{ padding: '9px 14px', color: '#6B7280', fontSize: 12 }}>{s.user_email || '—'}</td>
                        <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{s.date || '—'}</td>
                        <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>{fmtT(ci)}</td>
                        <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', color: active ? '#f59e0b' : 'inherit', fontWeight: active ? 700 : 400 }}>
                          {active ? 'Active ⏱' : fmtT(co)}
                        </td>
                        <td style={{ padding: '9px 14px', whiteSpace: 'nowrap', fontWeight: 600, color: active ? '#f59e0b' : '#1A1A2E' }}>
                          {active ? 'In progress' : (dur || '—')}
                        </td>
                        <td style={{ padding: '9px 14px', color: '#9CA3AF', fontSize: 12 }}>{s.notes || ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </Box>
        );
      })()}

      {/* ── PRODUCTS TAB ── */}
      {tab === 9 && <ProductsManager />}

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.severity} variant="filled" sx={{ width: '100%' }}>{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default AdminPanel;
