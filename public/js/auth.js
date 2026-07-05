(function () {
  'use strict';

  const { apiFetch, setSession, clearSession, getToken, getUser } = window.FinanceAPI;

  async function login(email, password) {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setSession(data.token, data.user);
    window.location.href = '/app/dashboard';
  }

  function logout() {
    clearSession();
    window.location.href = '/login';
  }

  function requireAuth() {
    if (!getToken()) {
      window.location.href = '/login';
      return false;
    }
    return true;
  }

  function requireAdmin() {
    if (!requireAuth()) return false;
    const user = getUser();
    if (!user || user.role !== 'admin') {
      window.location.href = '/app/dashboard';
      return false;
    }
    return true;
  }

  function initLoginPage() {
    const form = document.getElementById('loginForm');
    const errEl = document.getElementById('loginError');
    if (!form) return;

    if (getToken()) {
      window.location.href = '/app/dashboard';
      return;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.hidden = true;
      const email = form.email.value.trim();
      const password = form.password.value;
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        await login(email, password);
      } catch (err) {
        errEl.textContent = err.message || 'Falha no login';
        errEl.hidden = false;
        btn.disabled = false;
      }
    });
  }

  function initAppAuth() {
    if (!requireAuth()) return;
    const user = getUser();
    const nameEl = document.getElementById('userName');
    const logoutBtn = document.getElementById('logoutBtn');
    if (nameEl && user) nameEl.textContent = user.nome || user.email;
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    const adminLink = document.getElementById('adminLink');
    if (adminLink && user && user.role === 'admin') {
      adminLink.hidden = false;
    }
  }

  window.FinanceAuth = {
    login,
    logout,
    requireAuth,
    requireAdmin,
    initLoginPage,
    initAppAuth,
  };
})();
