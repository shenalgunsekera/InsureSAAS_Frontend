import React, { useState, useMemo, useCallback, createContext, useContext, useEffect, useRef } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSessionTimeout } from './hooks/useSessionTimeout';
import { onAuthStateChanged } from 'firebase/auth';
import { setActiveWorkSession, closeActiveWorkSession, logoutWithSessionClose } from './utils/workSession';
import { doc, getDoc, getDocFromServer, setDoc, addDoc, updateDoc, collection, getDocs, limit, query, where, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';
import { getOrCreateDeviceId, collectDeviceInfo, fetchLocationInfo } from './utils/deviceFingerprint';
import { PRODUCTS, DEFAULT_MODULE_ACCESS } from './config/products';
import { lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import TableSection from './components/TableSection';
import LoginPage from './components/LoginPage';
const ReportsPage      = lazy(() => import('./components/ReportsPage'));
const AdminPanel       = lazy(() => import('./components/AdminPanel'));
const OperationalMenu  = lazy(() => import('./pages/OperationalMenu'));
const QuotationsPage   = lazy(() => import('./pages/QuotationsPage'));
const QuoteResponsePage= lazy(() => import('./pages/QuoteResponsePage'));
const QuoteSelectPage     = lazy(() => import('./pages/QuoteSelectPage'));
const ComparisonPdfPage   = lazy(() => import('./pages/ComparisonPdfPage'));
const RenewalsPage     = lazy(() => import('./pages/RenewalsPage'));
const ClaimsPage       = lazy(() => import('./pages/ClaimsPage'));
const MarketingPage    = lazy(() => import('./pages/MarketingPage'));
const PortfolioPage    = lazy(() => import('./pages/PortfolioPage'));

/* ── MUI theme ───────────────────────────────────────────────────────────── */
const theme = createTheme({
  palette: {
    primary:    { main: '#2563EB', light: '#3B82F6', dark: '#1D4ED8', contrastText: '#fff' },
    secondary:  { main: '#6366F1', light: '#818CF8', contrastText: '#fff' },
    success:    { main: '#10B981', contrastText: '#fff' },
    error:      { main: '#2563EB' },
    background: { default: '#F9F9FB', paper: '#FFFFFF' },
    text:       { primary: '#0F172A', secondary: '#6B7280' },
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h4: { fontWeight: 800 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 10,
          fontSize: 14,
          transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
          boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
          '&:hover': {
            background: 'linear-gradient(135deg, #1D4ED8 0%, #1E40AF 100%)',
            boxShadow: '0 6px 18px rgba(37,99,235,0.35)',
            transform: 'translateY(-1px)',
          },
          '&:active': { transform: 'translateY(0)' },
          '&.Mui-disabled': { background: '#d8c8c4', boxShadow: 'none' },
        },
        containedSuccess: {
          background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
          boxShadow: '0 4px 12px rgba(16,185,129,0.22)',
          '&:hover': {
            background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
            transform: 'translateY(-1px)',
          },
        },
        outlinedPrimary: {
          borderColor: 'rgba(59,130,246,0.45)',
          color: '#2563EB',
          '&:hover': { borderColor: '#2563EB', background: 'rgba(37,99,235,0.05)' },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 20px rgba(59,130,246,0.07)',
          borderRadius: 14,
          border: '1px solid rgba(99,102,241,0.10)',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { borderRadius: 14 },
        elevation1: { boxShadow: '0 2px 20px rgba(59,130,246,0.07)' },
        elevation2: { boxShadow: '0 4px 28px rgba(59,130,246,0.10)' },
        elevation6: { boxShadow: '0 8px 40px rgba(59,130,246,0.14)' },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 10,
            '&:hover fieldset': { borderColor: '#6366f1' },
            '&.Mui-focused fieldset': { borderColor: '#3B82F6', borderWidth: 2 },
          },
          '& label.Mui-focused': { color: '#3B82F6' },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        outlined: { borderRadius: 10 },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 18,
          boxShadow: '0 24px 64px rgba(59,130,246,0.18)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          background: '#0F172A',
          color: '#fff',
          fontWeight: 700,
          padding: '18px 24px',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            background: '#0F172A',
            color: '#C8C8D8',
            fontWeight: 700,
            fontSize: 11.5,
            letterSpacing: 0.7,
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background 0.15s ease',
          '&:hover td': { background: 'rgba(99,102,241,0.05)' },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid rgba(99,102,241,0.08)',
          fontSize: 13,
          padding: '12px 16px',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 600 },
      },
    },
    MuiPagination: {
      styleOverrides: {
        root: {
          '& .MuiPaginationItem-root': { borderRadius: 8, fontWeight: 600 },
          '& .Mui-selected': {
            background: 'linear-gradient(135deg, #3B82F6, #6366f1)',
            color: '#fff',
            boxShadow: '0 2px 8px rgba(59,130,246,0.3)',
          },
        },
      },
    },
    MuiSnackbar: {
      defaultProps: { anchorOrigin: { vertical: 'bottom', horizontal: 'right' } },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 12, fontWeight: 500 },
        filledSuccess: { background: 'linear-gradient(135deg,#10B981,#059669)' },
        filledError:   { background: 'linear-gradient(135deg,#3B82F6,#e04040)' },
      },
    },
  },
});

