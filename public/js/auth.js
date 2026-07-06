(function () {
  'use strict';

  if (!window.FinanceAPI) {
    console.error('[auth] FinanceAPI não carregou — verifique /js/api.js');
    window.FinanceAuth = {
      bootLoginPage: function () {},
      initLoginPage: function () {},
    };
    return;
  }

  const { apiFetch, setSession, clearSession, getToken, getUser, getSubscription, getPricing } = window.FinanceAPI;

  function displayName(user) {
    if (!user) return '—';
    return user.nome || user.username || user.email || '—';
  }

  function updateUserUi(user) {
    const nameEl = document.getElementById('userName');
    const greetingEl = document.getElementById('userGreeting');
    const profileLink = document.getElementById('profileLink');
    const profileLabel = document.getElementById('profileLinkLabel');
    const profileAvatar = document.getElementById('profileLinkAvatar');
    const mobileAvatar = document.getElementById('topbarMobileAvatar');

    if (nameEl && user) nameEl.textContent = displayName(user);
    if (greetingEl && user) {
      greetingEl.textContent = user.username ? '@' + user.username : displayName(user);
    }
    if (profileLabel && user) {
      profileLabel.textContent = user.username ? '@' + user.username : displayName(user);
    }
    if (profileAvatar && user) {
      const parts = String(user.nome || '').trim().split(/\s+/).filter(Boolean);
      profileAvatar.textContent = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : String(user.username || user.nome || '?').slice(0, 2).toUpperCase();
    }
    if (mobileAvatar && user) {
      const parts = String(user.nome || '').trim().split(/\s+/).filter(Boolean);
      mobileAvatar.textContent = parts.length >= 2
        ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
        : String(user.username || user.nome || '?').slice(0, 2).toUpperCase();
    }
    if (profileLink && user) profileLink.hidden = false;
  }

  async function login(identifier, password) {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { identifier, password },
    });
    setSession(data.token, data.user, data.subscription || null, data.pricing || null);
    window.location.href = '/app/dashboard';
  }

  async function refreshSession() {
    const token = getToken();
    if (!token) return null;
    try {
      const data = await apiFetch('/api/auth/me');
      if (data && data.user) {
        setSession(token, data.user, data.subscription || null, data.pricing || null);
        updateUserUi(data.user);
        return data.user;
      }
    } catch {
      return null;
    }
    return getUser();
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
      if (errEl) errEl.hidden = true;
      const identifierInput = form.querySelector('#identifier');
      const passwordInput = form.querySelector('#password');
      const identifier = identifierInput ? identifierInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';
      const btn = form.querySelector('[type="submit"]');

      if (!identifier || !password) {
        if (errEl) {
          errEl.textContent = 'Preencha usuário e senha.';
          errEl.hidden = false;
        }
        return;
      }

      if (btn) btn.disabled = true;
      try {
        await login(identifier, password);
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message || 'Falha no login';
          errEl.hidden = false;
        }
        if (btn) btn.disabled = false;
      }
    });
  }

  function bootLoginPage() {
    if (!window.FinanceAuth) return;
    initLoginPage();
  }

  function initAppAuth() {
    if (!requireAuth()) return;
    updateUserUi(getUser());

    refreshSession();

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    const adminLink = document.getElementById('adminLink');
    const user = getUser();
    if (adminLink && user && user.role === 'admin') {
      adminLink.hidden = false;
    }
  }

  window.FinanceAuth = {
    login,
    logout,
    requireAuth,
    requireAdmin,
    refreshSession,
    initLoginPage,
    bootLoginPage,
    initAppAuth,
    displayName,
    updateUserUi,
    getSubscription,
  };
})();
