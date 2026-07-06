'use strict';

const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const LOGO = path.join(ROOT, 'public/images/logo-home-financas.png');
const OUT_DIR = path.join(ROOT, 'public/icons');
const BG = { r: 10, g: 10, b: 10, alpha: 1 };

async function writeIcon(size, logoScale, filename) {
  const logoSize = Math.round(size * logoScale);
  const logo = await sharp(LOGO)
    .resize(logoSize, logoSize, { fit: 'inside' })
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(OUT_DIR, filename));

  console.log('wrote', filename, size + 'x' + size);
}

async function main() {
  await writeIcon(192, 0.78, 'icon-192.png');
  await writeIcon(512, 0.72, 'icon-512.png');
  await writeIcon(512, 0.58, 'icon-512-maskable.png');
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
