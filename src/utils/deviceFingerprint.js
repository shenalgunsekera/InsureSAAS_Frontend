// ── Device ID — IndexedDB-first, permanent storage ────────────────────────────
//
// Why IndexedDB?
//   • Survives browser cache clears and cookie deletion
//   • Only wiped when user explicitly chooses "Clear Site Data" in settings
//   • Once a device is approved, it stays approved permanently
//   • UUID never drifts (unlike fingerprints that shift with OS/driver updates)
//
// Storage chain:  localStorage (fast cache) → IndexedDB (permanent) → generate new

const LS_KEY  = 'insuresaas_dev_id';
const DB_NAME = 'insuresaas_device_db';
const STORE   = 'device';
const ID_KEY  = 'id';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => { e.target.result.createObjectStore(STORE); };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = () => reject(new Error('IndexedDB unavailable'));
  });
}

function dbGet(db) {
  return new Promise(resolve => {
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(ID_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => resolve(null);
    } catch { resolve(null); }
  });
}

function dbPut(db, id) {
  return new Promise(resolve => {
    try {
      const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(id, ID_KEY);
      req.onsuccess = () => resolve();
      req.onerror   = () => resolve();
    } catch { resolve(); }
  });
}

/** Returns the permanent device ID.
 *  Creates one on first call and stores it in IndexedDB so it survives
 *  cache clears. Falls back to localStorage if IndexedDB isn't available. */
export async function getOrCreateDeviceId() {
  // 1 — Fast cache hit
  const cached = localStorage.getItem(LS_KEY);
  if (cached && cached.length > 8) return cached;

  try {
    const db = await openDB();

    // 2 — Already stored in IndexedDB (survives cache clears)
    const stored = await dbGet(db);
    if (stored && stored.length > 8) {
      try { localStorage.setItem(LS_KEY, stored); } catch (_) {}
      return stored;
    }

    // 3 — First time on this device — generate and persist
    const id = generateUUID();
    await dbPut(db, id);
    try { localStorage.setItem(LS_KEY, id); } catch (_) {}
    return id;

  } catch {
    // IndexedDB unavailable (very rare — old browsers / strict private mode)
    const fallback = localStorage.getItem(LS_KEY) || generateUUID();
    try { localStorage.setItem(LS_KEY, fallback); } catch (_) {}
    return fallback;
  }
}

// ── Device info collectors ────────────────────────────────────────────────────

export function collectDeviceInfo() {
  const ua = navigator.userAgent;

  const getBrowser = () => {
    if (/Edg\//.test(ua))                          return 'Microsoft Edge';
    if (/OPR\/|Opera/.test(ua))                    return 'Opera';
    if (/Chrome\//.test(ua) && !/Edg/.test(ua))    return 'Chrome';
    if (/Firefox\//.test(ua))                       return 'Firefox';
    if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return 'Safari';
    return 'Unknown Browser';
  };

  const getOS = () => {
    if (/Windows NT 10|Windows NT 11/.test(ua)) return 'Windows 10/11';
    if (/Windows NT 6\.3/.test(ua))             return 'Windows 8.1';
    if (/Windows/.test(ua))                     return 'Windows';
    if (/Mac OS X/.test(ua))                    return 'macOS';
    if (/Android/.test(ua)) {
      const m = ua.match(/Android ([0-9.]+)/);
      return m ? `Android ${m[1]}` : 'Android';
    }
    if (/iPhone|iPad/.test(ua)) return 'iOS';
    if (/Linux/.test(ua))       return 'Linux';
    return 'Unknown OS';
  };

  const getDeviceType = () => {
    if (/iPad/.test(ua))                  return 'Tablet';
    if (/Mobile|Android|iPhone/.test(ua)) return 'Mobile';
    return 'Desktop';
  };

  return {
    browser:     getBrowser(),
    os:          getOS(),
    device_type: getDeviceType(),
    screen:      `${window.screen.width}×${window.screen.height}`,
    timezone:    Intl.DateTimeFormat().resolvedOptions().timeZone,
    language:    navigator.language,
    user_agent:  ua.substring(0, 400),
  };
}

export async function fetchLocationInfo() {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) throw new Error('geo failed');
    const d = await res.json();
    return {
      ip:           d.ip           || 'Unknown',
      city:         d.city         || 'Unknown',
      region:       d.region       || '',
      country:      d.country_name || 'Unknown',
      country_code: d.country_code || '',
    };
  } catch {
    return { ip: 'Unknown', city: 'Unknown', region: '', country: 'Unknown', country_code: '' };
  }
}
