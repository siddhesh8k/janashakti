// Client-side media helpers for the video-report flow. No new dependencies —
// uses the built-in <video>/<canvas> APIs to enforce the 10-second cap and to
// grab a still frame that feeds the existing Gemini-vision analysis (analyzeIssue).

export const MAX_VIDEO_DURATION = 10; // seconds — civic clips stay short

// Read duration (seconds) from a video File via a hidden <video> element.
export const getVideoDuration = (file) => new Promise((resolve, reject) => {
  const v = document.createElement('video');
  v.preload = 'metadata';
  v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration); };
  v.onerror = () => reject(new Error('Cannot read video'));
  v.src = URL.createObjectURL(file);
});

// Grab a still frame as base64 jpg (no data: prefix) — the same shape
// analyzeIssue()/callGeminiVision() already expect for a photo.
export const extractVideoFrame = (file, atSeconds = 1) => new Promise((resolve, reject) => {
  const v = document.createElement('video');
  v.preload = 'metadata';
  v.muted = true;
  v.playsInline = true;
  v.onloadedmetadata = () => { v.currentTime = Math.min(atSeconds, (v.duration || 2) / 2); };
  v.onseeked = () => {
    try {
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      URL.revokeObjectURL(v.src);
      resolve(c.toDataURL('image/jpeg', 0.6).split(',')[1]);
    } catch (err) {
      reject(err);
    }
  };
  v.onerror = () => reject(new Error('Cannot extract frame'));
  v.src = URL.createObjectURL(file);
});
