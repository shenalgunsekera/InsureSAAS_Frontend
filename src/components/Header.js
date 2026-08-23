import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../App';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import BarChartIcon from '@mui/icons-material/BarChart';

const pageMeta = {
  '/':             { title: 'Underwriting', sub: 'Policy issuance and client records',    icon: <PeopleOutlineIcon /> },
  '/underwriting': { title: 'Underwriting', sub: 'Policy issuance and client records',    icon: <PeopleOutlineIcon /> },
  '/reports':      { title: 'Reports',      sub: 'Financial summaries and analytics',     icon: <BarChartIcon /> },
};

const Header = () => {
  const { userProfile, user, searchQuery, setSearchQuery } = useAuth();
  const location = useLocation();
  const meta     = pageMeta[location.pathname] || pageMeta['/'];
  const role     = userProfile?.role || '';
  const name     = userProfile?.full_name || user?.email?.split('@')[0] || '';
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'U';
  const isClients = location.pathname === '/' || location.pathname === '/underwriting';

  return (
    <Box sx={{
      position: 'sticky', top: 0, zIndex: 100,
      bgcolor: 'rgba(255,255,255,0.96)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(255, 139, 90,0.12)',
      boxShadow: '0 2px 16px rgba(255, 90, 90,0.06)',
      px: { xs: 2, sm: 3 }, py: 1.5,
      display: 'flex', alignItems: 'center', gap: 2,
    }}>
      {/* page info */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, minWidth: 0, flex: 1 }}>
        <Box sx={{
          width: 36, height: 36, borderRadius: '10px',
          background: 'linear-gradient(135deg,#FF5A5A,#FF8B5A)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          '& svg': { color: '#fff', fontSize: 18 },
        }}>
          {meta.icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#1A1A2E', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
            {meta.title}
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: '#9CA3AF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: { xs: 'none', sm: 'block' } }}>
            {meta.sub}
          </Typography>
        </Box>
      </Box>

      {/* search — only on clients page */}
      {isClients && (
        <TextField
          placeholder="Search by name, mobile, policy, file no…"
          size="small"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          sx={{
            width: { xs: 160, sm: 260, md: 320 },
            '& .MuiOutlinedInput-root': {
              borderRadius: '12px',
              bgcolor: '#FFF5F2',
              fontSize: 13,
              '& fieldset': { borderColor: 'rgba(255, 139, 90,0.25)' },
              '&:hover fieldset': { borderColor: '#FF8B5A' },
              '&.Mui-focused fieldset': { borderColor: '#FF5A5A', borderWidth: 2 },
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 17, color: '#FF8B5A' }} />
              </InputAdornment>
            ),
          }}
        />
      )}

      {/* user badge */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, flexShrink: 0 }}>
        {role && (
          <Chip
            label={role}
            size="small"
            sx={{
              fontWeight: 700, fontSize: 11, textTransform: 'capitalize',
              background: 'linear-gradient(135deg,rgba(255, 90, 90,0.12),rgba(255, 139, 90,0.10))',
              color: '#FF5A5A', border: '1px solid rgba(255, 90, 90,0.20)',
              display: { xs: 'none', sm: 'flex' },
            }}
          />
        )}
        <Avatar sx={{
          width: 34, height: 34, fontSize: 12, fontWeight: 700,
          background: 'linear-gradient(135deg,#FF5A5A,#FF8B5A)',
          boxShadow: '0 2px 10px rgba(255, 90, 90,0.30)',
          cursor: 'default',
        }}>
          {initials}
        </Avatar>
      </Box>
    </Box>
  );
};

export default Header;
