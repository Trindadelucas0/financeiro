#!/usr/bin/env node
/**
 * Envia notificações push para usuários com subscription ativa.
 * Agendar em produção (ex.: 9h America/Sao_Paulo):
 *   0 9 * * * cd /app && node scripts/send-notifications.js
 */
const { loadEnv } = require('../src/config/env');
const { runMigrations } = require('../src/db/migrate');
const pushSubscriptionService = require('../src/services/pushSubscriptionService');
const notificationDispatchService = require('../src/services/notificationDispatchService');
const webPushService = require('../src/services/webPushService');

async function main() {
  loadEnv();

  if (!webPushService.isEnabled()) {
    console.error('[notify] VAPID não configurado. Defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no .env');
    process.exit(1);
  }

  await runMigrations();

  const userIds = await pushSubscriptionService.listUsersForDispatch();
  let sentTotal = 0;
  let skippedTotal = 0;
  let failedTotal = 0;

  console.log(`[notify] ${userIds.length} usuário(s) elegível(is)`);

  for (const userId of userIds) {
    const queue = await notificationDispatchService.dispatchForUser(userId);

    if (queue.length === 0) {
      skippedTotal += 1;
      continue;
    }

    for (const notification of queue) {
      const result = await webPushService.sendToUser(userId, notification);

      if (result.sent > 0) {
        await pushSubscriptionService.logSent(userId, notification);
        sentTotal += 1;
        console.log(`[notify] enviado user=${userId} type=${notification.type} key=${notification.dedupKey}`);
      } else {
        failedTotal += 1;
        console.warn(`[notify] falha user=${userId} type=${notification.type} failed=${result.failed} expired=${result.expired}`);
      }
    }
  }

  console.log(`[notify] concluído — enviados: ${sentTotal}, sem novidade: ${skippedTotal}, falhas: ${failedTotal}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[notify] erro:', err.message);
    process.exit(1);
  });
