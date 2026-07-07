#!/usr/bin/env node
/**
 * Envia saudações push no horário local de cada usuário.
 * Canal separado das notificações financeiras.
 *
 * Produção — cron a cada 15 min (lógica usa fuso do usuário, não do servidor):
 *   */15 * * * * cd /app && node scripts/send-greeting-notifications.js
 *
 * Teste local (força slot sem esperar horário):
 *   node scripts/send-greeting-notifications.js --force-slot=cafe_manha
 */
const { loadEnv } = require('../src/config/env');
const { runMigrations } = require('../src/db/migrate');
const pushSubscriptionService = require('../src/services/pushSubscriptionService');
const greetingNotificationService = require('../src/services/greetingNotificationService');
const webPushService = require('../src/services/webPushService');

function parseForceSlot(argv) {
  const arg = argv.find((a) => a.startsWith('--force-slot='));
  if (!arg) return null;
  const slot = arg.split('=')[1];
  const valid = greetingNotificationService.GREETING_SLOTS.some((s) => s.id === slot);
  if (!valid) {
    console.error(`[greet] Slot inválido: ${slot}. Use: cafe_manha, almoco, lanche, noite`);
    process.exit(1);
  }
  const env = loadEnv();
  if (env.nodeEnv === 'production') {
    console.error('[greet] --force-slot não permitido em produção');
    process.exit(1);
  }
  return slot;
}

async function main() {
  const env = loadEnv();
  const forceSlot = parseForceSlot(process.argv.slice(2));

  if (!webPushService.isEnabled()) {
    console.error('[greet] VAPID não configurado. Defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no .env');
    process.exit(1);
  }

  await runMigrations();

  const userIds = await pushSubscriptionService.listUsersForDispatch();
  let sentTotal = 0;
  let skippedTotal = 0;
  let failedTotal = 0;

  console.log(`[greet] ${userIds.length} usuário(s) elegível(is)${forceSlot ? ` (force-slot=${forceSlot})` : ''}`);

  for (const userId of userIds) {
    const queue = await greetingNotificationService.dispatchGreetingForUser(userId, { forceSlot });

    if (queue.length === 0) {
      skippedTotal += 1;
      continue;
    }

    for (const notification of queue) {
      const result = await webPushService.sendToUser(userId, notification);

      if (result.sent > 0) {
        await pushSubscriptionService.logSent(userId, notification);
        sentTotal += 1;
        console.log(`[greet] enviado user=${userId} slot=${notification.dedupKey}`);
      } else {
        failedTotal += 1;
        console.warn(`[greet] falha user=${userId} failed=${result.failed} expired=${result.expired}`);
      }
    }
  }

  console.log(`[greet] concluído — enviados: ${sentTotal}, sem slot/dedup: ${skippedTotal}, falhas: ${failedTotal}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[greet] erro:', err.message);
    process.exit(1);
  });
