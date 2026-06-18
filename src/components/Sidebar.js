import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { useAuth } from '../App';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import BarChartIcon from '@mui/icons-material/BarChart';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import RaiseTicketModal from './RaiseTicketModal';

const DRAWER_W = 260;

const navItems = [
  { label: 'Home',          path: '/menu',          icon: <HomeOutlinedIcon /> },
  { label: 'Quotations',    path: '/quotations',    icon: <RequestQuoteOutlinedIcon />, mod: 'quotations'   },
  { label: 'Underwriting',  path: '/underwriting',  icon: <PeopleOutlineIcon />,        mod: 'underwriting' },
  { label: 'Portfolio',     path: '/portfolio',     icon: <AccountTreeOutlinedIcon />,  mod: 'portfolio'    },
  { label: 'Claims',        path: '/claims',        icon: <GavelOutlinedIcon />,        mod: 'claims'       },
  { label: 'Renewals',      path: '/renewals',      icon: <AutorenewIcon />,            mod: 'renewals'     },
  { label: 'Reports',       path: '/reports',       icon: <BarChartIcon />,             mod: 'reports'      },
];

function NavItem({ item, active, onClick }) {
  return (
    <ListItem
      button
      onClick={onClick}
      sx={{
        mx: 1.5, mb: 0.5,
        borderRadius: '10px',
        px: 1.5, py: 1,
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
        background: active ? 'rgba(59,130,246,0.18)' : 'transparent',
        '&:hover': {
          background: active ? 'rgba(59,130,246,0.22)' : 'rgba(255,255,255,0.06)',
          transform: 'translateX(3px)',
        },
      }}
    >
      {active && (
        <Box sx={{
          position: 'absolute', left: 0, top: '18%', bottom: '18%',
          width: 3, borderRadius: '0 3px 3px 0',
          background: 'linear-gradient(180deg,#2563EB,#3B82F6)',
        }} />
      )}
      <ListItemIcon sx={{
        minWidth: 36,
        color: active ? '#93C5FD' : 'rgba(255,255,255,0.45)',
        transition: 'color 0.2s ease',
        '& svg': { fontSize: 20 },
      }}>
        {item.icon}
      </ListItemIcon>
      <ListItemText
        primary={item.label}
        primaryTypographyProps={{
          fontSize: 13.5,
          fontWeight: active ? 700 : 400,
          color: active ? '#FFFFFF' : 'rgba(255,255,255,0.60)',
          letterSpacing: 0.1,
        }}
      />
    </ListItem>
  );
}

