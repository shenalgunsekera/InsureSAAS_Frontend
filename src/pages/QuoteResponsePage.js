import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  doc, getDoc, updateDoc, arrayUnion, serverTimestamp,
  collection, addDoc, getDocs, query, where,
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from '../firebase';
import { uploadFile as uploadToCloudinary, openFile } from '../storage';
import { PRODUCTS } from '../config/products';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';

// Sections filled by insurer — excluded from the read-only quote summary
const INSURER_SECTIONS = new Set([
  'Introducer', 'Covers Required', 'Cover Required', 'Additional Clauses',
]);

function buildInfoSections(product, formData) {
  if (!product || !formData) return [];
  const noFields = new Set(
    (product.fields || [])
      .filter(f => f.type === 'yesno' && formData[f.name] === 'No')
      .map(f => f.name)
  );
  const sectionMap = {};
  const sectionOrder = [];
  (product.fields || []).forEach(f => {
    if (!f.section || INSURER_SECTIONS.has(f.section)) return;
    if (f.showIf) {
      if (f.showIf.notZero) {
        const pv = formData[f.showIf.field];
        if (!pv || pv === '0' || Number(pv) === 0) return;
      } else if (formData[f.showIf.field] !== f.showIf.value) return;
    }
    if (noFields.has(f.name)) return;
    const val = formData[f.name];
    if (!val) return;
    if ((f.type === 'number' || f.type === 'currency') && (val === '0' || val === 0)) return;
    if (!sectionMap[f.section]) {
      sectionMap[f.section] = [];
      sectionOrder.push(f.section);
    }
    const fileName = f.type === 'file' ? (formData[f.name + '_filename'] || f.label) : null;
    sectionMap[f.section].push({ field: f, value: val, fileName });
  });
  return sectionOrder
    .filter(name => sectionMap[name].length > 0)
    .map(name => ({ name, fields: sectionMap[name] }));
}

function getYesnoFields(product, ...sectionNames) {
  if (!product) return [];
  return (product.fields || []).filter(
    f => sectionNames.includes(f.section) && f.type === 'yesno'
  );
}

const clientBadge = (val) => ({
  display: 'inline-block', padding: '2px 10px', borderRadius: '20px',
  fontSize: 12, fontWeight: 700,
  background: val === 'Yes' ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
  color: val === 'Yes' ? '#059669' : '#6B7280',
});

