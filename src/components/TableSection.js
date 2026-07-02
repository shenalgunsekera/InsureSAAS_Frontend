import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  collection, getDocs, deleteDoc, doc, query, orderBy, writeBatch, updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import { uploadFile as uploadToCloudinary } from '../storage';
import AddClientForm, { textFields as UW_FIELDS } from './AddClientForm';
import ClientDetailsModal from './ClientDetailsModal';
import { exportHeader, normaliseImportRow } from '../utils/csvHeaders';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Pagination from '@mui/material/Pagination';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import Stack from '@mui/material/Stack';

import LinearProgress from '@mui/material/LinearProgress';

import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import GridOnIcon from '@mui/icons-material/GridOn';

/* ── All underwriting columns (for Excel & CSV) ───────────────────────── */
// Derived from AddClientForm textFields + extra product-risk keys
const MONTHS_LABEL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function fmtDateUW(v) {
  if (!v) return '';
  if (v?.toDate) return v.toDate().toLocaleDateString('en-GB');
  const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleDateString('en-GB');
}

function deriveYear(client) {
  const v = client.policy_period_from;
  if (!v) return '';
  const d = new Date(v); return isNaN(d) ? '' : String(d.getFullYear());
}
function deriveMonth(client) {
  const v = client.policy_period_from;
  if (!v) return '';
  const d = new Date(v); return isNaN(d) ? '' : MONTHS_LABEL[d.getMonth()];
}
function derivePolicyDays(client) {
  const from = client.policy_period_from;
  const to   = client.policy_period_to;
  if (!from || !to) return '';
  const a = new Date(from); const b = new Date(to);
  if (isNaN(a) || isNaN(b)) return '';
  return String(Math.round((b - a) / 86400000));
}

