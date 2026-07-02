import React, { useState, useEffect, useMemo } from 'react';
import { collection, addDoc, doc, updateDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { uploadFile as uploadToCloudinary } from '../storage';
import { useAuth } from '../App';
import { PRODUCTS } from '../config/products';
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
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';

import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';

/* ── Derived from PRODUCTS config — always in sync ───────────────────────── */
// label → product key  (e.g. 'Motor Insurance' → 'motor')
const PRODUCT_KEY_MAP = Object.fromEntries(
  Object.entries(PRODUCTS).map(([k, v]) => [v.label, k])
);
// product key → main class  (used to auto-fill the Main Class dropdown)
// Allowed Main Class values (what the dropdown shows).
const MAIN_CLASSES = ['Fire', 'Marine', 'Motor', 'Health', 'Miscellaneous', 'Individual', 'Group', 'Other'];
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
  // Auto-generated from PRODUCTS config — if a product is added there, it appears here
  product: Object.values(PRODUCTS).map(p => p.label),
  customer_type: ['Individual', 'Company'],
  insurance_provider: [
    'AIA Insurance', 'Allianz Insurance Lanka', 'Ceylinco General Insurance',
    'Ceylinco Life Insurance', 'Fairfirst Insurance', 'HNB General Insurance',
    'Janashakthi General Insurance', 'Janashakthi Life Insurance',
    'LOLC General Insurance', 'LOLC Life Assurance',
    'National Insurance Trust Fund', 'Orient Insurance',
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

/* ── Commission rate table (by Main Class) ──────────────────────────────────
   Standard commission = basic premium × basic rate + SRCC × 7.5% + TC × 7.5%.
   For a "Special" commission, an additional special rate (+/-) is applied to the
   BASIC premium only; SRCC and TC rates remain fixed.                          */
const COMMISSION_BASIC_RATES = {
  Motor: 20, Fire: 20, Marine: 15, Health: 20,
  Miscellaneous: 20, Individual: 20, Group: 20, Other: 20,
};
const COMMISSION_SRCC_RATE = 7.5;
const COMMISSION_TC_RATE   = 7.5;
const num = (v) => parseFloat(String(v ?? '').replace(/,/g, '')) || 0;
const roundMoney = (n) => (Number.isFinite(n) && n !== 0 ? String(Math.round(n * 100) / 100) : '');

/* ── Field definitions ─────────────────────────────────────────────────────
   Exported so TableSection can use it for CSV template generation           */
export const textFields = [
  // Introducer
  { label: 'InsureSAAS File No.', name: 'insuresaas_ib_file_no', section: 'Introducer' },
  { label: 'Manager',            name: 'manager',            section: 'Introducer' },
  { label: 'Introducer Code',    name: 'introducer_code',    section: 'Introducer' },
  // Insurance Company
  { label: 'Insurance Type',     name: 'insurance_type',     section: 'Insurance Company', dropdown: true },
  { label: 'Main Class',         name: 'main_class',         section: 'Insurance Company', dropdown: true },
  { label: 'Product',            name: 'product',            section: 'Insurance Company', dropdown: true, required: true },
  { label: 'Insurance Provider', name: 'insurance_provider', section: 'Insurance Company', dropdown: true, required: true },
  { label: 'Branch',             name: 'branch',             section: 'Insurance Company', dropdown: true },
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
  // Commission
  { label: 'Commission Type',    name: 'commission_type',    section: 'Commission', dropdown: true },
  { label: 'Basic Commission %', name: 'commission_pct',     section: 'Commission', type: 'number', readOnly: true },
  { label: 'Special Rate (+/- %)', name: 'commission_special_rate', section: 'Commission', type: 'number' },
  { label: 'Commission Basic',   name: 'commission_basic',   section: 'Commission', type: 'number' },
  { label: 'Commission SRCC',    name: 'commission_srcc',    section: 'Commission', type: 'number' },
  { label: 'Commission TC',      name: 'commission_tc',      section: 'Commission', type: 'number' },
  { label: 'Special Adjustment', name: 'commission_special_amount', section: 'Commission', type: 'number', readOnly: true },
  { label: 'Total Commission',   name: 'commission_total',   section: 'Commission', type: 'number', readOnly: true },
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
  Introducer:                 '#FF5A5A',
  'Insurance Company':        '#FF8B5A',
  'Proposer Details':         '#FFA95A',
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

function calcOsDays(from) {
  if (!from) return '';
  const a = new Date(from instanceof Date ? from : from);
  if (isNaN(a)) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - a) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? String(diff) : '';
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
          border: `2px dashed ${dragging ? '#FF5A5A' : uploaded ? '#10B981' : 'rgba(255,139,90,0.35)'}`,
          borderRadius: '12px', p: 1.5, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 1,
          bgcolor: dragging ? 'rgba(255,90,90,0.04)' : uploaded ? 'rgba(16,185,129,0.04)' : '#FAFAFA',
          transition: 'all 0.2s ease',
          '&:hover': { borderColor: '#FF8B5A', bgcolor: 'rgba(255,139,90,0.04)' },
        }}
      >
        {uploaded
          ? <CheckCircleOutlinedIcon sx={{ color: '#10B981', fontSize: 20, flexShrink: 0 }} />
          : <CloudUploadOutlinedIcon sx={{ color: '#FF8B5A', fontSize: 20, flexShrink: 0 }} />}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#374151', lineHeight: 1.2 }}>{label}</Typography>
          {fileName
            ? <Typography sx={{ fontSize: 10.5, color: '#10B981', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{fileName}</Typography>
            : existing
              ? <Typography sx={{ fontSize: 10.5, color: '#9CA3AF' }}>Current file saved — drop to replace</Typography>
              : <Typography sx={{ fontSize: 10.5, color: '#9CA3AF' }}>Click or drag to upload (PDF/image)</Typography>}
        </Box>
        {existing && !fileName && (
          <Link href={existing} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            sx={{ fontSize: 10.5, color: '#FF8B5A', whiteSpace: 'nowrap', flexShrink: 0 }}>
            View
          </Link>
        )}
      </Box>
      {progress !== null && progress < 100 && (
        <LinearProgress variant="determinate" value={progress}
          sx={{ mt: 0.5, borderRadius: '2px', height: 3,
                '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#FF5A5A,#FF8B5A)' } }} />
      )}
      <input type="file" id={`file-${fieldName}`} accept="application/pdf,image/*"
        style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
    </Box>
  );
}

