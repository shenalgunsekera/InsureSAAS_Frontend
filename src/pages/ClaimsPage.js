import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import { uploadFile, openFile } from '../storage';
import { logActivity } from '../utils/workSession';
import { confirmTypedDelete } from '../utils/confirmDelete';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Collapse from '@mui/material/Collapse';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Skeleton from '@mui/material/Skeleton';
import Pagination from '@mui/material/Pagination';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import LinearProgress from '@mui/material/LinearProgress';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PostAddOutlinedIcon from '@mui/icons-material/PostAddOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import { buildClaimsCsv, buildClaimsTemplate, parseClaimsCsv, matchClaimDoc } from '../utils/claimsIo';

const BRAND_PREFIX = 'insuresaas';
const ACCENT = '#255EAB';
const downloadFile = (content, filename, type = 'text/csv;charset=utf-8;') => {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
};

/* ── Claim process tracker: the 24-step workflow ─────────────────────────────
   Controlled component: parent owns the tracker object and decides how it is
   persisted (immediately to Firestore on the card, or into form state in the
   register dialog). Each step has a status dropdown; a "positive" status
   (anything other than No / Pending / blank) reveals a multi-file uploader so
   supporting documents and images can be attached, with an Add button for more. */
const TRACKER_STEPS = [
  { key: 'claim_intimated',            label: 'Claim Intimated' },
  { key: 'claim_number_created',       label: 'Claim Number Created' },
  { key: 'surveyor_assigned',          label: 'Surveyor / Inspection Assigned' },
  { key: 'inspection_completed',       label: 'Inspection Completed' },
  { key: 'documents_requested',        label: 'Documents Requested' },
  { key: 'customer_informed',          label: 'Customer Informed' },
  { key: 'documents_received',         label: 'Documents Received' },
  { key: 'documents_verified',         label: 'Documents Verified' },
  { key: 'documents_submitted_insurer',label: 'Documents Submitted to Insurer' },
  { key: 'claim_under_assessment',     label: 'Claim Under Assessment', options: ['Pending', 'In Progress', 'Completed'] },
  { key: 'further_queries_raised',     label: 'Further Queries Raised' },
  { key: 'query_response_submitted',   label: 'Query Response Submitted' },
  { key: 'offer_received',             label: 'Offer Received' },
  { key: 'dispute_raised',             label: 'Dispute Raised' },
  { key: 'negotiation_history',        label: 'Negotiation History', options: ['Ongoing', 'Concluded'] },
  { key: 'final_offer_received',       label: 'Final Offer Received' },
  { key: 'customer_acceptance',        label: 'Customer Acceptance' },
  { key: 'payment_released',           label: 'Payment Released' },
  { key: 'payment_received',           label: 'Payment Received' },
  { key: 'receipt_issued',             label: 'Receipt Issued' },
  { key: 'claim_closed',               label: 'Claim Closed' },
  { key: 'customer_satisfaction_survey',label: 'Customer Satisfaction Survey' },
  { key: 'lessons_learned',            label: 'Lessons Learned' },
];
const YESNO = ['Yes', 'No'];
const allowsUpload = (v) => !!v && v !== 'No' && v !== 'Pending';

// Each tracker step belongs to a status stage. The claim status auto-advances to
// the stage of the FURTHEST completed step, so the chip keeps pace with the work
// done. Ordered low → high; 'Rejected' is a manual outcome with no step.
const STATUS_ORDER = ['Filed', 'Investigating', 'Under Review', 'Approved', 'Settled'];
const STEP_STAGE = {
  claim_intimated: 'Filed', claim_number_created: 'Filed',
  surveyor_assigned: 'Investigating', inspection_completed: 'Investigating',
  documents_requested: 'Under Review', customer_informed: 'Under Review',
  documents_received: 'Under Review', documents_verified: 'Under Review',
  documents_submitted_insurer: 'Under Review', claim_under_assessment: 'Under Review',
  further_queries_raised: 'Under Review', query_response_submitted: 'Under Review',
  offer_received: 'Approved', dispute_raised: 'Approved', negotiation_history: 'Approved',
  final_offer_received: 'Approved', customer_acceptance: 'Approved', payment_released: 'Approved',
  payment_received: 'Settled', receipt_issued: 'Settled', claim_closed: 'Settled',
  customer_satisfaction_survey: 'Settled', lessons_learned: 'Settled',
};
const isPos = (v) => !!v && v !== 'No' && v !== 'Pending';
// Highest stage reached across all completed steps ('' when nothing is done yet).
function deriveClaimStatus(tracker = {}) {
  let best = -1;
  Object.keys(STEP_STAGE).forEach(k => {
    if (isPos(tracker[k]?.value)) best = Math.max(best, STATUS_ORDER.indexOf(STEP_STAGE[k]));
  });
  return best >= 0 ? STATUS_ORDER[best] : 'Filed';
}

