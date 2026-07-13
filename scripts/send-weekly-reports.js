#!/usr/bin/env node
/**
 * Envia resumo financeiro (HTML + PDF) para usuários Pro.
 * Agendar em produção (segunda e sexta às 8h, America/Sao_Paulo):
 *   0 8 * * 1,5 cd ~/PROJETOS/financeiro && node scripts/send-weekly-reports.js
 */
const { loadEnv } = require('../src/config/env');
const { runMigrations } = require('../src/db/migrate');
const weeklyReportEmailService = require('../src/services/weeklyReportEmailService');
const { getPool } = require('../src/db/pool');

async function main() {
  loadEnv();
  await runMigrations();

  const result = await weeklyReportEmailService.processWeeklyReportEmails();

  if (result.disabled) {
    console.log('[weekly-report] Resend não configurado — nada enviado');
    return;
  }

  console.log(
    `[weekly-report] concluído — mes=${result.mes} candidatos: ${result.candidates}, enviados: ${result.sent}, já enviados: ${result.skipped}, falhas: ${result.failed}`,
  );
}

main()
  .then(async () => {
    try {
      await getPool().end();
    } catch (_) {
      // pool pode não ter sido aberto
    }
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[weekly-report] erro:', err.message);
    try {
      await getPool().end();
    } catch (_) {
      // ignore
    }
    process.exit(1);
  });
