import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, addDoc, getDocs, doc, getDoc, setDoc, deleteDoc,
  query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import { API_URL } from '../config';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';

import SendIcon from '@mui/icons-material/Send';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HistoryIcon from '@mui/icons-material/History';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';

const ACCENT   = '#25D366'; // WhatsApp green
const ACCENT2  = '#128C7E';

const PRESET_TEMPLATES = [
  {
    id: 'preset_birthday',
    name: 'Birthday Greeting',
    type: 'birthday',
    icon: '🎂',
    content: 'Happy Birthday {{name}}! 🎂🎉\n\nWishing you a wonderful day filled with joy and happiness.\n\nWarm regards,\nInsureSAAS',
  },
  {
    id: 'preset_christmas',
    name: 'Christmas Greeting',
    type: 'holiday',
    icon: '🎄',
    content: 'Merry Christmas {{name}}! 🎄✨\n\nWishing you and your family a joyful Christmas and a prosperous New Year.\n\nWarm regards,\nInsureSAAS',
  },
  {
    id: 'preset_new_year',
    name: 'New Year Greeting',
    type: 'holiday',
    icon: '🎆',
    content: 'Happy New Year {{name}}! 🎆🥂\n\nMay this new year bring you health, happiness, and prosperity.\n\nWith best wishes,\nInsureSAAS',
  },
  {
    id: 'preset_renewal',
    name: 'Policy Renewal Reminder',
    type: 'renewal',
    icon: '🔄',
    content: 'Dear {{name}},\n\n⚠️ This is a friendly reminder that your insurance policy ({{policy_no}}) is due for renewal on {{renewal_date}}.\n\nPlease contact us to renew and continue your coverage without interruption.\n\nInsureSAAS',
  },
  {
    id: 'preset_anniversary',
    name: 'Policy Anniversary',
    type: 'anniversary',
    icon: '🏆',
    content: 'Dear {{name}},\n\nThank you for trusting InsureSAAS with your insurance needs! 🏆\n\nWe value your continued partnership and look forward to serving you.\n\nWarm regards,\nInsureSAAS',
  },
];

function replaceVars(template, client) {
  return template
    .replace(/{{name}}/g,         client.client_name || client.name || 'Valued Client')
    .replace(/{{policy_no}}/g,    client.policy_no   || '—')
    .replace(/{{renewal_date}}/g, client.policy_period_to ? new Date(client.policy_period_to).toLocaleDateString('en-GB') : '—');
}

