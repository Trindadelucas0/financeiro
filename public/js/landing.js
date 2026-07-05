(function () {
  var nav = document.getElementById('landingNav');
  var reveals = document.querySelectorAll('.landing-reveal');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0, rootMargin: '0px 0px -8px 0px' });

  reveals.forEach(function (el) { observer.observe(el); });
})();
