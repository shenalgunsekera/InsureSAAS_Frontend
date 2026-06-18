import React from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../App';
import { MODULES } from '../config/products';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import LogoutIcon from '@mui/icons-material/Logout';

// Route for each module key
const MODULE_ROUTES = {
  quotations:   '/quotations',
  underwriting: '/underwriting',
  claims:       '/claims',
  accounting:   '/accounting',
  reports:      '/reports',
  renewals:     '/renewals',
  marketing:    '/marketing',
  portfolio:    '/portfolio',
};

// Visual colour theme for each module
const MODULE_COLORS = {
  quotations:   { grad:'linear-gradient(135deg,#3B82F6,#6366f1)', light:'rgba(59,130,246,0.08)',   border:'rgba(59,130,246,0.18)'   },
  underwriting: { grad:'linear-gradient(135deg,#6366f1,#818cf8)', light:'rgba(99,102,241,0.08)',  border:'rgba(99,102,241,0.18)'  },
  claims:       { grad:'linear-gradient(135deg,#0ea5e9,#38bdf8)', light:'rgba(14,165,233,0.08)',  border:'rgba(14,165,233,0.18)'  },
  accounting:   { grad:'linear-gradient(135deg,#10B981,#34d399)', light:'rgba(16,185,129,0.08)',  border:'rgba(16,185,129,0.18)'  },
  reports:      { grad:'linear-gradient(135deg,#f59e0b,#fbbf24)', light:'rgba(245,158,11,0.08)',  border:'rgba(245,158,11,0.18)'  },
  renewals:     { grad:'linear-gradient(135deg,#8b5cf6,#a78bfa)', light:'rgba(139,92,246,0.08)',  border:'rgba(139,92,246,0.18)'  },
  marketing:    { grad:'linear-gradient(135deg,#25D366,#128C7E)',  light:'rgba(37,211,102,0.08)', border:'rgba(37,211,102,0.18)'  },
  portfolio:    { grad:'linear-gradient(135deg,#2563EB,#3B82F6)', light:'rgba(37,99,235,0.08)',   border:'rgba(37,99,235,0.18)'   },
};

