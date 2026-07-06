(function () {
  'use strict';

  const ASK_KEY = 'financeiro_renewal_notify_asked';

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
    if (localStorage.getItem(key)) return;

    const body = notifyBody(sub.daysUntilExpiry);

    function show() {
      try {
        new Notification('Home Finanças', { body: body, tag: key });
        localStorage.setItem(key, '1');
      } catch (_) {
        /* ignore */
      }
    }

    if (Notification.permission === 'granted') {
      show();
      return;
    }

    if (Notification.permission === 'default' && !localStorage.getItem(ASK_KEY)) {
      localStorage.setItem(ASK_KEY, '1');
      Notification.requestPermission().then(function (permission) {
        if (permission === 'granted') show();
      });
    }
  }

  window.FinanceRenewalReminder = { maybeNotify };
})();