function ClaimProcessTracker({ value, onChange, claimId, brandPrefix, accent }) {
  const [busy, setBusy] = useState('');
  const [noteDrafts, setNoteDrafts] = useState({});
  const tracker = value || {};

  const setValue = (key, v) =>
    onChange({ ...tracker, [key]: { ...(tracker[key] || {}), value: v } });

  const commitNote = (key, v) =>
    onChange({ ...tracker, [key]: { ...(tracker[key] || {}), note: v } });

  const addLink = (key) => {
    const raw = window.prompt('Paste one or more video / document links (YouTube, Drive, etc.).\nSeparate multiple links with a new line, comma or space.') || '';
    const added = raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean)
      .map(u => ({ url: /^https?:\/\//i.test(u) ? u : `https://${u}` }));
    if (!added.length) return;
    onChange({ ...tracker, [key]: { ...(tracker[key] || {}), links: [...(tracker[key]?.links || []), ...added] } });
  };

  const removeLink = (key, idx) =>
    onChange({ ...tracker, [key]: { ...(tracker[key] || {}), links: (tracker[key]?.links || []).filter((_, i) => i !== idx) } });

  const addFiles = async (key, fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setBusy(key);
    const added = [];
    for (const file of files) {
      try {
        const url = await uploadFile(file, `${brandPrefix}/docs/claims/${claimId}/${key}`, undefined, file.name);
        added.push({ url, name: file.name });
      } catch (_) { /* skip failed file */ }
    }
    onChange({ ...tracker, [key]: { ...(tracker[key] || {}), docs: [...(tracker[key]?.docs || []), ...added] } });
    setBusy('');
  };

  const removeDoc = (key, idx) =>
    onChange({ ...tracker, [key]: { ...(tracker[key] || {}), docs: (tracker[key]?.docs || []).filter((_, i) => i !== idx) } });

  const progressed = TRACKER_STEPS.filter(s => allowsUpload(tracker[s.key]?.value)).length;

  return (
    <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed rgba(0,0,0,0.12)' }}>
      <Typography sx={{ fontSize: 11, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: 1, mb: 1.5 }}>
        Claim Process Tracker — {progressed}/{TRACKER_STEPS.length} progressed
      </Typography>
      <Stack spacing={0.8}>
        {TRACKER_STEPS.map((step, i) => {
          const st = tracker[step.key] || {};
          const opts = step.options || YESNO;
          const showUp = allowsUpload(st.value);
          const docs = st.docs || [];
          const links = st.links || [];
          return (
            <Box key={step.key} sx={{ p: 1.1, borderRadius: '10px',
                    border: '1px solid rgba(0,0,0,0.06)', bgcolor: showUp ? `${accent}0D` : 'transparent' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#374151', flex: 1, minWidth: 170 }}>
                  {i + 1}. {step.label}
                </Typography>
                <FormControl size="small" sx={{ minWidth: 148 }}>
                  <Select value={st.value || ''} displayEmpty onChange={e => setValue(step.key, e.target.value)}
                    sx={{ fontSize: 12.5 }}>
                    <MenuItem value=""><em>—</em></MenuItem>
                    {opts.map(o => <MenuItem key={o} value={o} sx={{ fontSize: 12.5 }}>{o}</MenuItem>)}
                  </Select>
                </FormControl>
                {showUp && (
                  <Button component="label" size="small" variant="outlined" disabled={busy === step.key}
                    startIcon={<UploadFileOutlinedIcon sx={{ fontSize: 15 }} />}
                    sx={{ fontSize: 11, borderColor: `${accent}55`, color: accent, whiteSpace: 'nowrap' }}>
                    {busy === step.key ? 'Uploading…' : 'Add files'}
                    <input hidden type="file" multiple accept="image/*,application/pdf"
                      onChange={e => { addFiles(step.key, e.target.files); e.target.value = ''; }} />
                  </Button>
                )}
                {showUp && (
                  <Button size="small" variant="outlined" onClick={() => addLink(step.key)}
                    startIcon={<LinkOutlinedIcon sx={{ fontSize: 15 }} />}
                    sx={{ fontSize: 11, borderColor: `${accent}55`, color: accent, whiteSpace: 'nowrap' }}>
                    Add link
                  </Button>
                )}
              </Box>
              {(docs.length > 0 || links.length > 0) && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, mt: 1 }}>
                  {docs.map((d, di) => (
                    <Chip key={'d' + di} size="small" icon={<DescriptionOutlinedIcon sx={{ fontSize: 14 }} />}
                      label={d.name || `File ${di + 1}`}
                      onClick={() => openFile(d.url)} onDelete={() => removeDoc(step.key, di)}
                      sx={{ fontSize: 11, maxWidth: 220, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} />
                  ))}
                  {links.map((l, li) => (
                    <Chip key={'l' + li} size="small" icon={<LinkOutlinedIcon sx={{ fontSize: 14 }} />}
                      label={l.name || l.url.replace(/^https?:\/\//, '').slice(0, 34)}
                      onClick={() => window.open(l.url, '_blank', 'noopener')} onDelete={() => removeLink(step.key, li)}
                      sx={{ fontSize: 11, maxWidth: 220, bgcolor: `${accent}12`, color: accent, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} />
                  ))}
                </Box>
              )}
              {showUp && (
                <TextField size="small" fullWidth multiline placeholder="Notes for this step (optional)…"
                  value={noteDrafts[step.key] ?? (st.note || '')}
                  onChange={e => setNoteDrafts(d => ({ ...d, [step.key]: e.target.value }))}
                  onBlur={e => commitNote(step.key, e.target.value)}
                  sx={{ mt: 1, '& .MuiOutlinedInput-root': { fontSize: 12, borderRadius: '8px' } }} />
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

const STATUS_CONFIG = {
  'Filed':        { color: '#6366f1', bg: 'rgba(99,102,241,0.10)' },
  'Under Review': { color: '#d97706', bg: 'rgba(245,158,11,0.10)' },
  'Investigating':{ color: '#0ea5e9', bg: 'rgba(14,165,233,0.10)' },
  'Approved':     { color: '#059669', bg: 'rgba(16,185,129,0.10)' },
  'Settled':      { color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  'Rejected':     { color: '#dc2626', bg: 'rgba(239,68,68,0.10)'  },
};

function ClaimCard({ claim, onUpdate, onDelete, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [status, setStatus] = useState(claim.status);
  const [notes, setNotes] = useState(claim.notes || '');
  const [settlement, setSettlement] = useState(claim.settlement_amount || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [tracker, setTracker] = useState(claim.process_tracker || {});
  const [core, setCore] = useState({
    claim_ref_id:  claim.claim_ref_id  || '',
    client_name:   claim.client_name   || '',
    policy_no:     claim.policy_no      || '',
    product:       claim.product        || '',
    incident_date: claim.incident_date  || '',
    cause:         claim.cause          || '',
    loss_amount:   claim.loss_amount    || '',
    description:   claim.description     || '',
  });
  const setC = (k, v) => setCore(c => ({ ...c, [k]: v }));
  const s = STATUS_CONFIG[claim.status] || STATUS_CONFIG['Filed'];
  const filed = claim.created_at?.toDate?.()
    ? claim.created_at.toDate().toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
    : '—';

  const [disputeOpen, setDisputeOpen] = useState(false);

  // Tracker edits on the card persist to Firestore immediately.
  const persistTracker = async (next) => {
    // A dispute can resolve either way (Approved or Rejected), so when it's first
    // raised we never auto-advance — we ask the user to set the status by hand.
    const disputeJustRaised = isPos(next.dispute_raised?.value) && !isPos(tracker.dispute_raised?.value);
    setTracker(next);
    const derived = deriveClaimStatus(next);
    const patch = { process_tracker: next, updated_at: serverTimestamp() };
    // Auto-advance the status to match tracker progress. Rejected is a manual
    // state (there is no tracker step for it), so never override it automatically.
    if (disputeJustRaised) {
      setDisputeOpen(true);
    } else if (derived && derived !== status && status !== 'Rejected') {
      patch.status = derived;
      setStatus(derived);
      onUpdate?.(claim.id, { status: derived });
    }
    try { await updateDoc(doc(db, 'claims', claim.id), patch); }
    catch (_) { /* ignore */ }
  };

  // Manual status pick after a dispute is raised.
  const chooseDisputeStatus = async (newStatus) => {
    setStatus(newStatus);
    setDisputeOpen(false);
    onUpdate?.(claim.id, { status: newStatus });
    try { await updateDoc(doc(db, 'claims', claim.id), { status: newStatus, updated_at: serverTimestamp() }); }
    catch (_) { /* ignore */ }
  };

  const save = async () => {
    setSaving(true);
    const patch = { ...core, status, notes, settlement_amount: settlement, updated_at: serverTimestamp() };
    await updateDoc(doc(db, 'claims', claim.id), patch);
    onUpdate(claim.id, { ...core, status, notes, settlement_amount: settlement });
    setSaving(false);
  };

  const del = async () => {
    if (!confirmTypedDelete(`Delete claim ${claim.reference}${claim.client_name ? ` (${claim.client_name})` : ''}? This removes the claim and its process tracker.`)) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'claims', claim.id));
      logActivity(`Deleted claim ${claim.reference}`);
      onDelete?.(claim.id);
    } catch (_) { setDeleting(false); }
  };

  return (
    <Card sx={{ mb: 1.5, border: '1px solid rgba(56,163,224,0.12)' }}>
      <CardContent sx={{ p:0,'&:last-child':{pb:0} }}>
        <Box sx={{ px:2.5, py:1.5, display:'flex', alignItems:'center', gap:1.5,
                    cursor:'pointer','&:hover':{bgcolor:'rgba(37,94,171,0.02)'} }}
             onClick={() => setOpen(o=>!o)}>
          <Box sx={{ flex:1, minWidth:0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb:0.3 }}>
              <Typography sx={{ fontWeight:700, fontSize:14 }}>{claim.reference}</Typography>
              {claim.claim_ref_id && (
                <Chip label={`Ref: ${claim.claim_ref_id}`} size="small" sx={{ bgcolor:'rgba(37,94,171,0.10)', color:'#255EAB', fontWeight:700, fontSize:10.5 }} />
              )}
              <Chip label={claim.status} size="small" sx={{ bgcolor:s.bg, color:s.color, fontWeight:700, fontSize:10.5 }} />
            </Stack>
            <Typography sx={{ fontSize:12, color:'#9CA3AF' }}>
              {claim.client_name} · {claim.policy_no} · Filed: {filed}
            </Typography>
          </Box>
          <Box sx={{ display:'flex', gap:{ xs:1.5, sm:3 }, flexShrink:0, lineHeight:1.25 }}>
            <Box sx={{ textAlign:'right' }}>
              <Typography sx={{ fontSize:9.5, fontWeight:800, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:0.4 }}>Est. Loss</Typography>
              <Typography sx={{ fontWeight:800, fontSize:14, color:'#255EAB', whiteSpace:'nowrap' }}>
                {claim.loss_amount ? `LKR ${Number(claim.loss_amount).toLocaleString()}` : '—'}
              </Typography>
            </Box>
            <Box sx={{ textAlign:'right' }}>
              <Typography sx={{ fontSize:9.5, fontWeight:800, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:0.4 }}>Settled</Typography>
              <Typography sx={{ fontWeight:800, fontSize:14, color:'#059669', whiteSpace:'nowrap' }}>
                {claim.settlement_amount ? `LKR ${Number(claim.settlement_amount).toLocaleString()}` : '—'}
              </Typography>
            </Box>
          </Box>
          {open ? <ExpandLessIcon sx={{ color:'#9CA3AF' }} /> : <ExpandMoreIcon sx={{ color:'#9CA3AF' }} />}
        </Box>
        <Collapse in={open} timeout={220} unmountOnExit>
          <Box sx={{ px:2.5, pb:2.5, pt:0.5, borderTop:'1px solid rgba(56,163,224,0.08)' }}>
            <Typography sx={{ fontSize:11, fontWeight:800, color:'#255EAB', textTransform:'uppercase', letterSpacing:1, mb:1 }}>Claim Reference</Typography>
            <Box sx={{ mb:2 }}>
              <TextField size="small" label="Claim Ref ID" value={core.claim_ref_id} onChange={e=>setC('claim_ref_id', e.target.value)} sx={{ width:{ xs:'100%', sm:'50%' } }} />
            </Box>
            <Typography sx={{ fontSize:11, fontWeight:800, color:'#255EAB', textTransform:'uppercase', letterSpacing:1, mb:1 }}>Claim Details</Typography>
            <Box sx={{ display:'grid', gridTemplateColumns:{ xs:'1fr', sm:'1fr 1fr' }, gap:1.5, mb:2 }}>
              <TextField size="small" label="Client Name" value={core.client_name} onChange={e=>setC('client_name', e.target.value)} />
              <TextField size="small" label="Policy No" value={core.policy_no} onChange={e=>setC('policy_no', e.target.value)} />
              <TextField size="small" label="Product / Class" value={core.product} onChange={e=>setC('product', e.target.value)} />
              <TextField size="small" label="Incident Date" type="date" InputLabelProps={{ shrink:true }} value={core.incident_date} onChange={e=>setC('incident_date', e.target.value)} />
              <TextField size="small" label="Estimated Loss (LKR)" type="number" inputProps={{ step:'any', inputMode:'decimal' }} value={core.loss_amount} onChange={e=>setC('loss_amount', e.target.value)} />
              <TextField size="small" label="Cause of Loss" value={core.cause} onChange={e=>setC('cause', e.target.value)} />
              <TextField size="small" label="Loss Description" multiline minRows={2} sx={{ gridColumn:{ sm:'1 / -1' } }} value={core.description} onChange={e=>setC('description', e.target.value)} />
            </Box>
            <Stack direction={{ xs:'column', sm:'row' }} spacing={1.5} alignItems="flex-start">
              <FormControl size="small" sx={{ minWidth:160 }}>
                <InputLabel>Status</InputLabel>
                <Select value={status} label="Status" onChange={e=>setStatus(e.target.value)}>
                  {Object.keys(STATUS_CONFIG).map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField size="small" label="Settlement Amount (LKR)" type="number" inputProps={{ step:'any', inputMode:'decimal' }}
                value={settlement} onChange={e=>setSettlement(e.target.value)} />
              <TextField size="small" label="Internal Notes" multiline minRows={2} fullWidth
                value={notes} onChange={e=>setNotes(e.target.value)} />
            </Stack>
            <Stack direction="row" spacing={1.5} justifyContent="flex-end" sx={{ mt:1.5 }}>
              <Button variant="outlined" color="error" size="small" onClick={del} disabled={deleting || saving}
                sx={{ borderColor:'rgba(239,68,68,0.4)' }}>
                {deleting ? 'Deleting…' : 'Delete Claim'}
              </Button>
              <Button variant="contained" size="small" onClick={save} disabled={saving || deleting}>
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </Stack>

            <ClaimProcessTracker value={tracker} onChange={persistTracker} claimId={claim.id} brandPrefix={BRAND_PREFIX} accent={ACCENT} />
          </Box>
        </Collapse>
      </CardContent>

      {/* Dispute raised — the outcome can go either way, so the user chooses. */}
      <Dialog open={disputeOpen} onClose={() => setDisputeOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, fontSize: 16 }}>Dispute Raised</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13, color: '#4B5563' }}>
            A dispute can end in the claim being settled or rejected, so the status isn't
            advanced automatically. Please set it manually for <strong>{claim.reference}</strong>.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap' }}>
          <Button size="small" onClick={() => setDisputeOpen(false)} sx={{ color: '#6B7280' }}>Decide later</Button>
          <Box sx={{ flex: 1 }} />
          <Button size="small" variant="outlined" color="error" onClick={() => chooseDisputeStatus('Rejected')}>Rejected</Button>
          <Button size="small" variant="contained" color="success" onClick={() => chooseDisputeStatus('Settled')}>Settled</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

const EMPTY_FORM = {
  claim_ref_id:'', client_name:'', policy_no:'', product:'', incident_date:'',
  cause:'', description:'', loss_amount:'',
};

const ClaimsPage = () => {
  const { user, userProfile } = useAuth();
  const [claims,   setClaims]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [open,     setOpen]     = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState({ open:false, msg:'', severity:'success' });
  const [justCreatedId, setJustCreatedId] = useState(null);
  const [cPage,    setCPage]    = useState(1);
  const C_PER_PAGE = 15;
  const [search,   setSearch]   = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [regTracker, setRegTracker] = useState({});
  const [newClaimRef, setNewClaimRef] = useState(null);

  const load = useCallback(async () => {
    const q = query(collection(db,'claims'), orderBy('created_at','desc'));
    const snap = await getDocs(q);
    setClaims(snap.docs.map(d=>({id:d.id,...d.data()})));
    setLoading(false);
  },[]);

  useEffect(()=>{ load(); },[load]);

  // Reset to first page whenever the search/filter narrows the list.
  useEffect(()=>{ setCPage(1); },[search, statusFilter]);

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  // Pre-mint the claim's document id so the tracker can upload files (which
  // need a stable storage path) before the claim doc is written.
  const openRegister = () => {
    setForm(EMPTY_FORM);
    setRegTracker({});
    setNewClaimRef(doc(collection(db,'claims')));
    setOpen(true);
  };

  const handleCreate = async () => {
    if (!form.client_name||!form.incident_date) {
      setToast({open:true, msg:'Client name and incident date are required', severity:'error'}); return;
    }
    setSaving(true);
    const ref = `CLM-${Date.now().toString().slice(-6)}`;
    const claimRef = newClaimRef || doc(collection(db,'claims'));
    await setDoc(claimRef, {
      ...form, reference:ref, status:'Filed', process_tracker: regTracker,
      created_by: user?.uid||'', created_by_name: userProfile?.full_name||'',
      created_at: serverTimestamp(), updated_at: serverTimestamp(),
    });
    logActivity(`Registered claim ${ref}${form.client_name ? ` for ${form.client_name}` : ''}`);
    setForm(EMPTY_FORM);
    setRegTracker({});
    setNewClaimRef(null);
    setOpen(false);
    setSaving(false);
    setJustCreatedId(claimRef.id); // auto-expand the new claim so the tracker is right there
    setToast({open:true, msg:'Claim registered.', severity:'success'});
    load();
  };

  const stats = {
    filed:    claims.filter(c=>c.status==='Filed').length,
    active:   claims.filter(c=>['Under Review','Investigating'].includes(c.status)).length,
    settled:  claims.filter(c=>c.status==='Settled').length,
    rejected: claims.filter(c=>c.status==='Rejected').length,
  };

  /* ── Import / export ─────────────────────────────────────────────────── */
  const [csvImporting,     setCsvImporting]     = useState(false);
  const [csvErrOpen,       setCsvErrOpen]       = useState(false);
  const [importErrors,     setImportErrors]     = useState([]);
  const [docImportOpen,    setDocImportOpen]    = useState(false);
  const [docImportItems,   setDocImportItems]   = useState([]);
  const [docImportRunning, setDocImportRunning] = useState(false);
  const [docImportProgress,setDocImportProgress]= useState({ done: 0, total: 0 });

  const handleExportCsv = () => {
    if (!claims.length) { setToast({ open:true, msg:'No claims to export.', severity:'info' }); return; }
    downloadFile(buildClaimsCsv(claims), `Claims_Export_${new Date().toISOString().slice(0,10)}.csv`);
  };
  const handleDownloadTemplate = () => downloadFile(buildClaimsTemplate(), 'Claims_Import_Template.csv');

  const handleImportCsv = async (file) => {
    if (!file) return;
    setCsvImporting(true);
    try {
      const text = await file.text();
      const { rows, errors } = parseClaimsCsv(text);
      if (!rows.length) {
        setImportErrors(errors.length ? errors : ['No valid claim rows were found in the file.']);
        setCsvErrOpen(true); setCsvImporting(false); return;
      }
      let created = 0;
      for (const row of rows) {
        const { process_tracker, created_at, id, ...rest } = row;   // eslint-disable-line no-unused-vars
        const ref = rest.reference || `CLM-${Date.now().toString().slice(-6)}-${created}`;
        const claimRef = doc(collection(db, 'claims'));
        await setDoc(claimRef, {
          ...rest,
          reference:       ref,
          status:          rest.status || 'Filed',
          process_tracker: process_tracker || {},
          created_by:      user?.uid || '',
          created_by_name: rest.created_by_name || userProfile?.full_name || 'Imported',
          created_at:      created_at && !isNaN(new Date(created_at)) ? new Date(created_at) : serverTimestamp(),
          updated_at:      serverTimestamp(),
        });
        created++;
      }
      logActivity(`Imported ${created} claim(s) from CSV`);
      setToast({ open:true, severity: errors.length ? 'warning' : 'success',
        msg:`Imported ${created} claim(s).${errors.length ? ` ${errors.length} row(s) skipped.` : ''}` });
      if (errors.length) { setImportErrors(errors); setCsvErrOpen(true); }
      load();
    } catch (err) {
      setToast({ open:true, msg:`Import failed: ${err.message || err}`, severity:'error' });
    }
    setCsvImporting(false);
  };

  const onDocFilesSelected = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setDocImportItems(files.map(file => {
      const m = matchClaimDoc(file.name, claims);
      return m
        ? { file, matched:true, claim:m.claim, step:m.step, status:'' }
        : { file, matched:false, reason:'No matching claim reference', status:'' };
    }));
    setDocImportProgress({ done:0, total:0 });
    setDocImportOpen(true);
  };

  const runDocImport = async () => {
    setDocImportRunning(true);
    const items = docImportItems;
    const toDo = items.filter(it => it.matched && it.status !== 'done');
    const byClaim = {};
    let done = 0;
    for (const it of toDo) {
      try {
        const url = await uploadFile(it.file, `${BRAND_PREFIX}/docs/claims/${it.claim.id}/${it.step}`, undefined, it.file.name);
        (byClaim[it.claim.id] = byClaim[it.claim.id] || { claim: it.claim, adds: {} });
        (byClaim[it.claim.id].adds[it.step] = byClaim[it.claim.id].adds[it.step] || []).push({ url, name: it.file.name });
        it.status = 'done';
      } catch { it.status = 'error'; }
      done++; setDocImportProgress({ done, total: toDo.length });
      setDocImportItems([...items]);
    }
    for (const { claim, adds } of Object.values(byClaim)) {
      const tracker = { ...(claim.process_tracker || {}) };
      Object.entries(adds).forEach(([step, docs]) => {
        tracker[step] = { ...(tracker[step] || {}), docs: [...(tracker[step]?.docs || []), ...docs] };
      });
      try { await updateDoc(doc(db, 'claims', claim.id), { process_tracker: tracker, updated_at: serverTimestamp() }); } catch { /* keep going */ }
    }
    setDocImportRunning(false);
    const ok = items.filter(it => it.status === 'done').length;
    setToast({ open:true, msg:`Attached ${ok} document(s) to claims.`, severity: ok ? 'success' : 'error' });
    load();
  };

  const filtered = claims.filter(c => {
    if (statusFilter !== 'All' && c.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hay = `${c.reference||''} ${c.client_name||''} ${c.policy_no||''} ${c.product||''} ${c.cause||''}`.toLowerCase();
    return hay.includes(q);
  });
  const pageCount = Math.ceil(filtered.length / C_PER_PAGE);
  const pageClaims = filtered.slice((cPage-1)*C_PER_PAGE, cPage*C_PER_PAGE);

  return (
    <Box className="page-enter" sx={{ maxWidth:1000, mx:'auto' }}>
      <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{sm:'center'}} sx={{mb:3}}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight:800, mb:0.3 }}>Claims</Typography>
          <Typography sx={{ fontSize:13, color:'#9CA3AF' }}>Register and track insurance claims</Typography>
        </Box>
        <Box sx={{ display:'flex', flexWrap:'wrap', gap:1, mt:{xs:1.5,sm:0}, alignItems:'center' }}>
          <Button size="small" variant="outlined" startIcon={<DescriptionOutlinedIcon sx={{ fontSize:16 }} />}
            onClick={handleDownloadTemplate} sx={{ textTransform:'none' }}>CSV Template</Button>
          <Button size="small" variant="outlined" startIcon={<FileDownloadOutlinedIcon sx={{ fontSize:16 }} />}
            onClick={handleExportCsv} sx={{ textTransform:'none' }}>Export CSV</Button>
          <Button size="small" variant="outlined" startIcon={<PostAddOutlinedIcon sx={{ fontSize:16 }} />}
            disabled={csvImporting} onClick={() => document.getElementById('claims-csv-input').click()}
            sx={{ textTransform:'none' }}>{csvImporting ? 'Importing…' : 'Import CSV'}</Button>
          <Button size="small" variant="outlined" startIcon={<UploadFileOutlinedIcon sx={{ fontSize:16 }} />}
            onClick={() => document.getElementById('claims-doc-input').click()}
            sx={{ textTransform:'none' }}>Import Documents</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openRegister}>Register Claim</Button>
          <input id="claims-csv-input" type="file" accept=".csv,text/csv" style={{ display:'none' }}
            onChange={e => { handleImportCsv(e.target.files[0]); e.target.value = ''; }} />
          <input id="claims-doc-input" type="file" multiple accept="application/pdf,image/*" style={{ display:'none' }}
            onChange={e => { onDocFilesSelected(e.target.files); e.target.value = ''; }} />
        </Box>
      </Stack>

      <Stack direction={{xs:'column',sm:'row'}} spacing={1.5} sx={{mb:3}}>
        {[
          { label:'Filed',    val:stats.filed,    color:'#6366f1', bg:'rgba(99,102,241,0.08)' },
          { label:'Active',   val:stats.active,   color:'#d97706', bg:'rgba(245,158,11,0.08)' },
          { label:'Settled',  val:stats.settled,  color:'#059669', bg:'rgba(16,185,129,0.08)' },
          { label:'Rejected', val:stats.rejected, color:'#dc2626', bg:'rgba(239,68,68,0.08)' },
        ].map(s=>(
          <Box key={s.label} sx={{flex:1, p:2, borderRadius:'12px', bgcolor:s.bg}}>
            <Typography sx={{fontSize:24, fontWeight:800, color:s.color}}>{s.val}</Typography>
            <Typography sx={{fontSize:12, color:'#6B7280'}}>{s.label}</Typography>
          </Box>
        ))}
      </Stack>

      <Stack direction={{xs:'column',sm:'row'}} spacing={1.5} sx={{mb:2.5}}>
        <TextField size="small" fullWidth placeholder="Search by reference, client, policy or product…"
          value={search} onChange={e=>setSearch(e.target.value)}
          InputProps={{ startAdornment:(<InputAdornment position="start"><SearchIcon sx={{ fontSize:18, color:'#9CA3AF' }} /></InputAdornment>) }} />
        <FormControl size="small" sx={{ minWidth:{ xs:'100%', sm:190 } }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} label="Status" onChange={e=>setStatusFilter(e.target.value)}>
            <MenuItem value="All">All statuses</MenuItem>
            {Object.keys(STATUS_CONFIG).map(s=><MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
      </Stack>

      {loading
        ? <Stack spacing={1.5}>{[1,2,3].map(i=><Skeleton key={i} height={64} sx={{borderRadius:'12px'}} />)}</Stack>
        : claims.length===0
          ? <Box sx={{textAlign:'center',py:6}}><Typography sx={{color:'#9CA3AF'}}>No claims registered yet.</Typography></Box>
          : filtered.length===0
            ? <Box sx={{textAlign:'center',py:6}}><Typography sx={{color:'#9CA3AF'}}>No claims match your search.</Typography></Box>
            : <>
                {pageClaims.map(c=>(
                  <ClaimCard key={c.id} claim={c}
                    defaultOpen={c.id === justCreatedId}
                    onUpdate={(id,updates)=>setClaims(p=>p.map(x=>x.id===id?{...x,...updates}:x))}
                    onDelete={(id)=>{ setClaims(p=>p.filter(x=>x.id!==id)); setToast({open:true,msg:'Claim deleted.',severity:'info'}); }} />
                ))}
                {filtered.length > C_PER_PAGE && (
                  <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', pt:2, flexWrap:'wrap', gap:1 }}>
                    <Typography sx={{ fontSize:12.5, color:'#9CA3AF' }}>
                      Showing {(cPage-1)*C_PER_PAGE+1}–{Math.min(cPage*C_PER_PAGE, filtered.length)} of {filtered.length} claims
                    </Typography>
                    <Pagination count={pageCount} page={cPage}
                      onChange={(_,v)=>{ setCPage(v); window.scrollTo({top:0,behavior:'smooth'}); }}
                      shape="rounded" size="small" />
                  </Box>
                )}
              </>
      }

      <Dialog open={open} onClose={()=>setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Register New Claim</DialogTitle>
        <DialogContent sx={{pt:2.5}}>
          <Stack spacing={2}>
            <Box>
              <Typography sx={{ fontSize:11, fontWeight:800, color:'#255EAB', textTransform:'uppercase', letterSpacing:1, mb:1 }}>Claim Reference</Typography>
              <TextField size="small" fullWidth label="Claim Ref ID" value={form.claim_ref_id} onChange={e=>set('claim_ref_id',e.target.value)} />
            </Box>
            <Typography sx={{ fontSize:11, fontWeight:800, color:'#255EAB', textTransform:'uppercase', letterSpacing:1, mt:0.5 }}>Claim Details</Typography>
            <TextField size="small" fullWidth label="Client Name *" value={form.client_name} onChange={e=>set('client_name',e.target.value)} />
            <Stack direction={{ xs:'column', sm:'row' }} spacing={1.5}>
              <TextField size="small" fullWidth label="Policy No" value={form.policy_no} onChange={e=>set('policy_no',e.target.value)} />
              <TextField size="small" fullWidth label="Product / Class" value={form.product} onChange={e=>set('product',e.target.value)} />
            </Stack>
            <Stack direction={{ xs:'column', sm:'row' }} spacing={1.5}>
              <TextField size="small" fullWidth label="Incident Date *" type="date" InputLabelProps={{shrink:true}} value={form.incident_date} onChange={e=>set('incident_date',e.target.value)} />
              <TextField size="small" fullWidth label="Estimated Loss (LKR)" type="number" inputProps={{ step:'any', inputMode:'decimal' }} value={form.loss_amount} onChange={e=>set('loss_amount',e.target.value)} />
            </Stack>
            <TextField size="small" fullWidth label="Cause of Loss" value={form.cause} onChange={e=>set('cause',e.target.value)} />
            <TextField size="small" fullWidth multiline minRows={3} label="Loss Description" value={form.description} onChange={e=>set('description',e.target.value)} />
          </Stack>
          {newClaimRef && (
            <ClaimProcessTracker value={regTracker} onChange={setRegTracker} claimId={newClaimRef.id} brandPrefix="insuresaas" accent="#255EAB" />
          )}
        </DialogContent>
        <DialogActions sx={{px:3,py:2,borderTop:'1px solid rgba(56,163,224,0.10)'}}>
          <Button onClick={()=>setOpen(false)} variant="outlined" sx={{borderColor:'#e0e0e0',color:'#6B7280'}}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>{saving?'Saving…':'Register Claim'}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={4000} onClose={()=>setToast(t=>({...t,open:false}))}>
        <Alert severity={toast.severity} variant="filled">{toast.msg}</Alert>
      </Snackbar>

      {/* CSV import issues */}
      <Dialog open={csvErrOpen} onClose={()=>setCsvErrOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight:800, fontSize:16 }}>Import notes</DialogTitle>
        <DialogContent dividers>
          {importErrors.map((e,i)=>(
            <Typography key={i} sx={{ fontSize:12.5, color:'#6B7280', mb:0.6 }}>• {e}</Typography>
          ))}
        </DialogContent>
        <DialogActions><Button onClick={()=>setCsvErrOpen(false)} variant="contained" size="small">Close</Button></DialogActions>
      </Dialog>

      {/* Import Documents — match files to claims by reference and attach */}
      <Dialog open={docImportOpen} onClose={()=>!docImportRunning && setDocImportOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight:800, fontSize:16 }}>Import Documents</DialogTitle>
        <DialogContent dividers>
          <Typography sx={{ fontSize:12, color:'#9CA3AF', mb:1.5 }}>
            Files are matched to a claim by its Claim Reference at the start of the file name
            (e.g. <b>CLM-123456__documents_received__report.pdf</b>). Matched files attach to that claim's tracker.
          </Typography>
          {docImportProgress.total > 0 && (
            <LinearProgress variant="determinate"
              value={Math.round((docImportProgress.done / docImportProgress.total) * 100)}
              sx={{ mb:1.5, borderRadius:'4px', height:6 }} />
          )}
          <Box sx={{ maxHeight:300, overflowY:'auto' }}>
            {docImportItems.map((it,i)=>(
              <Box key={i} sx={{ display:'flex', alignItems:'center', gap:1, py:0.6, borderBottom:'1px solid rgba(0,0,0,0.05)' }}>
                <DescriptionOutlinedIcon sx={{ fontSize:16, color: it.matched ? ACCENT : '#dc2626', flexShrink:0 }} />
                <Box sx={{ flex:1, minWidth:0 }}>
                  <Typography sx={{ fontSize:12.5, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{it.file.name}</Typography>
                  <Typography sx={{ fontSize:10.5, color: it.matched ? '#059669' : '#dc2626' }}>
                    {it.matched ? `→ ${it.claim.reference}${it.claim.client_name?` · ${it.claim.client_name}`:''}` : it.reason}
                  </Typography>
                </Box>
                {it.status==='done' && <Chip label="Uploaded" size="small" sx={{ height:20, fontSize:10, bgcolor:'rgba(16,185,129,0.12)', color:'#059669' }} />}
                {it.status==='error' && <Chip label="Failed" size="small" sx={{ height:20, fontSize:10, bgcolor:'rgba(239,68,68,0.12)', color:'#dc2626' }} />}
              </Box>
            ))}
          </Box>
          <Typography sx={{ fontSize:11.5, color:'#6B7280', mt:1.5 }}>
            {docImportItems.filter(it=>it.matched).length} of {docImportItems.length} file(s) matched a claim.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={()=>setDocImportOpen(false)} disabled={docImportRunning} variant="outlined"
            sx={{ borderColor:'#e0e0e0', color:'#6B7280' }}>Close</Button>
          <Button variant="contained" onClick={runDocImport}
            disabled={docImportRunning || docImportItems.filter(it=>it.matched && it.status!=='done').length===0}>
            {docImportRunning ? 'Uploading…' : `Attach ${docImportItems.filter(it=>it.matched && it.status!=='done').length} file(s)`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ClaimsPage;
