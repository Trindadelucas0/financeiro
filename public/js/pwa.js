(function () {
  'use strict';

  let deferredPrompt = null;
  let isStandalone = false;

  function detectStandalone() {
    isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function canInstall() {
    return !!deferredPrompt && !isStandalone;
  }

  function init() {
    detectStandalone();

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      document.dispatchEvent(new CustomEvent('pwa-install-ready'));
    });

    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      isStandalone = true;
      document.dispatchEvent(new CustomEvent('pwa-installed'));
    });
  }

  async function promptInstall() {
    if (!deferredPrompt) return { outcome: 'unavailable' };
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return { outcome: result.outcome };
  }

  function getInstallHint() {
    if (isStandalone) return 'App já instalado neste dispositivo.';
    if (canInstall()) return 'Instale para acesso rápido na tela inicial.';
    if (isIos()) return 'No iPhone: toque em Compartilhar → Adicionar à Tela de Início.';
    return 'No Chrome ou Edge: menu do navegador → Instalar aplicativo.';
  }

  window.FinancePWA = {
    init,
    promptInstall,
    canInstall,
    isStandalone: function () { return isStandalone; },
    getInstallHint,
  };

  init();
})();
