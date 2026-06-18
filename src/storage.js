import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import app from './firebase';

const storage  = getStorage(app);
const MAX_BYTES = 20 * 1024 * 1024;

// Explicit MIME map so files are always stored with the right Content-Type.
// Firebase uses this for the Content-Type response header, which browsers
// need to cache correctly and display inline (PDF, images).
const MIME_MAP = {
  pdf:  'application/pdf',
  jpg:  'image/jpeg', jpeg: 'image/jpeg',
  png:  'image/png',
  gif:  'image/gif',
  webp: 'image/webp',
  svg:  'image/svg+xml',
  avif: 'image/avif',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc:  'application/msword',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt:  'application/vnd.ms-powerpoint',
  txt:  'text/plain',
  csv:  'text/csv',
};

// Compress raster images client-side before upload.
// Targets vehicle photos and property photos which are commonly 2-5 MB.
// Only runs when the file is >300 KB; smaller files are uploaded as-is.
// Converts JPEG/PNG/WebP → JPEG at 82% quality, capped at 1920 px on longest edge.
// Falls back to the original file if the canvas output is larger.
async function compressImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
  if (file.size < 300 * 1024) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const MAX_DIM = 1920;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => resolve(blob && blob.size < file.size ? blob : file),
        'image/jpeg',
        0.82
      );
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

// uploadFile — core upload utility.
//
// folder    : Storage path prefix, e.g. "insuresaas/quotation-docs/MT-John_Silva"
// onProgress: optional (pct: 0-100) => void
// label     : human-readable doc name used as the filename stem,
//             e.g. "Vehicle Registration" → "Vehicle_Registration.pdf"
//             Falls back to a timestamp+random string when omitted.
export async function uploadFile(file, folder = 'insuresaas/docs', onProgress, label) {
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 20 MB.`);
  }

  const compressed = await compressImage(file);
  const wasCompressed = compressed !== file;

  const origExt = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'bin';
  // If we converted PNG/WebP → JPEG, the extension changes
  const ext = wasCompressed && file.type !== 'image/jpeg' ? 'jpg' : origExt;

  const stem = label
    ? label.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const filename = `${stem}.${ext}`;
  const fileRef  = ref(storage, `${folder}/${filename}`);

  const contentType = wasCompressed
    ? 'image/jpeg'
    : (file.type || MIME_MAP[origExt] || 'application/octet-stream');

  // Cache-Control: immutable + 1-year TTL.
  // Documents don't change after upload (a replacement is a new upload).
  // This means every view after the first is served from the browser/CDN cache
  // with zero Storage read operations and zero egress charges.
  const metadata = {
    contentType,
    cacheControl: 'public, max-age=31536000, immutable',
  };

  const attempt = (attemptsLeft) => new Promise((resolve, reject) => {
    const task = uploadBytesResumable(fileRef, compressed, metadata);

    task.on(
      'state_changed',
      (snap) => {
        if (onProgress) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      async (err) => {
        const retryable = err.code === 'storage/retry-limit-exceeded' ||
                          err.code === 'storage/unknown'              ||
                          err.message?.toLowerCase().includes('network');
        if (retryable && attemptsLeft > 1) {
          // Reset progress bar and retry after a short pause
          if (onProgress) onProgress(0);
          await new Promise(r => setTimeout(r, 2000));
          attempt(attemptsLeft - 1).then(resolve).catch(reject);
        } else {
          reject(new Error(err.message));
        }
      },
      async () => {
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (err) {
          reject(err);
        }
      }
    );
  });

  return attempt(3);
}

// Firebase Storage URLs are direct — return as-is.
export function viewUrl(url) {
  return url || '';
}

// Opens any file in a new tab. PDFs use a blob URL for guaranteed inline display.
// Falls back to direct window.open if the fetch fails (e.g. CORS).
export async function openFile(url) {
  if (!url) return;
  const isPdf = /\.pdf(\?|$)/i.test(url);
  if (isPdf) {
    try {
      const res     = await fetch(url);
      if (!res.ok) throw new Error('fetch failed');
      const blob    = await res.blob();
      const blobUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      window.open(url, '_blank');
    }
    return;
  }
  window.open(viewUrl(url), '_blank');
}
