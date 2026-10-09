// Work-session helpers.
//
// A work session opens on login and should close (clock_out set) on logout.
// But a user often leaves without logging out (closes the tab, sleeps the
// machine, loses network, crashes) — so to stop sessions showing "in progress
// forever" we also:
//   • send a heartbeat (last_seen) every minute while the tab is alive,
//   • close the user's own stale / previous-day open sessions on login,
//   • best-effort close on tab hide/close,
//   • and the Admin view treats a session with a stale last_seen as ended.

import { doc, updateDoc, addDoc, getDocs, collection, query, where, arrayUnion, serverTimestamp, Timestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { db } from '../firebase';

// A session whose last_seen is older than this (and has no clock_out) is treated
// as ended — the user left without logging out.
export const SESSION_STALE_MS = 10 * 60 * 1000; // 10 minutes
const HEARTBEAT_MS = 60 * 1000;                  // ping last_seen every minute

let active = null; // { id, clockInTs, userId }
let heartbeatTimer = null;

export function setActiveWorkSession(session) {
  active = session;
  startHeartbeat();
}
export function getActiveWorkSession() { return active; }

function touch() {
  if (!active) return;
  updateDoc(doc(db, 'work_sessions', active.id), { last_seen: serverTimestamp() }).catch(() => {});
}
function startHeartbeat() {
  stopHeartbeat();
  if (!active) return;
  touch();
  heartbeatTimer = setInterval(touch, HEARTBEAT_MS);
}
function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

/** Append an activity entry to the current open work session (and bump last_seen),
 *  so the Admin Panel Work Hours view shows what each staff member actually did.
 *  Silent no-op when there is no open session (never blocks the action). */
export async function logActivity(action) {
  const s = active;
  if (!s || !action) return;
  try {
    await updateDoc(doc(db, 'work_sessions', s.id), {
      activities: arrayUnion({ action: String(action).slice(0, 200), at: new Date().toISOString() }),
      last_seen: serverTimestamp(),
    });
  } catch (_) { /* best-effort — never disrupt the user's action */ }
}

/** Close the open work session while still authenticated. Safe to call twice. */
export async function closeActiveWorkSession() {
  const s = active;
  stopHeartbeat();
  if (!s) return;
  active = null; // clear first so a concurrent logout path won't double-write
  const mins = Math.max(0, Math.round((Date.now() - s.clockInTs) / 60000));
  try {
    await updateDoc(doc(db, 'work_sessions', s.id), {
      clock_out: Timestamp.now(),
      duration_minutes: mins,
      last_seen: serverTimestamp(),
    });
  } catch (_) { /* best-effort */ }
}

/** On login, close this user's open sessions that are stale or from a previous
 *  day (left without logging out). Returns the id of a still-live session for
 *  today if one exists (so it can be reused), else null. */
export async function reconcileOpenSessions(userId) {
  const today = new Date().toISOString().slice(0, 10);
  let liveTodayId = null;
  try {
    const snap = await getDocs(query(
      collection(db, 'work_sessions'),
      where('user_id', '==', userId),
      where('clock_out', '==', null),
    ));
    const now = Date.now();
    for (const d of snap.docs) {
      const data = d.data();
      const ci = data.clock_in?.toDate?.()?.getTime() || null;
      const ls = data.last_seen?.toDate?.()?.getTime() || ci || null;
      const fresh = data.date === today && ls != null && (now - ls) < SESSION_STALE_MS;
      if (fresh && !liveTodayId) {
        liveTodayId = d.id; // reuse this one
      } else {
        // Stale or old → close it at its last-seen time (best estimate of when they left).
        const endMs = ls || ci || now;
        const mins = ci != null ? Math.max(0, Math.round((endMs - ci) / 60000)) : 0;
        await updateDoc(doc(db, 'work_sessions', d.id), {
          clock_out: Timestamp.fromMillis(endMs),
          duration_minutes: mins,
          auto_closed: true,
        }).catch(() => {});
      }
    }
  } catch (_) { /* best-effort */ }
  return liveTodayId;
}

/** Open (or reuse) today's work session for the user, after reconciling stale ones. */
export async function openWorkSession(userId, email, name) {
  const liveId = await reconcileOpenSessions(userId);
  if (liveId) {
    let ts = Date.now();
    try {
      const snap = await getDocs(query(collection(db, 'work_sessions'), where('user_id', '==', userId), where('clock_out', '==', null)));
      const d = snap.docs.find(x => x.id === liveId);
      ts = d?.data().clock_in?.toDate?.()?.getTime() || ts;
    } catch (_) {}
    return { id: liveId, clockInTs: ts, userId };
  }
  const ref = await addDoc(collection(db, 'work_sessions'), {
    user_id: userId, user_email: email || '', user_name: name || '',
    date: new Date().toISOString().slice(0, 10),
    clock_in: serverTimestamp(), clock_out: null, duration_minutes: null,
    last_seen: serverTimestamp(), notes: '',
  });
  return { id: ref.id, clockInTs: Date.now(), userId };
}

/** Close the work session, THEN sign out. Use for every logout. */
export async function logoutWithSessionClose(auth) {
  await closeActiveWorkSession();
  try { await signOut(auth); } catch (_) {}
}

/** Whether a session row (as read back) is effectively still active — open AND
 *  seen recently. Stale open rows are treated as ended. */
export function isSessionActive(row) {
  if (!row || row.clock_out) return false;
  const ls = row.last_seen?.toDate?.()?.getTime() || row.clock_in?.toDate?.()?.getTime() || 0;
  return (Date.now() - ls) < SESSION_STALE_MS;
}
