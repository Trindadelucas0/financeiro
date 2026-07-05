(function () {
  'use strict';

  const { apiFetch, setSession, clearSession, getToken, getUser } = window.FinanceAPI;

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

    if (nameEl && user) nameEl.textContent = displayName(user);
    if (greetingEl && user) {
      greetingEl.textContent = (user.username ? '@' + user.username : displayName(user)) + ' · sincronizado';
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
    if (profileLink && user) profileLink.hidden = false;
  }

  async function login(identifier, password) {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { identifier, password },
    });
    setSession(data.token, data.user);
    window.location.href = '/app/dashboard';
  }

  async function refreshSession() {
    const token = getToken();
    if (!token) return null;
    try {
      const data = await apiFetch('/api/auth/me');
      if (data && data.user) {
        setSession(token, data.user);
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
      errEl.hidden = true;
      const identifier = form.identifier.value.trim();
      const password = form.password.value;
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      try {
        await login(identifier, password);
      } catch (err) {
        errEl.textContent = err.message || 'Falha no login';
        errEl.hidden = false;
        btn.disabled = false;
      }
    });
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
    initAppAuth,
    displayName,
    updateUserUi,
  };
})();
