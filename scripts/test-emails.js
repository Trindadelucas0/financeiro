#!/usr/bin/env node
/**
 * Envia todos os layouts de e-mail do sistema para um endereço de teste.
 * Uso: node scripts/test-emails.js [email]
 */
require('dotenv').config();

const { buildMonthlyReport, enrichReportWithAi } = require('../src/services/reportService');
const { generateMonthlyReportPdf } = require('../src/services/reportPdfService');
const {
  sendAllLayoutPreviews,
  verifyResendConnection,
  resetConfigCache,
  EMAIL_LAYOUTS,
} = require('../src/services/emailService');
const { getPool } = require('../src/db/pool');

const TEST_EMAIL = (process.argv[2] || 'lucasrodrigues4@live.com').trim().toLowerCase();
const TEST_FROM = 'Home Finanças <onboarding@resend.dev>';

function printResendHelp() {
  console.error('\nComo corrigir:');
  console.error('1. Acesse https://resend.com/api-keys e crie uma nova API key');
  console.error('2. Cole em RESEND_API_KEY no .env (formato: re_...)');
  console.error('3. Para teste rápido, use RESEND_FROM=' + TEST_FROM);
  console.error('4. Com onboarding@resend.dev, o destino precisa ser o e-mail da conta Resend');
  console.error('5. Para produção, verifique cashome.avadesk.com.br no Resend e use noreply@...');
}

(async () => {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) {
    console.error('RESEND_API_KEY ausente no .env');
    printResendHelp();
    process.exit(1);
  }

  if (!apiKey.startsWith('re_')) {
    console.error('RESEND_API_KEY inválida: deve começar com re_');
    printResendHelp();
    process.exit(1);
  }

  process.env.RESEND_FROM = TEST_FROM;
  resetConfigCache();

  console.log('Destino:', TEST_EMAIL);
  console.log('Remetente (teste):', TEST_FROM);
  console.log('Layouts:', EMAIL_LAYOUTS.join(', '));

  try {
    await verifyResendConnection();
    console.log('Conexão Resend: OK');
  } catch (err) {
    console.error('Conexão Resend falhou:', err.message);
    if (err.details && err.details.statusCode === 401) {
      console.error('A API key no .env foi rejeitada pelo Resend (401). Gere uma nova chave.');
    }
    printResendHelp();
    process.exit(1);
  }

  let pdfBuffer = null;
  let mes = '2026-07';
  let mesLabel = 'Julho de 2026';

  try {
    const pool = getPool();
    const { rows } = await pool.query('SELECT id, nome, email, username FROM users LIMIT 1');
    if (rows[0]) {
      const report = await buildMonthlyReport(rows[0].id, mes);
      await enrichReportWithAi(report, rows[0].id);
      pdfBuffer = await generateMonthlyReportPdf(report);
      mes = report.mes;
      mesLabel = report.mesLabel;
      console.log('PDF de exemplo gerado:', pdfBuffer.length, 'bytes');
    } else {
      console.warn('Nenhum usuário no banco — layout reportPdf será enviado sem anexo');
    }
    await pool.end();
  } catch (err) {
    console.warn('Não foi possível gerar PDF de exemplo:', err.message);
    try {
      await getPool().end();
    } catch (_) {
      /* ignore */
    }
  }

  const sampleData = {
    nome: 'Lucas Rodrigues',
    email: TEST_EMAIL,
    username: 'lucasrodrigues',
    tempPassword: 'Lucas2026!',
    mes,
    mesLabel,
    pdfBuffer,
  };

  const results = await sendAllLayoutPreviews(TEST_EMAIL, sampleData, { from: TEST_FROM });

  results.forEach(function (item) {
    console.log(`✓ ${item.layout} → id: ${item.id || '(sem id)'}`);
  });

  console.log(`\n${results.length}/${EMAIL_LAYOUTS.length} e-mails enviados para ${TEST_EMAIL}`);
  process.exit(0);
})().catch(function (err) {
  console.error('Falha no teste de e-mails:', err.message);
  if (err.details) console.error(err.details);
  if (err.details && err.details.statusCode === 401) {
    console.error('A API key no .env foi rejeitada pelo Resend (401). Gere uma nova chave.');
  }
  printResendHelp();
  process.exit(1);
});
