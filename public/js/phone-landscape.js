(function () {
  'use strict';

  function isPhoneLandscape() {
    var vv = window.visualViewport;
    var w = vv ? vv.width : window.innerWidth;
    var h = vv ? vv.height : window.innerHeight;
    return w > h && h <= 700;
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