const CoverTable = ({ fields, responses, setResponses, quoteFormData, headerLabel }) => (
  <Box sx={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 580 }}>
      <thead>
        <tr style={{ background: 'rgba(59,130,246,0.05)', borderBottom: '2px solid rgba(59,130,246,0.15)' }}>
          {[headerLabel, 'Client Requested', 'We Provide', 'Special Terms'].map(h => (
            <th key={h} style={{ padding: '10px 14px', textAlign: h === headerLabel ? 'left' : 'center', fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {fields.map((f, i) => {
          const clientVal = f.clientValue || quoteFormData?.[f.name] || 'No';
          const cr = responses[f.name] || { provided: '', terms: '' };
          return (
            <tr key={f.name} style={{ background: i % 2 === 0 ? '#fff' : '#EFF6FF', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
              <td style={{ padding: '10px 14px', fontSize: 13.5, fontWeight: 600, color: '#374151', minWidth: 190 }}>{f.label}</td>
              <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                <span style={clientBadge(clientVal)}>{clientVal}</span>
              </td>
              <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                <Select size="small" value={cr.provided} displayEmpty
                  onChange={e => setResponses(prev => ({ ...prev, [f.name]: { ...cr, provided: e.target.value } }))}
                  sx={{ minWidth: 88, fontSize: 13 }}>
                  <MenuItem value="">—</MenuItem>
                  <MenuItem value="Yes">Yes</MenuItem>
                  <MenuItem value="No">No</MenuItem>
                </Select>
              </td>
              <td style={{ padding: '8px 14px', minWidth: 200 }}>
                <TextField size="small" placeholder="Any special terms…" fullWidth
                  value={cr.terms}
                  onChange={e => setResponses(prev => ({ ...prev, [f.name]: { ...cr, terms: e.target.value } }))}
                  sx={{ '& .MuiInputBase-root': { fontSize: 13 } }} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </Box>
);

const QuoteResponsePage = () => {
  const [params]    = useSearchParams();
  const qid         = params.get('qid');
  const cid         = params.get('cid');
  const companyName = params.get('cn') ? decodeURIComponent(params.get('cn')) : 'Your Company';

  const [quote,      setQuote]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [submitted,  setSubmitted]  = useState(false);
  const [error,      setError]      = useState('');
  const [saving,     setSaving]     = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [uploadPct,  setUploadPct]  = useState(0);
  const [fileUrl,    setFileUrl]    = useState('');
  const [fileName,   setFileName]   = useState('');

  const [form, setForm] = useState({
    basic_premium: '', srcc_premium: '', tc_premium: '',
    admin_fee: '', vat_amount: '', other_premium: '',
    policy_fees: '', cess: '',
    road_safety_tax: '', stamp_fee: '', nbl: '', ssc_levy: '',
    deductible: '', excesses: '', commission_type: '',
    validity_days: '', notes: '',
  });

  const [coverResponses,  setCoverResponses]  = useState({});
  const [clauseResponses, setClauseResponses] = useState({});
  const [planPremiums,    setPlanPremiums]    = useState([]);

  // Decline — an insurer can reject the request (e.g. outside underwriting guidelines)
  const [declineOpen,   setDeclineOpen]   = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declining,     setDeclining]     = useState(false);

  const [submittedData,  setSubmittedData]  = useState(null);
  const [editing,        setEditing]        = useState(false);
  const [fieldErrors,    setFieldErrors]    = useState({});
  const [valOpen,        setValOpen]        = useState(false);
  const [valIssues,      setValIssues]      = useState({ missing: [], invalid: [] });
  const [editWindowOpen,  setEditWindowOpen]  = useState(false);
  const [reditApproved,   setReditApproved]   = useState(false);
  const [reditPending,    setReditPending]    = useState(false);
  const [showReditForm,   setShowReditForm]   = useState(false);
  const [reditReason,     setReditReason]     = useState('');
  const [reditSending,    setReditSending]    = useState(false);
  const [productDef,      setProductDef]      = useState(null);

  useEffect(() => {
    if (!qid) { setError('Invalid link — missing quote ID.'); setLoading(false); return; }
    signInAnonymously(auth)
      .catch(() => {})
      .finally(() => {
        getDoc(doc(db, 'quotes', qid))
          .then(snap => {
            if (!snap.exists()) { setError('This quote request could not be found.'); return; }
            const data = snap.data();
            if (data.status === 'confirmed') { setError('This quote has already been confirmed. No further responses needed.'); return; }
            const myResponse = (data.responses || []).find(r => r.company_id === cid);
            if (myResponse) {
              setSubmitted(true);
              setSubmittedData(myResponse);
              const submitTime = new Date(myResponse.submitted_at);
              const windowEnd  = new Date(submitTime.getTime() + 15 * 60 * 1000);
              if (new Date() < windowEnd) {
                setEditWindowOpen(true);
              } else {
                getDocs(query(
                  collection(db, 'quote_redit_requests'),
                  where('quote_id', '==', snap.id),
                  where('company_id', '==', cid),
                  where('status', '==', 'approved'),
                )).then(rsnap => {
                  const valid = rsnap.docs.find(d => new Date(d.data().approved_until) > new Date());
                  if (valid) { setReditApproved(true); return; }
                  getDocs(query(
                    collection(db, 'quote_redit_requests'),
                    where('quote_id', '==', snap.id),
                    where('company_id', '==', cid),
                    where('status', '==', 'pending'),
                  )).then(psnap => { if (!psnap.empty) setReditPending(true); });
                }).catch(() => {});
              }
            }
            const qData = { id: snap.id, ...data };
            setQuote(qData);
            // Initialise plan premiums for multi-plan products
            const pc = parseInt(data.form_data?.no_of_plans) || 1;
            setPlanPremiums(Array.from({ length: Math.max(pc, 1) }, (_, i) => ({
              plan: i + 1, basic: '', tax_pct: '18', tax: 0, total: 0,
            })));
            // Resolve product definition (static or custom)
            const pKey = data.product_key;
            if (PRODUCTS[pKey]) {
              setProductDef(PRODUCTS[pKey]);
            } else if (pKey) {
              getDoc(doc(db, 'products', pKey))
                .then(ps => { if (ps.exists()) setProductDef(ps.data()); })
                .catch(() => {});
            }
          })
          .catch(() => setError('Failed to load quote. Please check your link.'))
          .finally(() => setLoading(false));
      });
  }, [qid, cid]);

  useEffect(() => {
    if (!reditPending || !qid || !cid) return;
    const iv = setInterval(async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'quote_redit_requests'),
          where('quote_id', '==', qid),
          where('company_id', '==', cid),
          where('status', '==', 'approved'),
        ));
        const valid = snap.docs.find(d => new Date(d.data().approved_until) > new Date());
        if (valid) { setReditApproved(true); setReditPending(false); clearInterval(iv); }
      } catch {}
    }, 20000);
    return () => clearInterval(iv);
  }, [reditPending, qid, cid]);

  const submitReditRequest = async () => {
    if (!reditReason.trim()) return;
    setReditSending(true);
    try {
      await addDoc(collection(db, 'quote_redit_requests'), {
        quote_id:     qid,
        quote_ref:    quote?.reference || qid,
        company_id:   cid,
        company_name: companyName,
        product:      quote?.product_label || '',
        reason:       reditReason.trim(),
        status:       'pending',
        requested_at: serverTimestamp(),
      });
      setReditPending(true);
      setShowReditForm(false);
      setReditReason('');
    } catch { /* ignore */ }
    setReditSending(false);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setUploading(true);
    setError('');
    try {
      const url = await uploadToCloudinary(file, `insuresaas/quote-responses/${qid}`, pct => setUploadPct(pct), `${companyName} Quote Response`);
      setFileUrl(url);
    } catch (err) {
      const isRetry = err.message?.includes('retry-limit') || err.message?.includes('retry time');
      setError(
        isRetry
          ? 'Upload failed due to a network issue. Please check your connection and try uploading again.'
          : `Upload failed: ${err.message}`
      );
      setFileName('');
    }
    setUploading(false);
  };

  const totalPremium =
    (Number(form.basic_premium)    || 0) +
    (Number(form.srcc_premium)     || 0) +
    (Number(form.tc_premium)       || 0) +
    (Number(form.admin_fee)        || 0) +
    (Number(form.vat_amount)       || 0) +
    (Number(form.other_premium)    || 0) +
    (Number(form.policy_fees)      || 0) +
    (Number(form.cess)             || 0) +
    (Number(form.road_safety_tax)  || 0) +
    (Number(form.stamp_fee)        || 0) +
    (Number(form.nbl)              || 0) +
    (Number(form.ssc_levy)         || 0);

  const validateInsurer = () => {
    const errs = {};
    const missing = [];
    const invalid = [];
    if (!form.commission_type?.trim()) {
      errs.commission_type = 'Required';
      missing.push('Commission Type');
    }
    if (!fileUrl) {
      missing.push('Quote Document (file upload required)');
    }
    // Validate any numeric fields that were filled in
    [
      { key: 'basic_premium', label: 'Basic Premium' },
      { key: 'srcc_premium',  label: 'SRCC Premium'  },
      { key: 'tc_premium',    label: 'TC Premium'     },
      { key: 'admin_fee',     label: 'Admin Fee'      },
      { key: 'vat_amount',    label: 'VAT'            },
      { key: 'validity_days', label: 'Quote Validity' },
    ].forEach(({ key, label }) => {
      const val = form[key]?.toString().trim();
      if (val && isNaN(Number(val))) {
        errs[key] = 'Must be a number';
        invalid.push(`${label} — must be a valid number`);
      }
    });
    return { errs, missing, invalid };
  };

  const setFE = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setFieldErrors(e => { const n = { ...e }; delete n[key]; return n; });
  };

  const handleSubmit = async () => {
    const { errs, missing, invalid } = validateInsurer();
    if (Object.keys(errs).length > 0 || missing.length > 0) {
      setFieldErrors(errs);
      setValIssues({ missing, invalid });
      setValOpen(true);
      return;
    }
    setFieldErrors({});
    setError('');
    setSaving(true);
    try {
      const isPlans = !!productDef?.hasPlans;
      const grandTotal = isPlans
        ? planPremiums.reduce((s, p) => s + (Number(p.total) || 0), 0)
        : totalPremium;

      const responseId = `${cid}_${Date.now()}`;
      const response = {
        id:              responseId,
        company_id:      cid,
        company_name:    companyName,
        premium:         grandTotal,
        ...(isPlans ? { plan_premiums: planPremiums } : {
          basic_premium:     Number(form.basic_premium)    || 0,
          srcc_premium:      Number(form.srcc_premium)     || 0,
          tc_premium:        Number(form.tc_premium)       || 0,
          admin_fee:         Number(form.admin_fee)        || 0,
          vat_amount:        Number(form.vat_amount)       || 0,
          other_premium:     Number(form.other_premium)    || 0,
          policy_fees:       Number(form.policy_fees)      || 0,
          cess:              Number(form.cess)             || 0,
          road_safety_tax:   Number(form.road_safety_tax)  || 0,
          stamp_fee:         Number(form.stamp_fee)        || 0,
          nbl:               Number(form.nbl)              || 0,
          ssc_levy:          Number(form.ssc_levy)         || 0,
        }),
        deductible:      form.deductible,
        excesses:        form.excesses,
        commission_type: form.commission_type,
        validity_days:   form.validity_days,
        notes:           form.notes,
        cover_responses:  coverResponses,
        clause_responses: clauseResponses,
        quote_file_url:  fileUrl,
        submitted_at:    new Date().toISOString(),
      };

      if (editing) {
        const snap = await (await import('firebase/firestore')).getDoc(
          (await import('firebase/firestore')).doc(db, 'quotes', qid)
        );
        if (snap.exists()) {
          const prev = (snap.data().responses || []).filter(r => r.company_id !== cid);
          await updateDoc(doc(db, 'quotes', qid), {
            responses: [...prev, response],
            status: 'partial',
            updated_at: serverTimestamp(),
          });
        }
      } else {
        await updateDoc(doc(db, 'quotes', qid), {
          responses: arrayUnion(response),
          status: 'partial',
          updated_at: serverTimestamp(),
        });
      }

      setSubmittedData(response);
      setSubmitted(true);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  // Insurer declines the request (cannot quote — e.g. outside underwriting guidelines).
  const handleDecline = async () => {
    setDeclining(true);
    try {
      const response = {
        id:             `${cid}_${Date.now()}`,
        company_id:     cid,
        company_name:   companyName,
        declined:       true,
        decline_reason: declineReason.trim() || 'Outside our underwriting guidelines',
        premium:        0,
        submitted_at:   new Date().toISOString(),
      };
      const snap = await getDoc(doc(db, 'quotes', qid));
      if (snap.exists()) {
        const prev = (snap.data().responses || []).filter(r => r.company_id !== cid);
        await updateDoc(doc(db, 'quotes', qid), {
          responses: [...prev, response],
          status: 'partial',
          updated_at: serverTimestamp(),
        });
      }
      setSubmittedData(response);
      setSubmitted(true);
      setEditing(false);
      setDeclineOpen(false);
    } catch (err) {
      setError(err.message);
    }
    setDeclining(false);
  };

  const downloadReceipt = async () => {
    const { default: jsPDF }     = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    pdf.setFillColor(59,130,246);
    pdf.rect(0, 0, 210, 38, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(18); pdf.setFont('helvetica', 'bold');
    pdf.text('InsureSAAS', 14, 15);
    pdf.setFontSize(11); pdf.setFont('helvetica', 'normal');
    pdf.text('Quotation Submission Receipt', 14, 23);
    pdf.setFontSize(9);
    pdf.text(`Ref: ${quote?.reference || qid}   |   ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`, 14, 31);

    pdf.setFillColor(15,23,42);
    pdf.rect(0, 38, 210, 12, 'F');
    pdf.setTextColor(99,102,241);
    pdf.setFontSize(10); pdf.setFont('helvetica', 'bold');
    pdf.text(`SUBMITTED BY: ${companyName}`, 14, 46);
    pdf.setTextColor(255, 255, 255);
    pdf.text(`PRODUCT: ${quote?.product_label || ''}`, 120, 46);

    const premRows = (isPlansProduct
      ? [
          ...(submittedData?.plan_premiums || []).flatMap((p, pi) => [
            [`Plan ${pi + 1} — Basic Premium (LKR)`, Number(p.basic  || 0).toLocaleString()],
            [`Plan ${pi + 1} — Tax (LKR)`,           Number(p.tax    || 0).toLocaleString()],
            [`Plan ${pi + 1} — Total (LKR)`,         Number(p.total  || 0).toLocaleString()],
          ]),
          ['Grand Total (LKR)', Number(submittedData?.premium || 0).toLocaleString()],
        ]
      : [
          ['Total Premium (LKR)', Number(submittedData?.premium       || 0).toLocaleString()],
          ['Basic Premium (LKR)', Number(submittedData?.basic_premium || 0).toLocaleString()],
          ['SRCC (LKR)',          Number(submittedData?.srcc_premium  || 0).toLocaleString()],
          ['TC (LKR)',            Number(submittedData?.tc_premium    || 0).toLocaleString()],
          ['Admin Fee (LKR)',     Number(submittedData?.admin_fee     || 0).toLocaleString()],
          ['VAT (LKR)',           Number(submittedData?.vat_amount    || 0).toLocaleString()],
        ]
    ).concat([
      ['Deductibles',  submittedData?.deductible    || '—'],
      ['Excesses',     submittedData?.excesses      || '—'],
      ['Quote Validity', submittedData?.validity_days ? `${submittedData.validity_days} days` : '—'],
      ['Notes / Terms',  submittedData?.notes        || '—'],
    ]);

    autoTable(pdf, {
      startY: 56,
      head: [['Field', 'Value']],
      body: premRows,
      headStyles: { fillColor: [59,130,246], textColor: 255, fontStyle: 'bold', fontSize: 10 },
      alternateRowStyles: { fillColor: [239,246,255] },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 65 } },
      styles: { fontSize: 9.5, cellPadding: 4 },
      margin: { left: 14, right: 14 },
    });

    const prod = productDef || null;
    // Resolve a label for a response key: product field first, then custom extra covers/clauses
    const labelFor = (k) => {
      const field = prod?.fields?.find(f => f.name === k);
      if (field) return field.label;
      for (const sk of ['extra_covers', 'extra_clauses']) {
        try {
          const hit = JSON.parse(quote?.form_data?.[sk] || '[]')
            .find(c => sk + '_' + c.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() === k);
          if (hit) return hit.name;
        } catch {}
      }
      return k;
    };
    const coverEntries = Object.entries(submittedData?.cover_responses || {})
      .filter(([, v]) => v.provided);
    if (coverEntries.length > 0) {
      autoTable(pdf, {
        startY: pdf.lastAutoTable.finalY + 8,
        head: [['Cover / Clause', 'Provided', 'Special Terms']],
        body: coverEntries.map(([k, v]) => [labelFor(k), v.provided || '—', v.terms || '—']),
        headStyles: { fillColor: [15,23,42], textColor: [99,102,241], fontSize: 10 },
        alternateRowStyles: { fillColor: [239,246,255] },
        styles: { fontSize: 9.5, cellPadding: 4 },
        margin: { left: 14, right: 14 },
      });
    }
    const clauseEntries = Object.entries(submittedData?.clause_responses || {})
      .filter(([, v]) => v.provided);
    if (clauseEntries.length > 0) {
      autoTable(pdf, {
        startY: pdf.lastAutoTable.finalY + 8,
        head: [['Additional Clause', 'Included', 'Special Terms']],
        body: clauseEntries.map(([k, v]) => [labelFor(k), v.provided || '—', v.terms || '—']),
        headStyles: { fillColor: [15,23,42], textColor: [99,102,241], fontSize: 10 },
        alternateRowStyles: { fillColor: [239,246,255] },
        styles: { fontSize: 9.5, cellPadding: 4 },
        margin: { left: 14, right: 14 },
      });
    }

    const finalY = pdf.lastAutoTable.finalY + 10;
    pdf.setTextColor(150, 150, 150); pdf.setFontSize(8); pdf.setFont('helvetica', 'italic');
    pdf.text('InsureSAAS Ltd — Confidential Quotation Receipt', 14, finalY);

    pdf.save(`receipt_${quote?.reference || qid}_${companyName.replace(/\s+/g, '_')}.pdf`);
  };

  const canEdit = editWindowOpen || reditApproved;

  const handleEdit = () => {
    if (!canEdit) return;
    if (submittedData) {
      setForm({
        basic_premium:   submittedData.basic_premium?.toString()  || '',
        srcc_premium:    submittedData.srcc_premium?.toString()   || '',
        tc_premium:      submittedData.tc_premium?.toString()     || '',
        admin_fee:       submittedData.admin_fee?.toString()      || '',
        vat_amount:      submittedData.vat_amount?.toString()     || '',
        other_premium:   submittedData.other_premium?.toString()  || '',
        deductible:      submittedData.deductible     || '',
        excesses:        submittedData.excesses       || '',
        commission_type: submittedData.commission_type || '',
        validity_days:   submittedData.validity_days?.toString()  || '',
        notes:           submittedData.notes          || '',
      });
      setCoverResponses(submittedData.cover_responses  || {});
      setClauseResponses(submittedData.clause_responses || {});
      setFileUrl(submittedData.quote_file_url || '');
      setFileName('');
      if (submittedData.plan_premiums?.length) setPlanPremiums(submittedData.plan_premiums);
    }
    setSubmitted(false);
    setEditing(true);
  };

  const product      = productDef || null;
  const isPlansProduct = !!product?.hasPlans;
  const infoSections = buildInfoSections(product, quote?.form_data);
  const parseDynamicExtras = (storeKey) => {
    try {
      return (JSON.parse(quote?.form_data?.[storeKey] || '[]'))
        .filter(c => c.name?.trim() && c.value === 'Yes')
        .map(c => ({ name: storeKey + '_' + c.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(), label: c.name, type: 'yesno', clientValue: c.value }));
    } catch { return []; }
  };
  const coverFields  = [...getYesnoFields(product, 'Covers Required', 'Cover Required').filter(f => quote?.form_data?.[f.name] === 'Yes'), ...parseDynamicExtras('extra_covers')];
  const clauseFields = [...getYesnoFields(product, 'Additional Clauses').filter(f => quote?.form_data?.[f.name] === 'Yes'), ...parseDynamicExtras('extra_clauses')];

  const updatePlanPremium = (pi, key, rawVal) => {
    setPlanPremiums(prev => {
      const next = prev.map((p, i) => {
        if (i !== pi) return p;
        const updated = { ...p, [key]: rawVal };
        const basic = Number(updated.basic) || 0;
        const pct   = Number(updated.tax_pct) || 0;
        const tax   = Math.round(basic * pct / 100);
        return { ...updated, tax, total: basic + tax };
      });
      return next;
    });
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <CircularProgress sx={{ color: '#3B82F6' }} />
    </Box>
  );

  // ── Success / submitted view ─────────────────────────────────────────────────
  if (submitted && submittedData?.declined) return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F9F9FB', py: 4, px: 2 }}>
      <Box sx={{ maxWidth: 540, mx: 'auto' }}>
        <Card sx={{ overflow: 'hidden' }}>
          <Box sx={{ background: 'linear-gradient(135deg,#6B7280,#4B5563)', p: 3, textAlign: 'center' }}>
            <WarningAmberRoundedIcon sx={{ fontSize: 48, color: '#fff', mb: 1 }} />
            <Typography sx={{ fontWeight: 800, fontSize: 20, color: '#fff' }}>Request Declined</Typography>
            <Typography sx={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', mt: 0.5 }}>
              {companyName} · Ref: {quote?.reference}
            </Typography>
          </Box>
          <CardContent sx={{ p: 3 }}>
            <Typography sx={{ fontSize: 13.5, color: '#374151', mb: 2 }}>
              You have declined to quote on this request. InsureSAAS has been notified.
            </Typography>
            <Box sx={{ p: 2, borderRadius: '10px', bgcolor: 'rgba(107,114,128,0.06)', border: '1px solid rgba(0,0,0,0.08)', mb: 2.5 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.5 }}>Reason</Typography>
              <Typography sx={{ fontSize: 13.5, color: '#0F172A' }}>{submittedData.decline_reason}</Typography>
            </Box>
            <Button fullWidth variant="outlined" onClick={() => { setSubmitted(false); setSubmittedData(null); }}
              sx={{ py: 1.1, fontSize: 13, borderColor: 'rgba(59,130,246,0.3)', color: '#3B82F6' }}>
              Changed your mind? Submit a quotation instead
            </Button>
          </CardContent>
        </Card>
        <Typography sx={{ fontSize: 11.5, color: '#9CA3AF', textAlign: 'center', mt: 3 }}>
          InsureSAAS Ltd — Confidential Quotation Portal
        </Typography>
      </Box>
    </Box>
  );

  if (submitted) return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F9F9FB', py: 4, px: 2 }}>
      <Box sx={{ maxWidth: 560, mx: 'auto' }}>
        <Card sx={{ mb: 2.5, overflow: 'hidden' }}>
          <Box sx={{ background: 'linear-gradient(135deg,#10B981,#059669)', p: 3, textAlign: 'center' }}>
            <CheckCircleIcon sx={{ fontSize: 52, color: '#fff', mb: 1 }} />
            <Typography sx={{ fontWeight: 800, fontSize: 20, color: '#fff' }}>
              {editing ? 'Quotation Updated!' : 'Quotation Submitted!'}
            </Typography>
            <Typography sx={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', mt: 0.5 }}>
              {companyName} · Ref: {quote?.reference}
            </Typography>
          </Box>
          <CardContent sx={{ p: 3 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5 }}>
              Submission Summary
            </Typography>
            <Stack spacing={1} sx={{ mb: 2.5 }}>
              {(isPlansProduct
                ? [
                    ...(submittedData?.plan_premiums || []).flatMap((p, pi) => [
                      [`Plan ${pi + 1} — Basic`,  p.basic  ? `LKR ${Number(p.basic).toLocaleString()}`  : '—'],
                      [`Plan ${pi + 1} — Tax`,    p.tax    ? `LKR ${Number(p.tax).toLocaleString()}`    : '—'],
                      [`Plan ${pi + 1} — Total`,  `LKR ${Number(p.total || 0).toLocaleString()}`],
                    ]),
                    ['Grand Total',   `LKR ${Number(submittedData?.premium || 0).toLocaleString()}`],
                  ]
                : [
                    ['Total Premium', `LKR ${Number(submittedData?.premium || 0).toLocaleString()}`],
                    ['Basic Premium', submittedData?.basic_premium ? `LKR ${Number(submittedData.basic_premium).toLocaleString()}` : '—'],
                    ['SRCC',         submittedData?.srcc_premium  ? `LKR ${Number(submittedData.srcc_premium).toLocaleString()}`  : '—'],
                    ['TC',           submittedData?.tc_premium    ? `LKR ${Number(submittedData.tc_premium).toLocaleString()}`    : '—'],
                    ['Admin Fee',    submittedData?.admin_fee     ? `LKR ${Number(submittedData.admin_fee).toLocaleString()}`     : '—'],
                    ['VAT',          submittedData?.vat_amount    ? `LKR ${Number(submittedData.vat_amount).toLocaleString()}`    : '—'],
                  ]
              ).concat([
                ['Deductibles', submittedData?.deductible    || '—'],
                ['Excesses',    submittedData?.excesses      || '—'],
                ['Validity',    submittedData?.validity_days ? `${submittedData.validity_days} days` : '—'],
                ['Submitted',   new Date(submittedData?.submitted_at || Date.now()).toLocaleString('en-GB')],
              ]).map(([l, v]) => (
                <Box key={l} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.8, borderBottom: '1px solid rgba(99,102,241,0.08)' }}>
                  <Typography sx={{ fontSize: 13, color: '#6B7280' }}>{l}</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{v}</Typography>
                </Box>
              ))}
            </Stack>
            <Stack spacing={1.5}>
              <Button fullWidth variant="contained" onClick={downloadReceipt}
                startIcon={<UploadFileIcon />}
                sx={{ py: 1.2, fontSize: 13, background: 'linear-gradient(135deg,#0F172A,#2d2d42)' }}>
                Download PDF Receipt
              </Button>
              {canEdit ? (
                <Button fullWidth variant="outlined" onClick={handleEdit}
                  sx={{ py: 1.2, fontSize: 13, borderColor: 'rgba(59,130,246,0.3)', color: '#3B82F6' }}>
                  {reditApproved ? '✏️ Re-edit Approved — Edit & Resubmit' : 'Made a Mistake? Edit & Resubmit'}
                </Button>
              ) : reditPending ? (
                <Box sx={{ p: 2, borderRadius: '10px', bgcolor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', textAlign: 'center' }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#d97706', mb: 0.5 }}>Re-edit Request Pending</Typography>
                  <Typography sx={{ fontSize: 12, color: '#6B7280' }}>
                    Awaiting broker approval. This page will automatically unlock once approved.
                  </Typography>
                </Box>
              ) : showReditForm ? (
                <Box sx={{ p: 2, borderRadius: '10px', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, mb: 1.5, color: '#374151' }}>Request Re-edit Access</Typography>
                  <TextField fullWidth size="small" multiline rows={3}
                    label="Reason for re-edit *"
                    placeholder="Briefly explain why you need to update your submission…"
                    value={reditReason}
                    onChange={e => setReditReason(e.target.value)}
                    sx={{ mb: 1.5 }} />
                  <Stack direction="row" spacing={1}>
                    <Button variant="outlined" size="small" onClick={() => setShowReditForm(false)}
                      sx={{ borderColor: '#e0e0e0', color: '#6B7280' }}>Cancel</Button>
                    <Button variant="contained" size="small" onClick={submitReditRequest}
                      disabled={!reditReason.trim() || reditSending}
                      sx={{ background: 'linear-gradient(135deg,#3B82F6,#6366f1)' }}>
                      {reditSending ? 'Sending…' : 'Submit Request'}
                    </Button>
                  </Stack>
                </Box>
              ) : (
                <Box sx={{ p: 2, borderRadius: '10px', bgcolor: 'rgba(107,114,128,0.05)', border: '1px solid rgba(0,0,0,0.08)', textAlign: 'center' }}>
                  <Typography sx={{ fontSize: 12.5, color: '#6B7280', mb: 1.5 }}>
                    The 15-minute edit window has closed. Need to make a change?
                  </Typography>
                  <Button variant="outlined" size="small" onClick={() => setShowReditForm(true)}
                    sx={{ borderColor: 'rgba(59,130,246,0.3)', color: '#3B82F6', fontSize: 12 }}>
                    Request Re-edit Access
                  </Button>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>
        <Typography sx={{ fontSize: 11.5, color: '#9CA3AF', textAlign: 'center' }}>
          InsureSAAS Ltd — your response has been tracked in real-time.
        </Typography>
      </Box>
    </Box>
  );

  // ── Fatal error (no quote found) ─────────────────────────────────────────────
  if (error && !quote) return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F9F9FB', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
      <Card sx={{ maxWidth: 480, width: '100%' }}>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 2 }}>⚠️ Link Error</Typography>
          <Alert severity="error">{error}</Alert>
        </CardContent>
      </Card>
    </Box>
  );

  // ── Main form view ───────────────────────────────────────────────────────────
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F9F9FB', py: 4, px: 2 }}>
      <Box sx={{ maxWidth: 780, mx: 'auto' }}>

        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box sx={{
            width: 64, height: 64, borderRadius: '16px', mx: 'auto', mb: 2,
            background: 'linear-gradient(135deg,#3B82F6,#6366f1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
          }}>
            {product?.icon || '📋'}
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>Generate Your Quotation</Typography>
          <Typography sx={{ fontSize: 13.5, color: '#6B7280' }}>
            From <strong>{companyName}</strong> · Reference: <strong>{quote?.reference}</strong>
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: '#9CA3AF', mt: 0.5 }}>
            {product?.label} — Requested by InsureSAAS
          </Typography>
        </Box>

        {/* ── SECTION 1: QUOTATION (read-only summary) ── */}
        <Card sx={{ mb: 3, overflow: 'hidden' }}>
          <Box sx={{ background: '#0F172A', px: 3, py: 2 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 15, color: '#6366f1', letterSpacing: 0.5 }}>Quotation</Typography>
            <Typography sx={{ fontSize: 12, color: '#94A3B8', mt: 0.3 }}>
              Reference: {quote?.reference} · {product?.label}
            </Typography>
          </Box>
          <CardContent sx={{ p: 3 }}>
            {infoSections.length === 0 ? (
              <Typography sx={{ color: '#9CA3AF', fontSize: 13 }}>No additional details provided.</Typography>
            ) : (
              infoSections.map((sec, si) => (
                <Box key={sec.name} sx={{ mb: si < infoSections.length - 1 ? 3 : 0 }}>
                  <Typography sx={{
                    fontSize: 11, fontWeight: 800, color: '#3B82F6',
                    textTransform: 'uppercase', letterSpacing: 1,
                    mb: 1.5, pb: 0.5, borderBottom: '1px solid rgba(59,130,246,0.12)',
                  }}>
                    {sec.name}
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                    {sec.fields.map(({ field, value, fileName }) => (
                      <Box key={field.name} sx={field.type === 'textarea' || field.type === 'multiselect' || field.type === 'file' || field.type === 'plantable' ? { gridColumn: '1 / -1' } : {}}>
                        <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.4, mb: 0.3 }}>
                          {field.label}
                        </Typography>
                        {field.type === 'file' ? (
                          <Typography component="span" onClick={() => openFile(value)}
                            sx={{ fontSize: 13, color: '#6366f1', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 500, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>
                            📄 {fileName}
                          </Typography>
                        ) : field.type === 'plantable' ? (() => {
                          let rows = [];
                          try { rows = JSON.parse(value || '[]'); } catch (_) {}
                          return (
                            <Box sx={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                <thead>
                                  <tr style={{ background: 'rgba(8,145,178,0.07)' }}>
                                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Plan</th>
                                    {(field.planFields || []).map(pf => (
                                      <th key={pf.name} style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#374151' }}>{pf.label}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((row, ri) => (
                                    <tr key={ri} style={{ borderTop: '1px solid rgba(0,0,0,0.06)', background: ri % 2 === 0 ? '#fff' : '#f9fafb' }}>
                                      <td style={{ padding: '5px 10px', fontWeight: 700, color: '#0891b2' }}>Plan {ri + 1}</td>
                                      {(field.planFields || []).map(pf => (
                                        <td key={pf.name} style={{ padding: '5px 10px', textAlign: 'right', color: '#0F172A' }}>
                                          {row[pf.name] ? `LKR ${Number(row[pf.name]).toLocaleString()}` : '—'}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </Box>
                          );
                        })() : (
                          <Typography sx={{ fontSize: 13.5, color: '#0F172A', fontWeight: 500, lineHeight: 1.5 }}>
                            {(field.type === 'currency' || field.type === 'number') && !isNaN(Number(value)) && value !== ''
                              ? Number(value).toLocaleString()
                              : value}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                </Box>
              ))
            )}
          </CardContent>
        </Card>

        {/* ── SECTION 2: COVERS REQUIRED ── */}
        {coverFields.length > 0 && (
          <Card sx={{ mb: 3, overflow: 'hidden' }}>
            <Box sx={{ background: '#0F172A', px: 3, py: 2 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 15, color: '#6366f1' }}>Covers Required</Typography>
              <Typography sx={{ fontSize: 12, color: '#94A3B8', mt: 0.3 }}>Indicate which covers your policy provides and any special terms</Typography>
            </Box>
            {quote?.form_data?.type_of_cover && (
              <Box sx={{ px: 3, py: 1.5, bgcolor: 'rgba(99,102,241,0.05)', borderBottom: '1px solid rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Type of Cover Requested</Typography>
                <Box sx={{ px: 1.5, py: 0.4, borderRadius: '20px', bgcolor: 'rgba(99,102,241,0.12)', display: 'inline-block' }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#4F46E5' }}>{quote.form_data.type_of_cover}</Typography>
                </Box>
              </Box>
            )}
            <CoverTable
              fields={coverFields}
              responses={coverResponses}
              setResponses={setCoverResponses}
              quoteFormData={quote?.form_data}
              headerLabel="Cover"
            />
          </Card>
        )}

        {/* ── SECTION 3: ADDITIONAL CLAUSES ── */}
        {clauseFields.length > 0 && (
          <Card sx={{ mb: 3, overflow: 'hidden' }}>
            <Box sx={{ background: '#0F172A', px: 3, py: 2 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 15, color: '#6366f1' }}>Additional Clauses</Typography>
              <Typography sx={{ fontSize: 12, color: '#94A3B8', mt: 0.3 }}>Indicate which additional clauses are included in your quotation</Typography>
            </Box>
            <CoverTable
              fields={clauseFields}
              responses={clauseResponses}
              setResponses={setClauseResponses}
              quoteFormData={quote?.form_data}
              headerLabel="Clause"
            />
          </Card>
        )}

        {/* ── SECTION 4: YOUR QUOTATION DETAILS ── */}
        <Card>
          <CardContent>
            <Typography sx={{ fontWeight: 800, fontSize: 14, mb: 2.5, color: '#0F172A' }}>
              {editing ? '✏️ Editing Submission — Update your details below' : 'Your Quotation Details'}
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2, fontSize: 12 }}>{error}</Alert>}

            <Stack spacing={2.5}>

              {/* Premium Breakdown */}
              {isPlansProduct ? (
                /* ── Multi-plan premium table (Group Medical etc.) ── */
                <Box sx={{ borderRadius: '12px', border: '1px solid rgba(8,145,178,0.2)', overflow: 'hidden' }}>
                  <Box sx={{ px: 2, py: 1.5, bgcolor: 'rgba(8,145,178,0.06)' }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#0891b2', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      Premium per Plan
                    </Typography>
                  </Box>
                  <Box sx={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                      <thead>
                        <tr style={{ background: 'rgba(8,145,178,0.05)', borderBottom: '1px solid rgba(8,145,178,0.15)' }}>
                          {['Field', ...planPremiums.map((_, i) => `Plan ${i + 1}`)].map(h => (
                            <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { key: 'basic',   label: 'Basic Premium (LKR)' },
                          { key: 'tax_pct', label: 'Tax (%)' },
                          { key: 'tax',     label: 'Tax Amount (LKR)', readOnly: true },
                          { key: 'total',   label: 'Total Premium (LKR)', readOnly: true, bold: true },
                        ].map(row => (
                          <tr key={row.key} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', background: row.bold ? 'rgba(8,145,178,0.05)' : '#fff' }}>
                            <td style={{ padding: '8px 12px', fontSize: 13, fontWeight: row.bold ? 700 : 500, color: row.bold ? '#0891b2' : '#374151', minWidth: 160 }}>{row.label}</td>
                            {planPremiums.map((p, pi) => (
                              <td key={pi} style={{ padding: '6px 10px', minWidth: 110 }}>
                                {row.readOnly ? (
                                  <Typography sx={{ fontSize: 13.5, fontWeight: row.bold ? 800 : 500, color: row.bold ? '#0891b2' : '#374151', pl: 0.5 }}>
                                    {Number(p[row.key] || 0).toLocaleString()}
                                  </Typography>
                                ) : (
                                  <TextField size="small" type="number" fullWidth placeholder="0"
                                    value={p[row.key] || ''}
                                    onChange={e => updatePlanPremium(pi, row.key, e.target.value)}
                                    sx={{ '& .MuiInputBase-root': { fontSize: 13 } }} />
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                  <Box sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid rgba(8,145,178,0.2)', bgcolor: 'rgba(8,145,178,0.04)' }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Grand Total (All Plans)</Typography>
                    <Typography sx={{ fontSize: 17, fontWeight: 800, color: '#0891b2' }}>
                      LKR {planPremiums.reduce((s, p) => s + (Number(p.total) || 0), 0).toLocaleString()}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                /* ── Standard premium breakdown ── */
                <Box sx={{
                  p: 2, borderRadius: '12px',
                  border: `1px solid ${['basic_premium','srcc_premium','tc_premium','admin_fee','vat_amount'].some(k => fieldErrors[k]) ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.15)'}`,
                  bgcolor: 'rgba(59,130,246,0.02)',
                }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5 }}>
                    Premium Breakdown
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <TextField label="Basic Premium (LKR) *" type="number" size="small" fullWidth
                      error={!!fieldErrors.basic_premium} helperText={fieldErrors.basic_premium}
                      value={form.basic_premium} onChange={e => setFE('basic_premium', e.target.value)} />
                    <TextField label="Strike Riot Civil Commotion — SRCC (LKR)" type="number" size="small" fullWidth
                      error={!!fieldErrors.srcc_premium} helperText={fieldErrors.srcc_premium}
                      value={form.srcc_premium} onChange={e => setFE('srcc_premium', e.target.value)} />
                    <TextField label="Terrorism Cover — TC (LKR)" type="number" size="small" fullWidth
                      error={!!fieldErrors.tc_premium} helperText={fieldErrors.tc_premium}
                      value={form.tc_premium} onChange={e => setFE('tc_premium', e.target.value)} />
                    <TextField label="Policy Fees (LKR)" type="number" size="small" fullWidth
                      value={form.policy_fees} onChange={e => setFE('policy_fees', e.target.value)} />
                    <TextField label="Cess (LKR)" type="number" size="small" fullWidth
                      value={form.cess} onChange={e => setFE('cess', e.target.value)} />
                    <TextField label="Road Safety Tax (LKR)" type="number" size="small" fullWidth
                      value={form.road_safety_tax} onChange={e => setFE('road_safety_tax', e.target.value)} />
                    <TextField label="Stamp Fee (LKR)" type="number" size="small" fullWidth
                      value={form.stamp_fee} onChange={e => setFE('stamp_fee', e.target.value)} />
                    <TextField label="NBL (LKR)" type="number" size="small" fullWidth
                      value={form.nbl} onChange={e => setFE('nbl', e.target.value)} />
                    <TextField label="SSC Levy (LKR)" type="number" size="small" fullWidth
                      value={form.ssc_levy} onChange={e => setFE('ssc_levy', e.target.value)} />
                    <TextField label="Admin Fee (LKR)" type="number" size="small" fullWidth
                      error={!!fieldErrors.admin_fee} helperText={fieldErrors.admin_fee}
                      value={form.admin_fee} onChange={e => setFE('admin_fee', e.target.value)} />
                    <TextField label="VAT (LKR)" type="number" size="small" fullWidth
                      error={!!fieldErrors.vat_amount} helperText={fieldErrors.vat_amount}
                      value={form.vat_amount} onChange={e => setFE('vat_amount', e.target.value)} />
                    <TextField label="Other (LKR)" type="number" size="small" fullWidth
                      value={form.other_premium} onChange={e => setFE('other_premium', e.target.value)} />
                  </Box>
                  <Box sx={{ mt: 1.5, p: 1.5, borderRadius: '8px', bgcolor: 'rgba(59,130,246,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Total Premium (LKR)</Typography>
                    <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#3B82F6' }}>
                      {totalPremium > 0 ? totalPremium.toLocaleString() : '—'}
                    </Typography>
                  </Box>
                </Box>
              )}

              {/* Deductibles & Excesses */}
              <Box sx={{ p: 2, borderRadius: '12px', border: `1px solid ${fieldErrors.deductible ? 'rgba(239,68,68,0.4)' : 'rgba(0,0,0,0.1)'}` }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5 }}>
                  Deductibles & Excesses
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  <TextField label="Deductibles *" size="small" fullWidth
                    error={!!fieldErrors.deductible} helperText={fieldErrors.deductible}
                    value={form.deductible} onChange={e => setFE('deductible', e.target.value)} />
                  <TextField label="Excesses" size="small" fullWidth
                    value={form.excesses} onChange={e => setFE('excesses', e.target.value)} />
                </Box>
              </Box>

              {/* Commission */}
              <Box>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: fieldErrors.commission_type ? '#ef4444' : '#6B7280', mb: 0.8 }}>
                  Commission Type *
                  <Box component="span" sx={{ ml: 1, px: 0.8, py: 0.2, borderRadius: '4px', bgcolor: 'rgba(99,102,241,0.1)', color: '#6366f1', fontSize: 10, fontWeight: 700 }}>
                    FOR BROKER USE ONLY
                  </Box>
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, border: fieldErrors.commission_type ? '1px solid #ef4444' : 'none', borderRadius: '8px', p: fieldErrors.commission_type ? 0.5 : 0 }}>
                  {['Standard', 'Special'].map(opt => (
                    <Box key={opt} onClick={() => setFE('commission_type', opt)}
                      sx={{
                        flex: 1, py: 1, textAlign: 'center', borderRadius: '8px', cursor: 'pointer',
                        border: `1.5px solid ${form.commission_type === opt ? '#6366f1' : 'rgba(0,0,0,0.12)'}`,
                        bgcolor: form.commission_type === opt ? 'rgba(99,102,241,0.08)' : 'transparent',
                        color: form.commission_type === opt ? '#6366f1' : '#6B7280',
                        fontWeight: form.commission_type === opt ? 700 : 400, fontSize: 13,
                        transition: 'all 0.15s ease',
                      }}>
                      {opt}
                    </Box>
                  ))}
                </Box>
                {fieldErrors.commission_type && <Typography sx={{ fontSize: 11, color: '#ef4444', mt: 0.5, ml: 0.5 }}>{fieldErrors.commission_type}</Typography>}
              </Box>

              <TextField label="Quote Validity (days) *" type="number" fullWidth size="small"
                error={!!fieldErrors.validity_days} helperText={fieldErrors.validity_days}
                value={form.validity_days} onChange={e => setFE('validity_days', e.target.value)} />

              <TextField label="Notes / Terms & Conditions" multiline minRows={3} fullWidth size="small"
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />

              {/* File upload */}
              <Box>
                <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#374151', mb: 1 }}>
                  Upload Your Quotation Document (PDF / Image)
                </Typography>
                <Box
                  onClick={() => document.getElementById('quote-file-input').click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                  sx={{
                    border: `2px dashed ${fileUrl ? '#10B981' : 'rgba(99,102,241,0.35)'}`,
                    borderRadius: '12px', p: 2.5, cursor: 'pointer', textAlign: 'center',
                    bgcolor: fileUrl ? 'rgba(16,185,129,0.04)' : '#FAFAFA',
                    transition: 'all 0.2s ease',
                    '&:hover': { borderColor: '#6366f1', bgcolor: 'rgba(99,102,241,0.04)' },
                  }}>
                  <input id="quote-file-input" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                    style={{ display: 'none' }}
                    onChange={e => handleFile(e.target.files[0])} />
                  {uploading ? (
                    <Box>
                      <Typography sx={{ fontSize: 13, color: '#6B7280', mb: 1 }}>Uploading…</Typography>
                      <LinearProgress variant="determinate" value={uploadPct}
                        sx={{ borderRadius: 4, '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg,#3B82F6,#6366f1)' } }} />
                    </Box>
                  ) : fileUrl ? (
                    <Typography sx={{ fontSize: 13, color: '#10B981', fontWeight: 600 }}>
                      ✓ {fileName || 'Document uploaded'}
                    </Typography>
                  ) : (
                    <Box>
                      <UploadFileIcon sx={{ color: '#6366f1', fontSize: 32, mb: 0.5 }} />
                      <Typography sx={{ fontSize: 13, color: '#6B7280' }}>
                        Click or drag & drop your standard quotation document
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: '#9CA3AF', mt: 0.3 }}>PDF, JPG, PNG — max 20 MB</Typography>
                    </Box>
                  )}
                </Box>
              </Box>

            </Stack>

            <Button fullWidth variant="contained" onClick={handleSubmit} disabled={saving || uploading || declining}
              sx={{ mt: 3, py: 1.3, fontSize: 14, fontWeight: 700, background: 'linear-gradient(135deg,#3B82F6,#6366f1)' }}>
              {saving ? 'Submitting…' : editing ? 'Update Quotation' : 'Submit Quotation'}
            </Button>

            {!editing && (
              <Button fullWidth variant="text" onClick={() => setDeclineOpen(true)} disabled={saving || uploading || declining}
                sx={{ mt: 1.2, py: 1, fontSize: 13, fontWeight: 600, color: '#6B7280', '&:hover': { bgcolor: 'rgba(107,114,128,0.06)' } }}>
                Can't quote this risk? Decline the request
              </Button>
            )}

            <Typography sx={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', mt: 2 }}>
              Your submission is securely transmitted to InsureSAAS and tracked in real-time.
            </Typography>
          </CardContent>
        </Card>

        <Typography sx={{ fontSize: 11.5, color: '#9CA3AF', textAlign: 'center', mt: 3 }}>
          InsureSAAS Ltd — Confidential Quotation Portal
        </Typography>
      </Box>

      {/* Decline dialog */}
      <Dialog open={declineOpen} onClose={() => !declining && setDeclineOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
          <WarningAmberRoundedIcon sx={{ color: '#6B7280', fontSize: 22 }} />
          <span>Decline this request</span>
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: '#6B7280', mb: 2 }}>
            Let InsureSAAS know you cannot offer terms for this risk. This is recorded against your company for this request.
          </Typography>
          <TextField fullWidth size="small" multiline rows={3}
            label="Reason for declining"
            placeholder="e.g. Outside our underwriting guidelines / risk not accepted"
            value={declineReason}
            onChange={e => setDeclineReason(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeclineOpen(false)} disabled={declining} sx={{ color: '#6B7280' }}>Cancel</Button>
          <Button variant="contained" onClick={handleDecline} disabled={declining}
            sx={{ background: 'linear-gradient(135deg,#6B7280,#4B5563)' }}>
            {declining ? 'Submitting…' : 'Decline Request'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Validation dialog */}
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
            Fields with issues are highlighted above.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="contained" onClick={() => setValOpen(false)}
            sx={{ background: 'linear-gradient(135deg,#3B82F6,#6366f1)', minWidth: 100 }}>
            OK, fix them
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default QuoteResponsePage;
