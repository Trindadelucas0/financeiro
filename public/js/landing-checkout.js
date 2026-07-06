(function () {
  'use strict';

  function scrollToAcquire() {
    var target = document.getElementById('adquirir');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      var nomeInput = document.getElementById('acquireNome');
      if (nomeInput) nomeInput.focus();
    }
  }

  function showError(message) {
    var err = document.getElementById('acquireError');
    if (!err) return;
    err.textContent = message;
    err.hidden = !message;
  }

  async function startGuestCheckout(nome, email) {
    var res = await fetch('/api/payments/guest-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome, email: email }),
    });

    var data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }

    if (!res.ok) {
      var msg = (data && data.error) ? data.error : 'Não foi possível iniciar o checkout';
      if (res.status === 503) msg = 'Pagamentos em configuração. Tente novamente mais tarde.';
      throw new Error(msg);
    }

    if (!data || !data.url) {
      throw new Error('URL de checkout não retornada');
    }

    window.location.href = data.url;
  }

  function bindAcquireForm() {
    var form = document.getElementById('acquireForm');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      showError('');

      var nome = document.getElementById('acquireNome');
      var email = document.getElementById('acquireEmail');
      var btn = document.getElementById('acquireSubmit');

      var nomeVal = nome ? nome.value.trim() : '';
      var emailVal = email ? email.value.trim() : '';

      if (!nomeVal || nomeVal.length < 2) {
        showError('Informe seu nome completo.');
        return;
      }

      if (!emailVal || !emailVal.includes('@')) {
        showError('Informe um e-mail válido.');
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Abrindo checkout…';
      }

      try {
        await startGuestCheckout(nomeVal, emailVal);
      } catch (err) {
        showError(err.message || 'Não foi possível iniciar o checkout');
        if (btn) {
          btn.disabled = false;
          btn.textContent = btn.getAttribute('data-label') || 'Adquirir';
        }
      }
    });
  }

  function bindAcquireTriggers() {
    document.querySelectorAll('[data-scroll-acquire]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        scrollToAcquire();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bindAcquireForm();
    bindAcquireTriggers();
  });
})();
