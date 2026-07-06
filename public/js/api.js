(function () {
  'use strict';

  const TOKEN_KEY = 'financeiro_token';
  const USER_KEY = 'financeiro_user';
  const SUBSCRIPTION_KEY = 'financeiro_subscription';
  const PRICING_KEY = 'financeiro_pricing';

  function migrateLegacySession() {
    const legacyToken = sessionStorage.getItem(TOKEN_KEY);
    const legacyUser = sessionStorage.getItem(USER_KEY);
    if (legacyToken && !localStorage.getItem(TOKEN_KEY)) {
      localStorage.setItem(TOKEN_KEY, legacyToken);
    }
    if (legacyUser && !localStorage.getItem(USER_KEY)) {
      localStorage.setItem(USER_KEY, legacyUser);
    }
    if (legacyToken) sessionStorage.removeItem(TOKEN_KEY);
    if (legacyUser) sessionStorage.removeItem(USER_KEY);
  }

  migrateLegacySession();

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setSession(token, user, subscription, pricing) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    if (subscription !== undefined) {
      localStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(subscription));
    }
    if (pricing !== undefined) {
      localStorage.setItem(PRICING_KEY, JSON.stringify(pricing));
    }
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(SUBSCRIPTION_KEY);
    sessionStorage.removeItem(PRICING_KEY);
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SUBSCRIPTION_KEY);
    localStorage.removeItem(PRICING_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(SUBSCRIPTION_KEY);
    sessionStorage.removeItem(PRICING_KEY);
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function getSubscription() {
    try {
      const raw = localStorage.getItem(SUBSCRIPTION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function getPricing() {
    try {
      const raw = localStorage.getItem(PRICING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
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
          if (!onPaywall && !checkoutFlow) {
            window.location.href = '/app/perfil?assinatura=expirada';
          }
        }
      }

      throw err;
    }

    return payload;
  }

  window.FinanceAPI = {
    TOKEN_KEY,
    USER_KEY,
    SUBSCRIPTION_KEY,
    PRICING_KEY,
    getToken,
    setSession,
    clearSession,
    getUser,
    getSubscription,
    getPricing,
    apiFetch,
  };
})();
