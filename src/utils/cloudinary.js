// Cloudinary unsigned upload — used for short (≤10s) report videos.
// Videos are too large for the inline-base64 Firestore path that photos use, so we
// host them on Cloudinary (free tier) and store only the returned URL on the issue doc.
// An UNSIGNED upload preset needs no secret key — just the cloud name + preset name,
// both safe to ship in the client and kept in import.meta.env.VITE_*.

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const isCloudinaryEnabled = () => Boolean(CLOUD_NAME && UPLOAD_PRESET);

// Unsigned upload of a short clip → { url, duration, publicId }. Throws on failure
// so the caller can surface a toast and abort the submit (clip didn't attach).
export const uploadVideo = async (file) => {
  if (!isCloudinaryEnabled()) throw new Error('Cloudinary not configured');
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`,
    { method: 'POST', body: form }
  );
  if (!res.ok) throw new Error(`Cloudinary HTTP ${res.status}`);
  const data = await res.json();
  return { url: data.secure_url, duration: data.duration, publicId: data.public_id };
};

// First-frame jpg derived from a Cloudinary video URL, for <video poster>.
export const videoPosterUrl = (url) =>
  url ? url.replace('/upload/', '/upload/so_0/').replace(/\.(mp4|webm|mov)$/i, '.jpg') : '';

// Downscale a Cloudinary delivery URL to a target width for in-app display, so the
// app doesn't fetch full-res images. Rewrites the w_/h_ transform segment (and
// caps quality); leaves non-Cloudinary URLs (or base64 data URLs) untouched.
export const cloudinaryThumb = (url, width = 480) => {
  if (!url || !url.includes('res.cloudinary.com')) return url;
  const repl = `w_${width},c_fill,q_auto,f_auto`;
  // Matches the existing "w_800,h_600,c_fill,q_auto,f_jpg" style segment.
  if (/\/(image|video)\/(fetch|upload)\/[^/]*w_\d+/.test(url)) {
    return url.replace(/(\/(?:image|video)\/(?:fetch|upload)\/)[^/]*w_\d+[^/]*/, `$1${repl}`);
  }
  // No transform segment present → inject one right after /upload/ or /fetch/.
  return url.replace(/\/(image|video)\/(fetch|upload)\//, `/$1/$2/${repl}/`);
};
