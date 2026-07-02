import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
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

function daysLeft(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return Math.ceil((d - new Date()) / 86400000);
}

const RenewalsPage = () => {
  const [clients,  setClients]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [tab,      setTab]      = useState(0); // 0=expiring soon, 1=expired, 2=all
  const [rPage,    setRPage]    = useState(1);
  const [rPer,     setRPer]     = useState(15);

  useEffect(() => {
    const q = query(collection(db, 'clients'), orderBy('policy_period_to', 'asc'));
    getDocs(q).then(snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(c => !c.status || c.status === 'approved'));
    }).finally(() => setLoading(false));
  }, []);

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
  const filtered = lists[tab].filter(c => {
    const q = search.toLowerCase();
    return !q || (c.client_name||'').toLowerCase().includes(q) || (c.policy_no||'').toLowerCase().includes(q);
  });

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
              sx={{ '& .MuiTab-root':{fontSize:12.5, fontWeight:600, textTransform:'none', color:'#9CA3AF'}, '& .Mui-selected':{color:'#FF5A5A'}, '& .MuiTabs-indicator':{background:'linear-gradient(90deg,#FF5A5A,#FF8B5A)', height:2.5} }}>
              <Tab label={`Expiring Soon (${categorised.expiring.length})`} />
              <Tab label={`Expired (${categorised.expired.length})`} />
              <Tab label="All" />
            </Tabs>
            <Box sx={{ flex:1 }} />
            <TextField size="small" placeholder="Search client or policy…" value={search} onChange={e=>setSearch(e.target.value)} sx={{ minWidth:220 }} />
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
                      <TableRow key={c.id} sx={{ bgcolor: i%2===0?'#fff':'rgba(255,248,245,0.6)' }}>
                        <TableCell sx={{ fontWeight:600 }}>{c.client_name}</TableCell>
                        <TableCell sx={{ fontFamily:'monospace' }}>{c.policy_no||'—'}</TableCell>
                        <TableCell>{c.product||'—'}</TableCell>
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
            <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', px:2.5, py:1.5, borderTop:'1px solid rgba(255,139,90,0.08)', flexWrap:'wrap', gap:1 }}>
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
