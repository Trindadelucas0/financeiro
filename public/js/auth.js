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

  function updateAdminNav(user) {
    const adminLink = document.getElementById('adminLink');
    const adminClientsLink = document.getElementById('adminClientsLink');
    const isAdmin = Boolean(user && user.role === 'admin');

    if (adminLink) adminLink.hidden = !isAdmin;
    if (adminClientsLink) adminClientsLink.hidden = !isAdmin;
  }

  function updateUserUi(user) {
    const nameEl = document.getElementById('userName');
    const profileLink = document.getElementById('profileLink');
    const profileLabel = document.getElementById('profileLinkLabel');
    const profileAvatar = document.getElementById('profileLinkAvatar');
    const mobileAvatar = document.getElementById('topbarMobileAvatar');

    if (nameEl && user) nameEl.textContent = displayName(user);
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
    updateAdminNav(user);
  }

  function showForcePasswordForm() {
    const loginForm = document.getElementById('loginForm');
    const forceForm = document.getElementById('forcePasswordForm');
    const subtitle = document.getElementById('loginSubtitle');
    const checkoutWelcome = document.getElementById('checkoutWelcome');
    if (loginForm) loginForm.hidden = true;
    if (forceForm) forceForm.hidden = false;
    if (subtitle) subtitle.hidden = true;
    if (checkoutWelcome) checkoutWelcome.hidden = true;
  }

  function showWelcomeGrantModal(grantType) {
    return new Promise(function (resolve) {
      const dialog = document.getElementById('welcomeGrantDialog');
      const title = document.getElementById('welcomeGrantTitle');
      const message = document.getElementById('welcomeGrantMessage');
      const okBtn = document.getElementById('welcomeGrantOk');

      if (!dialog || !title || !message || !okBtn) {
        resolve();
        return;
      }

      if (grantType === 'lifetime') {
        title.textContent = 'Acesso vitalício liberado!';
        message.textContent = 'Você recebeu acesso vitalício ao painel. Agora defina sua senha pessoal para continuar.';
      } else {
        title.textContent = 'Você ganhou 30 dias grátis!';
        message.textContent = 'Seu acesso Pro está liberado por 30 dias. Defina sua senha para entrar no painel.';
      }

      function closeModal() {
        okBtn.removeEventListener('click', onOk);
        dialog.removeEventListener('cancel', onOk);
        if (dialog.open) dialog.close();
        resolve();
      }

      function onOk(e) {
        if (e) e.preventDefault();
        closeModal();
      }

      okBtn.addEventListener('click', onOk);
      dialog.addEventListener('cancel', onOk);
      dialog.showModal();
    });
  }

  function hasActiveSubscription(user, subscription) {
    if (user && user.role === 'admin') return true;
    return Boolean(subscription && subscription.isPro);
  }

  function redirectToPaywallIfNeeded() {
    const user = getUser();
    const subscription = getSubscription();
    if (hasActiveSubscription(user, subscription)) return false;

    const path = window.location.pathname;
    if (path === '/app/perfil' || path.startsWith('/app/perfil')) return false;

    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') return false;

    window.location.href = '/app/perfil?assinatura=expirada';
    return true;
  }

  function goToAppHome() {
    const user = getUser();
    const subscription = getSubscription();
    if (hasActiveSubscription(user, subscription)) {
      window.location.href = '/app/dashboard';
    } else {
      window.location.href = '/app/perfil?assinatura=expirada';
    }
  }

  function goToDashboard() {
    goToAppHome();
  }

  async function login(identifier, password) {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { identifier, password },
    });
    setSession(data.token, data.user, data.subscription || null, data.pricing || null);

    if (data.user && data.user.mustChangePassword) {
      if (data.welcomeGrant) {
        await showWelcomeGrantModal(data.welcomeGrant);
      }
      showForcePasswordForm();
      return data;
    }

    goToDashboard();
    return data;
  }

  async function submitRequiredPassword(newPassword) {
    const data = await apiFetch('/api/auth/me/password-required', {
      method: 'PATCH',
      body: { newPassword },
    });
    const token = getToken();
    if (data && data.user) {
      setSession(token, data.user, data.subscription || null, data.pricing || null);
    }
    goToDashboard();
    return data;
  }

  function cleanCheckoutQuery() {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('checkout')) return;

    params.delete('checkout');
    params.delete('order_nsu');
    params.delete('transaction_nsu');
    params.delete('slug');
    params.delete('receipt_url');
    params.delete('capture_method');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
  }

  function renderWelcome(data) {
    const welcome = document.getElementById('checkoutWelcome');
    const hint = document.getElementById('checkoutWelcomeHint');
    const credentials = document.getElementById('checkoutCredentials');
    const pending = document.getElementById('checkoutPending');
    const passwordRow = document.getElementById('welcomePasswordRow');
    const subtitle = document.getElementById('loginSubtitle');

    if (!welcome) return;

    welcome.hidden = false;
    if (subtitle) subtitle.textContent = 'Entre com as credenciais abaixo';

    if (data.pending) {
      if (hint) hint.textContent = data.message || 'Confirmando pagamento…';
      if (pending) pending.hidden = false;
      if (credentials) credentials.hidden = true;
      return;
    }

    if (pending) pending.hidden = true;
    if (hint) hint.textContent = data.loginHint || 'Use os dados abaixo para entrar.';
    if (credentials) credentials.hidden = false;

    const emailEl = document.getElementById('welcomeEmail');
    const usernameEl = document.getElementById('welcomeUsername');
    const passwordEl = document.getElementById('welcomePassword');
    const identifierInput = document.getElementById('identifier');
    const passwordInput = document.getElementById('password');

    if (emailEl) emailEl.textContent = data.email || '—';
    if (usernameEl) usernameEl.textContent = data.username ? '@' + data.username : '—';

    if (data.isNewAccount && data.tempPassword) {
      if (passwordRow) passwordRow.hidden = false;
      if (passwordEl) passwordEl.textContent = data.tempPassword;
      if (identifierInput) identifierInput.value = data.email || '';
      if (passwordInput) passwordInput.value = data.tempPassword;
    } else {
      if (passwordRow) passwordRow.hidden = true;
      if (identifierInput) identifierInput.value = data.email || '';
    }
  }

  async function handleCheckoutSuccess() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') !== 'success') return;

    const orderNsu = params.get('order_nsu');
    if (!orderNsu) return;

    const transactionNsu = params.get('transaction_nsu');
    const slug = params.get('slug');

    async function fetchWelcome() {
      const query = new URLSearchParams({ order_nsu: orderNsu });
      if (transactionNsu) query.set('transaction_nsu', transactionNsu);
      if (slug) query.set('slug', slug);
      return apiFetch('/api/payments/welcome?' + query.toString());
    }

    try {
      const data = await fetchWelcome();
      renderWelcome(data);

      if (data.pending) {
        setTimeout(async function () {
          try {
            const retry = await fetchWelcome();
            renderWelcome(retry);
          } catch (err) {
            const hint = document.getElementById('checkoutWelcomeHint');
            if (hint) hint.textContent = err.message || 'Não foi possível confirmar o pagamento.';
          }
        }, 2500);
      }
    } catch (err) {
      const welcome = document.getElementById('checkoutWelcome');
      const hint = document.getElementById('checkoutWelcomeHint');
      if (welcome) welcome.hidden = false;
      if (hint) {
        hint.textContent = err.message || 'Não foi possível carregar os dados do pagamento.';
      }
    } finally {
      cleanCheckoutQuery();
    }
  }

  async function refreshSession() {
    const token = getToken();
    if (!token) return null;
    try {
      const data = await apiFetch('/api/auth/me');
      if (data && data.user) {
        setSession(token, data.user, data.subscription || null, data.pricing || null);
        updateUserUi(data.user);
        updateRenewalBanner();
        redirectToPaywallIfNeeded();
        return data.user;
      }
    } catch {
      return null;
    }
    return getUser();
  }

  function renewalDaysLabel(days) {
    if (days === 1) return '1 dia';
    return days + ' dias';
  }

  function updateRenewalBanner() {
    const user = getUser();
    const sub = getSubscription();
    const topbar = document.getElementById('renewalTopbar');

    if (topbar) {
      if (user && user.role === 'admin') {
        topbar.hidden = true;
      } else if (sub && sub.renewalDueSoon) {
        const days = sub.daysUntilExpiry || 0;
        topbar.innerHTML =
          '<div class="renewal-topbar-inner" role="status">' +
            '<span class="renewal-topbar-text">Sua assinatura expira em ' + renewalDaysLabel(days) + '.</span>' +
            '<a href="/app/perfil" class="renewal-topbar-cta">Renovar acesso</a>' +
          '</div>';
        topbar.hidden = false;
      } else {
        topbar.hidden = true;
      }
    }

    if (window.FinanceRenewalReminder && sub) {
      FinanceRenewalReminder.maybeNotify(sub);
    }
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

  async function requireAdminAsync() {
    if (!requireAuth()) return false;
    const user = getUser() || await refreshSession();
    if (!user || user.role !== 'admin') {
      window.location.href = '/app/dashboard';
      return false;
    }
    return true;
  }

  function initLoginPage() {
    const form = document.getElementById('loginForm');
    const forceForm = document.getElementById('forcePasswordForm');
    const errEl = document.getElementById('loginError');
    const forceErrEl = document.getElementById('forcePasswordError');

    handleCheckoutSuccess();

    if (getToken()) {
      refreshSession().then(function (user) {
        if (!user) return;
        if (user.mustChangePassword) {
          showForcePasswordForm();
          return;
        }
        if (!window.location.search.includes('checkout=success')) {
          goToDashboard();
        }
      });
      if (!form) return;
    }

    if (!form) return;

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

    if (forceForm) {
      forceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (forceErrEl) forceErrEl.hidden = true;

        const newPass = document.getElementById('newPassword').value;
        const confirmPass = document.getElementById('confirmPassword').value;
        const btn = forceForm.querySelector('[type="submit"]');

        if (newPass.length < 6) {
          if (forceErrEl) {
            forceErrEl.textContent = 'A nova senha deve ter pelo menos 6 caracteres.';
            forceErrEl.hidden = false;
          }
          return;
        }

        if (newPass !== confirmPass) {
          if (forceErrEl) {
            forceErrEl.textContent = 'As senhas não coincidem.';
            forceErrEl.hidden = false;
          }
          return;
        }

        if (btn) btn.disabled = true;
        try {
          await submitRequiredPassword(newPass);
        } catch (err) {
          if (forceErrEl) {
            forceErrEl.textContent = err.message || 'Não foi possível atualizar a senha.';
            forceErrEl.hidden = false;
          }
          if (btn) btn.disabled = false;
        }
      });
    }
  }

  function bootLoginPage() {
    if (!window.FinanceAuth) return;
    initLoginPage();
  }

  async function initAppAuth() {
    if (!requireAuth()) return false;

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    const user = await refreshSession();
    if (!user) {
      clearSession();
      window.location.href = '/login';
      return false;
    }

    if (redirectToPaywallIfNeeded()) return false;
    return true;
  }

  window.FinanceAuth = {
    login,
    logout,
    requireAuth,
    requireAdmin,
    requireAdminAsync,
    refreshSession,
    initLoginPage,
    bootLoginPage,
    initAppAuth,
    displayName,
    updateUserUi,
    getSubscription,
    hasActiveSubscription,
    redirectToPaywallIfNeeded,
    goToAppHome,
    updateRenewalBanner,
  };
})();