/* ── Auth context ────────────────────────────────────────────────────────── */
export const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

/* ── Session timeout guard ───────────────────────────────────────────────── */
function SessionGuard({ children }) {
  const { warning, countdown, stayLoggedIn, logout } = useSessionTimeout();
  return (
    <>
      {children}
      <Dialog open={warning} maxWidth="xs" fullWidth disableEscapeKeyDown
        PaperProps={{ sx: { borderRadius: '18px' } }}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          ⏱ Session Expiring Soon
        </DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          <Typography sx={{ fontSize: 14, color: '#374151', lineHeight: 1.7 }}>
            You've been inactive. Your session will automatically log out in{' '}
            <Box component="span" sx={{ fontWeight: 800, color: '#3B82F6', fontSize: 16 }}>
              {countdown}s
            </Box>
            .
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: '#9CA3AF', mt: 1 }}>
            Click "Stay Logged In" to continue your session.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid rgba(99,102,241,0.10)' }}>
          <Button onClick={logout} variant="outlined"
            sx={{ fontSize: 13, borderColor: '#e0e0e0', color: '#6B7280' }}>
            Log Out Now
          </Button>
          <Button onClick={stayLoggedIn} variant="contained" sx={{ fontSize: 13 }}>
            Stay Logged In
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function RequireAuth({ children }) {
  const { user, userProfile, loading } = useAuth();
  const location = useLocation();
  const [deviceState, setDeviceState] = useState('checking');
  const [deviceId,    setDeviceId]    = useState('');

  const userProfileRef = useRef(userProfile);
  useEffect(() => { userProfileRef.current = userProfile; }, [userProfile]);

  const userUid = user?.uid ?? null;

  useEffect(() => {
    if (loading) return;
    if (!user) { setDeviceState('allowed'); return; }

    setDeviceState('checking');

    // cleanup is assigned once the async setup completes;
    // the returned cleanup fn always calls the latest value.
    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      const devId     = await getOrCreateDeviceId();
      setDeviceId(devId);
      const sessionId = `${user.uid}_${devId}`;

      // Fire-and-forget registration
      (async () => {
        try {
          const deviceInfo = collectDeviceInfo();
          const ref  = doc(db, 'device_sessions', sessionId);
          const snap = await getDoc(ref);
          const loc  = snap.exists() && snap.data().ip ? null : await fetchLocationInfo();
          const safeInfo = {
            device_id:  devId,
            user_id:    user.uid,
            user_email: user.email || '',
            user_name:  userProfileRef.current?.full_name || user.displayName || user.email?.split('@')[0] || '',
            ...deviceInfo,
            ...(loc || {}),
            last_seen: serverTimestamp(),
          };
          if (!snap.exists()) {
            // First time this device logs in — create with default status fields
            await setDoc(ref, { ...safeInfo, first_seen: serverTimestamp(), approved: false, blocked: false });
          } else {
            // Device already known — only update safe metadata, never touch approved/blocked
            await updateDoc(ref, safeInfo);
          }
        } catch (_) { }
      })();

      // Server-authoritative initial access check — bypasses stale local cache
      let initSess = { approved: false, blocked: false };
      let initSett = { lockdown_mode: false };
      try {
        const [sessSnap, settSnap] = await Promise.all([
          getDocFromServer(doc(db, 'device_sessions', sessionId)),
          getDocFromServer(doc(db, 'settings', 'device_control')),
        ]);
        if (sessSnap.exists()) initSess = sessSnap.data();
        if (settSnap.exists()) initSett = settSnap.data();
      } catch (_) {
        // Offline / unreachable — default to allowing so we don't lock out users
      }
      if (cancelled) return;

      if (initSess.blocked) { logoutWithSessionClose(auth); setDeviceState('restricted'); return; }

      if (initSett.lockdown_mode && !initSess.approved) {
        setDeviceState('restricted');
        // Watch for admin approval so device auto-unlocks without a page refresh
        const u1 = onSnapshot(doc(db, 'device_sessions', sessionId),
          snap => {
            if (cancelled || !snap.exists()) return;
            const d = snap.data();
            if (d.blocked) { logoutWithSessionClose(auth); setDeviceState('restricted'); return; }
            if (d.approved) setDeviceState('allowed');
          }, () => {});
        const u2 = onSnapshot(doc(db, 'settings', 'device_control'),
          snap => {
            if (cancelled) return;
            if (!snap.exists() || !snap.data().lockdown_mode) setDeviceState('allowed');
          }, () => {});
        cleanup = () => { u1(); u2(); };
        return;
      }

      setDeviceState('allowed');

      // Monitor for mid-session blocking — skip local cache reads to prevent false blocks
      const unsub = onSnapshot(
        doc(db, 'device_sessions', sessionId),
        { includeMetadataChanges: true },
        snap => {
          if (cancelled || snap.metadata.fromCache) return;
          if (snap.exists() && snap.data().blocked) { logoutWithSessionClose(auth); setDeviceState('restricted'); }
        },
        () => {},
      );
      cleanup = unsub;
    })();

    return () => { cancelled = true; cleanup(); };
  }, [userUid, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || deviceState === 'checking') return (
    <Box sx={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #3B82F6 0%, #6366f1 60%, #FFA95A 100%)',
    }}>
      <CircularProgress sx={{ color: '#fff' }} size={52} thickness={4} />
    </Box>
  );

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  if (deviceState === 'restricted') return (
    <Box sx={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0F172A 0%, #2d2d44 100%)', p: 3,
    }}>
      <Box sx={{ maxWidth: 420, textAlign: 'center' }}>
        <Box sx={{ width: 72, height: 72, borderRadius: '20px', bgcolor: 'rgba(239,68,68,0.15)',
                   display: 'flex', alignItems: 'center', justifyContent: 'center',
                   mx: 'auto', mb: 3, fontSize: 36 }}>
          🔒
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#fff', mb: 1 }}>
          Access Restricted
        </Typography>
        <Typography sx={{ color: '#9CA3AF', fontSize: 14, lineHeight: 1.7, mb: 3 }}>
          This device has not been approved to access the InsureSAAS system.
          Please contact your administrator to get this device approved.
        </Typography>
        <Typography sx={{ fontSize: 12, color: '#6B7280', bgcolor: 'rgba(255,255,255,0.05)',
                         borderRadius: '10px', p: 1.5, fontFamily: 'monospace' }}>
          Device ID: {deviceId ? deviceId.slice(0, 18) + '…' : '…'}
        </Typography>
        <Button variant="outlined" onClick={() => logoutWithSessionClose(auth)} sx={{ mt: 3, borderColor: 'rgba(99,102,241,0.4)', color: '#6366f1', fontSize: 13 }}>
          Sign Out
        </Button>
      </Box>
    </Box>
  );

  return children;
}

