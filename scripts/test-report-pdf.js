require('dotenv').config();
const { buildMonthlyReport, enrichReportWithAi } = require('../src/services/reportService');
const { generateMonthlyReportPdf } = require('../src/services/reportPdfService');
const { getPool } = require('../src/db/pool');

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
  console.log('PDF bytes:', pdf.length, 'ai:', report.aiEnabled, 'source:', report.aiInsights?.source);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
