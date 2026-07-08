(function () {
  'use strict';

  if (!window.FinanceAPI) {
    console.error('[register] FinanceAPI não carregou — verifique /js/api.js');
    return;
  }

  const { apiFetch, setSession, getToken } = window.FinanceAPI;

  async function register(nome, email, password) {
    const data = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: { nome, email, password },
    });
    setSession(data.token, data.user, data.subscription || null, data.pricing || null);
    window.location.href = '/app/dashboard';
    return data;
  }

  function initRegisterPage() {
    const form = document.getElementById('registerForm');
    const errEl = document.getElementById('registerError');
    if (!form) return;

    if (getToken()) {
      window.location.href = '/app/dashboard';
      return;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errEl) errEl.hidden = true;

      const nome = document.getElementById('nome').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const btn = form.querySelector('[type="submit"]');

      if (!nome || nome.length < 2) {
        if (errEl) {
          errEl.textContent = 'Informe seu nome completo.';
          errEl.hidden = false;
        }
        return;
      }

      if (!email || !email.includes('@')) {
        if (errEl) {
          errEl.textContent = 'Informe um e-mail válido.';
          errEl.hidden = false;
        }
        return;
      }

      if (password.length < 6) {
        if (errEl) {
          errEl.textContent = 'A senha deve ter pelo menos 6 caracteres.';
          errEl.hidden = false;
        }
        return;
      }

      if (password !== confirmPassword) {
        if (errEl) {
          errEl.textContent = 'As senhas não coincidem.';
          errEl.hidden = false;
        }
        return;
      }

      if (btn) btn.disabled = true;
      try {
        await register(nome, email, password);
      } catch (err) {
        let message = err.message || 'Não foi possível criar a conta';
        if (err.status === 409) {
          message = 'Este e-mail já está cadastrado. Entre com sua conta ou renove o acesso no perfil.';
        }
        if (errEl) {
          errEl.textContent = message;
          errEl.hidden = false;
        }
        if (btn) btn.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRegisterPage);
  } else {
    initRegisterPage();
  }
})();
