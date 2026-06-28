// One-off: downscale public/logo.png (rendered at ≤200px) to a web-sized 480px-wide
// PNG. Keeps the full original as public/logo-full.png. Idempotent (always resizes
// from the backup). Run: node scripts/optimizeLogo.mjs
import sharp from 'sharp';
import fs from 'node:fs';

const src = 'public/logo.png';
const backup = 'logo-full.png'; // project root — NOT under public/ (so it isn't served/precached)
if (!fs.existsSync(backup)) fs.copyFileSync(src, backup);
const before = fs.statSync(backup).size;
const buf = await sharp(backup)
  .resize({ width: 480, withoutEnlargement: true })
  .png({ compressionLevel: 9, quality: 80 })
  .toBuffer();
fs.writeFileSync(src, buf);
console.log(`logo.png: ${(before / 1024).toFixed(0)}KB → ${(buf.length / 1024).toFixed(0)}KB`);