/* ── Module Guard ────────────────────────────────────────────────────────── */
function ModuleGuard({ mod, children }) {
  const { hasAccess } = useAuth();
  if (!hasAccess(mod)) {
    return (
      <Box sx={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                 minHeight:'60vh', textAlign:'center', p:4 }}>
        <Box sx={{ width:72, height:72, borderRadius:'20px', bgcolor:'rgba(239,68,68,0.08)',
                   display:'flex', alignItems:'center', justifyContent:'center',
                   mb:3, fontSize:36 }}>🔒</Box>
        <Typography variant="h5" sx={{ fontWeight:800, mb:1, color:'#0F172A' }}>
          Module Restricted
        </Typography>
        <Typography sx={{ color:'#6B7280', fontSize:14, maxWidth:380, lineHeight:1.7 }}>
          You don't have permission to access this module.<br/>
          Contact your administrator to request access.
        </Typography>
      </Box>
    );
  }
  return <>{children}</>;
}

/* ── App ─────────────────────────────────────────────────────────────────── */
function App() {
  const [user,        setUser]        = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Tracks the active work session across login/logout
  const workSessionRef = useRef(null); // { id, clockInTs, userId }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Anonymous users (insurer/customer public pages) never get a staff profile
        if (firebaseUser.isAnonymous) { setLoading(false); return; }

        setUser(firebaseUser);
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));

        let profile;
        if (snap.exists()) {
          profile = snap.data();
          setUserProfile(profile);
        } else {
          // No Firestore profile — auto-create one.
          // First account ever in the system becomes admin; all others get employee.
          let role = 'employee';
          try {
            const anyExisting = await getDocs(query(collection(db, 'users'), limit(1)));
            if (anyExisting.empty) role = 'admin';
          } catch (_) {
            // Employees can't list users collection — default to employee
          }
          profile = {
            full_name:  firebaseUser.displayName || firebaseUser.email.split('@')[0],
            email:      firebaseUser.email,
            role,
            created_at: serverTimestamp(),
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), profile);
          setUserProfile(profile);
        }

        // ── Auto open work session ────────────────────────────────────────────
        if (!workSessionRef.current || workSessionRef.current.userId !== firebaseUser.uid) {
          const today = new Date().toISOString().slice(0, 10);
          try {
            const existing = await getDocs(query(
              collection(db, 'work_sessions'),
              where('user_id',   '==', firebaseUser.uid),
              where('date',      '==', today),
              where('clock_out', '==', null),
            ));
            if (!existing.empty) {
              const d = existing.docs[0];
              const ts = d.data().clock_in?.toDate?.()?.getTime() || Date.now();
              workSessionRef.current = { id: d.id, clockInTs: ts, userId: firebaseUser.uid };
            } else {
              const ref = await addDoc(collection(db, 'work_sessions'), {
                user_id:          firebaseUser.uid,
                user_email:       firebaseUser.email || '',
                user_name:        profile?.full_name || firebaseUser.email?.split('@')[0] || '',
                date:             today,
                clock_in:         serverTimestamp(),
                clock_out:        null,
                duration_minutes: null,
                notes:            '',
              });
              workSessionRef.current = { id: ref.id, clockInTs: Date.now(), userId: firebaseUser.uid };
            }
          } catch (_) {}
        }
        // Register the active session so every logout path can close it while
        // still authenticated (closing after signOut is rejected by the rules).
        setActiveWorkSession(workSessionRef.current);
      } else {
        // Logout paths close the session BEFORE signOut; this is a best-effort
        // fallback that no-ops if it was already closed.
        closeActiveWorkSession();
        workSessionRef.current = null;
        setUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Custom products — merged with static definitions ────────────────────────
  const [customProducts, setCustomProducts] = useState({});
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, 'products'),
      snap => {
        const map = {};
        snap.docs.forEach(d => { map[d.id] = d.data(); });
        setCustomProducts(map);
      },
      () => {}
    );
  }, [user]);

  const allProducts = useMemo(() => ({ ...PRODUCTS, ...customProducts }), [customProducts]);

  // ── Module access — one subscription for the whole app ──────────────────────
  const [moduleAccess, setModuleAccess] = useState(DEFAULT_MODULE_ACCESS);
  useEffect(() => {
    return onSnapshot(
      doc(db, 'settings', 'module_access'),
      snap => setModuleAccess(snap.exists() ? { ...DEFAULT_MODULE_ACCESS, ...snap.data() } : DEFAULT_MODULE_ACCESS),
      ()   => setModuleAccess(DEFAULT_MODULE_ACCESS),
    );
  }, []);

  const hasAccess = useCallback((key) => {
    const role = userProfile?.role || 'employee';
    if (role === 'admin') return true;
    return (moduleAccess[key] || []).includes(role);
  }, [moduleAccess, userProfile]);

  const authValue = useMemo(
    () => ({ user, userProfile, loading, setUser, setUserProfile, searchQuery, setSearchQuery, moduleAccess, hasAccess, allProducts }),
    [user, userProfile, loading, searchQuery, moduleAccess, hasAccess, allProducts]
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthContext.Provider value={authValue}>
        <Router>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* Public — insurance companies submit quotes without logging in */}
            <Route path="/quote-respond" element={<Suspense fallback={null}><QuoteResponsePage /></Suspense>} />
            {/* Public — customer selects preferred insurer */}
            <Route path="/quote-select"  element={<Suspense fallback={null}><QuoteSelectPage /></Suspense>} />
            {/* Public — customer downloads comparison PDF */}
            <Route path="/comparison-pdf" element={<Suspense fallback={null}><ComparisonPdfPage /></Suspense>} />

            <Route path="/*" element={
              <RequireAuth>
                <SessionGuard>
                <Suspense fallback={null}>
                  <Routes>
                    {/* Full-screen operational menu — no sidebar */}
                    <Route path="/menu" element={<OperationalMenu />} />

                    {/* All other routes use sidebar layout */}
                    <Route path="/*" element={
                      <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: '#EFF6FF' }}>
                        <Sidebar />
                        <Box sx={{
                          flex: 1, display: 'flex', flexDirection: 'column',
                          ml: { xs: 0, md: '260px' }, minWidth: 0,
                          transition: 'margin 0.3s cubic-bezier(0.4,0,0.2,1)',
                        }}>
                          <Header />
                          <Box className="page-enter" sx={{ flex: 1, p: { xs: 2, sm: 3, md: 3 }, pt: { xs: 2, sm: 3 } }}>
                            <Routes>
                              <Route path="/"              element={<ModuleGuard mod="underwriting"><TableSection /></ModuleGuard>} />
                              <Route path="/underwriting"  element={<ModuleGuard mod="underwriting"><TableSection /></ModuleGuard>} />
                              <Route path="/reports"       element={<ModuleGuard mod="reports"><ReportsPage /></ModuleGuard>} />
                              <Route path="/admin"         element={<AdminPanel />} />
                              <Route path="/quotations"    element={<ModuleGuard mod="quotations"><QuotationsPage /></ModuleGuard>} />
                              <Route path="/renewals"      element={<ModuleGuard mod="renewals"><RenewalsPage /></ModuleGuard>} />
                              <Route path="/claims"        element={<ModuleGuard mod="claims"><ClaimsPage /></ModuleGuard>} />
                              <Route path="/marketing"     element={<ModuleGuard mod="marketing"><MarketingPage /></ModuleGuard>} />
                              <Route path="/portfolio"     element={<ModuleGuard mod="portfolio"><PortfolioPage /></ModuleGuard>} />
                            </Routes>
                          </Box>
                        </Box>
                      </Box>
                    } />
                  </Routes>
                </Suspense>
                </SessionGuard>
              </RequireAuth>
            } />
          </Routes>
        </Router>
      </AuthContext.Provider>
    </ThemeProvider>
  );
}

export default App;
