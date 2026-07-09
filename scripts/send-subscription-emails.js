#!/usr/bin/env node
/**
 * Expira assinaturas vencidas e envia e-mail de aviso (uma vez por período).
 * Agendar em produção (ex.: a cada hora):
 *   0 * * * * cd ~/PROJETOS/financeiro && node scripts/send-subscription-emails.js
 */
const { loadEnv } = require('../src/config/env');
const { runMigrations } = require('../src/db/migrate');
const subscriptionEmailService = require('../src/services/subscriptionEmailService');
const { getPool } = require('../src/db/pool');

async function main() {
  loadEnv();
  await runMigrations();

  const result = await subscriptionEmailService.processExpiredSubscriptionEmails();

  if (result.disabled) {
    console.log('[subscription-email] Resend não configurado — nada enviado');
    return;
  }

  console.log(
    `[subscription-email] concluído — expirados: ${result.expired}, enviados: ${result.sent}, já enviados: ${result.skipped}, falhas: ${result.failed}`,
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
    console.error('[subscription-email] erro:', err.message);
    try {
      await getPool().end();
    } catch (_) {
      // ignore
    }
    process.exit(1);
  });
