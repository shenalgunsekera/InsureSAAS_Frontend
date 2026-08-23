// Work-session helpers.
//
// A work session is opened on login and must be closed (clock_out set) on
// logout. The close write MUST happen while the user is still authenticated —
// if it runs after signOut, the Firestore rules reject it (request.auth is
// null) and the session stays "ongoing" forever. So every logout path closes
// the session first, then signs out.

import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db } from '../firebase';

let active = null; // { id, clockInTs, userId }

export function setActiveWorkSession(session) { active = session; }
export function getActiveWorkSession() { return active; }

/** Append an activity entry to the current open work session, so the Admin
 *  Panel Work Hours view shows what each staff member actually did. Silent
 *  no-op when there is no open session (never blocks the action). */
export async function logActivity(action) {
  const s = active;
  if (!s || !action) return;
  try {
    await updateDoc(doc(db, 'work_sessions', s.id), {
      activities: arrayUnion({ action: String(action).slice(0, 200), at: new Date().toISOString() }),
    });
  } catch (_) { /* best-effort — never disrupt the user's action */ }
}

/** Close the open work session while still authenticated. Safe to call twice. */
export async function closeActiveWorkSession() {
  const s = active;
  if (!s) return;
  active = null; // clear first so a concurrent logout path won't double-write
  const mins = Math.max(0, Math.round((Date.now() - s.clockInTs) / 60000));
  try {
    await updateDoc(doc(db, 'work_sessions', s.id), {
      clock_out: Timestamp.now(),
      duration_minutes: mins,
    });
  } catch (_) { /* best-effort */ }
}

/** Close the work session, THEN sign out. Use for every logout. */
export async function logoutWithSessionClose(auth) {
  await closeActiveWorkSession();
  try { await signOut(auth); } catch (_) {}
}
