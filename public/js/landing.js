(function () {
  var nav = document.getElementById('landingNav');
  var reveals = document.querySelectorAll('.landing-reveal');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function onLandscapeChange() {
    if (!window.FinancePhoneLandscape || !window.FinancePhoneLandscape.isActive()) return;
    var showcase = document.querySelector('.landing-showcase');
    if (showcase) {
      requestAnimationFrame(function () {
        showcase.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
      });
    }
  }

  window.addEventListener('orientationchange', function () {
    setTimeout(onLandscapeChange, 350);
  });
  window.addEventListener('resize', onLandscapeChange);

  if (nav) {
    window.addEventListener('scroll', function () {
      if (window.scrollY > 8) {
        nav.classList.add('nav-scrolled');
      } else {
        nav.classList.remove('nav-scrolled');
      }
    }, { passive: true });
  }

  if (reducedMotion || !reveals.length) {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }

  if (!('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }

  reveals.forEach(function (el) {
    if (el.classList.contains('is-visible')) return;
    var rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.classList.add('is-visible');
    }
  });

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0, rootMargin: '0px 0px 80px 0px' });

  reveals.forEach(function (el) {
    if (el.classList.contains('is-visible')) return;
    observer.observe(el);
  });
})();