/* ── Excel export for underwriting sheet ─────────────────────────────── */
async function exportUnderwritingExcel(clients) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'InsureSAAS Insurance Brokers';
  wb.created = new Date();

  const ws = wb.addWorksheet('Underwriting', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }],
  });

  const RED    = 'FFFF5A5A';
  const AMBER  = 'FFFF8B5A';
  const DARK   = 'FF1A1A2E';
  const WHITE  = 'FFFFFFFF';
  const LTGRAY = 'FFF9FAFB';

  /* Column definitions */
  const cols = [
    // Reference
    { key: 'insuresaas_ib_file_no',  header: 'InsureSAAS File No.',     w: 22 },
    { key: '_year',              header: 'Year',                   w: 8,  derived: deriveYear },
    { key: '_month',             header: 'Month',                  w: 12, derived: deriveMonth },
    { key: 'policy_no',          header: 'Policy No.',             w: 20 },
    { key: 'policy_period_from', header: 'Policy Date',            w: 14, isDate: true },
    { key: 'manager',            header: 'Responsible Person',     w: 18 },
    { key: 'introducer_code',    header: 'Agent / Introducer',     w: 18 },
    // Client
    { key: 'client_name',        header: 'Policyholder',           w: 24 },
    { key: 'customer_type',      header: 'Customer Type',          w: 14 },
    { key: 'nic_proof',          header: 'NIC / PP No.',           w: 16 },
    { key: 'street1',            header: 'Address',                w: 28 },
    { key: '_contact',           header: 'Contact & Email',        w: 26, derived: c => [c.mobile_no, c.email].filter(Boolean).join(' / ') },
    // Policy
    { key: 'insurance_type',     header: 'Insurance Type',         w: 14 },
    { key: 'insurance_provider', header: 'Insurer',                w: 24 },
    { key: 'sum_insured_currency', header: 'Currency',             w: 10 },
    { key: 'sum_insured',        header: 'Sum Insured',             w: 16, isNum: true },
    { key: 'vehicle_number',     header: 'Vehicle No.',            w: 14 },
    { key: 'product',            header: 'Policy Class',           w: 20 },
    { key: 'policy_period_to',   header: 'Policy Expiry',          w: 14, isDate: true },
    { key: '_policy_days',       header: 'Policy Days',            w: 10, derived: derivePolicyDays },
    { key: 'os_days',            header: 'O/S Days',               w: 10 },
    { key: 'credit_period',      header: 'Credit Period (days)',    w: 16 },
    // Premium
    { key: 'basic_premium',      header: 'Basic Premium (Rs)',      w: 16, isNum: true },
    { key: 'srcc_premium',       header: 'SRCC (Rs)',               w: 14, isNum: true },
    { key: 'tc_premium',         header: 'TC Premium (Rs)',         w: 14, isNum: true },
    { key: 'other_premium',      header: 'Other Premium (Rs)',      w: 14, isNum: true },
    { key: 'validity_days',      header: 'Quote Validity (days)',   w: 14 },
    { key: 'net_premium',        header: 'Premium excl. Taxes (Rs)',w: 20, isNum: true },
    { key: 'total_invoice',      header: 'Total Premium incl. Taxes (Rs)', w: 24, isNum: true },
    // Payment
    { key: 'payment_status',     header: 'Payment Status',         w: 14 },
    { key: 'amount_received',    header: 'Amount Received (Rs)',    w: 18, isNum: true },
    { key: 'payment_date',       header: 'Payment Date',           w: 14, isDate: true },
    { key: 'payment_method',     header: 'Payment Method',         w: 16 },
    { key: 'cheque_slip_no',     header: 'Cheque / Slip No.',      w: 18 },
    { key: 'receipt_no',         header: 'Receipt No.',            w: 14 },
    { key: 'debit_note_no',      header: 'Debit Note No.',         w: 16 },
    // Commission
    { key: 'commission_pct',     header: 'Commission %',           w: 13, isNum: true },
    { key: 'commission_basic',   header: 'Commission Basic (Rs)',   w: 18, isNum: true },
    { key: 'commission_srcc',    header: 'Commission SRCC (Rs)',    w: 18, isNum: true },
    { key: 'commission_tc',      header: 'Commission TC (Rs)',      w: 16, isNum: true },
    { key: 'commission_total',   header: 'Total Commission (Rs)',   w: 18, isNum: true },
    { key: 'commission_paid_method', header: 'Commis. Method',     w: 16 },
    { key: 'commission_receive_date', header: 'Commis. Receive Date', w: 18, isDate: true },
    { key: 'commission_amount_paid', header: 'Commis. Amount Received (Rs)', w: 20, isNum: true },
    { key: 'commission_vat',     header: 'Commis. VAT (Rs)',       w: 14, isNum: true },
    // Claims
    { key: 'claim_paid',         header: 'Claim Paid?',            w: 12 },
    { key: 'claim_date',         header: 'Date of Claim',          w: 14, isDate: true },
    { key: 'claim_amount',       header: 'Claim Amount (Rs)',       w: 16, isNum: true },
    { key: 'claim_settled',      header: 'Settled Amount (Rs)',     w: 16, isNum: true },
    { key: 'repudiation_reasons', header: 'If Repudiated, Reasons', w: 28 },
    { key: 'partial_payment_reasons', header: 'Partial Payment Reasons', w: 28 },
    // Other
    { key: 'birthday_policy',    header: 'Birthday Policy',        w: 14, isDate: true },
    { key: 'notes',              header: 'Notes',                  w: 32 },
  ];

  /* Title rows */
  ws.mergeCells(1, 1, 1, cols.length);
  const t1 = ws.getCell(1, 1);
  t1.value = 'CEILAO INSURANCE BROKERS (PVT) LTD — UNDERWRITING REGISTER';
  t1.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
  t1.font  = { name: 'Calibri', bold: true, size: 14, color: { argb: WHITE } };
  t1.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, cols.length);
  const t2 = ws.getCell(2, 1);
  t2.value = `Generated: ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}   ·   ${clients.length} records`;
  t2.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3748' } };
  t2.font  = { name: 'Calibri', size: 10, color: { argb: 'FFCBD5E1' } };
  t2.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 16;

  ws.getRow(3).height = 8;

  /* Header row */
  ws.getRow(4).height = 22;
  cols.forEach((c, i) => {
    const cell = ws.getCell(4, i + 1);
    cell.value = c.header;
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
    cell.font  = { name: 'Calibri', bold: true, size: 9.5, color: { argb: AMBER } };
    cell.alignment = { horizontal: c.isNum ? 'right' : 'center', vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: RED } } };
    ws.getColumn(i + 1).width = c.w;
  });

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };

  /* Data rows */
  clients.forEach((client, ri) => {
    const rowNum = ri + 5;
    const bg = ri % 2 === 0 ? WHITE : LTGRAY;
    ws.getRow(rowNum).height = 16;
    cols.forEach((c, ci) => {
      const cell = ws.getCell(rowNum, ci + 1);
      const raw  = c.derived ? c.derived(client) : client[c.key];
      if (c.isNum) {
        const n = parseFloat(String(raw || '').replace(/,/g, ''));
        cell.value  = isNaN(n) ? null : n;
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      } else if (c.isDate) {
        cell.value = fmtDateUW(raw);
        cell.alignment = { horizontal: 'center' };
      } else {
        cell.value = raw ? String(raw) : null;
      }
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.font   = { name: 'Calibri', size: 9 };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `InsureSAAS_Underwriting_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

/* ── module-level client cache (survives React re-mounts) ─────────────── */
let _cachedClients = null;

/* ── Document import helpers ──────────────────────────────────────────── */
const DOC_LABEL_TO_KEY = {
  policyholder:    'policyholder_doc_url',
  proposal_form:   'proposal_form_doc_url',
  quotation:       'quotation_doc_url',
  cr_copy:         'cr_copy_doc_url',
  schedule:        'schedule_doc_url',
  invoice:         'invoice_doc_url',
  payment_receipt: 'payment_receipt_doc_url',
  nic_br:          'nic_br_doc_url',
};
const DOC_LABELS = Object.keys(DOC_LABEL_TO_KEY);

function parseDocFile(file, clients) {
  const nameNoExt = file.name.replace(/\.[^.]+$/, '');

  // Find which doc label this filename ends with
  let docLabel = null;
  for (const label of DOC_LABELS) {
    if (nameNoExt === label || nameNoExt.endsWith(`_${label}`)) {
      docLabel = label; break;
    }
  }
  if (!docLabel) return { file, matched: false, reason: 'Unknown document type' };

  // Find the client whose fileNo is the longest prefix of this filename
  let matchedClient = null;
  let bestLen = 0;
  for (const c of clients) {
    const fileNo = (c.insuresaas_ib_file_no || '').toString().replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!fileNo) continue;
    if (nameNoExt.toLowerCase().startsWith(fileNo.toLowerCase() + '_') && fileNo.length > bestLen) {
      matchedClient = c;
      bestLen = fileNo.length;
    }
  }
  if (!matchedClient) return { file, matched: false, docLabel, reason: 'No matching client' };

  return {
    file, matched: true, docLabel,
    client: matchedClient,
    firestoreKey: DOC_LABEL_TO_KEY[docLabel],
    status: 'pending',
  };
}

/* ── helpers ──────────────────────────────────────────────────────────── */
function daysUntilExpiry(dateStr) {
  if (!dateStr) return null;
  const exp = new Date(dateStr);
  if (isNaN(exp)) return null;
  return Math.ceil((exp - new Date()) / (1000 * 60 * 60 * 24));
}

function expiryStatus(client) {
  const d = daysUntilExpiry(client.policy_period_to);
  if (d === null)  return 'none';
  if (d < 0)       return 'expired';
  if (d <= 30)     return 'expiring';
  return 'active';
}

const statusChip = {
  active:   { label: 'Active',   color: '#059669', bg: 'rgba(16,185,129,0.10)' },
  expiring: { label: 'Expiring', color: '#d97706', bg: 'rgba(245,158,11,0.10)' },
  expired:  { label: 'Expired',  color: '#dc2626', bg: 'rgba(239,68,68,0.10)'  },
  none:     { label: '—',        color: '#9CA3AF', bg: 'transparent'            },
};



/* ── skeleton row ─────────────────────────────────────────────────────── */
function SkeletonRow() {
  return (
    <TableRow>
      {[180, 120, 120, 120, 90, 100].map((w, i) => (
        <TableCell key={i}>
          <Skeleton variant="text" width={w} height={18} sx={{ bgcolor: 'rgba(255,90,90,0.06)' }} />
        </TableCell>
      ))}
    </TableRow>
  );
}

/* ── main component ───────────────────────────────────────────────────── */
const TableSection = () => {
  const { user, userProfile, searchQuery } = useAuth();
  const location = useLocation();
  const prefillHandled = useRef(false);
  const isPrivileged = userProfile?.role === 'manager' || userProfile?.role === 'admin';
  const isManager = isPrivileged;
  const uid = user?.uid || '';

  const [clients,      setClients]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [addOpen,      setAddOpen]      = useState(false);
  const [prefillData,  setPrefillData]  = useState({});
  const [detailClient, setDetailClient] = useState(null);
  const [editClient,   setEditClient]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteAllDlg, setDeleteAllDlg] = useState(false);
  const [csvErrors,    setCsvErrors]    = useState([]);
  const [csvErrDlg,    setCsvErrDlg]    = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [snackbar,     setSnackbar]     = useState({ open: false, msg: '', sev: 'success' });
  const [page,         setPage]         = useState(1);
  const [rowsPerPage,  setRowsPerPage]  = useState(15);
  const [filterType,   setFilterType]   = useState('all');
  const [filterYear,   setFilterYear]   = useState('all');
  const [filterMonth,  setFilterMonth]  = useState('all');

  // ── Document import state ─────────────────────────────────────────────
  const [docImportOpen,     setDocImportOpen]     = useState(false);
  const [docImportItems,    setDocImportItems]    = useState([]); // parsed file items
  const [docImportRunning,  setDocImportRunning]  = useState(false);
  const [docImportProgress, setDocImportProgress] = useState({ done: 0, total: 0, current: '' });
  const [docImportFinished, setDocImportFinished] = useState(false);

  const toast = (msg, sev = 'success') => setSnackbar({ open: true, msg, sev });

  /* ── Document import ───────────────────────────────────────────────────── */
  const handleDocFilesSelect = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    const allClients = _cachedClients || clients;
    const items = files
      .filter(f => !f.name.startsWith('.') && f.name !== 'document_links.txt' && f.name !== 'README.txt')
      .map(f => parseDocFile(f, allClients));
    setDocImportItems(items);
    setDocImportFinished(false);
    setDocImportProgress({ done: 0, total: 0, current: '' });
    setDocImportOpen(true);
  };

  const runDocImport = async () => {
    const toUpload = docImportItems.filter(it => it.matched && it.status !== 'done');
    setDocImportRunning(true);
    setDocImportProgress({ done: 0, total: toUpload.length, current: '' });

    let done = 0;
    const updated = [...docImportItems];

    for (const item of toUpload) {
      const idx = updated.findIndex(x => x.file.name === item.file.name);
      setDocImportProgress({ done, total: toUpload.length, current: item.file.name });
      try {
        const url = await uploadToCloudinary(item.file, 'insuresaas/docs-restore');
        await updateDoc(doc(db, 'clients', item.client.id), { [item.firestoreKey]: url });
        updated[idx] = { ...updated[idx], status: 'done', url };
        // Keep client cache in sync
        if (_cachedClients) {
          const ci = _cachedClients.findIndex(c => c.id === item.client.id);
          if (ci !== -1) _cachedClients[ci] = { ..._cachedClients[ci], [item.firestoreKey]: url };
        }
      } catch (err) {
        updated[idx] = { ...updated[idx], status: 'error', error: err.message };
      }
      done++;
      setDocImportItems([...updated]);
      setDocImportProgress({ done, total: toUpload.length, current: '' });
    }

    setDocImportRunning(false);
    setDocImportFinished(true);
    const errors = updated.filter(x => x.status === 'error').length;
    toast(errors ? `Import done — ${done - errors} uploaded, ${errors} failed` : `${done} documents uploaded successfully`);
  };

  /* fetch — serves from module cache instantly, then refreshes from Firestore */
  const fetchClients = useCallback(async (force = false) => {
    if (!force && _cachedClients) {
      setClients(_cachedClients);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const q = query(collection(db, 'clients'), orderBy('created_at', 'desc'));
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Employees only see approved clients + their own pending/rejected
      const data = isPrivileged
        ? all
        : all.filter(c =>
            !c.status || c.status === 'approved' ||
            ((c.status === 'pending' || c.status === 'rejected') && c.submitted_by === uid)
          );
      _cachedClients = data;
      setClients(data);
    } catch (err) {
      if (!_cachedClients) toast('Failed to load clients', 'error');
    }
    setLoading(false);
  }, [isPrivileged, uid]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // Auto-open Add/Edit Client form with pre-filled data from Quote comparison.
  // Data is stored in sessionStorage (not URL params) so Firebase Storage URLs
  // and large forms (29 clauses, 30+ risk fields) are never truncated.
  useEffect(() => {
    if (prefillHandled.current) return;

    // Support legacy URL-param prefill (backwards compat) AND sessionStorage
    const params = new URLSearchParams(location.search);
    const urlRaw = params.get('prefill');
    const ssRaw  = sessionStorage.getItem('uw_prefill');
    const raw    = ssRaw || urlRaw;
    if (!raw) return;

    try {
      const data = ssRaw ? JSON.parse(raw) : JSON.parse(decodeURIComponent(raw));
      prefillHandled.current = true;
      sessionStorage.removeItem('uw_prefill');
      window.history.replaceState({}, '', window.location.pathname);

      const quoteId  = data._quote_id;
      const { _quote_id: _removed, ...cleanData } = data; // eslint-disable-line no-unused-vars

      if (quoteId) {
        const existing = _cachedClients?.find(c => c.source_quote_id === quoteId);
        if (existing) {
          setEditClient({ ...existing, ...cleanData });
        } else {
          setPrefillData({ ...cleanData, source_quote_id: quoteId });
          setAddOpen(true);
        }
      } else {
        setPrefillData(cleanData);
        setAddOpen(true);
      }
    } catch { /* ignore malformed data */ }
  }, [location.search]);

  /* Available years derived from actual client data */
  const availableYears = useMemo(() => {
    const years = new Set();
    clients.forEach(c => {
      const d = c.created_at?.toDate ? c.created_at.toDate() : c.created_at ? new Date(c.created_at) : null;
      if (d && !isNaN(d)) years.add(d.getFullYear());
    });
    return [...years].sort((a, b) => b - a);
  }, [clients]);

  /* filter + search */
  const filtered = useMemo(() => {
    let list = clients;
    if (filterType !== 'all') list = list.filter(c => c.customer_type === filterType);

    // Date Added filters
    if (filterYear !== 'all' || filterMonth !== 'all') {
      list = list.filter(c => {
        const d = c.created_at?.toDate ? c.created_at.toDate() : c.created_at ? new Date(c.created_at) : null;
        if (!d || isNaN(d)) return false;
        if (filterYear  !== 'all' && d.getFullYear()  !== Number(filterYear))  return false;
        if (filterMonth !== 'all' && d.getMonth()     !== Number(filterMonth)) return false;
        return true;
      });
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c =>
        (c.client_name       || '').toLowerCase().includes(q) ||
        (c.mobile_no         || '').toLowerCase().includes(q) ||
        (c.policy_no         || '').toLowerCase().includes(q) ||
        (c.insuresaas_ib_file_no || '').toLowerCase().includes(q) ||
        (c.product           || '').toLowerCase().includes(q) ||
        (c.email             || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [clients, filterType, filterYear, filterMonth, searchQuery]);

  /* paginate */
  const pageCount    = Math.ceil(filtered.length / rowsPerPage);
  const paginated    = filtered.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const handlePageChange = (_, v) => { setPage(v); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  /* delete single */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDoc(doc(db, 'clients', deleteTarget.id));
      toast('Client deleted');
      _cachedClients = null; fetchClients(true);
    } catch {
      toast('Failed to delete client', 'error');
    }
    setDeleteTarget(null);
  };

  /* delete all */
  const handleDeleteAll = async () => {
    try {
      const snap  = await getDocs(collection(db, 'clients'));
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      toast(`Deleted ${snap.size} clients`);
      _cachedClients = null; fetchClients(true);
    } catch {
      toast('Failed to delete all clients', 'error');
    }
    setDeleteAllDlg(false);
  };

  /* CSV template — generated from UW_FIELDS so it always stays in sync */
  const handleDownloadTemplate = () => {
    const allFields = UW_FIELDS
      .filter(f => !f.readOnly)
      .map(f => f.name);

    const example = {
      insurance_type: 'General', customer_type: 'Individual', product: 'Comprehensive',
      insurance_provider: 'Ceylinco General Insurance',
      sum_insured_currency: 'LKR', sum_insured: '5000000',
      client_name: 'John Doe', mobile_no: '0771234567',
      insuresaas_ib_file_no: 'MT-20250101-0001-JOHNDOE',
      manager: 'Jane Smith', introducer_code: 'INT001',
      policy_no: 'POL123456',
      policy_period_from: '2025-01-01', policy_period_to: '2026-01-01',
      basic_premium: '50000', net_premium: '58000', total_invoice: '64600',
      payment_status: 'Paid', payment_method: 'Bank Transfer',
      commission_type: 'Standard', commission_pct: '20',
      commission_basic: '10000',
      date_added: new Date().toISOString().slice(0, 10),
    };
    // Header row uses friendly names (e.g. total_premium) while values are still
    // pulled by the internal key. The importer maps the friendly names back.
    const headerRow = allFields.map(exportHeader);
    const csv = Papa.unparse([headerRow, allFields.map(h => example[h] ?? '')]);
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: 'insuresaas_underwriting_template.csv',
    });
    a.click(); URL.revokeObjectURL(a.href);
  };

  /* CSV import */
  const handleImportCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvImporting(true);
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        const required = ['customer_type','product','insurance_provider','client_name','mobile_no'];
        const missing = required.filter(f => !results.meta.fields?.includes(f));
        if (missing.length) {
          toast(`Missing CSV columns: ${missing.join(', ')}`, 'error');
          setCsvImporting(false); return;
        }
        let imported = 0, errors = [];
        // Firestore batches are capped at 500 writes — commit in chunks so large
        // registers (hundreds/thousands of rows) import without hitting the limit.
        const CHUNK = 450;
        let batch = writeBatch(db);
        let pending = 0;
        try {
          for (let i = 0; i < results.data.length; i++) {
            const row = normaliseImportRow(results.data[i]);
            const miss = required.filter(f => !row[f]);
            if (miss.length) { errors.push({ row: i + 2, error: `Missing: ${miss.join(', ')}` }); continue; }
            const ref = doc(collection(db, 'clients'));
            const clean = {};
            Object.entries(row).forEach(([k, v]) => { if (v !== '' && v != null) clean[k] = v; });
            // Auto-calculations the form normally derives — computed on import so the
            // record shows complete totals without anyone re-saving it.
            const n = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
            const commTotal = n(clean.commission_basic) + n(clean.commission_srcc) + n(clean.commission_tc) + n(clean.commission_special_amount);
            if (commTotal !== 0) clean.commission_total = String(Math.round(commTotal * 100) / 100);
            if (clean.policy_period_from && clean.policy_period_to && !clean.policy_days) {
              const a = new Date(clean.policy_period_from), b = new Date(clean.policy_period_to);
              if (!isNaN(a) && !isNaN(b)) { const days = Math.round((b - a) / 86400000); if (days >= 0) clean.policy_days = String(days); }
            }
            // Honour date_added if provided (preserves original date on backup restore)
            const dateAdded = clean.date_added ? new Date(clean.date_added) : new Date();
            delete clean.date_added;
            batch.set(ref, { ...clean, created_at: isNaN(dateAdded) ? new Date() : dateAdded, is_active: true });
            imported++; pending++;
            if (pending >= CHUNK) { await batch.commit(); batch = writeBatch(db); pending = 0; }
          }
          if (pending > 0) await batch.commit();
          if (errors.length) { setCsvErrors(errors); setCsvErrDlg(true); toast(`Imported ${imported}, ${errors.length} failed`, 'warning'); }
          else toast(`Successfully imported ${imported} clients!`);
          _cachedClients = null; fetchClients(true);
        } catch (err) { toast(`Import failed after ${imported} rows: ${err.message || 'error'}`, 'error'); }
        e.target.value = ''; setCsvImporting(false);
      },
    });
  };

  /* add / edit callbacks */
  const handleAddClient  = () => { _cachedClients = null; fetchClients(true); setAddOpen(false);    toast('Client added successfully!'); };
  const handleEditClient = () => { _cachedClients = null; fetchClients(true); setEditClient(null);  toast('Client updated successfully!'); };

  return (
    <Box className="page-enter">

      {/* ── toolbar ───────────────────────────────────────────── */}
      <Box sx={{
        display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 2,
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* filter chips + date filters */}
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {['all','Individual','Company'].map(t => (
              <Chip
                key={t}
                label={t === 'all' ? 'All' : t}
                clickable
                onClick={() => { setFilterType(t); setPage(1); }}
                sx={{
                  fontWeight: 600, fontSize: 12,
                  background: filterType === t
                    ? 'linear-gradient(135deg,#FF5A5A,#FF8B5A)'
                    : 'rgba(255,90,90,0.07)',
                  color: filterType === t ? '#fff' : '#FF5A5A',
                  border: filterType === t ? 'none' : '1px solid rgba(255,90,90,0.20)',
                  transition: 'all 0.2s ease',
                  '&:hover': { opacity: 0.88 },
                }}
              />
            ))}
          </Stack>

          {/* Date Added filter row */}
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography sx={{ fontSize: 11.5, color: '#9CA3AF', fontWeight: 600 }}>Date Added:</Typography>
            <Select size="small" value={filterYear} onChange={e => { setFilterYear(e.target.value); setPage(1); }}
              sx={{ fontSize: 12, height: 30, minWidth: 90, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,139,90,0.25)' } }}>
              <MenuItem value="all" sx={{ fontSize: 12 }}>All Years</MenuItem>
              {availableYears.map(y => <MenuItem key={y} value={y} sx={{ fontSize: 12 }}>{y}</MenuItem>)}
            </Select>
            <Select size="small" value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setPage(1); }}
              sx={{ fontSize: 12, height: 30, minWidth: 110, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,139,90,0.25)' } }}>
              <MenuItem value="all" sx={{ fontSize: 12 }}>All Months</MenuItem>
              {['January','February','March','April','May','June','July','August','September','October','November','December']
                .map((m, i) => <MenuItem key={i} value={i} sx={{ fontSize: 12 }}>{m}</MenuItem>)}
            </Select>
            {(filterYear !== 'all' || filterMonth !== 'all') && (
              <Chip label="Clear" size="small" clickable onClick={() => { setFilterYear('all'); setFilterMonth('all'); setPage(1); }}
                sx={{ fontSize: 11, height: 24, bgcolor: 'rgba(239,68,68,0.08)', color: '#ef4444' }} />
            )}
            {(filterYear !== 'all' || filterMonth !== 'all') && (
              <Typography sx={{ fontSize: 11.5, color: '#6B7280' }}>
                {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              </Typography>
            )}
          </Stack>
        </Stack>

        {/* action buttons */}
        <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="flex-end">
          <Button
            size="small" variant="outlined"
            startIcon={<FileDownloadOutlinedIcon />}
            onClick={handleDownloadTemplate}
            sx={{ borderColor: 'rgba(255,139,90,0.35)', color: '#FF8B5A', fontSize: 12,
                  '&:hover': { borderColor: '#FF8B5A', bgcolor: 'rgba(255,139,90,0.07)' } }}
          >
            CSV Template
          </Button>
          <Button
            size="small" variant="outlined"
            startIcon={<GridOnIcon />}
            onClick={() => exportUnderwritingExcel(filtered)}
            sx={{ borderColor: 'rgba(16,185,129,0.35)', color: '#059669', fontSize: 12,
                  '&:hover': { borderColor: '#059669', bgcolor: 'rgba(16,185,129,0.07)' } }}
          >
            Export Excel
          </Button>
          <Button
            size="small" variant="outlined"
            startIcon={<FileUploadOutlinedIcon />}
            onClick={() => document.getElementById('csv-input').click()}
            disabled={csvImporting}
            sx={{ borderColor: 'rgba(255,139,90,0.35)', color: '#FF8B5A', fontSize: 12,
                  '&:hover': { borderColor: '#FF8B5A', bgcolor: 'rgba(255,139,90,0.07)' } }}
          >
            {csvImporting ? 'Importing…' : 'Import CSV'}
          </Button>
          <Button
            size="small" variant="outlined"
            startIcon={<FolderOpenOutlinedIcon />}
            onClick={() => document.getElementById('doc-import-input').click()}
            sx={{ borderColor: 'rgba(99,102,241,0.35)', color: '#6366f1', fontSize: 12,
                  '&:hover': { borderColor: '#6366f1', bgcolor: 'rgba(99,102,241,0.06)' } }}
          >
            Import Documents
          </Button>
          <input id="doc-import-input" type="file" multiple accept="*/*" style={{ display: 'none' }}
            onChange={handleDocFilesSelect} />
          <Button
            size="small" variant="contained"
            startIcon={<AddCircleOutlineIcon />}
            onClick={() => setAddOpen(true)}
            sx={{ fontSize: 12 }}
          >
            Add Client
          </Button>
          {isManager && (
            <Tooltip title="Delete all clients">
              <Button
                size="small" variant="outlined"
                startIcon={<DeleteSweepIcon />}
                onClick={() => setDeleteAllDlg(true)}
                sx={{ borderColor: 'rgba(239,68,68,0.35)', color: '#ef4444', fontSize: 12,
                      '&:hover': { borderColor: '#ef4444', bgcolor: 'rgba(239,68,68,0.06)' } }}
              >
                Delete All
              </Button>
            </Tooltip>
          )}
        </Stack>
      </Box>

      {/* ── table ────────────────────────────────────────────── */}
      <Paper elevation={1} sx={{ overflow: 'hidden', borderRadius: '14px', border: '1px solid rgba(255,139,90,0.10)' }}>
        <TableContainer>
          <Table sx={{ minWidth: 680 }}>
            <TableHead>
              <TableRow>
                <TableCell>Client Name</TableCell>
                <TableCell>Contact</TableCell>
                <TableCell>Product</TableCell>
                <TableCell>Policy #</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : paginated.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                          <PeopleOutlineIcon sx={{ fontSize: 42, color: 'rgba(255,90,90,0.25)' }} />
                          <Typography sx={{ color: '#9CA3AF', fontWeight: 500 }}>
                            {searchQuery ? 'No clients match your search' : 'No clients yet — add your first client!'}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )
                  : paginated.map((client, idx) => {
                    const status = expiryStatus(client);
                    const sc = statusChip[status];
                    const rowClass =
                      status === 'expiring' ? 'row-expiring-soon' :
                      status === 'expired'  ? 'row-expired' : '';
                    return (
                      <TableRow
                        key={client.id}
                        className={rowClass}
                        sx={{
                          bgcolor: idx % 2 === 0 ? '#fff' : 'rgba(255,248,245,0.7)',
                          animation: `stagger 0.3s ease both`,
                          animationDelay: `${Math.min(idx * 0.04, 0.4)}s`,
                        }}
                      >
                        <TableCell>
                          <Typography sx={{ fontWeight: 600, fontSize: 13, color: '#1A1A2E' }}>
                            {client.client_name}
                          </Typography>
                          {client.email && (
                            <Typography sx={{ fontSize: 11, color: '#9CA3AF' }}>{client.email}</Typography>
                          )}
                          {client.status === 'pending' && (
                            <Chip label="Pending approval" size="small"
                              sx={{ mt: 0.4, bgcolor: 'rgba(245,158,11,0.12)', color: '#d97706', fontWeight: 600, fontSize: 10, height: 18 }} />
                          )}
                          {client.status === 'rejected' && (
                            <Tooltip title={client.rejection_reason || 'Rejected'}>
                              <Chip label="Rejected" size="small"
                                sx={{ mt: 0.4, bgcolor: 'rgba(239,68,68,0.10)', color: '#dc2626', fontWeight: 600, fontSize: 10, height: 18, cursor: 'help' }} />
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: 13 }}>{client.mobile_no}</TableCell>
                        <TableCell>
                          <Chip
                            label={client.product || '—'}
                            size="small"
                            sx={{ fontSize: 11, fontWeight: 600,
                                  bgcolor: 'rgba(255,139,90,0.10)', color: '#c05010' }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: 13, fontFamily: 'monospace', letterSpacing: 0.3 }}>
                          {client.policy_no || '—'}
                        </TableCell>
                        <TableCell>
                          {status !== 'none' && (
                            <Box sx={{
                              display: 'inline-flex', alignItems: 'center',
                              px: 1.2, py: 0.3, borderRadius: '20px',
                              background: sc.bg, fontSize: 11, fontWeight: 700, color: sc.color,
                            }}>
                              {sc.label}
                            </Box>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Tooltip title="View details">
                              <IconButton size="small" onClick={() => setDetailClient(client)}
                                sx={{ color: '#4f46e5', '&:hover': { bgcolor: 'rgba(99,102,241,0.10)' } }}>
                                <VisibilityOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {isManager && (
                              <>
                                <Tooltip title="Edit">
                                  <IconButton size="small" onClick={() => setEditClient(client)}
                                    sx={{ color: '#FF8B5A', '&:hover': { bgcolor: 'rgba(255,139,90,0.10)' } }}>
                                    <EditOutlinedIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Delete">
                                  <IconButton size="small" onClick={() => setDeleteTarget(client)}
                                    sx={{ color: '#ef4444', '&:hover': { bgcolor: 'rgba(239,68,68,0.10)' } }}>
                                    <DeleteOutlineIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })
              }
            </TableBody>
          </Table>
        </TableContainer>

        {/* pagination bar */}
        {!loading && filtered.length > 0 && (
          <Box sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            px: 2.5, py: 1.5, flexWrap: 'wrap', gap: 1,
            borderTop: '1px solid rgba(255,139,90,0.08)',
          }}>
            <Typography sx={{ fontSize: 12.5, color: '#9CA3AF' }}>
              Showing {(page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, filtered.length)} of {filtered.length} clients
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: 12.5, color: '#9CA3AF' }}>Rows:</Typography>
              <Select
                size="small" value={rowsPerPage}
                onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
                sx={{ fontSize: 12, '& .MuiOutlinedInput-root': { borderRadius: '8px' }, minWidth: 65 }}
              >
                {[10, 15, 25, 50, 100].map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
              </Select>
            </Box>
            <Pagination
              count={pageCount} page={page}
              onChange={handlePageChange}
              shape="rounded" size="small"
            />
          </Box>
        )}
      </Paper>

      {/* ── dialogs ──────────────────────────────────────────── */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { maxHeight: '92vh' } }}>
        <DialogTitle>
          {Object.keys(prefillData).length > 0 ? 'New Client — Pre-filled from Quote' : 'Add New Client'}
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <AddClientForm
            onSuccess={() => { handleAddClient(); setPrefillData({}); }}
            onCancel={() => { setAddOpen(false); setPrefillData({}); }}
            initialData={prefillData}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editClient} onClose={() => setEditClient(null)} maxWidth="md" fullWidth
        PaperProps={{ sx: { maxHeight: '92vh' } }}>
        <DialogTitle>Edit Client</DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {editClient && (
            <AddClientForm
              initialData={editClient}
              isEdit
              onSuccess={handleEditClient}
              onCancel={() => setEditClient(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* delete single confirm */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Client</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <Typography>
            Are you sure you want to delete <strong>{deleteTarget?.client_name}</strong>? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setDeleteTarget(null)} variant="outlined" sx={{ color: '#6B7280', borderColor: '#e0e0e0' }}>
            Cancel
          </Button>
          <Button onClick={handleDelete} variant="contained"
            sx={{ background: 'linear-gradient(135deg,#FF5A5A,#e04040)', boxShadow: 'none',
                  '&:hover': { background: 'linear-gradient(135deg,#e04040,#c03030)' } }}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* delete all confirm */}
      <Dialog open={deleteAllDlg} onClose={() => setDeleteAllDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete All Clients</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <Alert severity="error" sx={{ mb: 1.5 }}>This will permanently delete ALL {clients.length} clients.</Alert>
          <Typography>This action cannot be undone. Are you absolutely sure?</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setDeleteAllDlg(false)} variant="outlined" sx={{ color: '#6B7280', borderColor: '#e0e0e0' }}>
            Cancel
          </Button>
          <Button onClick={handleDeleteAll} variant="contained"
            sx={{ background: 'linear-gradient(135deg,#FF5A5A,#e04040)', boxShadow: 'none' }}>
            Delete All
          </Button>
        </DialogActions>
      </Dialog>

      {/* CSV errors */}
      <Dialog open={csvErrDlg} onClose={() => setCsvErrDlg(false)} maxWidth="sm" fullWidth>
        <DialogTitle>CSV Import Errors</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5, color: '#9CA3AF', fontSize: 13 }}>
            {csvErrors.length} rows failed to import:
          </Typography>
          <Box sx={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
            {csvErrors.map((e, i) => (
              <Box key={i} sx={{ p: 1.5, bgcolor: 'rgba(239,68,68,0.06)', borderRadius: '10px',
                                  border: '1px solid rgba(239,68,68,0.15)' }}>
                <Typography sx={{ fontWeight: 700, color: '#dc2626', fontSize: 12 }}>Row {e.row}</Typography>
                <Typography sx={{ color: '#6B7280', fontSize: 12 }}>{e.error}</Typography>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCsvErrDlg(false)} variant="contained" size="small">Close</Button>
        </DialogActions>
      </Dialog>

      <ClientDetailsModal client={detailClient} onClose={() => setDetailClient(null)} />

      <input type="file" accept=".csv" id="csv-input" style={{ display: 'none' }} onChange={handleImportCSV} />

      {/* ── Import Documents Dialog ── */}
      <Dialog open={docImportOpen} onClose={() => !docImportRunning && setDocImportOpen(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: '16px' } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 1.2 }}>
          <FolderOpenOutlinedIcon sx={{ color: '#6366f1' }} />
          Import Documents
          <Typography component="span" sx={{ fontSize: 12, color: '#9CA3AF', ml: 'auto', fontWeight: 400 }}>
            {docImportItems.filter(x => x.matched).length} matched · {docImportItems.filter(x => !x.matched).length} unmatched
          </Typography>
        </DialogTitle>

        <DialogContent sx={{ p: 0 }}>
          {/* Progress bar while uploading */}
          {docImportRunning && (
            <Box sx={{ px: 3, pt: 2, pb: 1 }}>
              <Typography sx={{ fontSize: 12, color: '#6B7280', mb: 0.5 }}>
                Uploading {docImportProgress.done} / {docImportProgress.total}
                {docImportProgress.current && ` — ${docImportProgress.current}`}
              </Typography>
              <LinearProgress variant="determinate"
                value={docImportProgress.total ? Math.round((docImportProgress.done / docImportProgress.total) * 100) : 0}
                sx={{ height: 7, borderRadius: 4,
                      '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#6366f1,#818cf8)' },
                      bgcolor: 'rgba(99,102,241,0.10)' }} />
            </Box>
          )}

          {/* Matched files */}
          {docImportItems.filter(x => x.matched).length > 0 && (
            <Box sx={{ px: 3, pt: docImportRunning ? 1 : 2.5, pb: 1 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, mb: 1 }}>
                Matched ({docImportItems.filter(x => x.matched).length} files)
              </Typography>
              <Box sx={{ maxHeight: 320, overflowY: 'auto', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '10px' }}>
                {docImportItems.filter(x => x.matched).map((item, i) => (
                  <Box key={i} sx={{ px: 2, py: 1.2, display: 'flex', alignItems: 'center', gap: 1.5,
                                     borderBottom: i < docImportItems.filter(x => x.matched).length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
                    {item.status === 'done'
                      ? <CheckCircleOutlineIcon sx={{ fontSize: 16, color: '#059669', flexShrink: 0 }} />
                      : item.status === 'error'
                      ? <ErrorOutlineIcon sx={{ fontSize: 16, color: '#dc2626', flexShrink: 0 }} />
                      : <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: 'rgba(99,102,241,0.15)', flexShrink: 0 }} />
                    }
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#1A1A2E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.file.name}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: '#9CA3AF' }}>
                        {item.client.client_name} · {item.client.insuresaas_ib_file_no} · <strong style={{ color: '#6366f1' }}>{item.docLabel}</strong>
                        {item.status === 'error' && <span style={{ color: '#dc2626' }}> — {item.error}</span>}
                      </Typography>
                    </Box>
                    <Chip label={item.status === 'done' ? 'Uploaded' : item.status === 'error' ? 'Failed' : 'Ready'}
                      size="small"
                      sx={{ fontSize: 10, fontWeight: 700, height: 20,
                            bgcolor: item.status === 'done' ? 'rgba(16,185,129,0.10)' : item.status === 'error' ? 'rgba(239,68,68,0.10)' : 'rgba(99,102,241,0.10)',
                            color:   item.status === 'done' ? '#059669' : item.status === 'error' ? '#dc2626' : '#6366f1' }} />
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {/* Unmatched files */}
          {docImportItems.filter(x => !x.matched).length > 0 && (
            <Box sx={{ px: 3, pt: 1.5, pb: 2.5 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, mb: 1 }}>
                Could Not Match ({docImportItems.filter(x => !x.matched).length} files)
              </Typography>
              <Box sx={{ maxHeight: 140, overflowY: 'auto', border: '1px solid rgba(245,158,11,0.20)', borderRadius: '10px', bgcolor: 'rgba(245,158,11,0.04)' }}>
                {docImportItems.filter(x => !x.matched).map((item, i) => (
                  <Box key={i} sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1.5,
                                     borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                    <ErrorOutlineIcon sx={{ fontSize: 15, color: '#d97706', flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.name}</Typography>
                      <Typography sx={{ fontSize: 11, color: '#9CA3AF' }}>{item.reason}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
              <Typography sx={{ fontSize: 11, color: '#9CA3AF', mt: 1 }}>
                Unmatched files are skipped. Make sure you import the CSV first, then import documents.
              </Typography>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(0,0,0,0.06)', gap: 1 }}>
          <Button onClick={() => setDocImportOpen(false)} disabled={docImportRunning} variant="outlined"
            sx={{ borderColor: '#e0e0e0', color: '#6B7280', fontSize: 13 }}>
            {docImportFinished ? 'Close' : 'Cancel'}
          </Button>
          {!docImportFinished && (
            <Button variant="contained" disabled={docImportRunning || docImportItems.filter(x => x.matched).length === 0}
              onClick={runDocImport}
              sx={{ fontSize: 13, background: 'linear-gradient(135deg,#6366f1,#818cf8)' }}>
              {docImportRunning
                ? `Uploading ${docImportProgress.done}/${docImportProgress.total}…`
                : `Upload ${docImportItems.filter(x => x.matched).length} Documents`}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={snackbar.sev}
          variant="filled"
          onClose={() => setSnackbar(s => ({ ...s, open: false }))}
          sx={{ borderRadius: '12px', fontWeight: 500 }}
        >
          {snackbar.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default TableSection;