const OperationalMenu = () => {
  const { user, userProfile, hasAccess } = useAuth();
  const navigate = useNavigate();
  const role     = userProfile?.role || 'employee';
  const name     = userProfile?.full_name || user?.email?.split('@')[0] || 'there';
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const handleLogout = async () => { await signOut(auth); navigate('/login'); };

  // Only show modules the user can access (hidden completely for others)
  const visibleModules = MODULES.filter(m => hasAccess(m.key) && MODULE_ROUTES[m.key]);

  const isAdminOrManager = role === 'admin' || role === 'manager';

  return (
    <Box sx={{ minHeight:'100vh', bgcolor:'#EFF6FF', display:'flex', flexDirection:'column' }}>

      {/* ── Top bar ── */}
      <Box sx={{
        px:{ xs:3, md:6 }, py:2.5, bgcolor:'#fff',
        borderBottom:'1px solid rgba(99,102,241,0.12)',
        display:'flex', alignItems:'center', justifyContent:'space-between',
        boxShadow:'0 2px 12px rgba(59,130,246,0.06)',
      }}>
        <Box sx={{ display:'flex', alignItems:'center', gap:1.5 }}>
          <Box sx={{
            width:40, height:40, borderRadius:'10px',
            background:'rgba(239,246,255,0.8)', border:'1px solid rgba(99,102,241,0.15)',
            display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden',
          }}>
            <Box component="img" src={require('../InsureSAAS Logo.png')} alt="InsureSAAS"
              sx={{ width:34, height:34, objectFit:'contain' }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight:800, color:'#1A1A2E', fontSize:16, lineHeight:1.1 }}>
              InsureSAAS
            </Typography>
            <Typography sx={{ fontSize:10.5, color:'#9CA3AF', fontWeight:600, letterSpacing:0.8, textTransform:'uppercase' }}>
              Management Portal
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display:'flex', alignItems:'center', gap:1.5 }}>
          <Box sx={{ textAlign:'right', display:{ xs:'none', sm:'block' } }}>
            <Typography sx={{ fontSize:13.5, fontWeight:700, color:'#1A1A2E' }}>{name}</Typography>
            <Typography sx={{ fontSize:11, color:'#6366f1', fontWeight:600, textTransform:'capitalize' }}>{role}</Typography>
          </Box>
          <Avatar sx={{ width:36, height:36, fontSize:13, fontWeight:800, background:'linear-gradient(135deg,#3B82F6,#6366f1)' }}>
            {initials}
          </Avatar>
          <Tooltip title="Sign out" placement="bottom">
            <IconButton size="small" onClick={handleLogout}
              sx={{ color:'#9CA3AF', '&:hover':{ color:'#3B82F6', bgcolor:'rgba(59,130,246,0.06)' } }}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Hero ── */}
      <Box sx={{
        px:{ xs:3, md:6 }, pt:{ xs:4, md:5 }, pb:{ xs:3, md:4 },
        background:'linear-gradient(135deg,rgba(59,130,246,0.04) 0%,rgba(99,102,241,0.03) 100%)',
        borderBottom:'1px solid rgba(99,102,241,0.08)',
      }}>
        <Box sx={{ maxWidth:960, mx:'auto' }}>
          <Typography sx={{ fontSize:{ xs:22, md:28 }, fontWeight:800, color:'#1A1A2E', mb:0.5, lineHeight:1.2 }}>
            {greeting},{' '}
            <Box component="span" sx={{ background:'linear-gradient(135deg,#3B82F6,#6366f1)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
              {name}
            </Box>{' '}👋
          </Typography>
          <Typography sx={{ fontSize:14, color:'#6B7280' }}>
            Select a module to get started.
          </Typography>
        </Box>
      </Box>

      {/* ── Module grid ── */}
      <Box sx={{ flex:1, px:{ xs:3, md:6 }, py:{ xs:3, md:4 } }}>
        <Box sx={{ maxWidth:960, mx:'auto' }}>

          <Typography sx={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:1.2, mb:2 }}>
            Modules
          </Typography>

          <Box sx={{ display:'grid', gridTemplateColumns:{ xs:'1fr', sm:'1fr 1fr', md:'1fr 1fr 1fr' }, gap:2 }}>

            {visibleModules.map(mod => {
              const colors = MODULE_COLORS[mod.key] || MODULE_COLORS.quotations;
              return (
                <Box key={mod.key} onClick={() => navigate(MODULE_ROUTES[mod.key])}
                  sx={{
                    bgcolor:'#fff', borderRadius:'16px', border:`1px solid ${colors.border}`,
                    p:0, cursor:'pointer', overflow:'hidden',
                    boxShadow:'0 2px 12px rgba(59,130,246,0.05)',
                    transition:'all 0.22s cubic-bezier(0.4,0,0.2,1)',
                    '&:hover':{ transform:'translateY(-3px)', boxShadow:'0 8px 32px rgba(59,130,246,0.12)' },
                  }}>
                  <Box sx={{ height:4, background:colors.grad }} />
                  <Box sx={{ p:2.5 }}>
                    <Box sx={{
                      width:48, height:48, borderRadius:'12px', background:colors.light,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:22, mb:2,
                    }}>
                      {mod.icon}
                    </Box>
                    <Typography sx={{ fontWeight:800, fontSize:15, color:'#1A1A2E', mb:0.4 }}>{mod.label}</Typography>
                    <Typography sx={{ fontSize:12.5, color:'#9CA3AF', lineHeight:1.5 }}>{mod.description}</Typography>
                  </Box>
                </Box>
              );
            })}

            {/* Admin Panel — visible to admin and manager only */}
            {isAdminOrManager && (
              <Box onClick={() => navigate('/admin')}
                sx={{
                  bgcolor:'#fff', borderRadius:'16px', border:'1px solid rgba(26,26,46,0.15)',
                  p:0, cursor:'pointer', overflow:'hidden',
                  boxShadow:'0 2px 12px rgba(59,130,246,0.05)',
                  transition:'all 0.22s cubic-bezier(0.4,0,0.2,1)',
                  '&:hover':{ transform:'translateY(-3px)', boxShadow:'0 8px 32px rgba(26,26,46,0.12)' },
                }}>
                <Box sx={{ height:4, background:'linear-gradient(135deg,#1A1A2E,#374151)' }} />
                <Box sx={{ p:2.5 }}>
                  <Box sx={{
                    width:48, height:48, borderRadius:'12px', background:'rgba(26,26,46,0.06)',
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, mb:2,
                  }}>
                    ⚙️
                  </Box>
                  <Typography sx={{ fontWeight:800, fontSize:15, color:'#1A1A2E', mb:0.4 }}>Admin Panel</Typography>
                  <Typography sx={{ fontSize:12.5, color:'#9CA3AF', lineHeight:1.5 }}>
                    User management, module access, tickets and system settings
                  </Typography>
                </Box>
              </Box>
            )}

          </Box>
        </Box>
      </Box>

      {/* ── Footer ── */}
      <Box sx={{
        px:{ xs:3, md:6 }, py:2, bgcolor:'#fff',
        borderTop:'1px solid rgba(99,102,241,0.08)',
        display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:1,
      }}>
        <Typography sx={{ fontSize:12, color:'#C4B5B0' }}>
          InsureSAAS Ltd — Internal Use Only
        </Typography>
        <Chip label={role} size="small"
          sx={{ bgcolor:'rgba(99,102,241,0.10)', color:'#6366f1', fontWeight:700, fontSize:11,
                textTransform:'capitalize', border:'1px solid rgba(99,102,241,0.20)' }} />
      </Box>
    </Box>
  );
};

export default OperationalMenu;
