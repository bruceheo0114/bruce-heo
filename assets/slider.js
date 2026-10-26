/* 홈페이지 가로 슬라이드(첫 화면·주요 내용). scroll-snap 위에 탭·화살표·자동 넘김·해시 이동만 얹는다. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setup(root) {
    var track = root.querySelector('[data-slider-track]');
    if (!track) return null;
    var slides = Array.prototype.slice.call(track.children);
    var tabs = root.querySelectorAll('[data-slide-to]');
    var current = 0, timer = null;

    function fit() { var el = slides[current]; if (el) track.style.height = el.offsetHeight + 'px'; }
    function mark() {
      current = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
      fit();
      tabs.forEach(function (t) {
        var on = +t.getAttribute('data-slide-to') === current;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.setAttribute('aria-current', on ? 'true' : 'false');
        if (on && t.scrollIntoView && t.parentNode.scrollWidth > t.parentNode.clientWidth) {
          t.parentNode.scrollTo({ left: t.offsetLeft - 16, behavior: reduce ? 'auto' : 'smooth' });
        }
      });
      slides.forEach(function (s, i) { s.toggleAttribute('inert', i !== current); });
    }
    function go(i, instant) {
      current = (i + slides.length) % slides.length;
      track.scrollTo({ left: track.clientWidth * current, behavior: instant || reduce ? 'auto' : 'smooth' });
      if (instant) mark();
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    track.addEventListener('scroll', function () { window.requestAnimationFrame(mark); }, { passive: true });
    window.addEventListener('resize', function () { go(current, true); });
    window.addEventListener('load', fit);
    tabs.forEach(function (t) { t.addEventListener('click', function () { stop(); go(+t.getAttribute('data-slide-to')); }); });
    root.querySelectorAll('[data-slide-prev]').forEach(function (b) { b.addEventListener('click', function () { stop(); go(current - 1); }); });
    root.querySelectorAll('[data-slide-next]').forEach(function (b) { b.addEventListener('click', function () { stop(); go(current + 1); }); });
    ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(function (ev) { root.addEventListener(ev, stop, { passive: true }); });
    if ('ResizeObserver' in window) slides.forEach(function (s) { new ResizeObserver(fit).observe(s); });

    var delay = +root.getAttribute('data-autoplay');
    if (delay && !reduce) timer = setInterval(function () { go(current + 1); }, delay);
    mark();

    return {
      // id 가 이 슬라이더의 어느 슬라이드 안에 있으면 그 슬라이드로 넘긴다
      show: function (id) {
        var el = document.getElementById(id);
        if (!el || !track.contains(el)) return false;
        for (var i = 0; i < slides.length; i++) {
          if (slides[i].contains(el)) { stop(); go(i, true); return true; }
        }
        return false;
      },
      root: root
    };
  }

  var sliders = Array.prototype.map.call(document.querySelectorAll('[data-slider]'), setup).filter(Boolean);

  function openHash(hash, scroll) {
    var id = (hash || '').replace(/^#/, '');
    if (!id) return false;
    for (var i = 0; i < sliders.length; i++) {
      if (sliders[i].show(id)) {
        if (scroll) sliders[i].root.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        return true;
      }
    }
    return false;
  }

  if (location.hash) window.addEventListener('load', function () { openHash(location.hash, true); });
  window.addEventListener('hashchange', function () { openHash(location.hash, true); });
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="#"]');
    if (!a) return;
    var url = new URL(a.getAttribute('href'), location.href);
    if (url.pathname !== location.pathname || !url.hash) return;
    if (openHash(url.hash, true)) { e.preventDefault(); history.replaceState(null, '', url.hash); }
  });
}());