function DrawerContent({ onClose }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, userProfile, hasAccess } = useAuth();
  const [ticketOpen, setTicketOpen] = useState(false);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const role = userProfile?.role || '';
  const name = userProfile?.full_name || user?.email?.split('@')[0] || 'User';
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <Box sx={{
      height: '100%', display: 'flex', flexDirection: 'column',
      bgcolor: '#1E1E2E',
    }}>
      {/* ── header ───────────────────────────────────────── */}
      <Box sx={{
        p: 2.5, pb: 2,
        background: 'rgba(0,0,0,0.20)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* bg decoration */}
        <Box sx={{
          position: 'absolute', right: -20, top: -20,
          width: 100, height: 100, borderRadius: '50%',
          background: 'rgba(255,255,255,0.10)',
        }} />
        <Box sx={{
          position: 'absolute', right: 20, bottom: -30,
          width: 70, height: 70, borderRadius: '50%',
          background: 'rgba(255,255,255,0.07)',
        }} />

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, zIndex: 1 }}>
            <Box sx={{
              width: 44, height: 44, borderRadius: '12px',
              background: 'rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(255,255,255,0.12)',
              overflow: 'hidden',
            }}>
              <Box component="img" src={require('../InsureSAAS Logo.png')} alt="InsureSAAS"
                sx={{ width: 36, height: 36, objectFit: 'contain' }} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 800, color: '#fff', fontSize: 18, lineHeight: 1.1, letterSpacing: -0.3 }}>
                InsureSAAS
              </Typography>
              <Typography sx={{ fontSize: 10.5, color: 'rgba(255,255,255,0.80)', fontWeight: 500, letterSpacing: 0.5 }}>
                INSURANCE PORTAL
              </Typography>
            </Box>
          </Box>
          {/* mobile close button */}
          {onClose && (
            <IconButton size="small" onClick={onClose} sx={{ color: 'rgba(255,255,255,0.8)', display: { md: 'none' } }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* ── nav items ────────────────────────────────────── */}
      <Box sx={{ flex: 1, py: 1.5, overflowY: 'auto' }}>
        <Typography sx={{
          px: 3, pb: 1, fontSize: 10.5, fontWeight: 700,
          color: 'rgba(255,255,255,0.28)', letterSpacing: 1.2, textTransform: 'uppercase',
        }}>
          Navigation
        </Typography>
        <List disablePadding>
          {navItems.filter(item => !item.mod || hasAccess(item.mod)).map(item => (
            <NavItem
              key={item.path}
              item={item}
              active={item.path === '/menu'
                ? location.pathname === '/menu'
                : location.pathname.startsWith(item.path)}
              onClick={() => { navigate(item.path); onClose?.(); }}
            />
          ))}
          {hasAccess('marketing') && (
            <NavItem
              item={{ label: 'Marketing', path: '/marketing', icon: <CampaignOutlinedIcon /> }}
              active={location.pathname.startsWith('/marketing')}
              onClick={() => { navigate('/marketing'); onClose?.(); }}
            />
          )}
          {(role === 'admin' || role === 'manager') && (
            <NavItem
              item={{ label: 'Admin Panel', path: '/admin', icon: <AdminPanelSettingsOutlinedIcon /> }}
              active={location.pathname.startsWith('/admin')}
              onClick={() => { navigate('/admin'); onClose?.(); }}
            />
          )}
        </List>

        <Divider sx={{ mx: 2, my: 1.5, borderColor: 'rgba(255,255,255,0.08)' }} />

        {/* Employee guide */}
        <ListItem
          button
          component="a" href="/employee-guide.html" target="_blank" rel="noopener noreferrer"
          sx={{
            mx: 1.5, borderRadius: '10px', px: 1.5, py: 1,
            transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
            '&:hover': { background: 'rgba(99,102,241,0.12)', transform: 'translateX(3px)' },
          }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: 'rgba(99,102,241,0.7)', '& svg': { fontSize: 20 } }}>
            <MenuBookOutlinedIcon />
          </ListItemIcon>
          <ListItemText
            primary="Employee Guide"
            primaryTypographyProps={{ fontSize: 13.5, fontWeight: 400, color: 'rgba(255,255,255,0.60)' }}
          />
        </ListItem>

        {/* Support ticket button — visible to all */}
        <ListItem
          button
          onClick={() => { setTicketOpen(true); onClose?.(); }}
          sx={{
            mx: 1.5, borderRadius: '10px', px: 1.5, py: 1,
            transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
            '&:hover': { background: 'rgba(99,102,241,0.12)', transform: 'translateX(3px)' },
          }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: 'rgba(99,102,241,0.7)', '& svg': { fontSize: 20 } }}>
            <ConfirmationNumberOutlinedIcon />
          </ListItemIcon>
          <ListItemText
            primary="Raise a Ticket"
            primaryTypographyProps={{ fontSize: 13.5, fontWeight: 400, color: 'rgba(255,255,255,0.60)' }}
          />
        </ListItem>
      </Box>

      <RaiseTicketModal open={ticketOpen} onClose={() => setTicketOpen(false)} />

      {/* ── user footer ──────────────────────────────────── */}
      <Box>
        <Divider sx={{ mx: 2, borderColor: 'rgba(255,255,255,0.08)' }} />
        <Box sx={{
          p: 2, display: 'flex', alignItems: 'center', gap: 1.5,
          background: 'rgba(0,0,0,0.15)',
        }}>
          <Avatar sx={{
            width: 36, height: 36, fontSize: 13, fontWeight: 700,
            background: 'linear-gradient(135deg,#3B82F6,#6366f1)',
            flexShrink: 0,
          }}>
            {initials}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {name}
            </Typography>
            <Typography sx={{ fontSize: 11, color: '#93C5FD', fontWeight: 600, textTransform: 'capitalize' }}>
              {role || 'User'}
            </Typography>
          </Box>
          <Tooltip title="Sign out" placement="top">
            <IconButton
              size="small"
              onClick={handleLogout}
              sx={{
                color: 'rgba(255,255,255,0.35)', flexShrink: 0,
                '&:hover': { color: '#93C5FD', bgcolor: 'rgba(59,130,246,0.12)' },
                transition: 'all 0.2s ease',
              }}
            >
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );
}

const Sidebar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* mobile hamburger */}
      <IconButton
        onClick={() => setMobileOpen(true)}
        sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'fixed', top: 12, left: 12, zIndex: 1300,
          bgcolor: 'white', boxShadow: '0 2px 12px rgba(59,130,246,0.20)',
          color: '#3B82F6', borderRadius: '12px', p: 0.8,
          '&:hover': { bgcolor: 'white', transform: 'scale(1.05)' },
          transition: 'all 0.2s ease',
        }}
      >
        <MenuIcon />
      </IconButton>

      {/* permanent desktop drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': {
            width: DRAWER_W,
            border: 'none',
            boxShadow: '4px 0 24px rgba(59,130,246,0.08)',
          },
        }}
        open
      >
        <DrawerContent />
      </Drawer>

      {/* temporary mobile drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: DRAWER_W,
            border: 'none',
            boxShadow: '4px 0 40px rgba(59,130,246,0.18)',
          },
        }}
      >
        <DrawerContent onClose={() => setMobileOpen(false)} />
      </Drawer>
    </>
  );
};

export default Sidebar;
