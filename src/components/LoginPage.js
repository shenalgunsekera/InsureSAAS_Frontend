import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../App';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import logo from '../InsureSAAS Logo.png';

/* decorative floating circles */
const Circle = ({ size, top, left, opacity, delay }) => (
  <Box sx={{
    position: 'absolute', borderRadius: '50%',
    width: size, height: size, top, left,
    background: 'rgba(255,255,255,0.12)',
    animation: `float ${3 + delay}s ease-in-out infinite`,
    animationDelay: `${delay}s`,
    pointerEvents: 'none',
    '@keyframes float': {
      '0%,100%': { transform: 'translateY(0)' },
      '50%':     { transform: 'translateY(-12px)' },
    },
  }} />
);

const LoginPage = () => {
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const navigate  = useNavigate();
  const location  = useLocation();
  const { setUser, setUserProfile } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      setUser(cred.user);
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      if (snap.exists()) setUserProfile(snap.data());
      const from = location.state?.from?.pathname;
      navigate(from && from !== '/' && from !== '/login' ? from : '/menu');
    } catch (err) {
      const msgs = {
        'auth/user-not-found':    'No account found with this email.',
        'auth/wrong-password':    'Incorrect password. Please try again.',
        'auth/invalid-email':     'Please enter a valid email address.',
        'auth/too-many-requests': 'Too many failed attempts. Try again later.',
        'auth/invalid-credential':'Invalid email or password.',
      };
      setError(msgs[err.code] || 'Login failed. Please try again.');
    }
    setLoading(false);
  };

  return (
    <Box sx={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(145deg, #0F172A 0%, #1E1B4B 50%, #0C2D5E 100%)',
      position: 'relative',
      overflow: 'hidden',
      p: 2,
    }}>
      {/* decorative circles */}
      <Circle size={80}  top="8%"   left="6%"   opacity={0.15} delay={0}   />
      <Circle size={140} top="70%"  left="3%"   opacity={0.10} delay={1.2} />
      <Circle size={60}  top="15%"  left="82%"  opacity={0.12} delay={0.7} />
      <Circle size={180} top="60%"  left="78%"  opacity={0.08} delay={2}   />
      <Circle size={40}  top="45%"  left="50%"  opacity={0.10} delay={1.5} />

      {/* card */}
      <Box
        className="anim-scale-in"
        sx={{
          width: '100%', maxWidth: 420,
          background: 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(20px)',
          borderRadius: '24px',
          boxShadow: '0 32px 80px rgba(0,0,0,0.22)',
          overflow: 'hidden',
          zIndex: 1,
        }}
      >
        {/* card header */}
        <Box sx={{
          px: 4, py: 3.5,
          background: 'linear-gradient(135deg, #3B82F6, #6366f1)',
          textAlign: 'center',
        }}>
            {/* logo */}
          <Box sx={{
            width: 72, height: 72,
            background: 'rgba(255,255,255,0.18)',
            borderRadius: '20px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            mx: 'auto', mb: 1.5,
            backdropFilter: 'blur(10px)',
            border: '2px solid rgba(255,255,255,0.30)',
            overflow: 'hidden',
          }}>
            <Box component="img" src={logo} alt="InsureSAAS" sx={{ width: 56, height: 56, objectFit: 'contain' }} />
          </Box>
          <Typography sx={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>
            InsureSAAS
          </Typography>
          <Typography sx={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', mt: 0.5, fontWeight: 500 }}>
            Insurance Management Portal
          </Typography>
        </Box>

        {/* form */}
        <Box component="form" onSubmit={handleSubmit} sx={{ px: 4, py: 4 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#1A1A2E', mb: 2.5, textAlign: 'center' }}>
            Sign in to your account
          </Typography>

          <TextField
            label="Email address"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            fullWidth
            required
            autoFocus
            autoComplete="email"
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <MailOutlineIcon sx={{ color: '#6366f1', fontSize: 20 }} />
                </InputAdornment>
              ),
            }}
          />

          <TextField
            label="Password"
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            fullWidth
            required
            autoComplete="current-password"
            sx={{ mb: 2.5 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockOutlinedIcon sx={{ color: '#6366f1', fontSize: 20 }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowPass(v => !v)} edge="end">
                    {showPass
                      ? <VisibilityOffOutlinedIcon sx={{ fontSize: 18, color: '#999' }} />
                      : <VisibilityOutlinedIcon   sx={{ fontSize: 18, color: '#999' }} />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: '10px', fontSize: 13 }}>
              {error}
            </Alert>
          )}

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading}
            sx={{ py: 1.4, fontSize: 15, fontWeight: 700, borderRadius: '12px' }}
          >
            {loading
              ? <CircularProgress size={22} thickness={4} sx={{ color: '#fff' }} />
              : 'Sign In'}
          </Button>

          <Typography sx={{ mt: 3, fontSize: 12, color: '#9CA3AF', textAlign: 'center' }}>
            InsureSAAS &copy; {new Date().getFullYear()} &bull; Secure Portal
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default LoginPage;