function TemplateCard({ tpl, onEdit, onDelete, isPreset }) {
  const typeColors = {
    birthday:    { bg: 'rgba(59,130,246,0.08)',   color: '#3B82F6' },
    holiday:     { bg: 'rgba(16,185,129,0.08)',  color: '#059669' },
    renewal:     { bg: 'rgba(99,102,241,0.08)',  color: '#6366f1' },
    anniversary: { bg: 'rgba(245,158,11,0.08)',  color: '#d97706' },
    custom:      { bg: 'rgba(107,114,128,0.08)', color: '#6B7280' },
  };
  const tc = typeColors[tpl.type] || typeColors.custom;

  return (
    <Card sx={{ border: '1px solid rgba(37,211,102,0.15)', mb: 1.5 }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.8 }}>
              <Typography sx={{ fontSize: 18 }}>{tpl.icon || '📝'}</Typography>
              <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{tpl.name}</Typography>
              <Chip label={tpl.type} size="small" sx={{ bgcolor: tc.bg, color: tc.color, fontWeight: 600, fontSize: 10 }} />
              {isPreset && <Chip label="Built-in" size="small" sx={{ bgcolor: 'rgba(0,0,0,0.04)', color: '#9CA3AF', fontSize: 10 }} />}
            </Stack>
            <Typography sx={{ fontSize: 12, color: '#6B7280', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
              {tpl.content.length > 120 ? tpl.content.slice(0, 120) + '…' : tpl.content}
            </Typography>
          </Box>
          {!isPreset && (
            <Stack direction="row" spacing={0.5} sx={{ ml: 1, flexShrink: 0 }}>
              <IconButton size="small" onClick={() => onEdit(tpl)} sx={{ color: '#6366f1' }}><EditOutlinedIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={() => onDelete(tpl.id)} sx={{ color: '#ef4444' }}><DeleteOutlineIcon fontSize="small" /></IconButton>
            </Stack>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

const MarketingPage = () => {
  const { user, userProfile, hasAccess } = useAuth();
  const isManager = hasAccess('marketing');

  const [tab, setTab] = useState(0);
  const [toast, setToast] = useState({ open: false, msg: '', severity: 'success' });
  const showToast = (msg, severity = 'success') => setToast({ open: true, msg, severity });

  /* ── Settings ── */
  const [settings, setSettings]     = useState({ phoneNumberId: '', accessToken: '', businessName: '' });
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [testPhone, setTestPhone]   = useState('');
  const [testing, setTesting]       = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'settings', 'whatsapp_api'))
      .then(snap => { if (snap.exists()) setSettings(snap.data()); })
      .catch(() => {});
  }, []);

  const saveSettings = async () => {
    await setDoc(doc(db, 'settings', 'whatsapp_api'), { ...settings, updated_at: serverTimestamp() });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
    showToast('WhatsApp settings saved.');
  };

  const testConnection = async () => {
    if (!settings.phoneNumberId || !settings.accessToken) { showToast('Enter Phone Number ID and Access Token first.', 'error'); return; }
    if (!testPhone) { showToast('Enter a test phone number.', 'error'); return; }
    setTesting(true);
    try {
      const res = await fetch(`${API_URL}/send-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testPhone, message: 'Test message from InsureSAAS ✅' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      showToast('Test message sent successfully!');
    } catch (err) {
      showToast(`Test failed: ${err.message}`, 'error');
    }
    setTesting(false);
  };

  /* ── Templates ── */
  const [templates, setTemplates]   = useState([]);
  const [tplDialog, setTplDialog]   = useState(false);
  const [editTpl, setEditTpl]       = useState(null);
  const [tplForm, setTplForm]       = useState({ name: '', type: 'custom', icon: '📝', content: '' });

  const loadTemplates = useCallback(async () => {
    const snap = await getDocs(query(collection(db, 'marketing_templates'), orderBy('created_at', 'desc')));
    setTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const openNewTpl = () => { setEditTpl(null); setTplForm({ name: '', type: 'custom', icon: '📝', content: '' }); setTplDialog(true); };
  const openEditTpl = (t) => { setEditTpl(t); setTplForm({ name: t.name, type: t.type, icon: t.icon || '📝', content: t.content }); setTplDialog(true); };

  const saveTpl = async () => {
    if (!tplForm.name || !tplForm.content) { showToast('Name and content are required.', 'error'); return; }
    const data = { ...tplForm, updated_at: serverTimestamp() };
    if (editTpl) {
      await setDoc(doc(db, 'marketing_templates', editTpl.id), { ...data, created_at: editTpl.created_at });
    } else {
      await addDoc(collection(db, 'marketing_templates'), { ...data, created_by: user?.uid, created_at: serverTimestamp() });
    }
    setTplDialog(false);
    loadTemplates();
    showToast(editTpl ? 'Template updated.' : 'Template created.');
  };

  const deleteTpl = async (id) => {
    await deleteDoc(doc(db, 'marketing_templates', id));
    setTemplates(prev => prev.filter(t => t.id !== id));
    showToast('Template deleted.', 'info');
  };

  /* ── Campaign ── */
  const [clients, setClients]           = useState([]);
  const [clientFilter, setClientFilter] = useState('all');
  const [selectedClients, setSelectedClients] = useState([]);
  const [selectedTpl, setSelectedTpl]   = useState(null);
  const [previewClient, setPreviewClient] = useState(null);
  const [sending, setSending]           = useState(false);
  const [sendProgress, setSendProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [campaignName, setCampaignName] = useState('');

  useEffect(() => {
    getDocs(query(collection(db, 'clients'), orderBy('created_at', 'desc')))
      .then(snap => setClients(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, []);

  const today = new Date();
  const filtered = clients.filter(c => {
    if (clientFilter === 'all') return true;
    if (clientFilter === 'birthday') {
      // clients whose dob month/day matches today (use policy_period_from as proxy if no dob)
      return false; // dob not stored in underwriting - show empty with info
    }
    if (clientFilter === 'renewal_30') {
      if (!c.policy_period_to) return false;
      const renewal = new Date(c.policy_period_to);
      const diff = (renewal - today) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 30;
    }
    if (clientFilter === 'renewal_7') {
      if (!c.policy_period_to) return false;
      const renewal = new Date(c.policy_period_to);
      const diff = (renewal - today) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    }
    if (clientFilter.startsWith('class_')) {
      const cls = clientFilter.replace('class_', '');
      return (c.main_class || '').toLowerCase().includes(cls);
    }
    return true;
  });

  const toggleClient = (id) => setSelectedClients(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll    = () => setSelectedClients(prev => prev.length === filtered.length ? [] : filtered.map(c => c.id));

  const allTemplates = [...PRESET_TEMPLATES, ...templates];

  const sendCampaign = async () => {
    if (!settings.phoneNumberId || !settings.accessToken) { showToast('Configure WhatsApp API settings first.', 'error'); setTab(0); return; }
    if (!selectedTpl) { showToast('Select a template.', 'error'); return; }
    if (selectedClients.length === 0) { showToast('Select at least one contact.', 'error'); return; }
    if (!campaignName.trim()) { showToast('Enter a campaign name.', 'error'); return; }

    setSending(true);
    const targets = clients.filter(c => selectedClients.includes(c.id) && c.mobile_no);
    setSendProgress({ done: 0, total: targets.length, errors: 0 });

    const results = [];
    let errorCount = 0;

    for (const client of targets) {
      const msg = replaceVars(selectedTpl.content, client);
      let ok = false;
      try {
        const res = await fetch(`${API_URL}/send-whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to:      client.mobile_no,
            message: msg,
          }),
        });
        const data = await res.json();
        ok = res.ok;
        results.push({ name: client.client_name, phone: client.mobile_no, status: res.ok ? 'sent' : 'failed', error: !res.ok ? data.error : undefined });
      } catch {
        results.push({ name: client.client_name, phone: client.mobile_no, status: 'failed' });
      }
      if (!ok) errorCount += 1;
      const snap = errorCount;
      setSendProgress(p => ({ ...p, done: p.done + 1, errors: snap }));
      await new Promise(r => setTimeout(r, 300));
    }
    const errors = errorCount;

    await addDoc(collection(db, 'marketing_campaigns'), {
      name:             campaignName.trim(),
      template_name:    selectedTpl.name,
      template_type:    selectedTpl.type,
      recipients_count: targets.length,
      sent_count:       targets.length - errors,
      failed_count:     errors,
      status:           errors === targets.length ? 'failed' : errors > 0 ? 'partial' : 'completed',
      results,
      created_by:       user?.uid,
      created_by_name:  userProfile?.full_name || '',
      created_at:       serverTimestamp(),
    });

    setSending(false);
    showToast(`Campaign complete — ${targets.length - errors} sent, ${errors} failed.`, errors > 0 ? 'warning' : 'success');
    setSelectedClients([]);
    setCampaignName('');
    setTab(3);
  };

  /* ── History ── */
  const [campaigns, setCampaigns]   = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'marketing_campaigns'), orderBy('created_at', 'desc')));
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {}
    setHistLoading(false);
  }, []);

  useEffect(() => { if (tab === 3) loadHistory(); }, [tab, loadHistory]);

  if (!isManager) {
    return (
      <Box sx={{ textAlign: 'center', py: 10 }}>
        <Typography sx={{ fontSize: 16, color: '#9CA3AF' }}>Marketing is only accessible to Managers and Admins.</Typography>
      </Box>
    );
  }

  const previewMessage = selectedTpl && (previewClient || filtered[0])
    ? replaceVars(selectedTpl.content, previewClient || filtered[0])
    : selectedTpl?.content || '';

  return (
    <Box className="page-enter" sx={{ maxWidth: 1000, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <WhatsAppIcon sx={{ color: ACCENT, fontSize: 28 }} />
            <Typography variant="h5" sx={{ fontWeight: 800 }}>Marketing</Typography>
            <Chip label="Manager Only" size="small" sx={{ bgcolor: 'rgba(37,211,102,0.1)', color: ACCENT2, fontWeight: 700, fontSize: 10 }} />
          </Stack>
          <Typography sx={{ fontSize: 13, color: '#9CA3AF', mt: 0.3 }}>
            WhatsApp bulk campaigns — birthday cards, holiday greetings, renewal reminders
          </Typography>
        </Box>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{
        mb: 3, borderBottom: '1px solid rgba(37,211,102,0.15)',
        '& .MuiTab-root': { fontSize: 13, fontWeight: 600, textTransform: 'none', color: '#9CA3AF' },
        '& .Mui-selected': { color: ACCENT2 },
        '& .MuiTabs-indicator': { background: ACCENT, height: 2.5 },
      }}>
        <Tab label="⚙️ Settings" />
        <Tab label="📝 Templates" />
        <Tab label="🚀 Send Campaign" />
        <Tab label="📊 History" />
      </Tabs>

      {/* ── SETTINGS ── */}
      {tab === 0 && (
        <Box>
          <Alert severity="info" sx={{ mb: 3, fontSize: 12.5 }}>
            Connect your <strong>WhatsApp Business Cloud API</strong>. You need a Meta Business Account with WhatsApp enabled.
            Get your credentials from <strong>Meta for Developers → Your App → WhatsApp → API Setup</strong>.
          </Alert>
          <Card sx={{ border: '1px solid rgba(37,211,102,0.2)', mb: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 2.5, color: '#374151' }}>
                WhatsApp Business API Credentials
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField size="small" fullWidth label="Business Name"
                  value={settings.businessName} onChange={e => setSettings(s => ({ ...s, businessName: e.target.value }))} />
                <TextField size="small" fullWidth label="Phone Number ID *"
                  placeholder="e.g. 123456789012345"
                  value={settings.phoneNumberId} onChange={e => setSettings(s => ({ ...s, phoneNumberId: e.target.value }))} />
                <TextField size="small" fullWidth label="Access Token *" type="password"
                  placeholder="Permanent access token from Meta"
                  value={settings.accessToken} onChange={e => setSettings(s => ({ ...s, accessToken: e.target.value }))}
                  sx={{ gridColumn: '1 / -1' }} />
              </Box>
              <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
                <Button variant="contained" onClick={saveSettings}
                  sx={{ background: settingsSaved ? 'linear-gradient(135deg,#10B981,#059669)' : `linear-gradient(135deg,${ACCENT},${ACCENT2})`, fontSize: 13 }}>
                  {settingsSaved ? '✓ Saved!' : 'Save Settings'}
                </Button>
              </Stack>
            </CardContent>
          </Card>

          <Card sx={{ border: '1px solid rgba(37,211,102,0.2)' }}>
            <CardContent sx={{ p: 3 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 2, color: '#374151' }}>Test Connection</Typography>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <TextField size="small" placeholder="+94771234567" label="Test phone number"
                  value={testPhone} onChange={e => setTestPhone(e.target.value)}
                  sx={{ flex: 1 }} />
                <Button variant="outlined" onClick={testConnection} disabled={testing}
                  startIcon={testing ? <CircularProgress size={14} /> : <SendIcon />}
                  sx={{ borderColor: ACCENT, color: ACCENT2, flexShrink: 0 }}>
                  {testing ? 'Sending…' : 'Send Test'}
                </Button>
              </Stack>
              <Typography sx={{ fontSize: 11.5, color: '#9CA3AF', mt: 1 }}>
                Sends a test message to verify your credentials are working correctly.
              </Typography>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* ── TEMPLATES ── */}
      {tab === 1 && (
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2.5 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Message Templates</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={openNewTpl}
              sx={{ background: `linear-gradient(135deg,${ACCENT},${ACCENT2})`, fontSize: 13 }}>
              New Template
            </Button>
          </Stack>

          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5 }}>
            Built-in Templates
          </Typography>
          {PRESET_TEMPLATES.map(t => <TemplateCard key={t.id} tpl={t} isPreset />)}

          {templates.length > 0 && (
            <>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, mb: 1.5, mt: 3 }}>
                Custom Templates
              </Typography>
              {templates.map(t => <TemplateCard key={t.id} tpl={t} onEdit={openEditTpl} onDelete={deleteTpl} />)}
            </>
          )}

          <Alert severity="info" sx={{ mt: 3, fontSize: 12 }}>
            <strong>Variables you can use:</strong> {'{{name}}'} — client name &nbsp;|&nbsp;
            {'{{policy_no}}'} — policy number &nbsp;|&nbsp; {'{{renewal_date}}'} — renewal date
          </Alert>
        </Box>
      )}

      {/* ── SEND CAMPAIGN ── */}
      {tab === 2 && (
        <Box>
          {sending && (
            <Box sx={{ mb: 3 }}>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Sending campaign…</Typography>
                <Typography sx={{ fontSize: 13, color: '#6B7280' }}>
                  {sendProgress.done} / {sendProgress.total}
                  {sendProgress.errors > 0 && ` · ${sendProgress.errors} failed`}
                </Typography>
              </Stack>
              <LinearProgress variant="determinate"
                value={sendProgress.total > 0 ? (sendProgress.done / sendProgress.total) * 100 : 0}
                sx={{ borderRadius: 4, height: 6, '& .MuiLinearProgress-bar': { background: `linear-gradient(90deg,${ACCENT},${ACCENT2})` } }} />
            </Box>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { md: '1fr 1fr' }, gap: 3 }}>
            {/* Left: setup */}
            <Box>
              <TextField size="small" fullWidth label="Campaign Name *" sx={{ mb: 2 }}
                value={campaignName} onChange={e => setCampaignName(e.target.value)}
                placeholder="e.g. Christmas 2025 Greetings" />

              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#374151', mb: 1 }}>Select Template *</Typography>
              <Box sx={{ maxHeight: 280, overflowY: 'auto', pr: 0.5, mb: 2 }}>
                {allTemplates.map(t => (
                  <Box key={t.id} onClick={() => setSelectedTpl(t)}
                    sx={{
                      p: 1.5, mb: 1, borderRadius: '10px', cursor: 'pointer',
                      border: `1.5px solid ${selectedTpl?.id === t.id ? ACCENT : 'rgba(0,0,0,0.08)'}`,
                      bgcolor: selectedTpl?.id === t.id ? 'rgba(37,211,102,0.06)' : '#fff',
                      transition: 'all 0.15s ease',
                    }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography sx={{ fontSize: 16 }}>{t.icon || '📝'}</Typography>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{t.name}</Typography>
                        <Typography sx={{ fontSize: 11, color: '#9CA3AF' }}>{t.type}</Typography>
                      </Box>
                      {selectedTpl?.id === t.id && <CheckCircleOutlineIcon sx={{ color: ACCENT, fontSize: 18 }} />}
                    </Stack>
                  </Box>
                ))}
              </Box>

              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#374151', mb: 1 }}>
                Filter Recipients &nbsp;
                <Chip label={`${selectedClients.length} selected`} size="small"
                  sx={{ bgcolor: 'rgba(37,211,102,0.1)', color: ACCENT2, fontWeight: 700 }} />
              </Typography>
              <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
                <InputLabel>Filter</InputLabel>
                <Select value={clientFilter} label="Filter" onChange={e => { setClientFilter(e.target.value); setSelectedClients([]); }}>
                  <MenuItem value="all">All Active Clients</MenuItem>
                  <MenuItem value="renewal_7">Renewal in next 7 days</MenuItem>
                  <MenuItem value="renewal_30">Renewal in next 30 days</MenuItem>
                  <MenuItem value="class_motor">Motor Insurance Clients</MenuItem>
                  <MenuItem value="class_fire">Fire Insurance Clients</MenuItem>
                  <MenuItem value="class_life">Life Insurance Clients</MenuItem>
                  <MenuItem value="class_marine">Marine Insurance Clients</MenuItem>
                </Select>
              </FormControl>

              <Box sx={{ maxHeight: 280, overflowY: 'auto', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '10px', p: 1 }}>
                <FormControlLabel
                  control={<Checkbox size="small" checked={selectedClients.length === filtered.length && filtered.length > 0} onChange={toggleAll} sx={{ '&.Mui-checked': { color: ACCENT } }} />}
                  label={<Typography sx={{ fontSize: 12, fontWeight: 700 }}>Select All ({filtered.length})</Typography>}
                  sx={{ mb: 0.5, px: 1 }}
                />
                {filtered.length === 0 ? (
                  <Typography sx={{ fontSize: 12, color: '#9CA3AF', px: 1, py: 1 }}>No clients match this filter.</Typography>
                ) : filtered.map(c => (
                  <FormControlLabel key={c.id}
                    control={<Checkbox size="small" checked={selectedClients.includes(c.id)} onChange={() => toggleClient(c.id)} sx={{ '&.Mui-checked': { color: ACCENT } }} />}
                    label={
                      <Box>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>{c.client_name}</Typography>
                        <Typography sx={{ fontSize: 11, color: '#9CA3AF' }}>
                          {c.mobile_no || 'No phone'} · {c.main_class || '—'}
                          {!c.mobile_no && <Chip label="No phone" size="small" sx={{ ml: 0.5, fontSize: 9, height: 14, bgcolor: 'rgba(239,68,68,0.1)', color: '#ef4444' }} />}
                        </Typography>
                      </Box>
                    }
                    sx={{ display: 'flex', mb: 0.3, px: 0.5, borderRadius: '6px', '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' } }}
                  />
                ))}
              </Box>
            </Box>

            {/* Right: preview + send */}
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#374151', mb: 1 }}>Message Preview</Typography>
              {selectedTpl ? (
                <Box>
                  <FormControl size="small" fullWidth sx={{ mb: 1.5 }}>
                    <InputLabel>Preview with client</InputLabel>
                    <Select value={previewClient?.id || ''} label="Preview with client"
                      onChange={e => setPreviewClient(filtered.find(c => c.id === e.target.value) || null)}>
                      <MenuItem value="">First matched client</MenuItem>
                      {filtered.slice(0, 20).map(c => <MenuItem key={c.id} value={c.id}>{c.client_name}</MenuItem>)}
                    </Select>
                  </FormControl>

                  {/* WA-style message bubble */}
                  <Box sx={{ bgcolor: '#ECE5DD', borderRadius: '12px', p: 2, minHeight: 160 }}>
                    <Box sx={{ bgcolor: '#fff', borderRadius: '0 12px 12px 12px', p: 2, maxWidth: '85%', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                      <Typography sx={{ fontSize: 13, whiteSpace: 'pre-line', lineHeight: 1.6, color: '#1a1a1a' }}>
                        {previewMessage}
                      </Typography>
                      <Typography sx={{ fontSize: 10, color: '#9CA3AF', textAlign: 'right', mt: 0.5 }}>
                        {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ bgcolor: '#ECE5DD', borderRadius: '12px', p: 4, textAlign: 'center', minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ color: '#9CA3AF', fontSize: 13 }}>Select a template to preview</Typography>
                </Box>
              )}

              <Box sx={{ mt: 2.5, p: 2, borderRadius: '12px', bgcolor: 'rgba(37,211,102,0.05)', border: '1px solid rgba(37,211,102,0.15)' }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#374151', mb: 1 }}>Campaign Summary</Typography>
                {[
                  ['Campaign', campaignName || '—'],
                  ['Template', selectedTpl?.name || '—'],
                  ['Recipients', `${selectedClients.length} contacts`],
                  ['With phone', `${clients.filter(c => selectedClients.includes(c.id) && c.mobile_no).length} will receive`],
                ].map(([l, v]) => (
                  <Stack key={l} direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Typography sx={{ fontSize: 12, color: '#6B7280' }}>{l}</Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{v}</Typography>
                  </Stack>
                ))}
              </Box>

              <Button fullWidth variant="contained" startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                onClick={sendCampaign} disabled={sending || !selectedTpl || selectedClients.length === 0 || !campaignName.trim()}
                sx={{ mt: 2, py: 1.3, fontSize: 14, fontWeight: 700, background: `linear-gradient(135deg,${ACCENT},${ACCENT2})` }}>
                {sending ? `Sending ${sendProgress.done}/${sendProgress.total}…` : `Send to ${selectedClients.length} Contact${selectedClients.length !== 1 ? 's' : ''}`}
              </Button>

              <Typography sx={{ fontSize: 11, color: '#9CA3AF', textAlign: 'center', mt: 1 }}>
                Messages are sent one by one to respect WhatsApp rate limits.
              </Typography>
            </Box>
          </Box>
        </Box>
      )}

      {/* ── HISTORY ── */}
      {tab === 3 && (
        <Box>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2.5 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 15 }}>Campaign History</Typography>
            <Button size="small" variant="outlined" onClick={loadHistory}
              sx={{ borderColor: 'rgba(37,211,102,0.3)', color: ACCENT2, fontSize: 12 }}>
              Refresh
            </Button>
          </Stack>

          {histLoading ? (
            <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress sx={{ color: ACCENT }} /></Box>
          ) : campaigns.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <HistoryIcon sx={{ fontSize: 40, color: 'rgba(37,211,102,0.2)', mb: 1 }} />
              <Typography sx={{ color: '#9CA3AF' }}>No campaigns sent yet.</Typography>
            </Box>
          ) : campaigns.map(c => {
            const statusMap = {
              completed: { color: '#059669', bg: 'rgba(16,185,129,0.08)', label: 'Completed' },
              partial:   { color: '#d97706', bg: 'rgba(245,158,11,0.08)',  label: 'Partial' },
              failed:    { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',    label: 'Failed' },
            };
            const s = statusMap[c.status] || statusMap.completed;
            const date = c.created_at?.toDate?.()?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) || '—';

            return (
              <Card key={c.id} sx={{ mb: 1.5, border: '1px solid rgba(37,211,102,0.12)' }}>
                <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{c.name}</Typography>
                        <Chip label={s.label} size="small" sx={{ bgcolor: s.bg, color: s.color, fontWeight: 700, fontSize: 10 }} />
                      </Stack>
                      <Typography sx={{ fontSize: 12, color: '#6B7280' }}>
                        Template: {c.template_name} · {date} · By {c.created_by_name || '—'}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={2} alignItems="center" sx={{ flexShrink: 0, ml: 2 }}>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 18, fontWeight: 800, color: '#059669' }}>{c.sent_count}</Typography>
                        <Typography sx={{ fontSize: 10, color: '#9CA3AF' }}>Sent</Typography>
                      </Box>
                      <Box sx={{ textAlign: 'center' }}>
                        <Typography sx={{ fontSize: 18, fontWeight: 800, color: '#ef4444' }}>{c.failed_count}</Typography>
                        <Typography sx={{ fontSize: 10, color: '#9CA3AF' }}>Failed</Typography>
                      </Box>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {/* ── Template Dialog ── */}
      <Dialog open={tplDialog} onClose={() => setTplDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{editTpl ? 'Edit Template' : 'New Template'}</DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
            <TextField size="small" fullWidth label="Template Name *"
              value={tplForm.name} onChange={e => setTplForm(f => ({ ...f, name: e.target.value }))} />
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select value={tplForm.type} label="Type" onChange={e => setTplForm(f => ({ ...f, type: e.target.value }))}>
                {['birthday','holiday','renewal','anniversary','custom'].map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField size="small" label="Icon (emoji)" value={tplForm.icon}
              onChange={e => setTplForm(f => ({ ...f, icon: e.target.value }))} />
          </Box>
          <TextField fullWidth multiline rows={6} size="small" label="Message Content *"
            value={tplForm.content} onChange={e => setTplForm(f => ({ ...f, content: e.target.value }))}
            placeholder={'Use {{name}}, {{policy_no}}, {{renewal_date}} for personalisation'} />
          <Typography sx={{ fontSize: 11, color: '#9CA3AF', mt: 1 }}>
            Variables: {'{{name}}'} · {'{{policy_no}}'} · {'{{renewal_date}}'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setTplDialog(false)} sx={{ color: '#6B7280' }}>Cancel</Button>
          <Button variant="contained" onClick={saveTpl}
            sx={{ background: `linear-gradient(135deg,${ACCENT},${ACCENT2})` }}>
            {editTpl ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast.open} autoHideDuration={5000} onClose={() => setToast(t => ({ ...t, open: false }))}>
        <Alert severity={toast.severity} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
};

export default MarketingPage;
