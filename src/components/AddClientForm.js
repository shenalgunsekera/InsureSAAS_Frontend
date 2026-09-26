import React, { useState, useEffect, useMemo, useRef } from 'react';
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp, getDocs, arrayUnion, increment, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { uploadFile as uploadToCloudinary, openFile } from '../storage';
import { logActivity } from '../utils/workSession';
import { useAuth } from '../App';
import { PRODUCTS } from '../config/products';
import { rateFor } from '../utils/commissionRates';
import { structureRate } from '../utils/commissionStructures';
import { evaluateAutoCalc, describeAutoCalc } from '../utils/autoCalc';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import Link from '@mui/material/Link';
import Chip from '@mui/material/Chip';
import Autocomplete from '@mui/material/Autocomplete';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';

/* Endorsement = a recorded change to an in-force policy. Each captures the
   revised Basic/SRCC/TC premium + sum insured; commission auto-calculates and
   the latest endorsement's figures become the policy's current values. */
const ENDORSEMENT_TYPES = [
  'Sum Insured Change', 'Period Extension / Change', 'Additional Coverage',
  'Add Cover', 'Add New Location', 'Cancellation / Return', 'Other',
];
const ENDO_UPLOAD_PREFIX = 'insuresaas';

/* ── Derived from PRODUCTS config — always in sync ───────────────────────── */
// label → product key  (e.g. 'Motor Insurance' → 'motor')
const PRODUCT_KEY_MAP = Object.fromEntries(
  Object.entries(PRODUCTS).map(([k, v]) => [v.label, k])
);
// product key → main class  (used to auto-fill the Main Class dropdown)
// Allowed Main Class values (what the dropdown shows).
const MAIN_CLASSES = ['Fire', 'Marine', 'Motor', 'Health', 'Miscellaneous', 'Individual', 'Group', 'Other'];
// Main Class options depend on Insurance Type. General = non-life classes;
// Life = life classes. Health appears under both.
const MAIN_CLASS_BY_TYPE = {
  General: ['Fire', 'Motor', 'Marine', 'Miscellaneous', 'Health'],
  Life:    ['Individual', 'Group', 'Other', 'Health'],
};
// Sentinel option in the Insurance Provider dropdown that opens the "add company" prompt.
const ADD_PROVIDER_SENTINEL = '➕ Add Insurance Company…';
const PRODUCT_MAIN_CLASS = {
  motor: 'Motor', mf: 'Motor',
  fire: 'Fire',
  marine: 'Marine',
  surgical: 'Health', group_medical: 'Group',
  personal_accidents: 'Individual', life_endowment: 'Individual', travel: 'Individual',
  wci: 'Group',
  car: 'Miscellaneous', ear: 'Miscellaneous', dtap: 'Miscellaneous',
  public_liability: 'Miscellaneous', product_liability: 'Miscellaneous',
  fgt: 'Miscellaneous', cyber: 'Miscellaneous', title_insurance: 'Miscellaneous',
};

/* ── Risk field sections to pull from product config ─────────────────────── */
const RISK_SECTIONS = [
  'Risk Information', 'Vehicle Details', 'Voyage Details', 'Marine Details',
  'Engineering Details', 'Loan Details', 'Property Details', 'Liability Details',
];

/* ── Static document fields ──────────────────────────────────────────────── */
const docFields = [
  { label: 'Policyholder',     doc: 'policyholder_doc_url',     text: 'policyholder_text' },
  { label: 'Proposal Form',    doc: 'proposal_form_doc_url',    text: 'proposal_form_text' },
  { label: 'Quotation',        doc: 'quotation_doc_url',        text: 'quotation_text' },
  { label: 'CR Copy',          doc: 'cr_copy_doc_url',          text: 'cr_copy_text' },
  { label: 'Schedule',         doc: 'schedule_doc_url',         text: 'schedule_text' },
  { label: 'Invoice / Debit',  doc: 'invoice_doc_url',          text: 'invoice_text' },
  { label: 'Payment Receipt',  doc: 'payment_receipt_doc_url',  text: 'payment_receipt_text' },
  { label: 'NIC / BR',         doc: 'nic_br_doc_url',           text: 'nic_br_text' },
];

/* ── Dropdowns ────────────────────────────────────────────────────────────── */
const dropdowns = {
  insurance_type: ['General', 'Life'],
  sum_insured_currency: ['LKR', 'USD', 'EUR', 'GBP', 'AUD', 'JPY', 'INR', 'SGD', 'Other'],
  main_class: MAIN_CLASSES,
  new_renewal: ['New', 'Renewal'],
  // Auto-generated from PRODUCTS config — if a product is added there, it appears here
  product: Object.values(PRODUCTS).filter(p => !p.hidden).map(p => p.label),
  customer_type: ['Individual', 'Individual Inhouse', 'Corporate', 'Corporate Inhouse'],
  insurance_provider: [
    'AIA Insurance', 'Allianz Insurance Lanka', 'Ceylinco General Insurance',
    'Ceylinco Life Insurance', 'Continental Insurance Lanka', 'Fairfirst Insurance',
    'HNB General Insurance',
    'Janashakthi General Insurance', 'Janashakthi Life Insurance',
    'LOLC General Insurance', 'LOLC Life Assurance',
    'National Insurance Trust Fund', 'Orient Insurance',
    'Peoples Insurance', 'Sanasa General Insurance',
    'Sanasa Life Assurance', 'Softlogic Life Insurance',
    'Sri Lanka Insurance Corporation',
    'Union Assurance', 'Other',
  ],
  branch: ['Colombo', 'Kandy', 'Galle', 'Kurunegala', 'Jaffna', 'Negombo', 'Matara', 'Other'],
  commission_type: ['Standard', 'Special'],
  payment_status: ['Unpaid', 'Partial', 'Paid', 'Overdue'],
  payment_method: ['Cash', 'Cheque', 'Bank Transfer', 'Online', 'Other'],
  commission_paid_method: ['Cash', 'Cheque', 'Bank Transfer', 'Online', 'Other'],
  claim_paid: ['Yes', 'No', 'Partial', 'Repudiated'],
};

/* ── Commission ─────────────────────────────────────────────────────────────
   Standard commission = premiums × the rate in force at the policy start date,
   resolved from the admin Commissions tab (settings/commission_rates) with a
   per-class fallback — see utils/commissionRates. A "Special" commission adds a
   single flat Special Commission amount on top of the Basic/SRCC/TC.           */
const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
const roundMoney = (n) => (Number.isFinite(n) && n !== 0 ? String(Math.round(n * 100) / 100) : '');

/* ── Field definitions ─────────────────────────────────────────────────────
   Exported so TableSection can use it for CSV template generation           */
export const textFields = [
  // Introducer
  { label: 'InsureSAAS IB File No.', name: 'insuresaas_ib_file_no', section: 'Introducer' },
  { label: 'Manager',            name: 'manager',            section: 'Introducer' },
  { label: 'Introducer Code',    name: 'introducer_code',    section: 'Introducer' },
  // Insurance Company
  { label: 'Insurance Type',     name: 'insurance_type',     section: 'Insurance Company', dropdown: true },
  { label: 'Main Class',         name: 'main_class',         section: 'Insurance Company', dropdown: true },
  { label: 'Product',            name: 'product',            section: 'Insurance Company', dropdown: true, required: true },
  { label: 'Insurance Provider', name: 'insurance_provider', section: 'Insurance Company', dropdown: true, required: true },
  { label: 'Branch',             name: 'branch',             section: 'Insurance Company', dropdown: true },
  { label: 'New / Renewal',      name: 'new_renewal',        section: 'Introducer', dropdown: true },
  // Proposer Details
  { label: 'Customer Type',      name: 'customer_type',      section: 'Proposer Details', dropdown: true, required: true },
  { label: 'Client Name',        name: 'client_name',        section: 'Proposer Details', required: true },
  { label: 'NIC / Passport No.', name: 'nic_proof',          section: 'Proposer Details' },
  { label: 'Business Registration', name: 'business_registration', section: 'Proposer Details' },
  { label: 'SVAT / VAT No.',     name: 'svat_proof',         section: 'Proposer Details' },
  { label: 'Street 1',           name: 'street1',            section: 'Proposer Details' },
  { label: 'Street 2',           name: 'street2',            section: 'Proposer Details' },
  { label: 'City',               name: 'city',               section: 'Proposer Details' },
  { label: 'District',           name: 'district',           section: 'Proposer Details' },
  { label: 'Postal Code',        name: 'postal_code',        section: 'Proposer Details' },
  { label: 'Province',           name: 'province',           section: 'Proposer Details' },
  { label: 'Telephone',          name: 'telephone',          section: 'Proposer Details' },
  { label: 'Mobile No',          name: 'mobile_no',          section: 'Proposer Details', required: true },
  { label: 'Contact Person',     name: 'contact_person',     section: 'Proposer Details' },
  { label: 'Email',              name: 'email',              section: 'Proposer Details' },
  { label: 'Social Media',       name: 'social_media',       section: 'Proposer Details' },
  // Period of Insurance
  { label: 'Policy No',          name: 'policy_no',          section: 'Period of Insurance' },
  { label: 'Policy Type',        name: 'policy_type',        section: 'Period of Insurance' },
  { label: 'Coverage',           name: 'coverage',           section: 'Period of Insurance' },
  { label: 'Policy Period From', name: 'policy_period_from', section: 'Period of Insurance', date: true },
  { label: 'Policy Period To',   name: 'policy_period_to',   section: 'Period of Insurance', date: true },
  { label: 'Policy Days',        name: 'policy_days',        section: 'Period of Insurance', type: 'number', readOnly: true },
  { label: 'Year',               name: 'policy_year',        section: 'Period of Insurance', readOnly: true },
  { label: 'Month',              name: 'policy_month',       section: 'Period of Insurance', readOnly: true },
  { label: 'O/S Days',           name: 'os_days',            section: 'Period of Insurance', type: 'number' },
  { label: 'Credit Period (days)', name: 'credit_period',    section: 'Period of Insurance', type: 'number' },
  { label: 'Quote Validity (days)', name: 'validity_days',   section: 'Period of Insurance', type: 'number' },
  // Vehicle (motor only — shown conditionally)
  { label: 'Vehicle Number',     name: 'vehicle_number',     section: 'Risk Information', motor: true },
  // Sum Insured (own section)
  { label: 'Currency',           name: 'sum_insured_currency', section: 'Sum Insured', dropdown: true },
  { label: 'Sum Insured',        name: 'sum_insured',        section: 'Sum Insured', type: 'number' },
  { label: 'Basic Premium',      name: 'basic_premium',      section: 'Premium', type: 'number' },
  { label: 'SRCC Premium',       name: 'srcc_premium',       section: 'Premium', type: 'number' },
  { label: 'TC Premium',         name: 'tc_premium',         section: 'Premium', type: 'number' },
  { label: 'Cess',               name: 'cess',               section: 'Premium', type: 'number' },
  { label: 'NBL',                name: 'nbl',                section: 'Premium', type: 'number' },
  { label: 'SSC Levy',           name: 'ssc_levy',           section: 'Premium', type: 'number' },
  { label: 'Admin Fees',         name: 'admin_fees',         section: 'Premium', type: 'number' },
  { label: 'Other Premium',      name: 'other_premium',      section: 'Premium', type: 'number' },
  { label: 'Road Safety Fee',    name: 'road_safety_fee',    section: 'Premium', type: 'number' },
  { label: 'Policy Fee',         name: 'policy_fee',         section: 'Premium', type: 'number' },
  { label: 'Stamp Duty',         name: 'stamp_duty',         section: 'Premium', type: 'number' },
  { label: 'VAT',                name: 'vat_fee',            section: 'Premium', type: 'number' },
  { label: 'Net Premium (excl. taxes)', name: 'net_premium', section: 'Premium', type: 'number' },
  { label: 'Total Premium (incl. taxes)', name: 'total_invoice', section: 'Premium', type: 'number' },
  // Payment
  { label: 'Payment Status',     name: 'payment_status',     section: 'Payment', dropdown: true },
  { label: 'Amount Received',    name: 'amount_received',    section: 'Payment', type: 'number' },
  { label: 'Payment Date',       name: 'payment_date',       section: 'Payment', date: true },
  { label: 'Payment Method',     name: 'payment_method',     section: 'Payment', dropdown: true },
  { label: 'Cheque / Slip No.',  name: 'cheque_slip_no',     section: 'Payment' },
  { label: 'Receipt No.',        name: 'receipt_no',         section: 'Payment' },
  { label: 'Debit Note No.',     name: 'debit_note_no',      section: 'Payment' },
  { label: 'Debit Note Date',    name: 'debit_note_date',    section: 'Payment', date: true },
  // Commission
  { label: 'Commission Type',    name: 'commission_type',    section: 'Commission', dropdown: true },
  { label: 'Basic Commission %', name: 'commission_pct',     section: 'Commission', type: 'number' },
  { label: 'Special Basic %', name: 'commission_special_pct',      section: 'Commission', type: 'number' },
  { label: 'Special SRCC %',  name: 'commission_special_srcc_pct', section: 'Commission', type: 'number' },
  { label: 'Special TC %',    name: 'commission_special_tc_pct',   section: 'Commission', type: 'number' },
  { label: 'Commission Basic',   name: 'commission_basic',   section: 'Commission', type: 'number' },
  { label: 'Commission SRCC',    name: 'commission_srcc',    section: 'Commission', type: 'number' },
  { label: 'Commission TC',      name: 'commission_tc',      section: 'Commission', type: 'number' },
  { label: 'Total Commission',   name: 'commission_total',   section: 'Commission', type: 'number' },
  { label: 'Commission Method',  name: 'commission_paid_method', section: 'Commission', dropdown: true },
  { label: 'Commission Receive Date', name: 'commission_receive_date', section: 'Commission', date: true },
  { label: 'Commission Amount Received', name: 'commission_amount_paid',  section: 'Commission', type: 'number' },
  { label: 'Commission VAT',     name: 'commission_vat',     section: 'Commission', type: 'number' },
  // Claims
  { label: 'Claim Paid?',        name: 'claim_paid',         section: 'Claims', dropdown: true },
  { label: 'Date of Claim',      name: 'claim_date',         section: 'Claims', date: true },
  { label: 'Claim Amount (LKR)', name: 'claim_amount',       section: 'Claims', type: 'number' },
  { label: 'Settled Amount (LKR)', name: 'claim_settled',    section: 'Claims', type: 'number' },
  { label: 'Repudiation Reasons', name: 'repudiation_reasons', section: 'Claims' },
  { label: 'Partial Payment Reasons', name: 'partial_payment_reasons', section: 'Claims' },
  // Other
  { label: 'Birthday Policy',    name: 'birthday_policy',    section: 'Other', date: true },
  { label: 'Date Added',         name: 'date_added',         section: 'Other', date: true },
  { label: 'Notes',              name: 'notes',              section: 'Other' },
];

