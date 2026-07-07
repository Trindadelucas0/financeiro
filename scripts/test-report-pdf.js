require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { buildMonthlyReport, enrichReportWithAi } = require('../src/services/reportService');
const { generateMonthlyReportPdf } = require('../src/services/reportPdfService');
const { getPool } = require('../src/db/pool');

function countPdfPages(buffer) {
  const text = buffer.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page\b/g);
  return matches ? matches.length : 0;
}

(async () => {
  const pool = getPool();
  const { rows } = await pool.query('SELECT id FROM users LIMIT 1');
  if (!rows[0]) {
    console.log('no users');
    process.exit(0);
  }
  const report = await buildMonthlyReport(rows[0].id);
  await enrichReportWithAi(report, rows[0].id);
  const pdf = await generateMonthlyReportPdf(report);
  const pages = countPdfPages(pdf);

  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `relatorio-test-${report.mes}.pdf`);
  fs.writeFileSync(outPath, pdf);

  console.log('PDF bytes:', pdf.length);
  console.log('PDF pages:', pages);
  console.log('Saved:', outPath);
  console.log('ai:', report.aiEnabled, 'source:', report.aiInsights?.source);

  if (pages !== 4) {
    console.error('Expected 4 pages, got', pages);
    process.exit(1);
  }

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
