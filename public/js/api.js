(function () {
  'use strict';

  const TOKEN_KEY = 'financeiro_token';
  const LEGACY_KEYS = ['financeiro_user', 'financeiro_subscription', 'financeiro_pricing'];

  let sessionCache = {
    user: null,
    subscription: null,
    pricing: null,
  };

  function purgeLegacySessionData() {
    LEGACY_KEYS.forEach(function (key) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  }

  function migrateLegacyToken() {
    const legacyToken = sessionStorage.getItem(TOKEN_KEY);
    if (legacyToken && !localStorage.getItem(TOKEN_KEY)) {
      localStorage.setItem(TOKEN_KEY, legacyToken);
    }
    sessionStorage.removeItem(TOKEN_KEY);
    purgeLegacySessionData();
  }

  migrateLegacyToken();

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setSession(token, user, subscription, pricing) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    }
    if (user !== undefined) sessionCache.user = user;
    if (subscription !== undefined) sessionCache.subscription = subscription;
    if (pricing !== undefined) sessionCache.pricing = pricing;
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionCache = { user: null, subscription: null, pricing: null };
    purgeLegacySessionData();
  }

  function getUser() {
    return sessionCache.user;
  }

  function getSubscription() {
    return sessionCache.subscription;
  }

  function getPricing() {
    return sessionCache.pricing;
  }

  async function apiFetch(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    const isFormData = options.body instanceof FormData;
    if (!isFormData && options.body && typeof options.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    } else if (!isFormData && options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(path, { ...options, headers });

    if (res.status === 401) {
      clearSession();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      throw new Error('Não autorizado');
    }

    if (res.status === 204) return null;

    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const payload = isJson ? await res.json() : await res.blob();

    if (!res.ok) {
      const msg = isJson && payload && payload.error ? payload.error : 'Erro na requisição';
      const err = new Error(msg);
      if (isJson && payload) {
        err.code = payload.code;
        err.status = res.status;
        err.payload = payload;
      }

      if (res.status === 402) {
        const code = isJson && payload ? payload.code : null;
        if (code === 'SUBSCRIPTION_REQUIRED' || code === 'PRO_REQUIRED') {
          const path = window.location.pathname;
          const params = new URLSearchParams(window.location.search);
          const onPaywall = path === '/app/perfil' || path.startsWith('/app/perfil');
          const checkoutFlow = params.get('checkout') === 'success';
          const msg = (isJson && payload && payload.error)
            ? payload.error
            : 'Sua assinatura expirou. Renove o acesso Pro para continuar.';

          document.dispatchEvent(new CustomEvent('finance:subscription-required', {
            detail: { message: msg, code: code },
          }));

          if (!onPaywall && !checkoutFlow) {
            try {
              sessionStorage.setItem('finance_subscription_toast', msg);
            } catch (e) { /* ignore */ }
            // Delay so toast/banner can render before navigation wipes the page
            setTimeout(function () {
              window.location.href = '/app/perfil?assinatura=expirada';
            }, 900);
          }
        }
      }

      throw err;
    }

    return payload;
  }

  window.FinanceAPI = {
    TOKEN_KEY,
    getToken,
    setSession,
    clearSession,
    getUser,
    getSubscription,
    getPricing,
    apiFetch,
  };
})();
