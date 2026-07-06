const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'public', 'images', 'landing');
const dashboardSvgPath = path.join(outDir, 'dashboard-desktop.svg');
const logoPath = path.join(root, 'public', 'images', 'logo-home-financas.png');

async function generateOgCover() {
  const logo = await sharp(logoPath)
    .resize(520, null, { fit: 'inside' })
    .negate()
    .toBuffer();

  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 247, g: 247, b: 247, alpha: 1 },
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(outDir, 'og-cover.png'));
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const dashboardSvg = fs.readFileSync(dashboardSvgPath);
  await sharp(dashboardSvg).png().toFile(path.join(outDir, 'dashboard-desktop.png'));
  await sharp(dashboardSvg).resize(390).png().toFile(path.join(outDir, 'dashboard-mobile.png'));
  console.log('[generate-landing-shots] dashboard-desktop.png');
  console.log('[generate-landing-shots] dashboard-mobile.png');

  await generateOgCover();
  console.log('[generate-landing-shots] og-cover.png (1200x630)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