const SECTION_COLORS = {
  Introducer:                 '#255EAB',
  'Insurance Company':        '#38A3E0',
  'Proposer Details':         '#6BC0EC',
  'Period of Insurance':      '#10B981',
  'Financial Interest':       '#0284c7',
  'Risk Information':         '#0891b2',
  'Claims History':           '#f59e0b',
  'Underwriting Information': '#7c3aed',
  'Sum Insured':              '#059669',
  'Covers Required':          '#16a34a',
  'Additional Clauses':       '#15803d',
  Deductibles:                '#dc2626',
  Premium:                    '#6366f1',
  Payment:                    '#8b5cf6',
  Commission:                 '#ec4899',
  Claims:                     '#ef4444',
  Documents:                  '#6366f1',
  Other:                      '#6B7280',
};

/* ── helpers ─────────────────────────────────────────────────────────────── */
function calcPolicyDays(from, to) {
  if (!from || !to) return '';
  const a = new Date(from instanceof Date ? from : from);
  const b = new Date(to   instanceof Date ? to   : to);
  if (isNaN(a) || isNaN(b)) return '';
  const diff = Math.round((b - a) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? String(diff) : '';
}

// Outstanding days = days from policy commencement (start) to the payment date.
// While unpaid and no payment date yet, it counts up from the start to today.
// Once the premium is Paid, nothing is outstanding → 0.
function calcOsDays(from, paymentDate, paymentStatus) {
  if (String(paymentStatus || '').toLowerCase() === 'paid') return '0';
  if (!from) return '';
  const start = new Date(from instanceof Date ? from : from);
  if (isNaN(start)) return '';
  const end = paymentDate ? new Date(paymentDate instanceof Date ? paymentDate : paymentDate) : new Date();
  if (isNaN(end)) return '';
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
  return diff > 0 ? String(diff) : '0';
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function fmtNum(v) {
  if (v === '' || v === null || v === undefined) return '';
  let s = String(v).replace(/,/g, '');
  // Not a number-in-progress — show as-is.
  if (!/^-?\d*\.?\d*$/.test(s)) return s;
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  const hasDot = s.includes('.');
  let [intPart, decPart = ''] = s.split('.');
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ','); // thousands separators
  // Preserve the decimal portion exactly as typed (trailing dot / zeros kept).
  let out = intPart + (hasDot ? '.' + decPart : '');
  return (neg ? '-' : '') + out;
}

/* ── sub-components ──────────────────────────────────────────────────────── */
function DocUploadBox({ label, fieldName, existing, onFile, progress, uploaded }) {
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const handleFile = (file) => { if (!file) return; setFileName(file.name); onFile(file); };
  return (
    <Box>
      <Box
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => document.getElementById(`file-${fieldName}`).click()}
        sx={{
          border: `2px dashed ${dragging ? '#255EAB' : uploaded ? '#10B981' : 'rgba(56,163,224,0.35)'}`,
          borderRadius: '12px', p: 1.5, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 1,
          bgcolor: dragging ? 'rgba(37,94,171,0.04)' : uploaded ? 'rgba(16,185,129,0.04)' : '#FAFAFA',
          transition: 'all 0.2s ease',
          '&:hover': { borderColor: '#38A3E0', bgcolor: 'rgba(56,163,224,0.04)' },
        }}
      >
        {uploaded
          ? <CheckCircleOutlinedIcon sx={{ color: '#10B981', fontSize: 20, flexShrink: 0 }} />
          : <CloudUploadOutlinedIcon sx={{ color: '#38A3E0', fontSize: 20, flexShrink: 0 }} />}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#374151', lineHeight: 1.2 }}>{label}</Typography>
          {fileName
            ? <Typography sx={{ fontSize: 10.5, color: '#10B981', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{fileName}</Typography>
            : existing
              ? <Typography sx={{ fontSize: 10.5, color: '#9CA3AF' }}>Current file saved — drop to replace</Typography>
              : <Typography sx={{ fontSize: 10.5, color: '#9CA3AF' }}>Click or drag to upload (PDF/image)</Typography>}
        </Box>
        {existing && !fileName && (
          <Link component="button" type="button"
            onClick={e => { e.stopPropagation(); openFile(existing); }}
            sx={{ fontSize: 10.5, color: '#38A3E0', whiteSpace: 'nowrap', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer' }}>
            View
          </Link>
        )}
      </Box>
      {progress !== null && progress < 100 && (
        <LinearProgress variant="determinate" value={progress}
          sx={{ mt: 0.5, borderRadius: '2px', height: 3,
                '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#255EAB,#38A3E0)' } }} />
      )}
      <input type="file" id={`file-${fieldName}`} accept="application/pdf,image/*"
        style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
    </Box>
  );
}

function SectionHeader({ title }) {
  const color = SECTION_COLORS[title] || '#255EAB';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, mt: 0.5 }}>
      <Box sx={{ width: 4, height: 20, borderRadius: '2px', background: `linear-gradient(180deg,${color},rgba(0,0,0,0))` }} />
      <Typography sx={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {title}
      </Typography>
      <Box sx={{ flex: 1, height: 1, bgcolor: 'rgba(56,163,224,0.12)' }} />
    </Box>
  );
}

function NumericField({ value, onChange, readOnly, ...props }) {
  const handleChange = (e) => {
    const raw = e.target.value.replace(/,/g, '');
    if (raw === '' || /^-?\d*\.?\d*$/.test(raw)) onChange({ ...e, target: { ...e.target, value: raw } });
  };
  return (
    <TextField {...props}
      value={fmtNum(value)}
      onChange={readOnly ? undefined : handleChange}
      InputProps={{ readOnly: !!readOnly, ...(props.InputProps || {}) }}
      inputProps={{ inputMode: 'decimal', ...(props.inputProps || {}) }}
      sx={{ ...props.sx, ...(readOnly ? { '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.03)' } } : {}) }}
    />
  );
}

