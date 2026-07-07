(function () {
  'use strict';

  const { apiFetch } = window.FinanceAPI;

  let cachedPublicKey = null;
  let localSubscription = null;

  function isSupported() {
    return 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
  }

  async function getRegistration() {
    return navigator.serviceWorker.ready;
  }

  async function fetchPublicKey() {
    if (cachedPublicKey) return cachedPublicKey;
    const data = await apiFetch('/api/push/vapid-public-key');
    cachedPublicKey = data.publicKey;
    return cachedPublicKey;
  }

  async function getLocalSubscription() {
    if (localSubscription) return localSubscription;
    const reg = await getRegistration();
    localSubscription = await reg.pushManager.getSubscription();
    return localSubscription;
  }

  function detectTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
    } catch (_) {
      return 'America/Sao_Paulo';
    }
  }

  function getGreetingHint() {
    return 'Saudações do dia: café 7h, almoço 12h, lanche 15h e boa noite 21h no seu horário local.';
  }

  function getSupportHint() {
    if (!isSupported()) {
      if (isIos() && !isStandalone()) {
        return 'No iPhone, instale o app na tela inicial para receber notificações push.';
      }
      return 'Seu navegador não suporta notificações push.';
    }
    if (Notification.permission === 'denied') {
      return 'Notificações bloqueadas. Ative nas configurações do navegador ou do sistema.';
    }
    return 'Receba avisos de contas a vencer, atrasadas, orçamento e assinatura — mesmo com o app fechado.';
  }

  async function loadStatus() {
    if (!isSupported()) {
      return {
        supported: false,
        pushEnabled: false,
        subscribed: false,
        permission: Notification.permission,
        preferences: null,
        hint: getSupportHint(),
      };
    }

    try {
      const data = await apiFetch('/api/push/preferences');
      const sub = await getLocalSubscription();
      return {
        supported: true,
        pushEnabled: Boolean(data.pushEnabled),
        subscribed: Boolean(data.subscribed) || Boolean(sub),
        permission: Notification.permission,
        preferences: data.preferences,
        hint: getSupportHint(),
      };
    } catch (err) {
      return {
        supported: true,
        pushEnabled: false,
        subscribed: false,
        permission: Notification.permission,
        preferences: null,
        hint: err.message || getSupportHint(),
      };
    }
  }

  async function subscribe() {
    if (!isSupported()) {
      throw new Error(getSupportHint());
    }

    if (isIos() && !isStandalone()) {
      throw new Error('No iPhone, adicione o app à tela inicial antes de ativar notificações.');
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Permissão de notificação negada.');
    }

    const publicKey = await fetchPublicKey();
    const reg = await getRegistration();
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const payload = sub.toJSON();
    await apiFetch('/api/push/subscribe', {
      method: 'POST',
      body: {
        endpoint: payload.endpoint,
        keys: payload.keys,
        timezone: detectTimezone(),
      },
    });

    localSubscription = sub;
    await apiFetch('/api/push/preferences', {
      method: 'PUT',
      body: { enabled: true },
    });

    return { subscribed: true };
  }

  async function unsubscribe() {
    const sub = await getLocalSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await apiFetch('/api/push/unsubscribe', {
        method: 'DELETE',
        body: { endpoint },
      });
      await sub.unsubscribe();
      localSubscription = null;
    }

    await apiFetch('/api/push/preferences', {
      method: 'PUT',
      body: { enabled: false },
    });

    return { subscribed: false };
  }

  async function savePreferences(prefs) {
    const data = await apiFetch('/api/push/preferences', {
      method: 'PUT',
      body: prefs,
    });
    return data.preferences;
  }

  async function isPushActive() {
    if (!isSupported() || Notification.permission !== 'granted') return false;
    try {
      const status = await loadStatus();
      return Boolean(status.pushEnabled && status.subscribed && status.preferences && status.preferences.enabled);
    } catch (_) {
      return false;
    }
  }

  window.FinancePush = {
    isSupported,
    isPushActive,
    loadStatus,
    subscribe,
    unsubscribe,
    savePreferences,
    detectTimezone,
    getSupportHint,
    getGreetingHint,
  };
})();
