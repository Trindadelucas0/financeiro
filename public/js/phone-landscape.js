(function () {
  'use strict';

  function isPhoneLandscape() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    return w > h && h <= 600;
  }

  function apply() {
    document.documentElement.classList.toggle('is-phone-landscape', isPhoneLandscape());
  }

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', function () {
    setTimeout(apply, 50);
    setTimeout(apply, 300);
  });

  window.FinancePhoneLandscape = { apply: apply, isActive: isPhoneLandscape };
})();
