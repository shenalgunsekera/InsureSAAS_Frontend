import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection, addDoc, onSnapshot, query, orderBy,
  doc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../App';
import emailjs from '@emailjs/browser';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Pagination from '@mui/material/Pagination';
import Tooltip from '@mui/material/Tooltip';

import BusinessIcon from '@mui/icons-material/Business';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InventoryIcon from '@mui/icons-material/Inventory';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DescriptionIcon from '@mui/icons-material/Description';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ShieldIcon from '@mui/icons-material/Shield';
import BuildIcon from '@mui/icons-material/Build';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import SendIcon from '@mui/icons-material/Send';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import HistoryIcon from '@mui/icons-material/History';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';

import {
  INDUSTRIES, ASSET_EXPOSURE_MAP,
  getPortfoliosForIndustry, getAssetsForPortfolio,
  computeRecommendations, RISK_SCORING_RULES, STRENGTH_COLORS,
} from '../config/portfolioEngine';

const EMAILJS_SERVICE           = process.env.REACT_APP_EMAILJS_SERVICE_ID           || '';
const EMAILJS_PORTFOLIO_TEMPLATE = process.env.REACT_APP_EMAILJS_PORTFOLIO_TEMPLATE_ID  || process.env.REACT_APP_EMAILJS_TEMPLATE_ID || '';
const EMAILJS_KEY               = process.env.REACT_APP_EMAILJS_PUBLIC_KEY             || '';

const STEPS = [
  { label: 'Customer & Industry', icon: <BusinessIcon />   },
  { label: 'Portfolios',          icon: <FolderOpenIcon /> },
  { label: 'Assets',              icon: <InventoryIcon />  },
  { label: 'Risk Assessment',     icon: <AssessmentIcon /> },
  { label: 'Recommendations',     icon: <DescriptionIcon />},
];

const sectionHdr = (label, icon) => (
  <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:2, pb:1, borderBottom:'2px solid rgba(255,139,90,0.12)' }}>
    <Box sx={{ color:'#FF5A5A', display:'flex' }}>{icon}</Box>
    <Typography sx={{ fontWeight:800, fontSize:15, color:'#1A1A2E', textTransform:'uppercase', letterSpacing:0.8 }}>
      {label}
    </Typography>
  </Box>
);