function SectionHeader({ title }) {
  const color = SECTION_COLORS[title] || '#FF5A5A';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, mt: 0.5 }}>
      <Box sx={{ width: 4, height: 20, borderRadius: '2px', background: `linear-gradient(180deg,${color},rgba(0,0,0,0))` }} />
      <Typography sx={{ fontWeight: 700, fontSize: 13, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {title}
      </Typography>
      <Box sx={{ flex: 1, height: 1, bgcolor: 'rgba(255,139,90,0.12)' }} />
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
      inputProps={{ inputMode: 'numeric', ...(props.inputProps || {}) }}
      sx={{ ...props.sx, ...(readOnly ? { '& .MuiOutlinedInput-root': { bgcolor: 'rgba(0,0,0,0.03)' } } : {}) }}
    />
  );
}

/* ══════════════════════════════ MAIN FORM ═══════════════════════════════ */
const AddClientForm = ({ onSuccess, onCancel, initialData = {}, isEdit = false }) => {
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
      const raw = initialData[f.name];
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
    return obj;
  });

  /* ── date fields state ────────────────────────────────────────────────── */
  const [dates, setDates] = useState({
    policy_period_from:      initialData.policy_period_from ? new Date(initialData.policy_period_from) : null,
    policy_period_to:        initialData.policy_period_to   ? new Date(initialData.policy_period_to)   : null,
    payment_date:            initialData.payment_date        ? new Date(initialData.payment_date)        : null,
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

  const set = (name, val) => setFields(f => ({ ...f, [name]: val }));

  const handleDate = (name, val) => {
    setDates(d => ({ ...d, [name]: val }));
  };

  /* ── auto-calcs ──────────────────────────────────────────────────────── */
  useEffect(() => {
    const from = dates.policy_period_from;
    const to   = dates.policy_period_to;
    const days = calcPolicyDays(from, to);
    const os   = calcOsDays(from);
    const year  = from ? String(from.getFullYear()) : '';
    const month = from ? MONTHS[from.getMonth()] : '';
    setFields(f => ({
      ...f,
      policy_days:  days,
      os_days:      f.os_days !== '' ? f.os_days : os, // only auto-fill if empty
      policy_year:  year,
      policy_month: month,
    }));
  }, [dates.policy_period_from, dates.policy_period_to]);

  /* Auto-calculate Standard / Special commission from the rate table.
     Runs only when a commission type is selected; manual edits are left alone
     when no type is set. SRCC and TC rates are fixed; Special adds a +/- rate
     applied to the basic premium only. */
  const autoCommission = fields.commission_type === 'Standard' || fields.commission_type === 'Special';
  useEffect(() => {
    if (!autoCommission) return;
    const basicRate = COMMISSION_BASIC_RATES[fields.main_class] ?? 20;
    const cb = num(fields.basic_premium) * basicRate / 100;
    const cs = num(fields.srcc_premium)  * COMMISSION_SRCC_RATE / 100;
    const ct = num(fields.tc_premium)    * COMMISSION_TC_RATE   / 100;
    const specialAmt = fields.commission_type === 'Special'
      ? num(fields.basic_premium) * num(fields.commission_special_rate) / 100
      : 0;
    setFields(f => ({
      ...f,
      commission_pct:            String(basicRate),
      commission_basic:          roundMoney(cb),
      commission_srcc:           roundMoney(cs),
      commission_tc:             roundMoney(ct),
      commission_special_amount: fields.commission_type === 'Special' ? roundMoney(specialAmt) : '',
    }));
  }, [autoCommission, fields.commission_type, fields.main_class, fields.basic_premium,
      fields.srcc_premium, fields.tc_premium, fields.commission_special_rate]);

  useEffect(() => {
    const total = num(fields.commission_basic) + num(fields.commission_srcc)
                + num(fields.commission_tc) + num(fields.commission_special_amount);
    setFields(f => ({ ...f, commission_total: total !== 0 ? String(Math.round(total * 100) / 100) : '' }));
  }, [fields.commission_basic, fields.commission_srcc, fields.commission_tc, fields.commission_special_amount]);

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

  /* ── auto-fill main_class when product changes ───────────────────────── */
  useEffect(() => {
    const key = productKeyMap[fields.product];
    const mc = (key && PRODUCT_MAIN_CLASS[key]) || allProducts[key]?.mainClass;
    // Only auto-fill with a value that exists in the dropdown; otherwise leave
    // it for manual selection so the Select never shows an out-of-range value.
    if (mc && MAIN_CLASSES.includes(mc)) setFields(f => ({ ...f, main_class: mc }));
  }, [fields.product, productKeyMap, allProducts]);


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
        product_key: productKey || '',
      };
      delete payload.date_added;
      delete payload.policy_year;   // derived — store only for display
      delete payload.policy_month;  // derived
      const dateAdded = dates.date_added && !isNaN(dates.date_added) ? dates.date_added : null;

      // Convert number strings back to plain strings (keep raw for Firestore)
      if (isEdit && initialData.id) {
        await updateDoc(doc(db, 'clients', initialData.id), {
          ...payload,
          updated_at: serverTimestamp(),
          ...(dateAdded ? { created_at: dateAdded } : {}),
        });
      } else {
        await addDoc(collection(db, 'clients'), {
          ...payload,
          created_at:        dateAdded || serverTimestamp(),
          is_active:         true,
          status:            isPrivileged ? 'approved' : 'pending',
          submitted_by:      user?.uid || '',
          submitted_by_name: userProfile?.full_name || user?.email?.split('@')[0] || 'Unknown',
          submitted_at:      serverTimestamp(),
          ...(initialData.source_quote_id ? { source_quote_id: initialData.source_quote_id } : {}),
        });
      }
      onSuccess?.();
    } catch (err) {
      setError(err.message || 'Failed to save client');
    }
    setSaving(false);
  };

  /* ── render helpers ──────────────────────────────────────────────────── */
  const renderDropdown = (f, val, onChangeFn) => (
    <FormControl fullWidth size="small" key={f.name}>
      <InputLabel sx={{ fontSize: 13 }}>{f.label}{f.required ? ' *' : ''}</InputLabel>
      <Select label={`${f.label}${f.required ? ' *' : ''}`} value={val}
        onChange={e => onChangeFn(f.name, e.target.value)} required={!!f.required}
        sx={{ borderRadius: '10px', fontSize: 13 }}>
        {/* Product list includes custom products so custom-product quotes resolve here */}
        {(f.name === 'product' ? productOptions : (dropdowns[f.name] || [])).map(opt => <MenuItem key={opt} value={opt} sx={{ fontSize: 13 }}>{opt}</MenuItem>)}
      </Select>
      {f.required && !val && <FormHelperText error>{f.label} is required</FormHelperText>}
    </FormControl>
  );

  const renderStaticField = (f) => {
    const isReadOnly = !!f.readOnly;
    if (f.dropdown && dropdowns[f.name]) return renderDropdown(f, fields[f.name], set);
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
                '& .MuiInputBase-input': { color: '#FF5A5A', fontWeight: 700 } }} />
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
        <SectionHeader title="Introducer" />
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          <Grid item xs={12} sm={6} md={4}>
            <TextField label="InsureSAAS File No." value={fields.insuresaas_ib_file_no}
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
        {autoCommission && (
          <Box sx={{ mb: 1.5, px: 1.5, py: 1, borderRadius: '8px', bgcolor: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.18)' }}>
            <Typography sx={{ fontSize: 12, color: '#9d174d', fontWeight: 600 }}>
              {fields.commission_type === 'Special'
                ? `Auto-calculated: Standard (${fields.main_class || '—'} basic ${COMMISSION_BASIC_RATES[fields.main_class] ?? 20}%, SRCC ${COMMISSION_SRCC_RATE}%, TC ${COMMISSION_TC_RATE}%) with the Special Rate applied to the basic premium.`
                : `Auto-calculated from the rate table: ${fields.main_class || '—'} basic ${COMMISSION_BASIC_RATES[fields.main_class] ?? 20}%, SRCC ${COMMISSION_SRCC_RATE}%, TC ${COMMISSION_TC_RATE}% (× the entered premiums).`}
            </Typography>
          </Box>
        )}
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {textFields.filter(f => f.section === 'Commission')
            // Special-only fields hidden unless a Special commission is selected
            .filter(f => (f.name === 'commission_special_rate' || f.name === 'commission_special_amount')
              ? fields.commission_type === 'Special' : true)
            .map(f => {
              // When a commission type is chosen the breakdown is auto-derived, so lock those inputs
              const locked = autoCommission && ['commission_basic', 'commission_srcc', 'commission_tc'].includes(f.name);
              return (
                <Grid item xs={12} sm={6} md={4} key={f.name}>
                  {renderStaticField(locked ? { ...f, readOnly: true } : f)}
                </Grid>
              );
            })}
        </Grid>

        {/* ── Payment ──────────────────────────────────────── */}
        <SectionHeader title="Payment" />
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          {textFields.filter(f => f.section === 'Payment').map(f => (
            <Grid item xs={12} sm={6} md={4} key={f.name}>
              {renderStaticField(f)}
            </Grid>
          ))}
        </Grid>

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
                  <Link href={url} target="_blank" rel="noopener noreferrer"
                    sx={{ fontSize: 11, color: '#10B981', fontWeight: 700, '&:hover': { textDecoration: 'underline' } }}>
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

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>{error}</Alert>}

        {saving && (
          <Box sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 12, color: '#FF8B5A', mb: 0.5, fontWeight: 600 }}>Uploading and saving…</Typography>
            <LinearProgress sx={{ borderRadius: '4px', height: 5,
              '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#FF5A5A,#FF8B5A)' } }} />
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 1.5, pt: 1, justifyContent: 'flex-end',
                    borderTop: '1px solid rgba(255,139,90,0.12)', mt: 1 }}>
          <Button onClick={onCancel} variant="outlined" disabled={saving}
            sx={{ borderColor: '#e0e0e0', color: '#6B7280', '&:hover': { borderColor: '#aaa' } }}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving} sx={{ minWidth: 130 }}>
            {saving ? 'Saving…' : isEdit ? 'Update Client' : 'Add Client'}
          </Button>
        </Box>
      </Box>
    </LocalizationProvider>
  );
};

export default AddClientForm;
