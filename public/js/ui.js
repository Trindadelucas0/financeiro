(function () {
  'use strict';

  var confirmResolver = null;

  function showConfirm(options) {
    options = options || {};
    var dialog = document.getElementById('confirmDialog');
    if (!dialog) {
      return Promise.resolve(window.confirm(options.message || 'Confirmar?'));
    }

    return new Promise(function (resolve) {
      if (confirmResolver) {
        confirmResolver(false);
      }
      confirmResolver = resolve;

      var titleEl = document.getElementById('confirmTitle');
      var msgEl = document.getElementById('confirmMessage');
      var okBtn = document.getElementById('confirmOk');
      var cancelBtn = document.getElementById('confirmCancel');

      if (titleEl) titleEl.textContent = options.title || 'Confirmar';
      if (msgEl) msgEl.textContent = options.message || '';
      if (okBtn) {
        okBtn.textContent = options.confirmLabel || 'Confirmar';
        okBtn.className = 'btn ' + (options.danger ? 'btn-danger-primary' : 'btn-primary');
      }
      if (cancelBtn) cancelBtn.textContent = options.cancelLabel || 'Cancelar';

      dialog.showModal();
      if (cancelBtn) cancelBtn.focus();
    });
  }

  function finishConfirm(result) {
    var dialog = document.getElementById('confirmDialog');
    if (dialog) dialog.close();
    if (confirmResolver) {
      var r = confirmResolver;
      confirmResolver = null;
      r(result);
    }
  }

  function bindModal(dialog, onRequestClose) {
    if (!dialog || dialog._financeUiBound) return;
    dialog._financeUiBound = true;

    dialog.addEventListener('cancel', function (e) {
      e.preventDefault();
      if (onRequestClose) onRequestClose();
      else dialog.close();
    });

    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) {
        e.preventDefault();
        if (onRequestClose) onRequestClose();
        else dialog.close();
      }
    });
  }

  function initConfirmDialog() {
    var dialog = document.getElementById('confirmDialog');
    if (!dialog || dialog._financeConfirmInit) return;
    dialog._financeConfirmInit = true;

    bindModal(dialog, function () {
      finishConfirm(false);
    });

    var okBtn = document.getElementById('confirmOk');
    var cancelBtn = document.getElementById('confirmCancel');
    if (okBtn) {
      okBtn.addEventListener('click', function () { finishConfirm(true); });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () { finishConfirm(false); });
    }
  }

  function init() {
    initConfirmDialog();
  }

  window.FinanceUI = {
    showConfirm: showConfirm,
    bindModal: bindModal,
    init: init,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
