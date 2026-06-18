import { useEffect, useRef, useState, useCallback } from 'react';
import { signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';

const TIMEOUT_MS  = 20 * 60 * 1000; // 20 minutes
const WARNING_MS  = 18 * 60 * 1000; // warn at 18 minutes (2 min warning)
const EVENTS      = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click', 'wheel'];

export function useSessionTimeout() {
  const navigate       = useNavigate();
  const timeoutRef     = useRef(null);
  const warningRef     = useRef(null);
  const [warning, setWarning] = useState(false);
  const [countdown, setCountdown] = useState(120); // seconds remaining shown in warning
  const countdownRef   = useRef(null);

  const clearAll = useCallback(() => {
    clearTimeout(timeoutRef.current);
    clearTimeout(warningRef.current);
    clearInterval(countdownRef.current);
  }, []);

  const logout = useCallback(async () => {
    clearAll();
    setWarning(false);
    await signOut(auth);
    navigate('/login', { replace: true });
  }, [clearAll, navigate]);

  const resetTimer = useCallback(() => {
    clearAll();
    setWarning(false);

    // Warning fires 2 minutes before timeout
    warningRef.current = setTimeout(() => {
      setWarning(true);
      setCountdown(120);
      countdownRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) { clearInterval(countdownRef.current); return 0; }
          return c - 1;
        });
      }, 1000);
    }, WARNING_MS);

    // Actual logout
    timeoutRef.current = setTimeout(logout, TIMEOUT_MS);
  }, [clearAll, logout]);

  // Stay-logged-in from warning dialog
  const stayLoggedIn = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  useEffect(() => {
    if (!auth.currentUser) return;

    // Start timer
    resetTimer();

    // Reset on any activity
    const handler = () => resetTimer();
    EVENTS.forEach(e => window.addEventListener(e, handler, { passive: true }));

    return () => {
      clearAll();
      EVENTS.forEach(e => window.removeEventListener(e, handler));
    };
  }, [resetTimer, clearAll]);

  return { warning, countdown, stayLoggedIn, logout };
}
