import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import {
  getAuth, setPersistence,
  browserSessionPersistence, browserLocalPersistence,
  signInAnonymously,
} from 'firebase/auth';
import { getStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const db      = getFirestore(app);
export const auth    = getAuth(app);
export const storage = getStorage(app);
export default app;

// Persistence is set per sign-in type, NOT globally:
//   • Staff logins (LoginPage) use session persistence — logged out on tab close.
//   • Anonymous visitors (public quote pages) use local persistence — the same
//     anonymous account is reused across visits instead of minting a new
//     Firebase user on every tab/session.
export { browserSessionPersistence, browserLocalPersistence };

/** Anonymous auth for PUBLIC pages (quote response / selection / comparison).
 *  - Never touches an existing session: a signed-in staff member (or an
 *    already-restored anonymous user) is reused as-is.
 *  - New anonymous users are stored with LOCAL persistence so one browser
 *    keeps one anonymous account indefinitely instead of creating a new
 *    account per visit. */
export async function ensureAnonymousUser() {
  if (auth.currentUser) return auth.currentUser;
  try { await setPersistence(auth, browserLocalPersistence); } catch (_) {}
  const cred = await signInAnonymously(auth);
  return cred.user;
}

// Best-effort offline cache
enableIndexedDbPersistence(db).catch(() => {});
