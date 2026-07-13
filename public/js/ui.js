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
    initMaisSheet();
    initSaldoSheet();
    initMobileTip();
  }

  function initMaisSheet() {
    var btn = document.getElementById('btnMaisNav');
    var dialog = document.getElementById('maisSheetDialog');
    var closeBtn = document.getElementById('maisSheetClose');
    if (!btn || !dialog || dialog._financeMaisInit) return;
    dialog._financeMaisInit = true;

    function open() {
      document.body.appendChild(dialog);
      dialog.showModal();
      btn.setAttribute('aria-expanded', 'true');
    }

    function close() {
      dialog.close();
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function () {
      if (dialog.open) close();
      else open();
    });

    if (closeBtn) closeBtn.addEventListener('click', close);

    bindModal(dialog, close);

    dialog.addEventListener('close', function () {
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  function closeMaisSheet() {
    var dialog = document.getElementById('maisSheetDialog');
    if (dialog && dialog.open) dialog.close();
  }

  var saldoSheetMode = 'atualizar';

  function parseMoneyInput(str) {
    if (str == null) return null;
    var s = String(str).trim();
    if (!s) return null;
    s = s.replace(/[^\d.,]/g, '');
    if (!s) return null;

    var hasComma = s.indexOf(',') !== -1;
    var hasDot = s.indexOf('.') !== -1;

    if (hasComma) {
      // BR: 1.500,50 or 1500,50
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (hasDot) {
      var parts = s.split('.');
      if (parts.length === 2 && parts[1].length > 0 && parts[1].length <= 2) {
        // Decimal: 1.50 → 1.50
        s = parts[0] + '.' + parts[1];
      } else {
        // Thousands: 1.500 or 1.500.000 → 1500 / 1500000
        s = s.replace(/\./g, '');
      }
    }

    var n = Number(s);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.round(n * 100) / 100);
  }

  function formatMoneyInputValue(value) {
    if (value == null || value === '' || !Number.isFinite(Number(value))) return '';
    return Number(value).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function showSaldoSheetError(message) {
    if (window.FinanceApp && window.FinanceApp.toast) {
      window.FinanceApp.toast(message, 'error');
      return;
    }
    window.alert(message);
  }

  function formatMoneyPreview(value) {
    if (!window.FinanceApp || !window.FinanceCharts) {
      return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function updateSaldoSheetPreview() {
    var previewEl = document.getElementById('saldoSheetPreview');
    var valorInput = document.getElementById('saldoSheetValor');
    if (!previewEl || !valorInput || saldoSheetMode !== 'atualizar') return;
    var novo = parseMoneyInput(valorInput.value);
    var atual = window.FinanceApp && window.FinanceApp.getSaldoAtual ? window.FinanceApp.getSaldoAtual() : 0;
    if (novo != null && String(valorInput.value || '').trim() !== '') {
      previewEl.textContent = 'Saldo atual ' + formatMoneyPreview(atual) + ' → Novo ' + formatMoneyPreview(novo);
      previewEl.hidden = false;
    } else {
      previewEl.hidden = true;
    }
  }

  function initSaldoSheet() {
    var dialog = document.getElementById('saldoSheetDialog');
    var form = document.getElementById('saldoSheetForm');
    var cancelBtn = document.getElementById('saldoSheetCancel');
    var valorInput = document.getElementById('saldoSheetValor');
    if (!dialog || !form || dialog._financeSaldoInit) return;
    dialog._financeSaldoInit = true;

    bindModal(dialog, function () { dialog.close(); });

    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () { dialog.close(); });
    }

    if (valorInput) {
      valorInput.addEventListener('input', updateSaldoSheetPreview);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var rawValue = document.getElementById('saldoSheetValor').value;
      var valor = parseMoneyInput(rawValue);
      if (valor == null) {
        showSaldoSheetError('Informe um valor válido.');
        return;
      }
      if (saldoSheetMode === 'entrada' && valor <= 0) {
        showSaldoSheetError('Informe um valor maior que zero.');
        return;
      }
      if (!window.FinanceApp || !window.FinanceApp.submitSaldoSheet) {
        showSaldoSheetError('Não foi possível salvar agora. Recarregue a página.');
        return;
      }
      window.FinanceApp.submitSaldoSheet(
        saldoSheetMode,
        valor,
        document.getElementById('saldoSheetDescricao').value,
      );
    });
  }

  function openSaldoSheet(mode, presetValor) {
    var dialog = document.getElementById('saldoSheetDialog');
    if (!dialog) return;

    saldoSheetMode = mode === 'entrada' ? 'entrada' : 'atualizar';
    var titleEl = document.getElementById('saldoSheetTitle');
    var descEl = document.getElementById('saldoSheetDesc');
    var previewEl = document.getElementById('saldoSheetPreview');
    var labelEl = document.getElementById('saldoSheetValorLabel');
    var descField = document.getElementById('saldoSheetDescricaoField');
    var submitBtn = document.getElementById('saldoSheetSubmit');
    var valorInput = document.getElementById('saldoSheetValor');
    var descInput = document.getElementById('saldoSheetDescricao');

    if (saldoSheetMode === 'entrada') {
      if (titleEl) titleEl.textContent = 'Entrou dinheiro';
      if (descEl) descEl.textContent = 'Quanto entrou na sua conta?';
      if (labelEl) labelEl.textContent = 'Valor da entrada';
      if (descField) descField.hidden = false;
      if (submitBtn) submitBtn.textContent = 'Adicionar à conta';
      if (previewEl) previewEl.hidden = true;
      if (valorInput) valorInput.value = '';
      if (descInput) descInput.value = '';
    } else {
      if (titleEl) titleEl.textContent = 'Atualizar saldo';
      if (descEl) descEl.textContent = 'Informe o total que você tem na conta agora.';
      if (labelEl) labelEl.textContent = 'Novo saldo total';
      if (descField) descField.hidden = true;
      if (submitBtn) submitBtn.textContent = 'Salvar saldo';
      if (valorInput) {
        valorInput.value = presetValor != null && Number.isFinite(Number(presetValor))
          ? formatMoneyInputValue(presetValor)
          : '';
      }
      if (descInput) descInput.value = '';
      updateSaldoSheetPreview();
    }

    document.body.appendChild(dialog);
    dialog.showModal();
    if (valorInput) {
      requestAnimationFrame(function () {
        valorInput.focus();
        valorInput.select();
      });
    }
  }

  function closeSaldoSheet() {
    var dialog = document.getElementById('saldoSheetDialog');
    if (dialog && dialog.open) dialog.close();
  }

  function initMobileTip() {
    var banner = document.getElementById('mobileTipBanner');
    var dismiss = document.getElementById('mobileTipDismiss');
    if (!banner || banner._financeTipInit) return;
    banner._financeTipInit = true;

    if (window.matchMedia('(max-width: 768px)').matches && !localStorage.getItem('finance_mais_tip_dismissed')) {
      banner.hidden = false;
    }

    if (dismiss) {
      dismiss.addEventListener('click', function () {
        banner.hidden = true;
        localStorage.setItem('finance_mais_tip_dismissed', '1');
      });
    }
  }

  window.FinanceUI = {
    showConfirm: showConfirm,
    showPasswordPrompt: showPasswordPrompt,
    bindModal: bindModal,
    init: init,
    openMaisSheet: function () {
      var btn = document.getElementById('btnMaisNav');
      if (btn) btn.click();
    },
    closeMaisSheet: closeMaisSheet,
    openSaldoSheet: openSaldoSheet,
    closeSaldoSheet: closeSaldoSheet,
  };

  document.addEventListener('DOMContentLoaded', init);
})();
