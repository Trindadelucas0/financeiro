(function () {
  'use strict';

  var confirmResolver = null;
  var passwordResolver = null;

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

      document.body.appendChild(dialog);
      dialog.classList.add('modal-confirm-open');
      dialog.showModal();
      if (cancelBtn) cancelBtn.focus();
    });
  }

  function finishConfirm(result) {
    var dialog = document.getElementById('confirmDialog');
    if (dialog) {
      dialog.classList.remove('modal-confirm-open');
      dialog.close();
    }
    if (confirmResolver) {
      var r = confirmResolver;
      confirmResolver = null;
      r(result);
    }
  }

  function showPasswordPrompt(options) {
    options = options || {};
    var dialog = document.getElementById('passwordDialog');
    if (!dialog) {
      var fallback = window.prompt(options.message || 'Digite sua senha:');
      return Promise.resolve(fallback || null);
    }

    return new Promise(function (resolve) {
      if (passwordResolver) {
        passwordResolver(null);
      }
      passwordResolver = resolve;

      var titleEl = document.getElementById('passwordTitle');
      var msgEl = document.getElementById('passwordMessage');
      var inputEl = document.getElementById('passwordDialogInput');
      var okBtn = document.getElementById('passwordOk');
      var cancelBtn = document.getElementById('passwordCancel');

      if (titleEl) titleEl.textContent = options.title || 'Confirmar senha';
      if (msgEl) msgEl.textContent = options.message || '';
      if (inputEl) {
        inputEl.value = '';
        inputEl.classList.remove('input-error');
      }
      if (okBtn) okBtn.textContent = options.confirmLabel || 'Confirmar';
      if (cancelBtn) cancelBtn.textContent = options.cancelLabel || 'Cancelar';

      document.body.appendChild(dialog);
      dialog.classList.add('modal-confirm-open');
      dialog.showModal();
      if (inputEl) {
        requestAnimationFrame(function () { inputEl.focus(); });
      }
    });
  }

  function finishPassword(result) {
    var dialog = document.getElementById('passwordDialog');
    if (dialog) {
      dialog.classList.remove('modal-confirm-open');
      dialog.close();
    }
    if (passwordResolver) {
      var r = passwordResolver;
      passwordResolver = null;
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

  function initPasswordDialog() {
    var dialog = document.getElementById('passwordDialog');
    if (!dialog || dialog._financePasswordInit) return;
    dialog._financePasswordInit = true;

    bindModal(dialog, function () {
      finishPassword(null);
    });

    var okBtn = document.getElementById('passwordOk');
    var cancelBtn = document.getElementById('passwordCancel');
    var inputEl = document.getElementById('passwordDialogInput');

    function submitPassword() {
      var value = inputEl ? inputEl.value : '';
      if (!value.trim()) {
        if (inputEl) inputEl.classList.add('input-error');
        return;
      }
      finishPassword(value);
    }

    if (okBtn) {
      okBtn.addEventListener('click', submitPassword);
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () { finishPassword(null); });
    }
    if (inputEl) {
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitPassword();
        }
      });
      inputEl.addEventListener('input', function () {
        inputEl.classList.remove('input-error');
      });
    }
  }

  function init() {
    initConfirmDialog();
    initPasswordDialog();
  }

  window.FinanceUI = {
    showConfirm: showConfirm,
    showPasswordPrompt: showPasswordPrompt,
    bindModal: bindModal,
    init: init,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