// ─── Step 1: Customer + Industry ────────────────────────────────────────────
function StepCustomer({ data, onChange }) {
  return (
    <Box>
      {sectionHdr('Customer & Business Details', <BusinessIcon />)}
      <Box sx={{ display:'grid', gridTemplateColumns:{ xs:'1fr', sm:'1fr 1fr' }, gap:2, mb:3 }}>
        <TextField label="Customer / Company Name *" value={data.name} fullWidth
          onChange={e => onChange('name', e.target.value)} size="small" />
        <TextField label="Contact Person" value={data.contact || ''} fullWidth
          onChange={e => onChange('contact', e.target.value)} size="small" />
        <TextField label="Email Address" type="email" value={data.email || ''} fullWidth
          onChange={e => onChange('email', e.target.value)} size="small" />
        <TextField label="Phone / WhatsApp" value={data.phone || ''} fullWidth
          onChange={e => onChange('phone', e.target.value)} size="small" />
        <TextField label="Assessment Date" type="date" value={data.date || new Date().toISOString().split('T')[0]}
          onChange={e => onChange('date', e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
        <TextField label="Broker / Prepared By" value={data.broker || ''} fullWidth
          onChange={e => onChange('broker', e.target.value)} size="small" />
      </Box>

      {sectionHdr('Industry Classification', <BusinessIcon />)}
      <FormControl fullWidth size="small" sx={{ mb:2 }}>
        <InputLabel>Select Industry</InputLabel>
        <Select value={data.industry || ''} label="Select Industry"
          onChange={e => onChange('industry', e.target.value)}>
          {INDUSTRIES.map(ind => (
            <MenuItem key={ind.code} value={ind.code}>
              <Box>
                <Typography sx={{ fontWeight:600, fontSize:13 }}>{ind.name}</Typography>
                <Typography sx={{ fontSize:11, color:'#9CA3AF' }}>{ind.sector} · Risk: {ind.risk}</Typography>
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {data.industry && (() => {
        const ind = INDUSTRIES.find(i => i.code === data.industry);
        return ind ? (
          <Alert severity="info" sx={{ fontSize:12.5 }}>
            <strong>Typical Key Risks:</strong> {ind.typical}
          </Alert>
        ) : null;
      })()}
    </Box>
  );
}

// ─── Step 2: Portfolio Selection ─────────────────────────────────────────────
function StepPortfolios({ industryCode, selected, onToggle }) {
  const portfolios = useMemo(() => getPortfoliosForIndustry(industryCode), [industryCode]);
  return (
    <Box>
      {sectionHdr('Select Customer Portfolios', <FolderOpenIcon />)}
      <Typography sx={{ fontSize:13, color:'#6B7280', mb:2.5 }}>
        Select all portfolios that apply to this customer. Each portfolio groups related assets and risks.
      </Typography>
      <Box sx={{ display:'grid', gridTemplateColumns:{ xs:'1fr', sm:'1fr 1fr' }, gap:1.5 }}>
        {portfolios.map(p => {
          const active = selected.includes(p.code);
          return (
            <Box key={p.code} onClick={() => onToggle(p.code)}
              sx={{
                p:2, borderRadius:'12px', cursor:'pointer', transition:'all 0.15s',
                border: active ? '2px solid #E8472A' : '1.5px solid rgba(255,139,90,0.18)',
                bgcolor: active ? 'rgba(232,71,42,0.04)' : '#fff',
                '&:hover': { borderColor:'#E8712A', bgcolor:'rgba(232,113,42,0.03)' },
              }}>
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <Box sx={{
                  width:32, height:32, borderRadius:'8px', flexShrink:0,
                  bgcolor: active ? 'rgba(232,71,42,0.12)' : 'rgba(107,114,128,0.08)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  {active ? <CheckCircleIcon sx={{ fontSize:18, color:'#E8472A' }} /> : <FolderOpenIcon sx={{ fontSize:18, color:'#9CA3AF' }} />}
                </Box>
                <Box sx={{ flex:1 }}>
                  <Typography sx={{ fontWeight:700, fontSize:13, color: active ? '#1A1A2E' : '#374151' }}>
                    {p.name}
                  </Typography>
                  <Typography sx={{ fontSize:11.5, color:'#9CA3AF', lineHeight:1.5 }}>
                    {p.desc}
                  </Typography>
                </Box>
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// ─── Step 3: Asset Confirmation ──────────────────────────────────────────────
function StepAssets({ industryCode, selectedPortfolios, assetData, onAssetToggle, onAssetValue }) {
  const [openPf, setOpenPf] = useState(selectedPortfolios[0] || null);
  const portfolios = useMemo(() => getPortfoliosForIndustry(industryCode), [industryCode]);

  return (
    <Box>
      {sectionHdr('Confirm Assets Present', <InventoryIcon />)}
      <Typography sx={{ fontSize:13, color:'#6B7280', mb:2.5 }}>
        For each portfolio, confirm which assets are present and enter an estimated value where applicable.
      </Typography>
      <Stack spacing={1.5}>
        {selectedPortfolios.map(pfCode => {
          const pf      = portfolios.find(p => p.code === pfCode);
          const assets  = getAssetsForPortfolio(industryCode, pfCode);
          const isOpen  = openPf === pfCode;
          const confirmed = assets.filter(a => assetData[a.assetCode]?.present).length;
          return (
            <Card key={pfCode} elevation={0} sx={{ border:'1.5px solid rgba(255,139,90,0.15)', borderRadius:'12px' }}>
              <Box sx={{ p:2, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}
                onClick={() => setOpenPf(isOpen ? null : pfCode)}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box sx={{ width:36, height:36, borderRadius:'10px', bgcolor:'rgba(232,71,42,0.08)',
                             display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <FolderOpenIcon sx={{ fontSize:18, color:'#E8472A' }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontWeight:700, fontSize:13.5 }}>{pf?.name || pfCode}</Typography>
                    <Typography sx={{ fontSize:11.5, color:'#9CA3AF' }}>
                      {confirmed}/{assets.length} assets confirmed
                    </Typography>
                  </Box>
                </Stack>
                {isOpen ? <ExpandLessIcon sx={{ color:'#9CA3AF' }} /> : <ExpandMoreIcon sx={{ color:'#9CA3AF' }} />}
              </Box>
              <Collapse in={isOpen}>
                <Divider />
                <Box sx={{ p:2 }}>
                  <Stack spacing={1.5}>
                    {assets.map(({ assetCode, mandatory, asset }) => {
                      const present = assetData[assetCode]?.present || false;
                      const value   = assetData[assetCode]?.value   || '';
                      const notes   = assetData[assetCode]?.notes   || '';
                      if (!asset) return null;
                      return (
                        <Box key={assetCode} sx={{
                          p:1.5, borderRadius:'10px',
                          bgcolor: present ? 'rgba(16,185,129,0.04)' : 'rgba(107,114,128,0.03)',
                          border: present ? '1px solid rgba(16,185,129,0.20)' : '1px solid rgba(107,114,128,0.10)',
                        }}>
                          <Stack direction={{ xs:'column', sm:'row' }} spacing={1.5} alignItems={{ sm:'center' }}>
                            <FormControlLabel sx={{ flex:1, m:0 }}
                              control={
                                <Checkbox checked={present} size="small"
                                  onChange={e => onAssetToggle(assetCode, e.target.checked)}
                                  sx={{ color: present ? '#10B981' : '#D1D5DB', '&.Mui-checked': { color:'#10B981' } }} />
                              }
                              label={
                                <Box>
                                  <Stack direction="row" spacing={1} alignItems="center">
                                    <Typography sx={{ fontWeight:600, fontSize:13 }}>{asset.name}</Typography>
                                    {mandatory === 'Yes' && (
                                      <Chip label="Core" size="small"
                                        sx={{ fontSize:9.5, height:16, bgcolor:'rgba(232,71,42,0.10)', color:'#E8472A', fontWeight:700 }} />
                                    )}
                                  </Stack>
                                  <Typography sx={{ fontSize:11, color:'#9CA3AF' }}>{asset.desc}</Typography>
                                </Box>
                              }
                            />
                            {present && (
                              <Stack direction="row" spacing={1} sx={{ flexShrink:0 }}>
                                <TextField size="small" label="Est. Value (LKR)" type="number"
                                  value={value} onChange={e => onAssetValue(assetCode, 'value', e.target.value)}
                                  sx={{ width:160, '& .MuiOutlinedInput-root': { borderRadius:'8px', fontSize:12 } }} />
                                <TextField size="small" label="Notes" value={notes}
                                  onChange={e => onAssetValue(assetCode, 'notes', e.target.value)}
                                  sx={{ width:180, '& .MuiOutlinedInput-root': { borderRadius:'8px', fontSize:12 } }} />
                              </Stack>
                            )}
                          </Stack>
                          {present && (
                            <Typography sx={{ fontSize:11, color:'#6B7280', mt:0.5, pl:4 }}>
                              <strong>Valuation basis:</strong> {asset.valuationBasis} &nbsp;·&nbsp;
                              <strong>Data needed:</strong> {asset.dataRequired}
                            </Typography>
                          )}
                        </Box>
                      );
                    })}
                  </Stack>
                </Box>
              </Collapse>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}

// ─── Step 4: Risk Assessment Questions ───────────────────────────────────────
function StepRisk({ confirmedAssets, riskAnswers, onAnswer }) {
  const relevantRules = useMemo(() =>
    RISK_SCORING_RULES.filter(r =>
      confirmedAssets.some(ac =>
        ASSET_EXPOSURE_MAP.some(m => m.assetCode === ac && m.exposureCode === r.exposureCode)
      )
    ),
  [confirmedAssets]);

  const grouped = useMemo(() => {
    const map = {};
    relevantRules.forEach(r => {
      if (!map[r.exposureCode]) map[r.exposureCode] = [];
      map[r.exposureCode].push(r);
    });
    return map;
  }, [relevantRules]);

  const expLabels = {
    'EXP-FIRE':'Fire & Lightning', 'EXP-MB':'Machinery Breakdown', 'EXP-BOILER':'Boiler Explosion',
    'EXP-WCI':'Employee Injury', 'EXP-PL':'Public Liability', 'EXP-MAR':'Marine Cargo',
    'EXP-CYBER':'Cyber / Data Breach', 'EXP-BI':'Business Interruption', 'EXP-NATCAT':'Natural Perils',
  };

  if (relevantRules.length === 0) return (
    <Box sx={{ textAlign:'center', py:6 }}>
      <Typography sx={{ color:'#9CA3AF', fontWeight:600 }}>No risk questions applicable.</Typography>
      <Typography sx={{ fontSize:12.5, color:'#C4B5B0', mt:0.5 }}>Please confirm assets in the previous step first.</Typography>
    </Box>
  );

  return (
    <Box>
      {sectionHdr('Risk Assessment Questions', <AssessmentIcon />)}
      <Typography sx={{ fontSize:13, color:'#6B7280', mb:2.5 }}>
        Answer every question accurately. Adverse answers raise your risk score and generate targeted recommendations.
      </Typography>
      <Stack spacing={3}>
        {Object.entries(grouped).map(([expCode, rules]) => (
          <Box key={expCode}>
            {/* Exposure group header */}
            <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:1.5 }}>
              <Box sx={{ width:3, height:18, borderRadius:2, bgcolor:'#FF5A5A' }} />
              <Typography sx={{ fontWeight:800, fontSize:12.5, color:'#FF5A5A', textTransform:'uppercase', letterSpacing:0.8 }}>
                {expLabels[expCode] || expCode.replace('EXP-','')} Risk
              </Typography>
            </Box>
            <Stack spacing={1.5}>
              {rules.map(rule => {
                const answer    = riskAnswers[rule.id];
                // Answered and the answer matches the adverse condition
                const isAdverse = answer !== undefined && answer !== '' && answer === rule.answerCondition;
                // Answered but NOT adverse (safe answer)
                const isSafe    = answer !== undefined && answer !== '' && answer !== rule.answerCondition;

                return (
                  <Box key={rule.id} sx={{
                    p:2, borderRadius:'12px', transition:'all 0.15s',
                    bgcolor:  isAdverse ? 'rgba(239,68,68,0.04)' : isSafe ? 'rgba(16,185,129,0.03)' : '#fff',
                    border:   isAdverse ? '1.5px solid rgba(239,68,68,0.25)'
                            : isSafe    ? '1.5px solid rgba(16,185,129,0.20)'
                            :             '1px solid rgba(255,139,90,0.12)',
                  }}>
                    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb:1.2 }}>
                      <Typography sx={{ fontWeight:600, fontSize:13.5, color:'#1A1A2E', flex:1, lineHeight:1.5 }}>
                        {rule.question}
                      </Typography>
                      {isAdverse && <Chip label="⚠ Risk factor" size="small" sx={{ fontSize:10, fontWeight:700, bgcolor:'rgba(239,68,68,0.10)', color:'#dc2626', height:20, flexShrink:0 }} />}
                      {isSafe    && <Chip label="✓ Good"        size="small" sx={{ fontSize:10, fontWeight:700, bgcolor:'rgba(16,185,129,0.10)', color:'#059669',  height:20, flexShrink:0 }} />}
                    </Stack>

                    {rule.options ? (
                      // Multi-option questions (construction type, housekeeping, etc.)
                      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap:1 }}>
                        {rule.options.map(opt => {
                          const sel     = answer === opt;
                          const selAdv  = sel && opt === rule.answerCondition;
                          const selSafe = sel && opt !== rule.answerCondition;
                          return (
                            <Button key={opt} size="small"
                              variant={sel ? 'contained' : 'outlined'}
                              onClick={() => onAnswer(rule.id, opt)}
                              sx={{
                                fontSize:12, py:0.5, px:1.5, textAlign:'left', justifyContent:'flex-start',
                                ...(selAdv  ? { background:'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow:'none', color:'#fff' }
                                  : selSafe ? { background:'linear-gradient(135deg,#10B981,#059669)', boxShadow:'none', color:'#fff' }
                                  :           { borderColor:'rgba(107,114,128,0.3)', color:'#374151', bgcolor:'#fff',
                                                '&:hover':{ borderColor:'#FF5A5A', bgcolor:'rgba(255,90,90,0.03)' } }),
                              }}>
                              {opt}
                            </Button>
                          );
                        })}
                      </Stack>
                    ) : (
                      // Yes / No questions — store the literal answer
                      <Stack direction="row" spacing={1}>
                        {['Yes', 'No'].map(opt => {
                          const sel    = answer === opt;
                          const selAdv = sel && opt === rule.answerCondition;
                          const selSafe= sel && opt !== rule.answerCondition;
                          return (
                            <Button key={opt} size="small"
                              variant={sel ? 'contained' : 'outlined'}
                              onClick={() => onAnswer(rule.id, opt)}
                              sx={{
                                fontSize:12.5, py:0.5, minWidth:80, fontWeight:600,
                                ...(selAdv  ? { background:'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow:'none', color:'#fff' }
                                  : selSafe ? { background:'linear-gradient(135deg,#10B981,#059669)', boxShadow:'none', color:'#fff' }
                                  :           { borderColor:'rgba(107,114,128,0.3)', color:'#374151',
                                                '&:hover':{ borderColor:'#FF5A5A', bgcolor:'rgba(255,90,90,0.03)' } }),
                              }}>
                              {opt}
                            </Button>
                          );
                        })}
                      </Stack>
                    )}

                    {isAdverse && (
                      <Alert severity="warning" icon={<WarningAmberIcon sx={{ fontSize:16 }} />}
                        sx={{ mt:1.5, fontSize:12.5, py:0.5, '& .MuiAlert-icon':{ py:0.5 } }}>
                        <strong>Risk control required:</strong> {rule.rmAdvice}
                      </Alert>
                    )}
                  </Box>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

// ─── Step 5: Recommendations Report ──────────────────────────────────────────
function StepReport({ customer, industryCode, selectedPortfolios, confirmedAssets, assetData, riskAnswers, onSave, onSend, savedId, isSaved, saving }) {
  const recs = useMemo(() =>
    computeRecommendations(industryCode, selectedPortfolios, confirmedAssets),
  [industryCode, selectedPortfolios, confirmedAssets]);

  const industry = INDUSTRIES.find(i => i.code === industryCode);

  const [openProduct, setOpenProduct] = useState(null);

  const riskScore = useMemo(() => {
    let score = 0;
    RISK_SCORING_RULES.forEach(r => {
      if (riskAnswers[r.id] === r.answerCondition) score += r.scoreImpact;
    });
    return score;
  }, [riskAnswers]);

  const riskGrade = riskScore <= 4 ? { label:'Low',      color:'#059669', bg:'rgba(16,185,129,0.10)' }
                  : riskScore <= 8 ? { label:'Medium',   color:'#d97706', bg:'rgba(245,158,11,0.10)' }
                  : riskScore <= 14? { label:'High',     color:'#dc2626', bg:'rgba(239,68,68,0.10)'  }
                  :                  { label:'Critical', color:'#7c2d12', bg:'rgba(185,28,28,0.12)'  };

  const exportPdf = async () => {
    const { default: jsPDF }     = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const pdf  = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const pw   = pdf.internal.pageSize.getWidth();
    const today = new Date().toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });

    // Header
    pdf.setFillColor(26,26,46); pdf.rect(0,0,pw,22,'F');
    pdf.setFillColor(232,71,42); pdf.rect(0,22,pw,2.5,'F');
    pdf.setFontSize(12); pdf.setFont('helvetica','bold'); pdf.setTextColor(255,139,90);
    pdf.text('CEILAO INSURANCE BROKERS (PVT) LTD', pw/2, 10, {align:'center'});
    pdf.setFontSize(8); pdf.setFont('helvetica','normal'); pdf.setTextColor(148,163,184);
    pdf.text('INSURANCE BROKING & RISK MANAGEMENT  ·  SRI LANKA', pw/2,17,{align:'center'});

    // Title block
    pdf.setFillColor(249,250,251); pdf.rect(0,24.5,pw,14,'F');
    pdf.setFontSize(11); pdf.setFont('helvetica','bold'); pdf.setTextColor(26,26,46);
    pdf.text('PORTFOLIO REVIEW & INSURANCE RECOMMENDATION REPORT', pw/2, 31, {align:'center'});
    pdf.setFontSize(8); pdf.setFont('helvetica','normal'); pdf.setTextColor(107,114,128);
    pdf.text(`${customer.name || 'Client'}   ·   ${industry?.name || industryCode}   ·   ${today}`, pw/2, 36.5, {align:'center'});

    let y = 44;
    const addSection = (title) => {
      pdf.setFillColor(26,26,46); pdf.rect(10, y, pw-20, 8,'F');
      pdf.setFontSize(8.5); pdf.setFont('helvetica','bold'); pdf.setTextColor(255,139,90);
      pdf.text(title, 14, y+5.5);
      y += 11;
    };

    // Summary
    addSection('RISK ASSESSMENT SUMMARY');
    autoTable(pdf, {
      startY: y,
      body: [
        ['Customer', customer.name || '—'],
        ['Industry', industry?.name || industryCode],
        ['Risk Grade', `${riskGrade.label} (Score: ${riskScore})`],
        ['Assets Confirmed', confirmedAssets.length.toString()],
        ['Exposures Identified', recs.exposures.length.toString()],
        ['Recommended Products', recs.products.length.toString()],
        ['Assessment Date', customer.date || today],
        ['Prepared By', customer.broker || '—'],
      ],
      columnStyles: { 0:{ fontStyle:'bold', cellWidth:50 } },
      styles: { fontSize:8.5, cellPadding:{top:3,bottom:3,left:5,right:5} },
      margin: { left:10, right:10 },
      didParseCell: d => { if(d.row.index%2===0) d.cell.styles.fillColor=[255,255,255]; else d.cell.styles.fillColor=[255,248,245]; },
    });
    y = pdf.lastAutoTable.finalY + 8;

    // Recommended Products
    addSection('RECOMMENDED INSURANCE PROGRAMME');
    autoTable(pdf, {
      startY: y,
      head: [[
        {content:'#', styles:{fillColor:[26,26,46],textColor:[255,139,90],fontStyle:'bold',fontSize:8}},
        {content:'Product', styles:{fillColor:[26,26,46],textColor:[255,139,90],fontStyle:'bold',fontSize:8}},
        {content:'Recommendation', styles:{fillColor:[26,26,46],textColor:[255,139,90],fontStyle:'bold',fontSize:8}},
        {content:'Reason', styles:{fillColor:[26,26,46],textColor:[255,139,90],fontStyle:'bold',fontSize:8}},
      ]],
      body: recs.products.map((p,i) => [
        i+1, p.product.name, p.strength, p.reason,
      ]),
      columnStyles: { 0:{cellWidth:8}, 1:{cellWidth:50}, 2:{cellWidth:32} },
      styles: { fontSize:8, cellPadding:{top:3,bottom:3,left:4,right:4}, overflow:'linebreak' },
      margin: { left:10, right:10 },
    });
    y = pdf.lastAutoTable.finalY + 8;

    if (y > 250) { pdf.addPage(); y = 15; }

    // Risk Controls
    if (recs.ruleAdvice.length > 0) {
      addSection('RISK MANAGEMENT ADVICE');
      autoTable(pdf, {
        startY: y,
        head: [[
          {content:'Area', styles:{fillColor:[26,26,46],textColor:[255,139,90],fontStyle:'bold',fontSize:8}},
          {content:'Risk Control Recommendation', styles:{fillColor:[26,26,46],textColor:[255,139,90],fontStyle:'bold',fontSize:8}},
        ]],
        body: recs.ruleAdvice.map(r => [r.rule.portfolioCode?.replace('PF-',''), r.advice]),
        styles: { fontSize:8, cellPadding:{top:3,bottom:3,left:4,right:4}, overflow:'linebreak' },
        columnStyles: { 0:{cellWidth:32} },
        margin: { left:10, right:10 },
      });
    }

    // Footer — 18mm tall, two lines
    const ph = pdf.internal.pageSize.getHeight();
    pdf.setFillColor(26,26,46);  pdf.rect(0, ph-18, pw, 18, 'F');
    pdf.setFillColor(232,71,42); pdf.rect(0, ph-18, pw, 1.5, 'F');
    // Line 1: company name (left) + date (right)
    pdf.setFontSize(8); pdf.setFont('helvetica','bold'); pdf.setTextColor(255,139,90);
    pdf.text('InsureSAAS Insurance Brokers (Pvt) Ltd', 12, ph-11);
    pdf.setFont('helvetica','normal'); pdf.setFontSize(7); pdf.setTextColor(107,114,128);
    pdf.text(`Generated: ${today}`, pw-12, ph-11, {align:'right'});
    // Line 2: confidential note centred
    pdf.setFont('helvetica','italic'); pdf.setFontSize(6.5); pdf.setTextColor(148,163,184);
    pdf.text(
      'This report is confidential and prepared for the named client only.  Recommendations subject to underwriting confirmation.',
      pw/2, ph-4.5, {align:'center'}
    );

    pdf.save(`InsureSAAS_PortfolioReview_${(customer.name||'Client').replace(/\s+/g,'_')}.pdf`);
  };

  return (
    <Box>
      {/* Summary banner */}
      <Box sx={{ p:2.5, borderRadius:'14px', mb:3, background:'linear-gradient(135deg,#1A1A2E,#2d2d44)', color:'#fff' }}>
        <Stack direction={{ xs:'column', sm:'row' }} justifyContent="space-between" alignItems={{ sm:'center' }} spacing={2}>
          <Box>
            <Typography sx={{ fontWeight:800, fontSize:17, mb:0.3 }}>
              {customer.name || 'Client'} — Portfolio Review
            </Typography>
            <Typography sx={{ fontSize:12.5, color:'#9CA3AF' }}>
              {industry?.name || industryCode} · {confirmedAssets.length} assets · {recs.exposures.length} exposures · {recs.products.length} recommended products
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <Box sx={{ px:2, py:1, borderRadius:'10px', bgcolor: riskGrade.bg, textAlign:'center' }}>
              <Typography sx={{ fontSize:11, color: riskGrade.color, fontWeight:700, textTransform:'uppercase' }}>Risk Grade</Typography>
              <Typography sx={{ fontSize:22, fontWeight:900, color: riskGrade.color, lineHeight:1.1 }}>{riskGrade.label}</Typography>
              <Typography sx={{ fontSize:10, color: riskGrade.color }}>Score: {riskScore}</Typography>
            </Box>
            <Stack spacing={0.8}>
              <Button variant="contained" startIcon={<FileDownloadOutlinedIcon />} onClick={exportPdf}
                sx={{ background:'linear-gradient(135deg,#E8472A,#E8712A)', fontSize:12 }}>
                Export PDF
              </Button>
              <Button variant="contained"
                startIcon={saving ? <CircularProgress size={14} color="inherit" /> : isSaved ? <CheckCircleIcon /> : <SaveOutlinedIcon />}
                onClick={onSave} disabled={saving || isSaved}
                sx={{ background: isSaved ? 'linear-gradient(135deg,#10B981,#059669)' : savedId ? 'linear-gradient(135deg,#d97706,#f59e0b)' : 'linear-gradient(135deg,#6366f1,#818cf8)', fontSize:12, boxShadow:'none' }}>
                {saving ? 'Saving…' : isSaved ? 'Saved ✓' : savedId ? 'Save Changes' : 'Save Review'}
              </Button>
              <Button variant="outlined" startIcon={<SendIcon />} onClick={onSend}
                sx={{ fontSize:12, borderColor:'rgba(255,139,90,0.4)', color:'#FF8B5A' }}>
                Send to Client
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Box>

      {/* Exposures */}
      <Box sx={{ mb:3 }}>
        {sectionHdr('Risk Exposures Identified', <WarningAmberIcon />)}
        {(!recs?.exposures?.length) && (
          <Typography sx={{ color:'#9CA3AF', fontSize:13 }}>No exposures identified for the confirmed assets.</Typography>
        )}
        <Box sx={{ display:'grid', gridTemplateColumns:{ xs:'1fr', sm:'1fr 1fr 1fr' }, gap:1.5 }}>
          {(recs?.exposures || []).map(exp => (
            <Box key={exp.code} sx={{ p:1.5, borderRadius:'10px', bgcolor: exp.relevance==='High' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)', border: `1px solid ${exp.relevance==='High' ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)'}` }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography sx={{ fontWeight:700, fontSize:12.5 }}>{exp.name}</Typography>
                <Chip label={exp.relevance} size="small" sx={{ fontSize:10, fontWeight:700, height:18,
                  bgcolor: exp.relevance==='High' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                  color:   exp.relevance==='High' ? '#dc2626' : '#d97706' }} />
              </Stack>
              <Typography sx={{ fontSize:11, color:'#6B7280', mt:0.3 }}>{exp.desc}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      {/* Recommended Products */}
      <Box sx={{ mb:3 }}>
        {sectionHdr('Recommended Insurance Programme', <ShieldIcon />)}
        <Stack spacing={1.5}>
          {(recs?.products || []).map((p, idx) => {
            const st   = STRENGTH_COLORS[p.strength] || STRENGTH_COLORS['Recommended'];
            const open = openProduct === p.product.code;
            return (
              <Card key={p.product.code} elevation={0}
                sx={{ border:`1.5px solid ${open ? '#E8472A' : 'rgba(255,139,90,0.15)'}`, borderRadius:'12px' }}>
                <Box sx={{ p:2, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}
                  onClick={() => setOpenProduct(open ? null : p.product.code)}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box sx={{ width:32, height:32, borderRadius:'8px', bgcolor:'rgba(232,71,42,0.08)',
                               display:'flex', alignItems:'center', justifyContent:'center',
                               fontWeight:800, fontSize:13, color:'#E8472A' }}>
                      {idx+1}
                    </Box>
                    <Box>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography sx={{ fontWeight:700, fontSize:14 }}>{p.product.name}</Typography>
                        <Chip label={st.label} size="small"
                          sx={{ fontSize:10, fontWeight:700, height:18, bgcolor:st.bg, color:st.color }} />
                        <Chip label={p.product.family} size="small"
                          sx={{ fontSize:10, height:18, bgcolor:'rgba(99,102,241,0.08)', color:'#6366f1' }} />
                      </Stack>
                      <Typography sx={{ fontSize:12, color:'#6B7280' }}>{p.reason}</Typography>
                    </Box>
                  </Stack>
                  {open ? <ExpandLessIcon sx={{ color:'#9CA3AF', flexShrink:0 }} /> : <ExpandMoreIcon sx={{ color:'#9CA3AF', flexShrink:0 }} />}
                </Box>
                <Collapse in={open}>
                  <Divider />
                  <Box sx={{ p:2 }}>
                    <Typography sx={{ fontSize:12.5, color:'#374151', mb:1.5 }}>{p.product.desc}</Typography>
                    {p.clauses.length > 0 && (
                      <>
                        <Typography sx={{ fontWeight:700, fontSize:11.5, color:'#1A1A2E', mb:1, textTransform:'uppercase', letterSpacing:0.5 }}>
                          Recommended Clauses
                        </Typography>
                        <Stack spacing={0.8}>
                          {p.clauses.map(cl => {
                            const cs = { Mandatory:{ bg:'rgba(239,68,68,0.08)',color:'#dc2626' }, Strong:{ bg:'rgba(245,158,11,0.08)',color:'#d97706' }, Recommended:{ bg:'rgba(16,185,129,0.08)',color:'#059669' }, Conditional:{ bg:'rgba(99,102,241,0.08)',color:'#6366f1' } };
                            const c = cs[cl.level] || cs.Recommended;
                            return (
                              <Box key={cl.code} sx={{ display:'flex', gap:1.5, alignItems:'flex-start', p:1.2, borderRadius:'8px', bgcolor:c.bg }}>
                                <Chip label={cl.level} size="small" sx={{ fontSize:9.5, fontWeight:700, height:16, bgcolor:'transparent', color:c.color, flexShrink:0 }} />
                                <Box>
                                  <Typography sx={{ fontWeight:600, fontSize:12, color:'#1A1A2E' }}>{cl.name}</Typography>
                                  <Typography sx={{ fontSize:11, color:'#6B7280' }}>{cl.purpose} · <em>{cl.trigger}</em></Typography>
                                </Box>
                              </Box>
                            );
                          })}
                        </Stack>
                      </>
                    )}
                  </Box>
                </Collapse>
              </Card>
            );
          })}
        </Stack>
      </Box>

      {/* Risk Management Advice */}
      {(recs?.ruleAdvice?.length > 0) && (
        <Box>
          {sectionHdr('Risk Management Advice', <BuildIcon />)}
          <Stack spacing={1}>
            {(recs?.ruleAdvice || []).map(r => (
              <Box key={r.rule.ruleId} sx={{ p:1.5, borderRadius:'10px', bgcolor:'rgba(99,102,241,0.04)',
                                             border:'1px solid rgba(99,102,241,0.12)', display:'flex', gap:1.5 }}>
                <Box sx={{ width:28, height:28, borderRadius:'8px', bgcolor:'rgba(99,102,241,0.12)',
                           display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <BuildIcon sx={{ fontSize:15, color:'#6366f1' }} />
                </Box>
                <Box>
                  <Typography sx={{ fontWeight:600, fontSize:12.5, color:'#1A1A2E' }}>
                    {r.rule.portfolioCode?.replace('PF-','')} — {r.rule.assetCode?.replace('AST-','')}
                  </Typography>
                  <Typography sx={{ fontSize:12, color:'#4B5563' }}>{r.advice}</Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
}

// ─── Email HTML builder ───────────────────────────────────────────────────────
function buildEmailHtml({ customer, industryName, riskGrade, recs, riskScore, customMessage, brokerName }) {
  const products = recs.products.slice(0, 6);
  const advice   = recs.ruleAdvice.slice(0, 4);
  const gradeColor = { Low:'#059669', Medium:'#d97706', High:'#dc2626', Critical:'#7c2d12' }[riskGrade.label] || '#374151';
  const gradeBg    = { Low:'#D1FAE5', Medium:'#FEF3C7', High:'#FEE2E2', Critical:'#FEE2E2' }[riskGrade.label] || '#F3F4F6';

  const productRows = products.map((p, i) => `
    <tr style="background:${i%2===0?'#fff':'#FFF8F5'};">
      <td style="padding:9px 12px;font-weight:600;font-size:13px;color:#1A1A2E;">${i+1}. ${p.product.name}</td>
      <td style="padding:9px 12px;font-size:12px;color:#6B7280;">${p.product.family}</td>
      <td style="padding:9px 12px;">
        <span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;
          background:${p.strength.includes('Mandatory')?'#FEE2E2':p.strength==='Strong'?'#FEF3C7':'#D1FAE5'};
          color:${p.strength.includes('Mandatory')?'#DC2626':p.strength==='Strong'?'#D97706':'#059669'};">
          ${p.strength.includes('Mandatory')?'Mandatory':p.strength}
        </span>
      </td>
    </tr>`).join('');

  const adviceRows = advice.map(r => `
    <li style="margin:6px 0;font-size:13px;color:#374151;line-height:1.6;">${r.advice}</li>`).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:20px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- HEADER -->
  <tr><td style="background:#1A1A2E;padding:28px 32px;text-align:center;">
    <div style="color:#FF8B5A;font-size:20px;font-weight:bold;letter-spacing:0.5px;">CEILAO INSURANCE BROKERS</div>
    <div style="color:#9CA3AF;font-size:11px;margin-top:5px;letter-spacing:1px;">INSURANCE BROKING &amp; RISK MANAGEMENT &nbsp;·&nbsp; SRI LANKA</div>
  </td></tr>
  <tr><td style="background:linear-gradient(90deg,#E8472A,#E8712A);height:4px;"></td></tr>

  <!-- BODY -->
  <tr><td style="padding:32px;">
    <p style="font-size:15px;color:#374151;margin:0 0 8px;">Dear <strong>${customer.name || 'Valued Client'}</strong>,</p>
    <p style="font-size:13.5px;color:#6B7280;line-height:1.7;margin:0 0 24px;">
      Please find below your personalised <strong>Portfolio Insurance Review</strong> prepared by InsureSAAS Insurance Brokers.
      This report outlines the key risks identified for your business and our professional insurance recommendations.
    </p>
    ${customMessage ? `<p style="font-size:13.5px;color:#374151;background:#FFF8F5;border-left:3px solid #E8472A;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 24px;">${customMessage}</p>` : ''}

    <!-- RISK GRADE -->
    <div style="background:#F9FAFB;border-radius:10px;padding:20px;margin-bottom:24px;text-align:center;">
      <div style="font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Overall Risk Grade</div>
      <div style="display:inline-block;background:${gradeBg};color:${gradeColor};font-size:28px;font-weight:900;padding:8px 28px;border-radius:10px;">${riskGrade.label}</div>
      <div style="font-size:12px;color:#9CA3AF;margin-top:6px;">Risk Score: ${riskScore} &nbsp;·&nbsp; ${industryName}</div>
    </div>

    <!-- RECOMMENDED PROGRAMME -->
    <div style="margin-bottom:24px;">
      <div style="font-size:13px;font-weight:800;color:#1A1A2E;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #FEE2E2;">
        🛡️ Recommended Insurance Programme
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:8px;overflow:hidden;">
        <tr style="background:#1A1A2E;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#FF8B5A;font-weight:700;text-transform:uppercase;">Product</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#FF8B5A;font-weight:700;text-transform:uppercase;">Category</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#FF8B5A;font-weight:700;text-transform:uppercase;">Priority</th>
        </tr>
        ${productRows}
      </table>
    </div>

    ${advice.length > 0 ? `
    <!-- RISK CONTROLS -->
    <div style="margin-bottom:24px;">
      <div style="font-size:13px;font-weight:800;color:#1A1A2E;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #EDE9FE;">
        🔧 Key Risk Management Recommendations
      </div>
      <ul style="margin:0;padding-left:18px;">${adviceRows}</ul>
    </div>` : ''}

    <div style="background:#F9FAFB;border-radius:8px;padding:16px;font-size:12.5px;color:#6B7280;line-height:1.7;margin-bottom:24px;">
      <strong style="color:#374151;">Next Steps:</strong> Please contact us to discuss your insurance programme in detail.
      We can arrange quotations from multiple leading insurers and provide a full comparison for your review.
    </div>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="background:#1A1A2E;padding:20px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="color:#FF8B5A;font-size:13px;font-weight:700;">${brokerName || 'InsureSAAS Insurance Brokers'}</div>
          <div style="color:#9CA3AF;font-size:11px;margin-top:3px;">InsureSAAS Insurance Brokers (Pvt) Ltd</div>
          <div style="color:#9CA3AF;font-size:11px;">Insurance Broking &amp; Risk Management &nbsp;·&nbsp; Sri Lanka</div>
        </td>
        <td align="right">
          <div style="color:#6B7280;font-size:10px;text-align:right;">
            This report is confidential.<br>Recommendations subject to underwriting confirmation.
          </div>
        </td>
      </tr>
    </table>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ─── Send to Customer Dialog ──────────────────────────────────────────────────
function SendDialog({ open, onClose, customer, industryCode, recs, riskGrade, riskScore }) {
  const [toEmail,   setToEmail]   = useState(customer.email  || '');
  const [toPhone,   setToPhone]   = useState(customer.phone  || '');
  const [message,   setMessage]   = useState('');
  const [sending,   setSending]   = useState(false);
  const [sent,      setSent]      = useState(false);
  const [tab,       setTab]       = useState(0); // 0=Email 1=WhatsApp
  const [copied,    setCopied]    = useState(false);
  const [error,     setError]     = useState('');

  const industry = INDUSTRIES.find(i => i.code === industryCode);

  useEffect(() => { setToEmail(customer.email || ''); setToPhone(customer.phone || ''); }, [customer]);

  const whatsappText = useMemo(() => {
    const top5 = recs.products.slice(0, 5).map((p, i) => `${i+1}. ${p.product.name} — ${p.strength.includes('Mandatory') ? 'Mandatory' : p.strength}`).join('\n');
    return `Dear ${customer.name || 'Valued Client'},\n\nPlease find your *Portfolio Insurance Review* from InsureSAAS Insurance Brokers below.\n\n*Industry:* ${industry?.name || industryCode}\n*Risk Grade:* ${riskGrade.label} (Score: ${riskScore})\n\n*Recommended Insurance Programme:*\n${top5}\n\n${message ? `${message}\n\n` : ''}Please contact us to discuss your insurance programme.\n\n${customer.broker || 'Your Broker'}\nInsureSAAS Insurance Brokers (Pvt) Ltd\nInsurance Broking & Risk Management · Sri Lanka`;
  }, [customer, industry, industryCode, recs, riskGrade, riskScore, message]);

  const sendEmail = async () => {
    if (!toEmail.trim()) { setError('Please enter an email address.'); return; }
    setSending(true); setError('');
    try {
      const html = buildEmailHtml({ customer, industryName: industry?.name || industryCode, riskGrade, recs, riskScore, customMessage: message, brokerName: customer.broker });
      await emailjs.send(EMAILJS_SERVICE, EMAILJS_PORTFOLIO_TEMPLATE, {
        to_email:      toEmail.trim(),
        to_name:       customer.name || 'Valued Client',
        reference:     `Portfolio Review — ${customer.name}`,
        product:       industry?.name || 'Portfolio Review',
        table_html:    html,
        company_count: recs.products.length,
      }, { publicKey: EMAILJS_KEY });
      setSent(true);
      setTimeout(() => { setSent(false); onClose(); }, 2500);
    } catch (err) {
      setError(err?.text || err?.message || 'Email failed. Please try again.');
    }
    setSending(false);
  };

  const copyWhatsApp = () => {
    navigator.clipboard.writeText(whatsappText).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const openWhatsApp = () => {
    const num = toPhone.replace(/\D/g,'');
    if (num) window.open(`https://wa.me/${num.startsWith('0') ? '94'+num.slice(1) : num}?text=${encodeURIComponent(whatsappText)}`, '_blank');
    else copyWhatsApp();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb:0 }}>Send Portfolio Review to Client</DialogTitle>
      <DialogContent sx={{ pt:2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb:2.5, borderBottom:'1px solid rgba(255,139,90,0.12)',
          '& .MuiTab-root': { fontSize:13, fontWeight:600, textTransform:'none' },
          '& .Mui-selected': { color:'#E8472A' }, '& .MuiTabs-indicator': { background:'#E8472A' } }}>
          <Tab icon={<EmailOutlinedIcon sx={{ fontSize:16 }} />} iconPosition="start" label="Email" />
          <Tab icon={<span style={{ fontSize:15 }}>💬</span>} iconPosition="start" label="WhatsApp" />
        </Tabs>

        {tab === 0 && (
          <Box>
            <TextField fullWidth size="small" label="To (Email Address)" type="email"
              value={toEmail} onChange={e => setToEmail(e.target.value)} sx={{ mb:2 }} />
            <TextField fullWidth size="small" multiline rows={3}
              label="Personal message (optional)" placeholder="E.g. Hi John, following our meeting…"
              value={message} onChange={e => setMessage(e.target.value)} sx={{ mb:2 }} />
            <Alert severity="info" sx={{ fontSize:12, mb:1.5 }}>
              The email will include your branding, risk grade, full product recommendations, and risk management advice.
            </Alert>
            {error && <Alert severity="error" sx={{ fontSize:12, mb:1 }}>{error}</Alert>}
            {sent  && <Alert severity="success" sx={{ fontSize:12, mb:1 }}>✓ Email sent successfully!</Alert>}
          </Box>
        )}

        {tab === 1 && (
          <Box>
            <TextField fullWidth size="small" label="WhatsApp Number (e.g. 0771234567)"
              value={toPhone} onChange={e => setToPhone(e.target.value)} sx={{ mb:2 }} />
            <TextField fullWidth size="small" multiline rows={3}
              label="Personal message (optional)" value={message}
              onChange={e => setMessage(e.target.value)} sx={{ mb:2 }} />
            <Box sx={{ p:2, borderRadius:'10px', bgcolor:'#F0FDF4', border:'1px solid rgba(16,185,129,0.2)', mb:2 }}>
              <Typography sx={{ fontSize:11, fontWeight:700, color:'#059669', mb:1 }}>Message Preview</Typography>
              <Typography sx={{ fontSize:11.5, color:'#374151', whiteSpace:'pre-line', lineHeight:1.6, fontFamily:'monospace', maxHeight:160, overflow:'auto' }}>
                {whatsappText}
              </Typography>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px:3, py:2, gap:1 }}>
        <Button onClick={onClose} variant="outlined" sx={{ borderColor:'#e0e0e0', color:'#6B7280', fontSize:13 }}>Cancel</Button>
        {tab === 0 ? (
          <Button variant="contained" startIcon={sending ? <CircularProgress size={14} color="inherit" /> : <SendIcon />}
            onClick={sendEmail} disabled={sending || sent} sx={{ fontSize:13 }}>
            {sending ? 'Sending…' : sent ? 'Sent ✓' : 'Send Email'}
          </Button>
        ) : (
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={copyWhatsApp}
              sx={{ fontSize:12, borderColor:'rgba(16,185,129,0.4)', color:'#059669' }}>
              {copied ? 'Copied!' : 'Copy Message'}
            </Button>
            <Button variant="contained" startIcon={<span>💬</span>} onClick={openWhatsApp}
              sx={{ fontSize:12, background:'linear-gradient(135deg,#25D366,#128C7E)' }}>
              Open WhatsApp
            </Button>
          </Stack>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ─── Saved Reviews Dashboard ─────────────────────────────────────────────────
function SavedReviews({ onEdit }) {
  const [reviews,  setReviews]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,      setSearch]      = useState('');
  const [filterGrade, setFilterGrade] = useState('all'); // all | Low | Medium | High | Critical
  const [pPage,    setPPage]    = useState(1);
  const P_PER_PAGE = 15;
  const [viewItem, setViewItem] = useState(null);
  const [sendItem, setSendItem] = useState(null);
  const [deleting, setDeleting] = useState('');
  const [toast,    setToast]    = useState({ open:false, msg:'', sev:'success' });

  useEffect(() => {
    const q = query(collection(db, 'portfolio_assessments'), orderBy('created_at', 'desc'));
    return onSnapshot(q, snap => {
      setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  const gradeStyle = { Low:{ color:'#059669', bg:'rgba(16,185,129,0.10)' }, Medium:{ color:'#d97706', bg:'rgba(245,158,11,0.10)' }, High:{ color:'#dc2626', bg:'rgba(239,68,68,0.10)' }, Critical:{ color:'#7c2d12', bg:'rgba(185,28,28,0.12)' } };

  const timeAgo = ts => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  };

  const filtered = reviews.filter(r => {
    if (filterGrade !== 'all' && r.risk_grade !== filterGrade) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return [r.customer_name, r.industry_name, r.risk_grade, r.customer_email, r.customer_broker]
      .some(v => (v||'').toLowerCase().includes(q));
  });

  const handleDelete = async (id) => {
    setDeleting(id);
    try { await deleteDoc(doc(db, 'portfolio_assessments', id)); }
    catch { setToast({ open:true, msg:'Delete failed', sev:'error' }); }
    setDeleting('');
  };

  const counts = { total: reviews.length, High: reviews.filter(r=>r.risk_grade==='High'||r.risk_grade==='Critical').length, sent: reviews.filter(r=>r.status==='sent').length };

  return (
    <Box>
      {/* Stats */}
      <Stack direction="row" spacing={1.5} sx={{ mb:3 }}>
        {[
          { label:'Total Reviews',   val: counts.total,     color:'#6366f1', bg:'rgba(99,102,241,0.08)'  },
          { label:'High / Critical', val: counts.High,      color:'#dc2626', bg:'rgba(239,68,68,0.08)'   },
          { label:'Sent to Clients', val: counts.sent,      color:'#059669', bg:'rgba(16,185,129,0.08)'  },
        ].map(s => (
          <Box key={s.label} sx={{ flex:1, p:2, borderRadius:'12px', bgcolor:s.bg, border:`1px solid ${s.bg}` }}>
            <Typography sx={{ fontSize:24, fontWeight:800, color:s.color }}>{s.val}</Typography>
            <Typography sx={{ fontSize:11.5, color:s.color, opacity:0.8 }}>{s.label}</Typography>
          </Box>
        ))}
      </Stack>

      {/* Search + grade filter */}
      <Stack direction={{ xs:'column', sm:'row' }} spacing={1.5} alignItems="center" sx={{ mb:2.5 }}>
        <TextField size="small" placeholder="Search by customer, industry, broker…"
          value={search} onChange={e => setSearch(e.target.value)}
          sx={{ flex:1, '& .MuiOutlinedInput-root': { borderRadius:'10px', fontSize:13 } }} />
        <Stack direction="row" spacing={0.8} flexShrink={0}>
          {['all','Low','Medium','High','Critical'].map(g => {
            const gc = { all:{bg:'rgba(99,102,241,0.10)',c:'#6366f1'}, Low:{bg:'rgba(16,185,129,0.10)',c:'#059669'}, Medium:{bg:'rgba(245,158,11,0.10)',c:'#d97706'}, High:{bg:'rgba(239,68,68,0.10)',c:'#dc2626'}, Critical:{bg:'rgba(124,45,18,0.10)',c:'#7c2d12'} };
            const active = filterGrade === g;
            return (
              <Chip key={g} label={g === 'all' ? 'All' : g} size="small" clickable
                onClick={() => setFilterGrade(g)}
                sx={{ fontSize:11.5, fontWeight:700, height:26,
                  bgcolor: active ? gc[g].bg : 'transparent',
                  color:   active ? gc[g].c  : '#9CA3AF',
                  border:  active ? `1.5px solid ${gc[g].c}` : '1.5px solid rgba(107,114,128,0.20)',
                }} />
            );
          })}
        </Stack>
      </Stack>

      {loading ? (
        <Box sx={{ textAlign:'center', py:6 }}><CircularProgress sx={{ color:'#FF5A5A' }} /></Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ textAlign:'center', py:6 }}>
          <Typography sx={{ color:'#9CA3AF', fontWeight:600 }}>No saved reviews yet.</Typography>
          <Typography sx={{ fontSize:12.5, color:'#C4B5B0', mt:0.5 }}>Complete an assessment and click "Save Review" to store it here.</Typography>
        </Box>
      ) : (
        <Stack spacing={1.5}>
          {filtered.slice((pPage-1)*P_PER_PAGE, pPage*P_PER_PAGE).map(r => {
            const gs = gradeStyle[r.risk_grade] || gradeStyle.Medium;
            return (
              <Card key={r.id} elevation={0} sx={{ border:'1.5px solid rgba(255,139,90,0.12)', borderRadius:'12px', '&:hover': { boxShadow:'0 4px 16px rgba(255,90,90,0.08)' } }}>
                <CardContent sx={{ p:2, '&:last-child': { pb:2 } }}>
                  <Stack direction={{ xs:'column', sm:'row' }} justifyContent="space-between" alignItems={{ sm:'center' }} spacing={1.5}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Box sx={{ width:44, height:44, borderRadius:'10px', bgcolor:gs.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <Typography sx={{ fontWeight:900, fontSize:11, color:gs.color }}>{r.risk_grade || '—'}</Typography>
                      </Box>
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography sx={{ fontWeight:700, fontSize:14, color:'#1A1A2E' }}>{r.customer_name}</Typography>
                          {r.status === 'sent' && <Chip label="Sent" size="small" sx={{ fontSize:9.5, height:16, bgcolor:'rgba(16,185,129,0.10)', color:'#059669', fontWeight:700 }} />}
                        </Stack>
                        <Typography sx={{ fontSize:12, color:'#6B7280' }}>
                          {r.industry_name} · {r.recommendations_count || 0} products · {timeAgo(r.created_at)}
                        </Typography>
                        {(r.customer_email || r.customer_phone) && (
                          <Typography sx={{ fontSize:11, color:'#9CA3AF' }}>
                            {r.customer_email}{r.customer_email && r.customer_phone ? ' · ' : ''}{r.customer_phone}
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={0.5} flexShrink={0}>
                      <Tooltip title="View Report"><IconButton size="small" onClick={() => setViewItem(r)}
                        sx={{ borderRadius:'8px', bgcolor:'rgba(99,102,241,0.08)', color:'#6366f1', '&:hover': { bgcolor:'rgba(99,102,241,0.15)' } }}>
                        <VisibilityOutlinedIcon sx={{ fontSize:17 }} /></IconButton></Tooltip>
                      <Tooltip title="Edit Assessment"><IconButton size="small" onClick={() => onEdit(r)}
                        sx={{ borderRadius:'8px', bgcolor:'rgba(245,158,11,0.08)', color:'#d97706', '&:hover': { bgcolor:'rgba(245,158,11,0.15)' } }}>
                        <EditOutlinedIcon sx={{ fontSize:17 }} /></IconButton></Tooltip>
                      <Tooltip title="Send to Client"><IconButton size="small" onClick={() => setSendItem(r)}
                        sx={{ borderRadius:'8px', bgcolor:'rgba(16,185,129,0.08)', color:'#059669', '&:hover': { bgcolor:'rgba(16,185,129,0.15)' } }}>
                        <SendIcon sx={{ fontSize:17 }} /></IconButton></Tooltip>
                      <Tooltip title="Delete"><IconButton size="small" onClick={() => handleDelete(r.id)} disabled={deleting===r.id}
                        sx={{ borderRadius:'8px', bgcolor:'rgba(239,68,68,0.06)', color:'#dc2626', '&:hover': { bgcolor:'rgba(239,68,68,0.15)' } }}>
                        {deleting===r.id ? <CircularProgress size={14} color="inherit" /> : <DeleteOutlineIcon sx={{ fontSize:17 }} />}
                      </IconButton></Tooltip>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length > P_PER_PAGE && (
            <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', pt:1.5, flexWrap:'wrap', gap:1 }}>
              <Typography sx={{ fontSize:12.5, color:'#9CA3AF' }}>
                Showing {(pPage-1)*P_PER_PAGE+1}–{Math.min(pPage*P_PER_PAGE, filtered.length)} of {filtered.length}
              </Typography>
              <Pagination count={Math.ceil(filtered.length/P_PER_PAGE)} page={pPage}
                onChange={(_,v)=>{ setPPage(v); window.scrollTo({top:0,behavior:'smooth'}); }}
                shape="rounded" size="small" />
            </Box>
          )}
        </Stack>
      )}

      {/* View Report Dialog */}
      {viewItem && (
        <Dialog open onClose={() => setViewItem(null)} maxWidth="md" fullWidth PaperProps={{ sx: { maxHeight:'90vh' } }}>
          <DialogTitle>Portfolio Review — {viewItem.customer_name}</DialogTitle>
          <DialogContent dividers>
            <StepReport
              customer={{ name:viewItem.customer_name, email:viewItem.customer_email, phone:viewItem.customer_phone, broker:viewItem.customer_broker, date:viewItem.assessment_date }}
              industryCode={viewItem.industry_code}
              selectedPortfolios={viewItem.selected_portfolios || []}
              confirmedAssets={Object.entries(viewItem.asset_data||{}).filter(([,d])=>d.present).map(([c])=>c)}
              assetData={viewItem.asset_data || {}}
              riskAnswers={viewItem.risk_answers || {}}
              savedId={viewItem.id}
            />
          </DialogContent>
          <DialogActions sx={{ px:3, py:2 }}>
            <Button onClick={() => setViewItem(null)} variant="outlined" sx={{ borderColor:'#e0e0e0', color:'#6B7280' }}>Close</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Send Dialog from saved review */}
      {sendItem && (() => {
        const recs = computeRecommendations(sendItem.industry_code, sendItem.selected_portfolios || [],
          Object.entries(sendItem.asset_data||{}).filter(([,d])=>d.present).map(([c])=>c));
        const rs = sendItem.risk_score || 0;
        const rg = rs<=4?{label:'Low'}:rs<=8?{label:'Medium'}:rs<=14?{label:'High'}:{label:'Critical'};
        return (
          <SendDialog open onClose={() => setSendItem(null)}
            customer={{ name:sendItem.customer_name, email:sendItem.customer_email, phone:sendItem.customer_phone, broker:sendItem.customer_broker }}
            industryCode={sendItem.industry_code} recs={recs} riskGrade={rg} riskScore={rs} />
        );
      })()}

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast(t=>({...t,open:false}))}>
        <Alert severity={toast.sev} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const { user, userProfile } = useAuth();
  const [activeTab,  setActiveTab]  = useState(0); // 0=New 1=Saved
  const [step,       setStep]       = useState(0);
  const [customer,   setCustomer]   = useState({ name:'', industry:'', date:new Date().toISOString().split('T')[0], contact:'', broker:'', email:'', phone:'' });
  const [selectedPortfolios, setSelectedPortfolios] = useState([]);
  const [assetData,   setAssetData]   = useState({});
  const [riskAnswers, setRiskAnswers] = useState({});
  const [savedId,     setSavedId]     = useState('');  // Firestore doc ID of existing review
  const [isSaved,     setIsSaved]     = useState(false); // true = current state matches saved state
  const [saving,      setSaving]      = useState(false);
  const [sendOpen,    setSendOpen]    = useState(false);
  const [toast,       setToast]       = useState({ open:false, msg:'', sev:'success' });

  const confirmedAssets = useMemo(() =>
    Object.entries(assetData).filter(([, d]) => d.present).map(([code]) => code),
  [assetData]);

  const recs = useMemo(() =>
    computeRecommendations(customer.industry, selectedPortfolios, confirmedAssets),
  [customer.industry, selectedPortfolios, confirmedAssets]);

  const riskScore = useMemo(() => {
    let score = 0;
    RISK_SCORING_RULES.forEach(r => { if (riskAnswers[r.id] === r.answerCondition) score += r.scoreImpact; });
    return score;
  }, [riskAnswers]);
  const riskGrade = riskScore<=4?{label:'Low'}:riskScore<=8?{label:'Medium'}:riskScore<=14?{label:'High'}:{label:'Critical'};

  const markUnsaved = () => setIsSaved(false);

  const setCustomerField = useCallback((key, val) => { setCustomer(c => ({ ...c, [key]: val })); markUnsaved(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const togglePortfolio  = useCallback((code) => {
    setSelectedPortfolios(prev => prev.includes(code) ? prev.filter(c=>c!==code) : [...prev,code]);
    setAssetData({});
    markUnsaved();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleAsset    = useCallback((code, present) => { setAssetData(prev => ({ ...prev, [code]: { ...(prev[code]||{}), present } })); markUnsaved(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setAssetValue  = useCallback((code, key, val) => { setAssetData(prev => ({ ...prev, [code]: { ...(prev[code]||{}), [key]: val } })); markUnsaved(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const setRiskAnswer  = useCallback((id, ans) => { setRiskAnswers(prev => ({ ...prev, [id]: ans })); markUnsaved(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const canNext = () => {
    if (step === 0) return customer.name.trim() && customer.industry;
    if (step === 1) return selectedPortfolios.length > 0;
    if (step === 2) return confirmedAssets.length > 0;
    return true;
  };

  const reset = (keepTab = false) => {
    setStep(0);
    setCustomer({ name:'', industry:'', date:new Date().toISOString().split('T')[0], contact:'', broker:'', email:'', phone:'' });
    setSelectedPortfolios([]);
    setAssetData({});
    setRiskAnswers({});
    setSavedId('');
    setIsSaved(false);
    if (!keepTab) setActiveTab(0);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const industry = INDUSTRIES.find(i => i.code === customer.industry);
      const payload = {
        customer_name:          customer.name,
        customer_email:         customer.email || '',
        customer_phone:         customer.phone || '',
        customer_contact:       customer.contact || '',
        customer_broker:        customer.broker || userProfile?.full_name || '',
        assessment_date:        customer.date,
        industry_code:          customer.industry,
        industry_name:          industry?.name || customer.industry,
        selected_portfolios:    selectedPortfolios,
        asset_data:             assetData,
        risk_answers:           riskAnswers,
        risk_score:             riskScore,
        risk_grade:             riskGrade.label,
        recommendations_count:  (recs?.products || []).length,
        status:                 'draft',
        updated_at:             serverTimestamp(),
      };

      if (savedId) {
        // Update existing review
        await updateDoc(doc(db, 'portfolio_assessments', savedId), payload);
        setToast({ open:true, msg:'Portfolio review updated successfully!', sev:'success' });
      } else {
        // Create new review
        const docRef = await addDoc(collection(db, 'portfolio_assessments'), {
          ...payload,
          created_by:      user?.uid || '',
          created_by_name: userProfile?.full_name || '',
          created_at:      serverTimestamp(),
        });
        setSavedId(docRef.id);
        setToast({ open:true, msg:'Portfolio review saved successfully!', sev:'success' });
      }
      setIsSaved(true);
    } catch (err) {
      setToast({ open:true, msg:'Save failed: ' + err.message, sev:'error' });
    }
    setSaving(false);
  };

  const loadSavedReview = (r) => {
    setCustomer({
      name: r.customer_name || '', industry: r.industry_code || '',
      date: r.assessment_date || new Date().toISOString().split('T')[0],
      contact: r.customer_contact || '', broker: r.customer_broker || '',
      email: r.customer_email || '', phone: r.customer_phone || '',
    });
    setSelectedPortfolios(r.selected_portfolios || []);
    setAssetData(r.asset_data || {});
    setRiskAnswers(r.risk_answers || {});
    setSavedId(r.id);
    setIsSaved(true);  // just loaded — no unsaved changes yet
    setStep(4);
    setActiveTab(0);
  };

  return (
    <Box sx={{ maxWidth:960, mx:'auto' }}>
      {/* Page header */}
      <Stack direction={{ xs:'column', sm:'row' }} justifyContent="space-between" alignItems={{ sm:'center' }} sx={{ mb:3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight:800, mb:0.3 }}>Portfolio Review</Typography>
          <Typography sx={{ fontSize:13, color:'#9CA3AF' }}>
            Industry → Portfolio → Asset → Exposure → Insurance Recommendation
          </Typography>
        </Box>
        {activeTab === 0 && step > 0 && (
          <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={() => reset()}
            sx={{ mt:{ xs:1.5, sm:0 }, borderColor:'rgba(255,139,90,0.3)', color:'#FF8B5A', fontSize:12 }}>
            New Assessment
          </Button>
        )}
      </Stack>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb:3, borderBottom:'1px solid rgba(255,139,90,0.12)',
        '& .MuiTab-root': { fontSize:13, fontWeight:600, textTransform:'none', color:'#9CA3AF' },
        '& .Mui-selected': { color:'#E8472A' },
        '& .MuiTabs-indicator': { background:'linear-gradient(90deg,#E8472A,#E8712A)', height:2.5 } }}>
        <Tab icon={<AddCircleOutlineIcon sx={{ fontSize:17 }} />} iconPosition="start" label="New Assessment" />
        <Tab icon={<HistoryIcon sx={{ fontSize:17 }} />} iconPosition="start" label="Saved Reviews" />
      </Tabs>

      {/* ── Tab 0: New Assessment wizard ── */}
      {activeTab === 0 && (
        <>
          <Stepper activeStep={step} alternativeLabel sx={{ mb:4,
            '& .MuiStepLabel-label': { fontSize:12, fontWeight:600 },
            '& .MuiStepIcon-root.Mui-active': { color:'#E8472A' },
            '& .MuiStepIcon-root.Mui-completed': { color:'#10B981' },
          }}>
            {STEPS.map(s => <Step key={s.label}><StepLabel>{s.label}</StepLabel></Step>)}
          </Stepper>

          <Card elevation={0} sx={{ border:'1.5px solid rgba(255,139,90,0.12)', borderRadius:'16px', mb:3 }}>
            <CardContent sx={{ p:3 }}>
              {step === 0 && <StepCustomer data={customer} onChange={setCustomerField} />}
              {step === 1 && <StepPortfolios industryCode={customer.industry} selected={selectedPortfolios} onToggle={togglePortfolio} />}
              {step === 2 && <StepAssets industryCode={customer.industry} selectedPortfolios={selectedPortfolios} assetData={assetData} onAssetToggle={toggleAsset} onAssetValue={setAssetValue} />}
              {step === 3 && <StepRisk confirmedAssets={confirmedAssets} riskAnswers={riskAnswers} onAnswer={setRiskAnswer} />}
              {step === 4 && (
                <StepReport
                  customer={customer} industryCode={customer.industry}
                  selectedPortfolios={selectedPortfolios} confirmedAssets={confirmedAssets}
                  assetData={assetData} riskAnswers={riskAnswers}
                  onSave={handleSave} savedId={savedId} isSaved={isSaved} saving={saving}
                  onSend={() => setSendOpen(true)}
                />
              )}
            </CardContent>
          </Card>

          <Stack direction="row" justifyContent="space-between">
            <Button variant="outlined" startIcon={<ArrowBackIcon />}
              onClick={() => setStep(s => s - 1)} disabled={step === 0}
              sx={{ borderColor:'rgba(255,139,90,0.3)', color:'#FF8B5A', fontSize:13 }}>
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button variant="contained" endIcon={<ArrowForwardIcon />}
                onClick={() => setStep(s => s + 1)} disabled={!canNext()} sx={{ fontSize:13 }}>
                {step === 3 ? 'View Recommendations' : 'Continue'}
              </Button>
            ) : (
              <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={() => reset()}
                sx={{ borderColor:'rgba(16,185,129,0.3)', color:'#059669', fontSize:13 }}>
                Start New Assessment
              </Button>
            )}
          </Stack>
        </>
      )}

      {/* ── Tab 1: Saved Reviews ── */}
      {activeTab === 1 && <SavedReviews onEdit={loadSavedReview} />}

      {/* Send Dialog */}
      {sendOpen && (
        <SendDialog open onClose={() => setSendOpen(false)}
          customer={customer} industryCode={customer.industry}
          recs={recs} riskGrade={riskGrade} riskScore={riskScore} />
      )}

      <Snackbar open={toast.open} autoHideDuration={3000} onClose={() => setToast(t=>({...t,open:false}))}>
        <Alert severity={toast.sev} variant="filled">{toast.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
