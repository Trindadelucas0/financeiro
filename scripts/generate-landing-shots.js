const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'public', 'images', 'landing');
const svgPath = path.join(outDir, 'dashboard-desktop.svg');

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const svg = fs.readFileSync(svgPath);

  await sharp(svg).png().toFile(path.join(outDir, 'dashboard-desktop.png'));
  await sharp(svg).resize(390).png().toFile(path.join(outDir, 'dashboard-mobile.png'));

  console.log('[generate-landing-shots] dashboard-desktop.png');
  console.log('[generate-landing-shots] dashboard-mobile.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