/* ══════════════════════════════ MAIN FORM ═══════════════════════════════ */
const AddClientForm = ({ onSuccess, onCancel, initialData = {}, isEdit = false, onRenew }) => {
  const { user, userProfile } = useAuth();
  const isPrivileged = userProfile?.role === 'admin' || userProfile?.role === 'manager';

  /* ── scalar fields state ─────────────────────────────────────────────── */
  const [fields, setFields] = useState(() => {
    // Resolve product label: prefer stored label, fall back from product_key, else empty
    const resolveProduct = (raw, key) => {
      if (raw && PRODUCT_KEY_MAP[raw]) return raw;             // already a label
      if (key  && PRODUCTS[key]) return PRODUCTS[key].label;  // translate from key
      return '';
    };

    const obj = {};
    textFields.forEach(f => {
      if (f.date) return;
      if (f.name === 'product') {
        obj.product = resolveProduct(initialData.product, initialData.product_key);
        return;
      }
      const raw0 = initialData[f.name];
      // Legacy 'Company' customer_type → standardised 'Corporate'
      const raw = (f.name === 'customer_type' && raw0 === 'Company') ? 'Corporate' : raw0;
      if (raw === undefined || raw === null || raw === '') { obj[f.name] = ''; return; }
      if (f.dropdown && dropdowns[f.name]) {
        obj[f.name] = dropdowns[f.name].includes(String(raw)) ? String(raw)
          : (dropdowns[f.name].includes('Other') ? 'Other' : '');
      } else {
        obj[f.name] = String(raw);
      }
    });
    docFields.forEach(f => { obj[f.text] = initialData[f.text] || ''; });
    if (!obj.sum_insured_currency) obj.sum_insured_currency = 'LKR'; // sensible default
    // Marine policies default to New when the field is blank (existing records
    // predate this field); every other class is left blank to be set manually.
    if (!obj.new_renewal && (obj.main_class === 'Marine' || /marine/i.test(obj.product || ''))) obj.new_renewal = 'New';
    // Special commission is now entered as three rates (Basic / SRCC / TC %), each
    // applied to its premium — exactly like Standard but with manual percentages.
    // For older Special records that only stored amounts, back-derive the equivalent
    // percentages so editing shows them (a stored amount ÷ its premium × 100).
    if (obj.commission_type === 'Special') {
      const pct = (amt, prem) => (num(amt) && num(prem)) ? String(Math.round(num(amt) / num(prem) * 10000) / 100) : '';
      if (!num(obj.commission_special_pct)) {
        obj.commission_special_pct = pct(initialData.commission_basic, obj.basic_premium)
          || pct(initialData.commission_special || initialData.commission_special_amount, obj.basic_premium);
      }
      if (!num(obj.commission_special_srcc_pct)) obj.commission_special_srcc_pct = pct(initialData.commission_srcc, obj.srcc_premium);
      if (!num(obj.commission_special_tc_pct))   obj.commission_special_tc_pct   = pct(initialData.commission_tc,   obj.tc_premium);
    }
    return obj;
  });

  /* ── date fields state ────────────────────────────────────────────────── */
  const [dates, setDates] = useState({
    policy_period_from:      initialData.policy_period_from ? new Date(initialData.policy_period_from) : null,
    policy_period_to:        initialData.policy_period_to   ? new Date(initialData.policy_period_to)   : null,
    payment_date:            initialData.payment_date        ? new Date(initialData.payment_date)        : null,
    debit_note_date:         initialData.debit_note_date     ? new Date(initialData.debit_note_date)     : null,
    commission_receive_date: initialData.commission_receive_date ? new Date(initialData.commission_receive_date) : null,
    claim_date:              initialData.claim_date           ? new Date(initialData.claim_date)           : null,
    birthday_policy:         initialData.birthday_policy      ? new Date(initialData.birthday_policy)      : null,
    date_added:              initialData.created_at?.toDate
      ? initialData.created_at.toDate()
      : initialData.created_at ? new Date(initialData.created_at) : null,
  });

  const [docs,     setDocs]     = useState({});
  const [progress, setProgress] = useState({});
  const [uploaded, setUploaded] = useState({});
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  // ── Payments ledger ────────────────────────────────────────────────────
  // A policy can receive several payments. Each entry carries every payment field
  // except Payment Status (which stays policy-level). The policy's Amount Received
  // is the derived total of the ledger PLUS any endorsement Amount Paid (kept
  // separate but still counted). Legacy single-payment records migrate to one row.
  const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const freshPayment = () => ({ amount_received: '', payment_date: '', payment_method: '', cheque_slip_no: '', receipt_no: '', debit_note_no: '', debit_note_date: '' });
  const [payments, setPayments] = useState(() => {
    if (Array.isArray(initialData.payments) && initialData.payments.length) {
      return initialData.payments.map(p => ({ id: p.id || genId(), ...freshPayment(), ...p }));
    }
    const single = {
      amount_received: initialData.amount_received || '', payment_date: initialData.payment_date || '',
      payment_method: initialData.payment_method || '', cheque_slip_no: initialData.cheque_slip_no || '',
      receipt_no: initialData.receipt_no || '', debit_note_no: initialData.debit_note_no || '',
      debit_note_date: initialData.debit_note_date || '',
    };
    if (Object.values(single).some(v => v !== '' && v != null)) return [{ id: genId(), ...single }];
    // Seed one blank row so the payment fields are visible immediately (matches the
    // old single-payment form); fully-empty rows are dropped on save.
    return [{ id: genId(), ...freshPayment() }];
  });
  const PAY_KEYS = ['amount_received', 'payment_date', 'payment_method', 'cheque_slip_no', 'receipt_no', 'debit_note_no', 'debit_note_date'];
  const cleanPayments = payments.filter(p => PAY_KEYS.some(k => (p[k] ?? '') !== ''));
  const updatePayment = (id, key, val) => setPayments(list => list.map(p => (p.id === id ? { ...p, [key]: val } : p)));
  const addPayment    = () => setPayments(list => [...list, { id: genId(), ...freshPayment() }]);
  const removePayment = (id) => setPayments(list => list.filter(p => p.id !== id));
  const paymentsTotal    = payments.reduce((a, p) => a + num(p.amount_received), 0);

  // ── Endorsements (edit mode) ────────────────────────────────────────────
  const [endorsements, setEndorsements] = useState(() =>
    Array.isArray(initialData.endorsements) ? initialData.endorsements : []);
  const freshDraft = () => ({
    effective_date: '', type: ENDORSEMENT_TYPES[0], description: '',
    basic_premium_change: '', srcc_premium_change: '', tc_premium_change: '',
    total_premium_change: '', sum_insured_change: '', amount_paid: '', amount_paid_date: '', documents: [],
  });
  const [endoDraft, setEndoDraft] = useState(() => freshDraft());
  // Which endorsement's Amount Paid is being edited inline ({ id, value }).
  const [editingPaid, setEditingPaid] = useState(null);
  const [endoError, setEndoError] = useState('');
  const [endoUploading, setEndoUploading] = useState(false);

  const set = (name, val) => setFields(f => ({ ...f, [name]: val }));

  const handleDate = (name, val) => {
    setDates(d => ({ ...d, [name]: val }));
  };

  /* ── auto-calcs ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const from = dates.policy_period_from;
    const to   = dates.policy_period_to;
    const days = calcPolicyDays(from, to);
    const year  = from ? String(from.getFullYear()) : '';
    const month = from ? MONTHS[from.getMonth()] : '';
    setFields(f => ({
      ...f,
      policy_days:  days,
      policy_year:  year,
      policy_month: month,
    }));
  }, [dates.policy_period_from, dates.policy_period_to]);

  // O/S Days recomputes automatically from commencement → payment date, and
  // becomes 0 the moment the payment status is set to Paid.
  useEffect(() => {
    setFields(f => ({
      ...f,
      os_days: calcOsDays(dates.policy_period_from, dates.payment_date, f.payment_status),
    }));
  }, [dates.policy_period_from, dates.payment_date, fields.payment_status]);

  /* ── Commission rate schedules (admin-managed, per product / date range) ── */
  const [commissionSchedules, setCommissionSchedules] = useState({});
  useEffect(() => {
    let alive = true;
    getDoc(doc(db, 'settings', 'commission_rates'))
      .then(snap => { if (alive && snap.exists()) setCommissionSchedules(snap.data().products || {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  /* ── Commission structures (declining scales by policy year, per product) ──
     When the policy's product has a structure, the MAIN commission % comes from
     the scale for this policy's year — measured from the ORIGINAL policy's start
     date — instead of the flat date-range rate. It steps down as the policy
     renews. Configured in the Commission Structures module. */
  const [commissionStructures, setCommissionStructures] = useState({});
  useEffect(() => {
    let alive = true;
    getDoc(doc(db, 'settings', 'commission_structures'))
      .then(snap => { if (alive && snap.exists()) setCommissionStructures(snap.data().products || {}); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  // A renewal's year is measured from the ORIGINAL (root) policy's start date, so
  // fetch it when this record belongs to a renewal chain.
  const [structRootStart, setStructRootStart] = useState('');
  useEffect(() => {
    let alive = true;
    if (!initialData.root_policy_id) { setStructRootStart(''); return; }
    getDoc(doc(db, 'clients', initialData.root_policy_id))
      .then(s => { if (alive && s.exists()) setStructRootStart(s.data().policy_period_from || ''); })
      .catch(() => {});
    return () => { alive = false; };
  }, [initialData.root_policy_id]);

  const thisStartStr = dates.policy_period_from && !isNaN(dates.policy_period_from)
    ? dates.policy_period_from.toISOString().slice(0, 10) : '';
  // The root start: the original policy's start for a renewal, else this policy's own
  // start (a brand-new policy is Year 1).
  const structRootStr = initialData.root_policy_id ? structRootStart : thisStartStr;
  const structSegs = (() => { const v = commissionStructures[fields.product]; return (v && v.segments) || (Array.isArray(v) ? v : null); })();
  const usesStructure = !!(structSegs && structSegs.length);
  const structHit = usesStructure ? structureRate(structSegs, structRootStr, thisStartStr) : null;
  // Rate for this policy year: the scale rate, 0 once the scale has ended, or null
  // when the product has no structure (→ fall back to the normal date-range rate).
  const structRateVal = usesStructure ? (structHit ? structHit.rate : 0) : null;
  const structYear = structHit ? Math.floor(structHit.months / 12) + 1 : null;

  /* Standard commission auto-calculates from the admin rate table for the
     product, using the rate whose date range contains the policy START date —
     or, for a product with a commission structure, the scale rate for this
     policy's year. Special is entered by hand unless a structure applies. */
  const autoCommission = fields.commission_type === 'Standard';
  useEffect(() => {
    if (!autoCommission) return;
    const rate = rateFor(commissionSchedules, fields.product, fields.main_class, dates.policy_period_from);
    // The basic % comes from the commission structure when the product has one,
    // otherwise from the date-range rate table. SRCC / TC always use the rate table.
    const basicPct = structRateVal != null ? structRateVal : rate.basic;
    const cb = num(fields.basic_premium) * basicPct / 100;
    const cs = num(fields.srcc_premium)  * rate.srcc  / 100;
    const ct = num(fields.tc_premium)    * rate.tc    / 100;
    setFields(f => ({
      ...f,
      commission_pct:   String(basicPct),
      commission_basic: roundMoney(cb),
      commission_srcc:  roundMoney(cs),
      commission_tc:    roundMoney(ct),
    }));
  }, [autoCommission, fields.commission_type, fields.main_class, fields.product, fields.basic_premium,
      fields.srcc_premium, fields.tc_premium, dates.policy_period_from, commissionSchedules, structRateVal]);

  // Special commission: each entered % × its premium → the Commission Basic/SRCC/TC
  // amounts (like Standard, but with manually-entered rates).
  useEffect(() => {
    if (fields.commission_type !== 'Special') return;
    setFields(f => ({
      ...f,
      commission_pct: '',
      commission_basic: roundMoney(num(f.basic_premium) * num(f.commission_special_pct) / 100),
      commission_srcc:  roundMoney(num(f.srcc_premium)  * num(f.commission_special_srcc_pct) / 100),
      commission_tc:    roundMoney(num(f.tc_premium)    * num(f.commission_special_tc_pct) / 100),
    }));
  }, [fields.commission_type, fields.basic_premium, fields.srcc_premium, fields.tc_premium,
      fields.commission_special_pct, fields.commission_special_srcc_pct, fields.commission_special_tc_pct]);

  // A commission structure drives the Special Basic % for the policy's year.
  useEffect(() => {
    if (fields.commission_type !== 'Special' || structRateVal == null) return;
    setFields(f => ({ ...f, commission_special_pct: String(structRateVal) }));
  }, [fields.commission_type, structRateVal]);

  useEffect(() => {
    // Total commission = Basic + SRCC + TC (for both Standard and Special).
    const total = num(fields.commission_basic) + num(fields.commission_srcc) + num(fields.commission_tc);
    setFields(f => ({ ...f, commission_total: total !== 0 ? String(Math.round(total * 100) / 100) : '' }));
  }, [fields.commission_basic, fields.commission_srcc, fields.commission_tc]);

  /* ── Endorsement helpers ──────────────────────────────────────────────────
     Every field is a +/- CHANGE applied to the policy's current value. Commission
     is NOT entered — it recalculates from the new premiums using the same rate
     table + commission type; the endorsement records the resulting commission change. */
  const commissionOf = (basic, srcc, tc) => {
    if (fields.commission_type === 'Special') {
      // Special uses the manually-entered Special Basic / SRCC / TC rates.
      return basic * num(fields.commission_special_pct) / 100
           + srcc  * num(fields.commission_special_srcc_pct) / 100
           + tc    * num(fields.commission_special_tc_pct) / 100;
    }
    const rate = rateFor(commissionSchedules, fields.product, fields.main_class, dates.policy_period_from);
    const basicPct = structRateVal != null ? structRateVal : rate.basic;
    return basic * basicPct / 100 + srcc * rate.srcc / 100 + tc * rate.tc / 100;
  };
  const endoCommissionChange = (draft) => {
    const oldC = commissionOf(num(fields.basic_premium), num(fields.srcc_premium), num(fields.tc_premium));
    const newC = commissionOf(
      num(fields.basic_premium) + num(draft.basic_premium_change),
      num(fields.srcc_premium)  + num(draft.srcc_premium_change),
      num(fields.tc_premium)    + num(draft.tc_premium_change),
    );
    return Math.round((newC - oldC) * 100) / 100;
  };
  // Net premium change auto-derives from the Basic + SRCC + TC changes.
  const netPremiumChange = (draft) =>
    Math.round((num(draft.basic_premium_change) + num(draft.srcc_premium_change) + num(draft.tc_premium_change)) * 100) / 100;

  const handleEndoFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setEndoUploading(true); setEndoError('');
    try {
      const safeName = (fields.client_name || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
      const added = [];
      for (const file of files) {
        const url = await uploadToCloudinary(file, `${ENDO_UPLOAD_PREFIX}/clients/${safeName}/endorsements`, () => {}, file.name);
        added.push({ name: file.name, url });
      }
      setEndoDraft(d => ({ ...d, documents: [...d.documents, ...added] }));
    } catch (err) {
      setEndoError(err?.message || 'Failed to upload document.');
    }
    setEndoUploading(false);
  };

  const removeEndoDraftDoc = (idx) =>
    setEndoDraft(d => ({ ...d, documents: d.documents.filter((_, i) => i !== idx) }));

  const addEndorsement = () => {
    if (!endoDraft.effective_date && !endoDraft.description.trim()) {
      setEndoError('Add an effective date or a description for the endorsement.');
      return;
    }
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      endorsement_no: endorsements.length + 1,
      effective_date: endoDraft.effective_date || '',
      type: endoDraft.type,
      description: endoDraft.description.trim(),
      basic_premium_change: String(num(endoDraft.basic_premium_change)),
      srcc_premium_change:  String(num(endoDraft.srcc_premium_change)),
      tc_premium_change:    String(num(endoDraft.tc_premium_change)),
      net_premium_change:   String(netPremiumChange(endoDraft)),
      total_premium_change: String(num(endoDraft.total_premium_change)),
      sum_insured_change:   String(num(endoDraft.sum_insured_change)),
      commission_change:    String(endoCommissionChange(endoDraft)),
      amount_paid:          String(num(endoDraft.amount_paid)),
      amount_paid_date:     endoDraft.amount_paid_date || '',
      documents: endoDraft.documents,
      created_at: new Date().toISOString(),
      created_by: userProfile?.full_name || user?.email?.split('@')[0] || 'Unknown',
    };
    setEndorsements(list => [...list, entry]);
    // Apply each +/- change to the policy's current values. Net premium follows
    // the premium changes automatically; total premium takes the manual change.
    // The endorsement's Amount Paid is NOT written here — it's counted into the
    // policy's total Amount Received (with the payments ledger) at render/save time.
    setFields(f => ({ ...f,
      basic_premium: String(num(f.basic_premium) + num(entry.basic_premium_change)),
      srcc_premium:  String(num(f.srcc_premium)  + num(entry.srcc_premium_change)),
      tc_premium:    String(num(f.tc_premium)    + num(entry.tc_premium_change)),
      net_premium:   String(num(f.net_premium)   + num(entry.net_premium_change)),
      total_invoice: String(num(f.total_invoice) + num(entry.total_premium_change)),
      sum_insured:   String(num(f.sum_insured)   + num(entry.sum_insured_change)),
    }));
    setEndoDraft(freshDraft());
    setEndoError('');
  };

  // Edit an existing endorsement's Amount Paid + Paid Date. The policy total
  // recomputes from the ledger + all endorsement payments, so nothing else changes.
  const setEndorsementPaid = (id, raw, paidDate) =>
    setEndorsements(list => list.map(e => (e.id === id ? { ...e, amount_paid: String(num(raw)), amount_paid_date: paidDate || '' } : e)));

  const deleteEndorsement = (id) =>
    setEndorsements(list => list.filter(e => e.id !== id).map((e, i) => ({ ...e, endorsement_no: i + 1 })));

  // Total Amount Received = payments ledger + all endorsement Amount Paid (kept
  // separate but both counted). This is what reports and exports read.
  const endoPaidTotal    = endorsements.reduce((a, e) => a + num(e.amount_paid), 0);
  const totalReceivedNum = Math.round((paymentsTotal + endoPaidTotal) * 100) / 100;

  /* ── custom products (Firestore) merged with built-ins ───────────────────
     Without this, a quote built on a custom product would not render any of its
     product-specific fields here — the underwriting form would only know the
     built-in products. Merging keeps custom-product fields mapping correctly. */
  const [customProducts, setCustomProducts] = useState({});
  useEffect(() => {
    let alive = true;
    getDocs(collection(db, 'products')).then(snap => {
      if (!alive) return;
      const map = {};
      snap.forEach(d => { map[d.id] = { ...d.data() }; });
      setCustomProducts(map);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const allProducts   = useMemo(() => ({ ...PRODUCTS, ...customProducts }), [customProducts]);
  const productKeyMap  = useMemo(
    () => Object.fromEntries(Object.entries(allProducts).map(([k, v]) => [v.label, k])),
    [allProducts]);
  const productOptions = useMemo(() => Object.values(allProducts).map(p => p.label), [allProducts]);

  // Once custom products load, resolve a custom product that the static map missed.
  useEffect(() => {
    if (fields.product) return;
    const raw = initialData.product, key = initialData.product_key;
    let resolved = '';
    if (raw && productKeyMap[raw]) resolved = raw;
    else if (key && allProducts[key]) resolved = allProducts[key].label;
    if (resolved) setFields(f => ({ ...f, product: resolved }));
  }, [productKeyMap, allProducts]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Main Class options depend on Insurance Type (General vs Life) ─────── */
  const mainClassOptions = MAIN_CLASS_BY_TYPE[fields.insurance_type] || MAIN_CLASSES;

  /* ── auto-fill main_class ONLY when the user actually changes the product —
     never on the initial edit-load (that would clobber the saved main class). */
  const prevProduct = useRef(fields.product);
  useEffect(() => {
    if (prevProduct.current === fields.product) return; // deps changed for another reason (e.g. products loaded)
    prevProduct.current = fields.product;
    const key = productKeyMap[fields.product];
    const mc = (key && PRODUCT_MAIN_CLASS[key]) || allProducts[key]?.mainClass;
    if (mc && mainClassOptions.includes(mc)) setFields(f => ({ ...f, main_class: mc }));
  }, [fields.product, productKeyMap, allProducts]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── When Insurance Type changes, drop a main class that no longer applies. */
  const prevInsType = useRef(fields.insurance_type);
  useEffect(() => {
    if (prevInsType.current === fields.insurance_type) return;
    prevInsType.current = fields.insurance_type;
    setFields(f => (mainClassOptions.includes(f.main_class) ? f : { ...f, main_class: '' }));
  }, [fields.insurance_type]); // eslint-disable-line react-hooks/exhaustive-deps


  /* ── product-specific risk fields ────────────────────────────────────── */
  const productKey = useMemo(() => productKeyMap[fields.product] || null, [productKeyMap, fields.product]);

  const riskFields = useMemo(() => {
    if (!productKey || !allProducts[productKey]) return [];
    return (allProducts[productKey].fields || []).filter(f =>
      RISK_SECTIONS.includes(f.section) &&
      f.type !== 'file' &&
      f.type !== 'plantable' &&
      f.name !== 'sum_insured' &&
      f.name !== 'total_value' &&
      f.name !== 'extra_fittings_value' &&
      f.name !== 'vehicle_no'
    );
  }, [productKey, allProducts]);

  const financialInterestFields = useMemo(() => {
    if (!productKey || !allProducts[productKey]) return [];
    return (allProducts[productKey].fields || []).filter(f =>
      f.section === 'Financial Interest' && f.type !== 'file' && f.type !== 'plantable'
    );
  }, [productKey, allProducts]);

  const claimsHistoryFields = useMemo(() => {
    if (!productKey || !allProducts[productKey]) return [];
    return (allProducts[productKey].fields || []).filter(f =>
      f.section === 'Claims History' && f.type !== 'file' && f.type !== 'plantable'
    );
  }, [productKey, allProducts]);

  const underwritingInfoFields = useMemo(() => {
    if (!productKey || !allProducts[productKey]) return [];
    return (allProducts[productKey].fields || []).filter(f =>
      f.section === 'Underwriting Information' && f.type !== 'file' && f.type !== 'plantable'
    );
  }, [productKey, allProducts]);

  const coversFields = useMemo(() => {
    if (!productKey || !allProducts[productKey]) return [];
    return (allProducts[productKey].fields || []).filter(f =>
      (f.section === 'Covers Required' || f.section === 'Cover Required') &&
      f.type !== 'file' && f.type !== 'plantable'
    );
  }, [productKey, allProducts]);

  const clausesFields = useMemo(() => {
    if (!productKey || !allProducts[productKey]) return [];
    return (allProducts[productKey].fields || []).filter(f =>
      f.section === 'Additional Clauses' && f.type !== 'file' && f.type !== 'plantable'
    );
  }, [productKey, allProducts]);

  const sumInsuredSubFields = useMemo(() => {
    if (!productKey || !allProducts[productKey]) return [];
    return (allProducts[productKey].fields || []).filter(f =>
      f.section === 'Sum Insured' && f.type !== 'file' && f.type !== 'plantable' &&
      f.name !== 'sum_insured'
    );
  }, [productKey, allProducts]);

  // Any product field in a section this form doesn't already render — e.g. a
  // custom section/field created in the product editor, or the "Notes for
  // Insurer" section — so admin-created fields always surface here and their
  // values (carried over from the quote) are visible/editable in underwriting.
  const KNOWN_UW_SECTIONS = useMemo(() => new Set([
    ...textFields.map(f => f.section),
    ...RISK_SECTIONS, 'Financial Interest', 'Claims History', 'Underwriting Information',
    'Covers Required', 'Cover Required', 'Additional Clauses', 'Sum Insured', 'Document Uploads',
  ]), []);
  const customFields = useMemo(() => {
    if (!productKey || !allProducts[productKey]) return [];
    return (allProducts[productKey].fields || []).filter(f =>
      f.type !== 'file' && f.type !== 'plantable' && f.section && !KNOWN_UW_SECTIONS.has(f.section));
  }, [productKey, allProducts, KNOWN_UW_SECTIONS]);

  const prodDocFields = useMemo(() => {
    if (!productKey || !allProducts[productKey]) return [];
    return (allProducts[productKey].fields || []).filter(f =>
      f.section === 'Document Uploads' && f.type === 'file'
    );
  }, [productKey, allProducts]);

  /* Extra risk field values */
  const [riskValues, setRiskValues] = useState(() => {
    const rv = {};
    Object.keys(initialData).forEach(k => { rv[k] = initialData[k] ?? ''; });
    if (!('deductible' in rv)) rv.deductible = '';
    if (!('excesses'   in rv)) rv.excesses   = '';
    return rv;
  });
  const setRisk = (name, val) => setRiskValues(r => ({ ...r, [name]: val }));

  /* Honour product-config `showIf` rules (e.g. NCB % vs No. of NCB Years are
     mutually exclusive — only the one matching the chosen NCB type shows). */
  const isRiskFieldVisible = (f) => {
    if (!f.showIf) return true;
    if (f.showIf.notZero) {
      const v = riskValues[f.showIf.field];
      return v !== undefined && v !== '' && num(v) !== 0;
    }
    return riskValues[f.showIf.field] === f.showIf.value;
  };

  // Parse insurer's per-cover and per-clause responses (stored as JSON strings in riskValues)
  const coverResponses = useMemo(() => {
    try { return JSON.parse(riskValues.cover_responses || '{}'); } catch { return {}; }
  }, [riskValues.cover_responses]);

  const clauseResponses = useMemo(() => {
    try { return JSON.parse(riskValues.clause_responses || '{}'); } catch { return {}; }
  }, [riskValues.clause_responses]);

  /* ── submit ──────────────────────────────────────────────────────────── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    for (const f of textFields.filter(f => f.required && !f.readOnly)) {
      if (!fields[f.name]?.trim()) { setError(`${f.label} is required`); return; }
    }
    // Commission is compulsory to match the chosen type: Standard needs the
    // standard commission (Total Commission), Special needs the special commission.
    if (fields.commission_type === 'Standard' && !num(fields.commission_total)) {
      setError('Total Commission is required for a Standard commission'); return;
    }
    if (fields.commission_type === 'Special' && !num(fields.commission_total)) {
      setError('Enter at least one Special Commission % (Basic / SRCC / TC)'); return;
    }
    setSaving(true);
    try {
      const docUrls = {};
      const safeName = (fields.client_name || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
      for (const [fieldKey, file] of Object.entries(docs)) {
        if (!file) continue;
        const stdField  = docFields.find(df => df.doc  === fieldKey);
        const prodField = prodDocFields.find(df => df.name === fieldKey);
        const label = stdField?.label || prodField?.label || fieldKey;
        const url = await uploadToCloudinary(file, `insuresaas/clients/${safeName}/docs`, (pct) => {
          setProgress(p => ({ ...p, [fieldKey]: pct }));
        }, label);
        docUrls[fieldKey] = url;
        setUploaded(u => ({ ...u, [fieldKey]: true }));
      }

      // Build date strings from date state
      const datePayload = {};
      Object.entries(dates).forEach(([k, v]) => {
        if (k === 'date_added') return;
        if (v && !isNaN(v)) datePayload[k] = v.toISOString().split('T')[0];
      });

      const payload = {
        ...riskValues,   // risk/cover/clause fields (product-specific)
        ...fields,       // text fields win over riskValues for any shared keys
        ...datePayload,  // date fields override anything above
        ...docUrls,
        endorsements,    // recorded policy endorsements (with per-endorsement docs)
        product_key: productKey || '',
        // Renewal chain linkage — carried through from a renewal prefill / prior record
        ...(initialData.renewal_of ? { renewal_of: initialData.renewal_of } : {}),
        ...(initialData.root_policy_id ? { root_policy_id: initialData.root_policy_id } : {}),
      };
      // Payments ledger — store the full list and set the policy's Amount Received to
      // the derived total (ledger + endorsement payments). Mirror the most recent
      // payment's details onto the top-level fields so reports / CSV / PDF that read
      // the single payment fields keep showing a sensible value.
      const lastPay = cleanPayments[cleanPayments.length - 1] || {};
      payload.payments = cleanPayments;
      payload.amount_received = totalReceivedNum ? String(totalReceivedNum) : '';
      payload.payment_date    = lastPay.payment_date || '';
      payload.payment_method  = lastPay.payment_method || '';
      payload.cheque_slip_no  = lastPay.cheque_slip_no || '';
      payload.receipt_no      = lastPay.receipt_no || '';
      payload.debit_note_no   = lastPay.debit_note_no || '';
      payload.debit_note_date = lastPay.debit_note_date || '';

      delete payload.date_added;
      delete payload.policy_year;   // derived — store only for display
      delete payload.policy_month;  // derived
      // Clear the deprecated single Special Commission amount — Special now stores its
      // commission in Commission Basic/SRCC/TC (from the three Special %s), like Standard.
      if (fields.commission_type === 'Special') { payload.commission_special = ''; payload.commission_special_amount = ''; }
      const dateAdded = dates.date_added && !isNaN(dates.date_added) ? dates.date_added : null;

      // Convert number strings back to plain strings (keep raw for Firestore)
      if (isEdit && initialData.id) {
        await updateDoc(doc(db, 'clients', initialData.id), {
          ...payload,
          updated_at: serverTimestamp(),
          ...(dateAdded ? { created_at: dateAdded } : {}),
        });
      } else {
        const newRef = await addDoc(collection(db, 'clients'), {
          ...payload,
          created_at:        dateAdded || serverTimestamp(),
          is_active:         true,
          status:            isPrivileged ? 'approved' : 'pending',
          submitted_by:      user?.uid || '',
          submitted_by_name: userProfile?.full_name || user?.email?.split('@')[0] || 'Unknown',
          submitted_at:      serverTimestamp(),
          ...(initialData.source_quote_id ? { source_quote_id: initialData.source_quote_id } : {}),
        });
        // Renewal: register this child on its parent (the original New policy) once,
        // right here — so it can't be double-counted by the dialog and the parent
        // always knows its renewals (for display + cascade delete).
        const rootId = payload.root_policy_id;
        if (rootId && rootId !== newRef.id) {
          try {
            await updateDoc(doc(db, 'clients', rootId), {
              child_renewals: arrayUnion(newRef.id),
              renewal_count: increment(1),
              updated_at: serverTimestamp(),
            });
          } catch (_) { /* parent may be gone; ignore */ }
        }
      }
      logActivity(`${isEdit ? 'Updated' : 'Added'} policy${fields.client_name ? ` for ${fields.client_name}` : ''}${fields.insuresaas_ib_file_no ? ` (${fields.insuresaas_ib_file_no})` : ''}`);
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to save client');
    }
    setSaving(false);
  };

  /* ── Renewal — build a pre-filled copy of this policy as a new "Renewal"
     record. Renewals are FLAT children of the original "New" policy (the root):
     both renewal_of and root_policy_id point at that root, so renewing a renewal
     still attaches to the same parent instead of chaining. The new record is
     registered on the parent (child_renewals) exactly once, at save. */
  const buildRenewal = () => {
    const datePayload = {};
    Object.entries(dates).forEach(([k, v]) => {
      if (k === 'date_added') return;
      if (v && !isNaN(v)) datePayload[k] = v.toISOString().split('T')[0];
    });
    // Roll the period FORWARD to the next term so the renewal automatically lands on
    // the next policy year — this is what steps a commission-structure product to its
    // next (lower) rate with no manual date editing. New start = current expiry; new
    // end = start + the same term length (falls back to +1 year if the term is unknown).
    const oldFrom = dates.policy_period_from, oldTo = dates.policy_period_to;
    if (oldTo && !isNaN(oldTo)) {
      const nf = new Date(oldTo);
      let nt;
      if (oldFrom && !isNaN(oldFrom)) nt = new Date(oldTo.getTime() + (oldTo.getTime() - oldFrom.getTime()));
      else { nt = new Date(oldTo); nt.setFullYear(nt.getFullYear() + 1); }
      datePayload.policy_period_from = nf.toISOString().split('T')[0];
      datePayload.policy_period_to   = nt.toISOString().split('T')[0];
    }
    // The root is the original New policy: this record's own root if it has one
    // (i.e. it's already a renewal), otherwise this record itself.
    const root = initialData.root_policy_id || initialData.id || '';
    return {
      ...riskValues, ...fields, ...datePayload,
      product_key: productKey || initialData.product_key || '',
      new_renewal: 'Renewal',
      renewal_of: root,
      root_policy_id: root,
      // A renewal is a fresh period: clear the previous period's payments and
      // received-commission so nothing stale carries over. The earned commission
      // (basic / special) recalculates automatically for the new policy year.
      payments: [],
      amount_received: '', payment_date: '', payment_method: '', cheque_slip_no: '',
      receipt_no: '', debit_note_no: '', debit_note_date: '', payment_status: 'Unpaid',
      commission_amount_paid: '', commission_receive_date: '', commission_paid_method: '', commission_vat: '',
    };
  };

  // Renewal family — the original New policy (root) plus all its renewals, shown in
  // edit mode so the parent keeps track of its children.
  const [renewalKin, setRenewalKin] = useState([]);
  const renewalRootId = isEdit ? (initialData.root_policy_id || initialData.id || '') : '';
  useEffect(() => {
    let alive = true;
    if (!renewalRootId) { setRenewalKin([]); return; }
    getDocs(query(collection(db, 'clients'), where('root_policy_id', '==', renewalRootId)))
      .then(snap => { if (alive) setRenewalKin(snap.docs.filter(d => d.id !== renewalRootId).map(d => ({ id: d.id, ...d.data() }))); })
      .catch(() => {});
    return () => { alive = false; };
  }, [renewalRootId]);

  /* ── Insurance Provider dropdown — base list + user-added companies saved to
     Firestore ('insurance_providers') so they persist in the dropdown for
     everyone, and flow to reports / PDFs / exports as the stored value. ────── */
  const [customProviders,   setCustomProviders]   = useState([]);
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [newProviderName,   setNewProviderName]   = useState('');
  const [savingProvider,    setSavingProvider]    = useState(false);
  const [providerError,     setProviderError]     = useState('');
  useEffect(() => {
    let alive = true;
    getDocs(collection(db, 'insurance_providers'))
      .then(snap => { if (alive) setCustomProviders(snap.docs.map(d => d.data().name).filter(Boolean)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const providerOptions = useMemo(() => {
    const merged = (dropdowns.insurance_provider || []).filter(p => p !== 'Other');
    const has = (v) => merged.some(x => x.toLowerCase() === v.toLowerCase());
    customProviders.forEach(p => { if (!has(p)) merged.push(p); });
    const cur = fields.insurance_provider;                 // keep a legacy/custom value visible
    if (cur && cur !== ADD_PROVIDER_SENTINEL && !has(cur)) merged.push(cur);
    merged.push(ADD_PROVIDER_SENTINEL);
    return merged;
  }, [customProviders, fields.insurance_provider]);
  const handleProviderChange = (name, value) => {
    if (value === ADD_PROVIDER_SENTINEL) { setNewProviderName(''); setProviderError(''); setProviderDialogOpen(true); return; }
    set(name, value);
  };
  const saveNewProvider = async () => {
    const nm = newProviderName.trim();
    if (!nm) { setProviderError('Enter an insurance company name.'); return; }
    const dupe = providerOptions.some(p => p !== ADD_PROVIDER_SENTINEL && p.toLowerCase() === nm.toLowerCase());
    setSavingProvider(true); setProviderError('');
    try {
      if (!dupe) await addDoc(collection(db, 'insurance_providers'), { name: nm, created_at: serverTimestamp() });
      setCustomProviders(prev => (prev.some(p => p.toLowerCase() === nm.toLowerCase()) ? prev : [...prev, nm]));
      set('insurance_provider', nm);
      setProviderDialogOpen(false); setNewProviderName('');
    } catch (err) { setProviderError(err?.message || 'Could not save. Please try again.'); }
    setSavingProvider(false);
  };

  /* ── Existing-client lookup — type a name in Proposer Details to match an
     existing client and auto-fill their proposer / contact details. ───────── */
  const [existingClients, setExistingClients] = useState([]);
  useEffect(() => {
    let alive = true;
    getDocs(collection(db, 'clients'))
      .then(snap => { if (alive) setExistingClients(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.client_name)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const PROPOSER_COPY = ['customer_type', 'nic_proof', 'business_registration', 'svat_proof',
    'street1', 'street2', 'city', 'district', 'province', 'postal_code',
    'telephone', 'mobile_no', 'email', 'contact_person', 'social_media'];
  const fillFromClient = (c) => {
    if (!c) return;
    set('client_name', c.client_name || '');
    PROPOSER_COPY.forEach(k => {
      let v = c[k];
      if (k === 'customer_type' && v === 'Company') v = 'Corporate';
      if (v != null && v !== '') set(k, v);
    });
  };

  /* ── render helpers ──────────────────────────────────────────────────── */
  const renderDropdown = (f, val, onChangeFn) => (
    <FormControl fullWidth size="small" key={f.name}>
      <InputLabel sx={{ fontSize: 13 }}>{f.label}{f.required ? ' *' : ''}</InputLabel>
      <Select label={`${f.label}${f.required ? ' *' : ''}`} value={val}
        onChange={e => onChangeFn(f.name, e.target.value)} required={!!f.required}
        sx={{ borderRadius: '10px', fontSize: 13 }}>
        {/* Product list includes custom products so custom-product quotes resolve here */}
        {(f.name === 'product' ? productOptions : f.name === 'main_class' ? mainClassOptions : f.name === 'insurance_provider' ? providerOptions : (dropdowns[f.name] || [])).map(opt => <MenuItem key={opt} value={opt} sx={{ fontSize: 13, ...(opt === ADD_PROVIDER_SENTINEL ? { color: '#255EAB', fontWeight: 700 } : {}) }}>{opt}</MenuItem>)}
      </Select>
      {f.required && !val && <FormHelperText error>{f.label} is required</FormHelperText>}
    </FormControl>
  );

  const renderStaticField = (f) => {
    const isReadOnly = !!f.readOnly;
    // Client Name — suggest existing clients as you type; pick one to auto-fill
    // all proposer / contact details from that client record.
    if (f.name === 'client_name' && existingClients.length > 0) {
      return (
        <Autocomplete key={f.name} freeSolo options={existingClients}
          getOptionLabel={(o) => (typeof o === 'string' ? o : (o.client_name || ''))}
          filterOptions={(opts, state) => {
            const q = (state.inputValue || '').trim().toLowerCase();
            if (!q) return [];
            return opts.filter(o => (o.client_name || '').toLowerCase().includes(q)).slice(0, 8);
          }}
          inputValue={fields.client_name || ''}
          onInputChange={(_, val, reason) => { if (reason !== 'reset') set('client_name', val); }}
          onChange={(_, val) => { if (val && typeof val === 'object') fillFromClient(val); }}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          renderOption={(props, o) => (
            <li {...props} key={o.id}>
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{o.client_name}</Typography>
                <Typography sx={{ fontSize: 11, color: '#9CA3AF' }}>
                  {[o.nic_proof || o.business_registration, o.mobile_no || o.telephone].filter(Boolean).join(' · ') || 'Existing client'}
                </Typography>
              </Box>
            </li>
          )}
          renderInput={(params) => (
            <TextField {...params} size="small" fullWidth required={!!f.required}
              label={f.label} helperText="Type to match an existing client and auto-fill their details"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
          )} />
      );
    }
    if (f.dropdown && dropdowns[f.name]) return renderDropdown(f, fields[f.name], f.name === 'insurance_provider' ? handleProviderChange : set);
    if (f.date) return (
      <DatePicker key={f.name} label={f.label} value={dates[f.name]} onChange={val => handleDate(f.name, val)}
        slotProps={{ textField: { fullWidth: true, size: 'small', required: !!f.required,
          sx: { '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } } } }} />
    );
    if (f.type === 'number') return (
      <NumericField key={f.name} label={f.label} value={fields[f.name]}
        onChange={isReadOnly ? undefined : e => set(f.name, e.target.value)}
        readOnly={isReadOnly} fullWidth size="small" required={!!f.required}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
    );
    return (
      <TextField key={f.name} label={f.label} value={fields[f.name]}
        onChange={isReadOnly ? undefined : e => set(f.name, e.target.value)}
        fullWidth size="small" required={!!f.required}
        InputProps={{ readOnly: isReadOnly }}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13,
          ...(isReadOnly ? { bgcolor: 'rgba(0,0,0,0.03)' } : {}) } }} />
    );
  };

  /* ── risk field renderer (from products.js field definitions) ──────── */
  const renderRiskField = (f) => {
    const val = riskValues[f.name] ?? '';
    // Auto-calculated total (sum or percentage — e.g. 'sum:a,b' or 'pct:basic_premium:18').
    // Mirrors the quotation form so custom-product equations also compute here.
    if (f.autoCalc) {
      const total = evaluateAutoCalc(f.autoCalc, riskValues);
      const desired = total ? String(total) : '';
      if (desired !== String(val)) setTimeout(() => setRisk(f.name, desired), 0);
      const labelFor = (n) => (allProducts[productKey]?.fields || []).find(x => x.name === n)?.label || n;
      return (
        <NumericField key={f.name} label={`${f.label} (Auto-calculated)`} value={desired}
          readOnly fullWidth size="small"
          helperText={describeAutoCalc(f.autoCalc, labelFor)}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 },
                '& .MuiInputBase-input': { color: '#255EAB', fontWeight: 700 } }} />
      );
    }
    if (f.type === 'select') return (
      <FormControl fullWidth size="small" key={f.name}>
        <InputLabel sx={{ fontSize: 13 }}>{f.label}</InputLabel>
        <Select label={f.label} value={val} onChange={e => setRisk(f.name, e.target.value)}
          sx={{ borderRadius: '10px', fontSize: 13 }}>
          {(f.options || []).map(opt => <MenuItem key={opt} value={opt} sx={{ fontSize: 13 }}>{opt}</MenuItem>)}
        </Select>
      </FormControl>
    );
    if (f.type === 'yesno') return (
      <FormControl fullWidth size="small" key={f.name}>
        <InputLabel sx={{ fontSize: 13 }}>{f.label}</InputLabel>
        <Select label={f.label} value={val} onChange={e => setRisk(f.name, e.target.value)}
          sx={{ borderRadius: '10px', fontSize: 13 }}>
          {['Yes', 'No'].map(opt => <MenuItem key={opt} value={opt} sx={{ fontSize: 13 }}>{opt}</MenuItem>)}
        </Select>
      </FormControl>
    );
    if (f.type === 'number' || f.type === 'currency') return (
      <NumericField key={f.name} label={f.label} value={val}
        onChange={e => setRisk(f.name, e.target.value)}
        fullWidth size="small"
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
    );
    if (f.type === 'date') return (
      <DatePicker key={f.name} label={f.label}
        value={riskValues[f.name] ? new Date(riskValues[f.name]) : null}
        onChange={val => setRisk(f.name, val ? val.toISOString().split('T')[0] : '')}
        slotProps={{ textField: { fullWidth: true, size: 'small',
          sx: { '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } } } }} />
    );
    return (
      <TextField key={f.name} label={f.label} value={val} onChange={e => setRisk(f.name, e.target.value)}
        fullWidth size="small" multiline={f.type === 'textarea'} rows={f.type === 'textarea' ? 2 : 1}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
    );
  };

  /* ── file no hint ────────────────────────────────────────────────────── */
  const productPrefix = productKey ? (allProducts[productKey]?.prefix || '') : '';
  const fileNoHint = productPrefix ? `Format: ${productPrefix}-YYYYMMDD-XXXX-NAME` : '';

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box component="form" onSubmit={handleSubmit} sx={{ px: 3, py: 2.5, overflow: 'auto' }}>

        {/* ── Introducer ───────────────────────────────────── */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <SectionHeader title="Introducer" />
          {isEdit && (
            <Button variant="outlined" size="small" startIcon={<AutorenewIcon sx={{ fontSize: 18 }} />}
              onClick={() => onRenew?.(buildRenewal())}
              sx={{ textTransform: 'none', borderRadius: '10px', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
              Create Renewal
            </Button>
          )}
        </Box>
        {isEdit && (() => {
          const isChild = !!initialData.root_policy_id && initialData.root_policy_id !== initialData.id;
          if (!isChild && renewalKin.length === 0) return null;
          return (
            <Box sx={{ mb: 2, p: 1.2, borderRadius: '10px', border: '1px solid rgba(37,94,171,0.18)', bgcolor: 'rgba(37,94,171,0.04)' }}>
              <Typography sx={{ fontSize: 10.5, fontWeight: 800, color: '#255EAB', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.6 }}>
                {isChild ? 'This is a renewal — part of a policy family' : `Renewals (${renewalKin.length})`}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.8, flexWrap: 'wrap' }}>
                {isChild && (
                  <Chip label="Renewal of the original policy" size="small"
                    sx={{ height: 22, fontSize: 10.5, fontWeight: 700, bgcolor: 'rgba(124,58,237,0.12)', color: '#7c3aed' }} />
                )}
                {renewalKin.map(k => (
                  <Chip key={k.id} label={k.insuresaas_ib_file_no || k.policy_no || k.client_name || k.id.slice(0, 6)} size="small"
                    sx={{ height: 22, fontSize: 10.5, fontWeight: 700, bgcolor: 'rgba(37,94,171,0.10)', color: '#255EAB' }} />
                ))}
              </Box>
              <Typography sx={{ fontSize: 10.5, color: '#9CA3AF', mt: 0.6 }}>
                Deleting the original policy also deletes its renewals.
              </Typography>
            </Box>
          );
        })()}
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          <Grid item xs={12} sm={6} md={4}>
            <TextField label="InsureSAAS IB File No." value={fields.insuresaas_ib_file_no}
              onChange={e => set('insuresaas_ib_file_no', e.target.value)}
              fullWidth size="small" helperText={fileNoHint}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField label="Manager" value={fields.manager}
              onChange={e => set('manager', e.target.value)}
              fullWidth size="small"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField label="Introducer Code" value={fields.introducer_code}
              onChange={e => set('introducer_code', e.target.value)}
              fullWidth size="small"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            {renderStaticField(textFields.find(f => f.name === 'new_renewal'))}
          </Grid>
        </Grid>

        {/* ── Insurance Company ─────────────────────────────── */}
        <SectionHeader title="Insurance Company" />
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {textFields.filter(f => f.section === 'Insurance Company').map(f => (
            <Grid item xs={12} sm={6} md={4} key={f.name}>
              {renderStaticField(f)}
            </Grid>
          ))}
        </Grid>

        {/* ── Proposer Details ─────────────────────────────── */}
        <SectionHeader title="Proposer Details" />
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {textFields.filter(f => f.section === 'Proposer Details').map(f => (
            <Grid item xs={12} sm={6} md={4} key={f.name}>
              {renderStaticField(f)}
            </Grid>
          ))}
        </Grid>

        {/* ── Period of Insurance ───────────────────────────── */}
        <SectionHeader title="Period of Insurance" />
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {textFields.filter(f => f.section === 'Period of Insurance').map(f => (
            <Grid item xs={12} sm={6} md={4} key={f.name}>
              {renderStaticField(f)}
            </Grid>
          ))}
        </Grid>

        {/* ── Financial Interest (product-specific) ────────── */}
        {financialInterestFields.length > 0 && (
          <>
            <SectionHeader title="Financial Interest" />
            <Grid container spacing={2} sx={{ mb: 2.5 }}>
              {financialInterestFields.filter(isRiskFieldVisible).map(f => (
                <Grid item xs={12} sm={6} md={4} key={f.name}>
                  {renderRiskField(f)}
                </Grid>
              ))}
            </Grid>
          </>
        )}

        {/* ── Risk Information (product-specific) ──────────── */}
        {(riskFields.length > 0 || fields.main_class === 'Motor' || productKey === 'motor') && (
          <>
            <SectionHeader title="Risk Information" />
            {productKey && allProducts[productKey] && (
              <Chip label={allProducts[productKey].label} size="small"
                sx={{ mb: 1.5, fontSize: 11, fontWeight: 700,
                      bgcolor: `${allProducts[productKey].color}18`, color: allProducts[productKey].color }} />
            )}
            <Grid container spacing={2} sx={{ mb: 2.5 }}>
              {(fields.main_class === 'Motor' || productKey === 'motor') && (
                <Grid item xs={12} sm={6} md={4}>
                  <TextField label="Vehicle Number" value={fields.vehicle_number}
                    onChange={e => set('vehicle_number', e.target.value)}
                    fullWidth size="small"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
              )}
              {riskFields.filter(isRiskFieldVisible).map(f => (
                <Grid item xs={12} sm={6} md={4} key={f.name}>
                  {renderRiskField(f)}
                </Grid>
              ))}
            </Grid>
          </>
        )}

        {/* ── Claims History (product-specific) ────────────── */}
        {claimsHistoryFields.length > 0 && (
          <>
            <SectionHeader title="Claims History" />
            <Grid container spacing={2} sx={{ mb: 2.5 }}>
              {claimsHistoryFields.filter(isRiskFieldVisible).map(f => (
                <Grid item xs={12} sm={6} md={4} key={f.name}>
                  {renderRiskField(f)}
                </Grid>
              ))}
            </Grid>
          </>
        )}

        {/* ── Underwriting Information (product-specific) ───── */}
        {underwritingInfoFields.length > 0 && (
          <>
            <SectionHeader title="Underwriting Information" />
            <Grid container spacing={2} sx={{ mb: 2.5 }}>
              {underwritingInfoFields.filter(isRiskFieldVisible).map(f => (
                <Grid item xs={12} sm={6} md={4} key={f.name}>
                  {renderRiskField(f)}
                </Grid>
              ))}
            </Grid>
          </>
        )}

        {/* ── Sum Insured ───────────────────────────────────── */}
        <SectionHeader title="Sum Insured" />
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {sumInsuredSubFields.filter(isRiskFieldVisible).map(f => (
            <Grid item xs={12} sm={6} md={4} key={f.name}>
              {renderRiskField(f)}
            </Grid>
          ))}
          {textFields.filter(f => f.section === 'Sum Insured').map(f => (
            <Grid item xs={12} sm={6} md={4} key={f.name}>
              {renderStaticField(f)}
            </Grid>
          ))}
        </Grid>

        {/* ── Covers Required (product-specific) ───────────── */}
        {coversFields.length > 0 && (
          <>
            <SectionHeader title="Covers Required" />
            <Grid container spacing={2} sx={{ mb: 2.5 }}>
              {coversFields.filter(isRiskFieldVisible).map(f => {
                const ir = coverResponses[f.name] || {};
                const irColor = ir.status === 'Accepted' ? '#10B981'
                  : ir.status === 'Declined' ? '#EF4444' : '#F59E0B';
                return (
                  <Grid item xs={12} sm={6} md={4} key={f.name}>
                    {renderRiskField(f)}
                    {ir.status && (
                      <Box sx={{ mt: 0.5, px: 1, py: 0.3, borderRadius: '6px', bgcolor: `${irColor}14`, display: 'inline-flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: irColor }}>{ir.status}</Typography>
                        {ir.premium ? <Typography sx={{ fontSize: 10.5, color: irColor }}>· +LKR {ir.premium}</Typography> : null}
                        {ir.notes  ? <Typography sx={{ fontSize: 10.5, color: '#6B7280' }}>· {ir.notes}</Typography> : null}
                      </Box>
                    )}
                  </Grid>
                );
              })}
            </Grid>
          </>
        )}

        {/* ── Additional Clauses (product-specific) ────────── */}
        {clausesFields.length > 0 && (
          <>
            <SectionHeader title="Additional Clauses" />
            <Grid container spacing={2} sx={{ mb: 2.5 }}>
              {clausesFields.filter(isRiskFieldVisible).map(f => {
                const ir = clauseResponses[f.name] || {};
                const irColor = ir.status === 'Included' ? '#10B981'
                  : ir.status === 'Not included' ? '#EF4444' : '#F59E0B';
                return (
                  <Grid item xs={12} sm={6} md={4} key={f.name}>
                    {renderRiskField(f)}
                    {ir.status && (
                      <Box sx={{ mt: 0.5, px: 1, py: 0.3, borderRadius: '6px', bgcolor: `${irColor}14`, display: 'inline-flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: irColor }}>{ir.status}</Typography>
                        {ir.notes ? <Typography sx={{ fontSize: 10.5, color: '#6B7280' }}>· {ir.notes}</Typography> : null}
                      </Box>
                    )}
                  </Grid>
                );
              })}
            </Grid>
          </>
        )}

        {/* ── Custom / additional product sections (from the product editor) ── */}
        {(() => {
          const visible = customFields.filter(isRiskFieldVisible);
          if (!visible.length) return null;
          const bySection = {};
          visible.forEach(f => { (bySection[f.section] = bySection[f.section] || []).push(f); });
          return Object.entries(bySection).map(([section, flds]) => (
            <React.Fragment key={section}>
              <SectionHeader title={section} />
              <Grid container spacing={2} sx={{ mb: 2.5 }}>
                {flds.map(f => (
                  <Grid item xs={12} sm={f.type === 'textarea' ? 12 : 6} md={f.type === 'textarea' ? 12 : 4} key={f.name}>
                    {renderRiskField(f)}
                  </Grid>
                ))}
              </Grid>
            </React.Fragment>
          ));
        })()}

        {/* ── Premium ──────────────────────────────────────── */}
        <SectionHeader title="Premium" />
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {textFields.filter(f => f.section === 'Premium').map(f => (
            <Grid item xs={12} sm={6} md={4} key={f.name}>
              {renderStaticField(f)}
            </Grid>
          ))}
        </Grid>

        {/* ── Deductibles ──────────────────────────────────── */}
        <SectionHeader title="Deductibles" />
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          <Grid item xs={12} sm={6} md={4}>
            <TextField label="Deductible" value={riskValues.deductible || ''}
              onChange={e => setRisk('deductible', e.target.value)}
              fullWidth size="small"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField label="Excesses" value={riskValues.excesses || ''}
              onChange={e => setRisk('excesses', e.target.value)}
              fullWidth size="small"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
          </Grid>
        </Grid>

        {/* ── Commission ───────────────────────────────────── */}
        <SectionHeader title="Commission" />
        {usesStructure && (
          <Box sx={{ mb: 1.5, px: 1.5, py: 1, borderRadius: '8px', bgcolor: 'rgba(8,145,178,0.07)', border: '1px solid rgba(8,145,178,0.22)' }}>
            <Typography sx={{ fontSize: 12, color: '#0e7490', fontWeight: 700 }}>
              Commission Structure — {fields.product}: {structHit ? `Year ${structYear} rate ${structRateVal}%` : 'past the end of the scale (0%)'} (declining scale, from the original policy start date).
              {' '}{fields.commission_type === 'Special' ? 'Used as the Special Basic %; set SRCC / TC % by hand.' : 'Used as the Basic Commission %; SRCC / TC from the rate table.'}
            </Typography>
          </Box>
        )}
        {autoCommission && !usesStructure && (() => {
          const rate = rateFor(commissionSchedules, fields.product, fields.main_class, dates.policy_period_from);
          return (
            <Box sx={{ mb: 1.5, px: 1.5, py: 1, borderRadius: '8px', bgcolor: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.18)' }}>
              <Typography sx={{ fontSize: 12, color: '#9d174d', fontWeight: 600 }}>
                Auto-calculated for {fields.product || 'this product'} using the rate that applies on the policy start date — Basic {rate.basic}%, SRCC {rate.srcc}%, TC {rate.tc}% (× the entered premiums). Manage periods in Admin → Commissions.
              </Typography>
            </Box>
          );
        })()}
        {fields.commission_type === 'Special' && !usesStructure && (
          <Box sx={{ mb: 1.5, px: 1.5, py: 1, borderRadius: '8px', bgcolor: 'rgba(37,94,171,0.06)', border: '1px solid rgba(37,94,171,0.18)' }}>
            <Typography sx={{ fontSize: 12, color: '#255EAB', fontWeight: 600 }}>
              Enter your Special rates — Basic %, SRCC % and TC %. Each is applied to its premium to work out the Commission Basic / SRCC / TC. Total = Basic + SRCC + TC.
            </Typography>
          </Box>
        )}
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {textFields.filter(f => f.section === 'Commission')
            // The three Special rate fields show only for a Special type.
            .filter(f => ['commission_special_pct', 'commission_special_srcc_pct', 'commission_special_tc_pct'].includes(f.name) ? fields.commission_type === 'Special' : true)
            // Basic Commission % is a Standard-only rate — hidden for Special, which
            // uses its own Special Basic % instead.
            .filter(f => f.name === 'commission_pct' ? fields.commission_type !== 'Special' : true)
            .map(f => {
              // Commission Basic/SRCC/TC/Total are always derived (from admin rates for
              // Standard, or the Special %s). A structure also locks the Special Basic %.
              const locked = ['commission_basic', 'commission_srcc', 'commission_tc', 'commission_pct', 'commission_total'].includes(f.name)
                || (usesStructure && f.name === 'commission_special_pct');
              return (
                <Grid item xs={12} sm={6} md={4} key={f.name}>
                  {renderStaticField(locked ? { ...f, readOnly: true } : f)}
                </Grid>
              );
            })}
        </Grid>

        {/* ── Payment ──────────────────────────────────────── */}
        <SectionHeader title="Payment" />
        <Grid container spacing={2} sx={{ mb: 2 }}>
          {/* Payment Status stays policy-level; the rest is a per-payment ledger. */}
          <Grid item xs={12} sm={6} md={4}>
            {renderStaticField(textFields.find(f => f.name === 'payment_status'))}
          </Grid>
          <Grid item xs={12} sm={6} md={8}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', height: '100%' }}>
              <Box sx={{ px: 1.5, py: 0.8, borderRadius: '10px', bgcolor: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.22)' }}>
                <Typography sx={{ fontSize: 10.5, color: '#6B7280', fontWeight: 700 }}>Total Amount Received</Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#059669' }}>LKR {totalReceivedNum.toLocaleString()}</Typography>
              </Box>
              <Typography sx={{ fontSize: 11, color: '#9CA3AF' }}>
                {payments.length} payment{payments.length === 1 ? '' : 's'} (LKR {paymentsTotal.toLocaleString()})
                {endoPaidTotal ? ` + endorsements LKR ${endoPaidTotal.toLocaleString()}` : ''}
              </Typography>
            </Box>
          </Grid>
        </Grid>

        <Box sx={{ mb: 2.5 }}>
          {payments.length === 0 ? (
            <Typography sx={{ color: '#9CA3AF', fontSize: 13, mb: 1 }}>No payments recorded yet.</Typography>
          ) : payments.map((p, idx) => (
            <Box key={p.id} sx={{ p: 1.5, mb: 1, borderRadius: '10px', border: '1px solid rgba(56,163,224,0.18)', bgcolor: 'rgba(56,163,224,0.03)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Box sx={{ width: 24, height: 24, flexShrink: 0, borderRadius: '50%', bgcolor: '#255EAB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{idx + 1}</Box>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#255EAB' }}>Payment {idx + 1}</Typography>
                <Box sx={{ flex: 1 }} />
                <IconButton size="small" onClick={() => removePayment(p.id)} sx={{ color: '#dc2626' }}><DeleteOutlineIcon sx={{ fontSize: 18 }} /></IconButton>
              </Box>
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6} md={4}>
                  <NumericField label="Amount Received" value={p.amount_received} onChange={e => updatePayment(p.id, 'amount_received', e.target.value)} fullWidth size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <TextField type="date" label="Payment Date" InputLabelProps={{ shrink: true }} value={p.payment_date} onChange={e => updatePayment(p.id, 'payment_date', e.target.value)} fullWidth size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel sx={{ fontSize: 13 }}>Payment Method</InputLabel>
                    <Select label="Payment Method" value={p.payment_method} onChange={e => updatePayment(p.id, 'payment_method', e.target.value)} sx={{ borderRadius: '10px', fontSize: 13 }}>
                      <MenuItem value="" sx={{ fontSize: 13 }}><em>—</em></MenuItem>
                      {dropdowns.payment_method.map(m => <MenuItem key={m} value={m} sx={{ fontSize: 13 }}>{m}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <TextField label="Cheque / Slip No." value={p.cheque_slip_no} onChange={e => updatePayment(p.id, 'cheque_slip_no', e.target.value)} fullWidth size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <TextField label="Receipt No." value={p.receipt_no} onChange={e => updatePayment(p.id, 'receipt_no', e.target.value)} fullWidth size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <TextField label="Debit Note No." value={p.debit_note_no} onChange={e => updatePayment(p.id, 'debit_note_no', e.target.value)} fullWidth size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <TextField type="date" label="Debit Note Date" InputLabelProps={{ shrink: true }} value={p.debit_note_date} onChange={e => updatePayment(p.id, 'debit_note_date', e.target.value)} fullWidth size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
              </Grid>
            </Box>
          ))}
          <Button onClick={addPayment} startIcon={<AddCircleOutlineIcon />} variant="outlined" size="small"
            sx={{ textTransform: 'none', borderRadius: '10px', fontSize: 12.5, fontWeight: 600, borderColor: '#255EAB', color: '#255EAB' }}>
            Add Payment
          </Button>
        </Box>

        {/* ── Claims ───────────────────────────────────────── */}
        <SectionHeader title="Claims" />
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {textFields.filter(f => f.section === 'Claims').map(f => (
            <Grid item xs={12} sm={6} md={4} key={f.name}>
              {renderStaticField(f)}
            </Grid>
          ))}
        </Grid>

        {/* ── Documents ────────────────────────────────────── */}
        <SectionHeader title="Documents" />
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {/* Product-specific doc uploads (vehicle reg, property photos, etc.) */}
          {prodDocFields.map(df => (
            <Grid item xs={12} sm={6} key={df.name}>
              <DocUploadBox label={df.label} fieldName={df.name}
                existing={initialData[df.name] || riskValues[df.name]}
                onFile={file => setDocs(d => ({ ...d, [df.name]: file }))}
                progress={progress[df.name] ?? null} uploaded={!!uploaded[df.name]} />
            </Grid>
          ))}
          {/* Standard UW document uploads */}
          {docFields.map(df => (
            <Grid item xs={12} sm={6} key={df.doc}>
              <DocUploadBox label={df.label} fieldName={df.doc} existing={initialData[df.doc] || riskValues[df.doc]}
                onFile={file => setDocs(d => ({ ...d, [df.doc]: file }))}
                progress={progress[df.doc] ?? null} uploaded={!!uploaded[df.doc]} />
            </Grid>
          ))}
          {/* Any extra doc_ URLs from quotation form not covered by product or standard doc fields */}
          {Object.entries(riskValues)
            .filter(([k, v]) => k.startsWith('doc_') && v && typeof v === 'string' && v.startsWith('http') &&
              !docFields.some(df => df.doc === k) && !prodDocFields.some(df => df.name === k))
            .map(([k, url]) => (
              <Grid item xs={12} sm={6} key={k}>
                <Box sx={{ p: 1.5, border: '1px solid rgba(16,185,129,0.3)', borderRadius: '12px', bgcolor: 'rgba(16,185,129,0.04)' }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#374151', mb: 0.5 }}>
                    {k.replace(/^doc_/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </Typography>
                  <Typography sx={{ fontSize: 10.5, color: '#10B981', mb: 0.3 }}>From quotation form</Typography>
                  <Link component="button" type="button" onClick={() => openFile(url)}
                    sx={{ fontSize: 11, color: '#10B981', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>
                    View document ↗
                  </Link>
                </Box>
              </Grid>
            ))
          }
        </Grid>
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {docFields.map(df => (
            <Grid item xs={12} sm={6} md={4} key={df.text}>
              <TextField label={`${df.label} Notes`} value={fields[df.text]}
                onChange={e => set(df.text, e.target.value)}
                fullWidth size="small"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
            </Grid>
          ))}
        </Grid>

        {/* ── Other ────────────────────────────────────────── */}
        <SectionHeader title="Other" />
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {textFields.filter(f => f.section === 'Other').map(f => (
            <Grid item xs={12} sm={6} md={4} key={f.name}>
              {renderStaticField(f)}
            </Grid>
          ))}
        </Grid>

        {/* ── Endorsements (edit mode only) ─────────────────── */}
        {isEdit && (
          <>
            <SectionHeader title="Endorsements" />
            <Typography sx={{ fontSize: 12, color: '#9CA3AF', mb: 1.5, mt: -0.5 }}>
              Record changes to this in-force policy. The latest endorsement's Basic / SRCC / TC premium
              and sum insured become the policy's current values; commission recalculates automatically.
            </Typography>

            {endorsements.length === 0 ? (
              <Typography sx={{ color: '#9CA3AF', fontSize: 13, mb: 2 }}>No endorsements recorded yet.</Typography>
            ) : (
              <Box sx={{ mb: 2.5 }}>
                {ENDORSEMENT_TYPES.filter(t => endorsements.some(e => e.type === t)).map(t => (
                  <Box key={t} sx={{ mb: 1.5 }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.6 }}>{t}</Typography>
                    {endorsements.filter(e => e.type === t).map(e => (
                      <Box key={e.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', p: 1.5, mb: 1, borderRadius: '10px', border: '1px solid rgba(124,58,237,0.18)', bgcolor: 'rgba(124,58,237,0.04)' }}>
                        <Box sx={{ width: 26, height: 26, flexShrink: 0, borderRadius: '50%', bgcolor: '#7c3aed', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>{e.endorsement_no}</Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          {e.effective_date && <Typography sx={{ fontSize: 11.5, color: '#6B7280' }}>Effective {e.effective_date}</Typography>}
                          {e.description && <Typography sx={{ fontSize: 13, color: '#111827', mt: 0.3 }}>{e.description}</Typography>}
                          <Box sx={{ display: 'flex', gap: 2, mt: 0.6, flexWrap: 'wrap' }}>
                            {num(e.basic_premium_change) !== 0 && <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: '#374151' }}>Basic {num(e.basic_premium_change) < 0 ? '-' : '+'}LKR {Math.abs(num(e.basic_premium_change)).toLocaleString()}</Typography>}
                            {num(e.srcc_premium_change) !== 0 && <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: '#374151' }}>SRCC {num(e.srcc_premium_change) < 0 ? '-' : '+'}LKR {Math.abs(num(e.srcc_premium_change)).toLocaleString()}</Typography>}
                            {num(e.tc_premium_change) !== 0 && <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: '#374151' }}>TC {num(e.tc_premium_change) < 0 ? '-' : '+'}LKR {Math.abs(num(e.tc_premium_change)).toLocaleString()}</Typography>}
                            {num(e.net_premium_change) !== 0 && <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: '#6366F1' }}>Net {num(e.net_premium_change) < 0 ? '-' : '+'}LKR {Math.abs(num(e.net_premium_change)).toLocaleString()}</Typography>}
                            {num(e.total_premium_change) !== 0 && <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: '#255EAB' }}>Total {num(e.total_premium_change) < 0 ? '-' : '+'}LKR {Math.abs(num(e.total_premium_change)).toLocaleString()}</Typography>}
                            {num(e.sum_insured_change) !== 0 && <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: '#0891B2' }}>Sum Insured {num(e.sum_insured_change) < 0 ? '-' : '+'}LKR {Math.abs(num(e.sum_insured_change)).toLocaleString()}</Typography>}
                            {num(e.commission_change) !== 0 && <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: '#059669' }}>Commission {num(e.commission_change) < 0 ? '-' : '+'}LKR {Math.abs(num(e.commission_change)).toLocaleString()}</Typography>}
                          </Box>
                          {Array.isArray(e.documents) && e.documents.length > 0 && (
                            <Box sx={{ display: 'flex', gap: 1, mt: 0.8, flexWrap: 'wrap' }}>
                              {e.documents.map((d, i) => (
                                <Chip key={i} icon={<DescriptionOutlinedIcon sx={{ fontSize: 14 }} />} label={d.name || `Document ${i + 1}`} size="small" onClick={() => openFile(d.url)} sx={{ height: 22, fontSize: 10.5, cursor: 'pointer', bgcolor: 'rgba(124,58,237,0.10)', color: '#7c3aed' }} />
                              ))}
                            </Box>
                          )}
                          {/* Amount Paid + Paid Date — editable; rolls into the policy's Amount Received */}
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.8, flexWrap: 'wrap' }}>
                            {editingPaid && editingPaid.id === e.id ? (
                              <>
                                <NumericField label="Amount Paid" value={editingPaid.value} autoFocus
                                  onChange={ev => setEditingPaid(p => ({ ...p, value: ev.target.value }))}
                                  size="small" sx={{ maxWidth: 150, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 12.5 } }} />
                                <TextField type="date" label="Paid Date" InputLabelProps={{ shrink: true }} value={editingPaid.date}
                                  onChange={ev => setEditingPaid(p => ({ ...p, date: ev.target.value }))}
                                  size="small" sx={{ maxWidth: 160, '& .MuiOutlinedInput-root': { borderRadius: '8px', fontSize: 12.5 } }} />
                                <IconButton size="small" onClick={() => { setEndorsementPaid(e.id, editingPaid.value, editingPaid.date); setEditingPaid(null); }} sx={{ color: '#059669' }}><CheckCircleOutlinedIcon sx={{ fontSize: 18 }} /></IconButton>
                                <IconButton size="small" onClick={() => setEditingPaid(null)} sx={{ color: '#9CA3AF' }}><CloseIcon sx={{ fontSize: 17 }} /></IconButton>
                              </>
                            ) : (
                              <>
                                <Box sx={{ px: 1, py: 0.4, borderRadius: '7px', bgcolor: num(e.amount_paid) ? 'rgba(5,150,105,0.08)' : 'rgba(148,163,184,0.10)', border: `1px solid ${num(e.amount_paid) ? 'rgba(5,150,105,0.25)' : 'rgba(148,163,184,0.25)'}` }}>
                                  <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: num(e.amount_paid) ? '#059669' : '#9CA3AF' }}>
                                    Paid: LKR {num(e.amount_paid).toLocaleString()}{e.amount_paid_date ? ` · ${e.amount_paid_date}` : ''}
                                  </Typography>
                                </Box>
                                <IconButton size="small" onClick={() => setEditingPaid({ id: e.id, value: e.amount_paid || '', date: e.amount_paid_date || '' })} sx={{ color: '#7c3aed' }}><EditOutlinedIcon sx={{ fontSize: 16 }} /></IconButton>
                              </>
                            )}
                          </Box>
                          {e.created_by && <Typography sx={{ fontSize: 10, color: '#9CA3AF', mt: 0.4 }}>Recorded by {e.created_by}</Typography>}
                        </Box>
                        <IconButton size="small" onClick={() => deleteEndorsement(e.id)} sx={{ color: '#dc2626' }}><DeleteOutlineIcon sx={{ fontSize: 18 }} /></IconButton>
                      </Box>
                    ))}
                  </Box>
                ))}
              </Box>
            )}

            <Box sx={{ p: 2, borderRadius: '12px', border: '1px dashed rgba(124,58,237,0.35)', bgcolor: 'rgba(124,58,237,0.03)', mb: 2.5 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: '#7c3aed', mb: 1.5 }}>Add Endorsement</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField type="date" label="Effective Date" InputLabelProps={{ shrink: true }} fullWidth size="small" value={endoDraft.effective_date} onChange={e => setEndoDraft(d => ({ ...d, effective_date: e.target.value }))} sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel sx={{ fontSize: 13 }}>Type</InputLabel>
                    <Select label="Type" value={endoDraft.type} onChange={e => setEndoDraft(d => ({ ...d, type: e.target.value }))} sx={{ borderRadius: '10px', fontSize: 13 }}>
                      {ENDORSEMENT_TYPES.map(t => <MenuItem key={t} value={t} sx={{ fontSize: 13 }}>{t}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField label="Description of Change" fullWidth size="small" value={endoDraft.description} onChange={e => setEndoDraft(d => ({ ...d, description: e.target.value }))} placeholder="e.g. Sum insured increased; new location added…" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <NumericField label="Basic Premium Change (+/-)" value={endoDraft.basic_premium_change} onChange={e => setEndoDraft(d => ({ ...d, basic_premium_change: e.target.value }))} fullWidth size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <NumericField label="SRCC Premium Change (+/-)" value={endoDraft.srcc_premium_change} onChange={e => setEndoDraft(d => ({ ...d, srcc_premium_change: e.target.value }))} fullWidth size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <NumericField label="TC Premium Change (+/-)" value={endoDraft.tc_premium_change} onChange={e => setEndoDraft(d => ({ ...d, tc_premium_change: e.target.value }))} fullWidth size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <NumericField label="Net Premium Change (Auto)" value={netPremiumChange(endoDraft)} readOnly fullWidth size="small"
                    helperText="Basic + SRCC + TC"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <NumericField label="Total Premium Change (+/-)" value={endoDraft.total_premium_change} onChange={e => setEndoDraft(d => ({ ...d, total_premium_change: e.target.value }))} fullWidth size="small"
                    helperText="Incl. taxes — enter manually"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <NumericField label="Sum Insured Change (+/-)" value={endoDraft.sum_insured_change} onChange={e => setEndoDraft(d => ({ ...d, sum_insured_change: e.target.value }))} fullWidth size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <NumericField label="Amount Paid (optional)" value={endoDraft.amount_paid} onChange={e => setEndoDraft(d => ({ ...d, amount_paid: e.target.value }))} fullWidth size="small"
                    helperText="Adds to the policy's Amount Received"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField type="date" label="Paid Date" InputLabelProps={{ shrink: true }} value={endoDraft.amount_paid_date}
                    onChange={e => setEndoDraft(d => ({ ...d, amount_paid_date: e.target.value }))} fullWidth size="small"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
                </Grid>
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Box sx={{ px: 1.5, py: 0.8, borderRadius: '8px', bgcolor: 'rgba(5,150,105,0.08)', border: '1px solid rgba(5,150,105,0.2)' }}>
                      <Typography sx={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>Auto Commission Change</Typography>
                      <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#059669' }}>{endoCommissionChange(endoDraft) < 0 ? '-' : '+'}LKR {Math.abs(endoCommissionChange(endoDraft)).toLocaleString()}</Typography>
                    </Box>
                    <Button component="label" variant="outlined" size="small" startIcon={endoUploading ? <CircularProgress size={14} /> : <CloudUploadOutlinedIcon />} disabled={endoUploading} sx={{ textTransform: 'none', borderColor: '#7c3aed', color: '#7c3aed', fontSize: 12.5 }}>
                      {endoUploading ? 'Uploading…' : 'Upload Documents'}
                      <input hidden type="file" multiple accept="application/pdf,image/*" onChange={e => { handleEndoFiles(e.target.files); e.target.value = ''; }} />
                    </Button>
                    {endoDraft.documents.map((d, i) => (
                      <Chip key={i} icon={<DescriptionOutlinedIcon sx={{ fontSize: 14 }} />} label={d.name} size="small" onDelete={() => removeEndoDraftDoc(i)} sx={{ height: 24, fontSize: 11, bgcolor: 'rgba(124,58,237,0.10)', color: '#7c3aed' }} />
                    ))}
                  </Box>
                </Grid>
                {endoError && <Grid item xs={12}><Alert severity="error" sx={{ borderRadius: '10px', py: 0 }}>{endoError}</Alert></Grid>}
                <Grid item xs={12}>
                  <Button onClick={addEndorsement} startIcon={<AddCircleOutlineIcon />} variant="contained" sx={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', fontSize: 13, textTransform: 'none' }}>Add Endorsement</Button>
                </Grid>
              </Grid>
            </Box>
          </>
        )}

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>{error}</Alert>}

        {saving && (
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 12, color: '#38A3E0', mb: 0.5, fontWeight: 600 }}>Uploading and saving…</Typography>
            <LinearProgress sx={{ borderRadius: '4px', height: 5,
              '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#255EAB,#38A3E0)' } }} />
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 1.5, pt: 1, justifyContent: 'flex-end',
                    borderTop: '1px solid rgba(56,163,224,0.12)', mt: 1 }}>
          <Button onClick={onCancel} variant="outlined" disabled={saving}
            sx={{ borderColor: '#e0e0e0', color: '#6B7280', '&:hover': { borderColor: '#aaa' } }}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving} sx={{ minWidth: 130 }}>
            {saving ? 'Saving…' : isEdit ? 'Update Client' : 'Add Client'}
          </Button>
        </Box>
      </Box>

      {/* Add Insurance Company — saved permanently to the provider dropdown */}
      <Dialog open={providerDialogOpen} onClose={() => !savingProvider && setProviderDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, fontSize: 16 }}>Add Insurance Company</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 12.5, color: '#6B7280', mb: 1.5 }}>
            This company is saved permanently and will appear in the Insurance Provider dropdown from now on.
          </Typography>
          <TextField autoFocus fullWidth size="small" label="Insurance Company Name"
            value={newProviderName}
            onChange={e => setNewProviderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveNewProvider(); } }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '10px', fontSize: 13 } }} />
          {providerError && <Alert severity="error" sx={{ mt: 1.5, borderRadius: '10px', py: 0 }}>{providerError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setProviderDialogOpen(false)} disabled={savingProvider}
            sx={{ color: '#6B7280', textTransform: 'none' }}>Cancel</Button>
          <Button onClick={saveNewProvider} variant="contained" disabled={savingProvider}
            startIcon={savingProvider ? <CircularProgress size={14} color="inherit" /> : null}
            sx={{ textTransform: 'none', minWidth: 110 }}>
            {savingProvider ? 'Saving…' : 'Save & Select'}
          </Button>
        </DialogActions>
      </Dialog>
    </LocalizationProvider>
  );
};

export default AddClientForm;
