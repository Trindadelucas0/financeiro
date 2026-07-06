(function () {
  'use strict';

  const notifiedKeys = new Set();
  let permissionAsked = false;

  function storageKey(periodEnd) {
    return 'renewal_notified_' + String(periodEnd || '');
  }

  function notifyBody(days) {
    if (days === 1) return 'Sua assinatura expira amanhã. Renove em Meu perfil.';
    return 'Sua assinatura expira em ' + days + ' dias. Renove em Meu perfil.';
  }

  function maybeNotify(sub) {
    if (!sub || !sub.renewalDueSoon || !sub.currentPeriodEnd) return;
    if (!('Notification' in window)) return;

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
      return;
    }

    if (Notification.permission === 'default' && !permissionAsked) {
      permissionAsked = true;
      Notification.requestPermission().then(function (permission) {
        if (permission === 'granted') show();
      });
    }
  }

  window.FinanceRenewalReminder = { maybeNotify };
})();
