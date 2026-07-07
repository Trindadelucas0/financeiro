(function () {
  'use strict';

  const notifiedKeys = new Set();

  function storageKey(periodEnd) {
    return 'renewal_notified_' + String(periodEnd || '');
  }

  function notifyBody(days) {
    if (days === 1) return 'Sua assinatura expira amanhã. Renove em Meu perfil.';
    return 'Sua assinatura expira em ' + days + ' dias. Renove em Meu perfil.';
  }

  async function maybeNotify(sub) {
    if (!sub || !sub.renewalDueSoon || !sub.currentPeriodEnd) return;
    if (!('Notification' in window)) return;

    if (window.FinancePush && typeof FinancePush.isPushActive === 'function') {
      const pushActive = await FinancePush.isPushActive();
      if (pushActive) return;
    }

    const key = storageKey(sub.currentPeriodEnd);
    if (notifiedKeys.has(key)) return;

    const body = notifyBody(sub.daysUntilExpiry);

    function show() {
      try {
        new Notification('Home Finanças', { body: body, tag: key });
        notifiedKeys.add(key);
      } catch (_) {
        /* ignore */
      }
    }

    if (Notification.permission === 'granted') {
      show();
    }
  }

  window.FinanceRenewalReminder = { maybeNotify };
})();
