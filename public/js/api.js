(function () {
  'use strict';

  const TOKEN_KEY = 'financeiro_token';
  const USER_KEY = 'financeiro_user';

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function setSession(token, user) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  }

  function getUser() {
    try {
      const raw = sessionStorage.getItem(USER_KEY);
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
      throw new Error(msg);
    }

    return payload;
  }

  window.FinanceAPI = {
    TOKEN_KEY,
    USER_KEY,
    getToken,
    setSession,
    clearSession,
    getUser,
    apiFetch,
  };
})();
