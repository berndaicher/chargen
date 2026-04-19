import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const src = join(publicDir, 'Nexovis_Main_1.png');

// Generate PWA icons with proper sizes, centered on white background
async function generate(size, name) {
  const resized = await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(join(publicDir, name));
  console.log(`Created ${name} (${size}x${size})`);
}

await generate(192, 'favicon-192x192.png');
await generate(512, 'favicon-512x512.png');
await generate(32, 'favicon-32x32.png');
await generate(180, 'apple-touch-icon.png');
console.log('All icons generated from Nexovis_Main_1.png');
