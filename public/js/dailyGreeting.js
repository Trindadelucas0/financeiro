(function () {
  'use strict';

  var STORAGE_PREFIX = 'daily_greeting_';
  var dialogBound = false;
  var pendingUserId = null;

  function getLocalDateKey(date) {
    date = date || new Date();
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function getTimeGreeting(date) {
    date = date || new Date();
    var hour = date.getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function getFirstName(user) {
    if (!user) return '—';
    var parts = String(user.nome || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length > 0) return parts[0];
    return user.username || user.email || '—';
  }

  function storageKey(userId, dateKey) {
    return STORAGE_PREFIX + String(userId || '') + '_' + dateKey;
  }

  function wasShownToday(userId) {
    if (!userId) return true;
    try {
      return localStorage.getItem(storageKey(userId, getLocalDateKey())) === '1';
    } catch (_) {
      return true;
    }
  }

  function markShownToday(userId) {
    if (!userId) return;
    try {
      localStorage.setItem(storageKey(userId, getLocalDateKey()), '1');
    } catch (_) {
      /* ignore */
    }
  }

  function closeDialog() {
    var dialog = document.getElementById('dailyGreetingDialog');
    if (dialog && dialog.open) {
      if (pendingUserId) markShownToday(pendingUserId);
      pendingUserId = null;
      dialog.close();
    }
  }

  function bindDialog() {
    if (dialogBound) return;
    var dialog = document.getElementById('dailyGreetingDialog');
    var okBtn = document.getElementById('dailyGreetingOk');
    if (!dialog || !okBtn) return;

    dialogBound = true;

    dialog.addEventListener('cancel', function (e) {
      e.preventDefault();
      closeDialog();
    });

    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) closeDialog();
    });

    okBtn.addEventListener('click', closeDialog);
  }

  function maybeShow(user) {
    if (!user || !user.id) return;
    if (wasShownToday(user.id)) return;

    var dialog = document.getElementById('dailyGreetingDialog');
    var title = document.getElementById('dailyGreetingTitle');
    if (!dialog || !title) return;

    bindDialog();

    title.textContent = getTimeGreeting(new Date()) + ', ' + getFirstName(user);
    pendingUserId = user.id;

    if (!dialog.open) {
      dialog.showModal();
      okBtnFocus();
    }
  }

  function okBtnFocus() {
    var okBtn = document.getElementById('dailyGreetingOk');
    if (okBtn) okBtn.focus();
  }

  window.FinanceDailyGreeting = {
    maybeShow: maybeShow,
    getTimeGreeting: getTimeGreeting,
    getFirstName: getFirstName,
    getLocalDateKey: getLocalDateKey,
  };
})();
