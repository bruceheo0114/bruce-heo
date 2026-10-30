/* 홈페이지 가로 슬라이드(첫 화면·주요 내용)와 모바일 캐러셀(peek·coverflow·card stack).
   좁은 화면에서 주요 내용은 세로 스크롤, 첫 화면은 버튼으로만 넘긴다(data-mobile).
   scroll-snap 위에 탭·화살표·자동 넘김(프로그레스 바)·마우스 드래그·해시 이동만 얹는다. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var slice = function (list) { return Array.prototype.slice.call(list); };

  // 터치는 scroll-snap 이 처리하니, 마우스로 끌어 넘기기만 보탠다. 끌었으면 링크 클릭은 막는다.
  function mouseDrag(track, onStart, onEnd) {
    var down = false, moved = false, startX = 0, startLeft = 0;
    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; moved = false; startX = e.clientX; startLeft = track.scrollLeft;
      if (onStart) onStart();
    });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      if (!moved && Math.abs(dx) < 6) return;
      if (!moved) { moved = true; track.classList.add('is-dragging'); }
      track.scrollLeft = startLeft - dx;
    });
    window.addEventListener('pointerup', function (e) {
      if (!down) return;
      down = false;
      if (!moved) return;
      track.classList.remove('is-dragging');
      onEnd(e.clientX - startX);
    });
    track.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
    }, true);
    track.addEventListener('dragstart', function (e) { e.preventDefault(); });
  }

  function step(dx) { return dx < -40 ? 1 : dx > 40 ? -1 : 0; }

  // 좁은 화면(모바일·태블릿)에서 슬라이더를 다르게 쓴다.
  // data-mobile="stack": 슬라이드를 세로로 쌓고 탭은 해당 섹션으로 이동하는 고정 메뉴가 된다(현재 위치 표시).
  // data-mobile="buttons": 자동 넘김과 손가락 스와이프를 끄고 버튼으로만 넘긴다.
  var narrow = window.matchMedia('(max-width: 899px)');

  function setup(root) {
    var track = root.querySelector('[data-slider-track]');
    if (!track) return null;
    var slides = slice(track.children);
    var tabs = root.querySelectorAll('[data-slide-to]');
    var current = 0, dragFrom = 0;
    var equal = root.hasAttribute('data-equal');
    var mode = root.getAttribute('data-mobile');
    var stacked = false;

    // data-equal 이면 슬라이드 높이를 가장 긴 것에 맞춰 두어(CSS stretch) 넘길 때 아래 내용이 들썩이지 않게 한다
    function fit() {
      if (stacked) { track.style.height = ''; return; }
      var el = slides[current];
      if (el && !equal) track.style.height = el.offsetHeight + 'px';
    }
    function paint() {
      tabs.forEach(function (t) {
        var on = +t.getAttribute('data-slide-to') === current;
        if (t.getAttribute('aria-selected') === (on ? 'true' : 'false')) return;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.setAttribute('aria-current', on ? 'true' : 'false');
        if (on && t.parentNode.scrollWidth > t.parentNode.clientWidth) {
          t.parentNode.scrollTo({ left: t.offsetLeft - 16, behavior: reduce ? 'auto' : 'smooth' });
        }
      });
    }
    function mark() {
      if (stacked) return;
      current = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
      fit();
      paint();
      slides.forEach(function (s, i) { s.toggleAttribute('inert', i !== current); });
    }
    // 세로로 쌓였을 때: 고정 메뉴 바로 아래를 지난 마지막 섹션이 현재 섹션이다
    function spy() {
      if (!stacked) return;
      var line = root.querySelector('.main-slider__bar');
      line = line ? line.getBoundingClientRect().bottom + 24 : 140;
      var i = 0;
      slides.forEach(function (s, k) { if (s.getBoundingClientRect().top <= line) i = k; });
      current = i;
      paint();
    }
    function go(i, instant) {
      current = (i + slides.length) % slides.length;
      if (stacked) {
        slides[current].scrollIntoView({ behavior: instant || reduce ? 'auto' : 'smooth', block: 'start' });
        paint();
        return;
      }
      track.scrollTo({ left: track.clientWidth * current, behavior: instant || reduce ? 'auto' : 'smooth' });
      if (instant) mark();
    }
    // 자동 넘김은 현재 탭의 프로그레스 바 애니메이션이 끝날 때 다음으로 간다. 멈추면 바는 꽉 찬 채로 남는다.
    function stop() { root.classList.remove('is-autoplay'); }

    function layout() {
      var small = narrow.matches;
      root.classList.toggle('is-buttons', mode === 'buttons' && small);
      if (mode === 'buttons' && small) stop();
      if (mode !== 'stack') return;
      var was = stacked;
      stacked = small;
      root.classList.toggle('is-stacked', stacked);
      if (stacked) {
        slides.forEach(function (s) { s.removeAttribute('inert'); });
        fit();
        spy();
      } else if (was) {
        go(current, true);
      }
    }

    track.addEventListener('scroll', function () { window.requestAnimationFrame(mark); }, { passive: true });
    window.addEventListener('scroll', function () { window.requestAnimationFrame(spy); }, { passive: true });
    window.addEventListener('resize', function () { if (!stacked) go(current, true); });
    window.addEventListener('load', fit);
    tabs.forEach(function (t) { t.addEventListener('click', function () { stop(); go(+t.getAttribute('data-slide-to')); }); });
    root.querySelectorAll('[data-slide-prev]').forEach(function (b) { b.addEventListener('click', function () { stop(); go(current - 1); }); });
    root.querySelectorAll('[data-slide-next]').forEach(function (b) { b.addEventListener('click', function () { stop(); go(current + 1); }); });
    ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(function (ev) { root.addEventListener(ev, stop, { passive: true }); });
    if ('ResizeObserver' in window) slides.forEach(function (s) { new ResizeObserver(fit).observe(s); });
    if (root.hasAttribute('data-drag')) {
      mouseDrag(track, function () { dragFrom = current; }, function (dx) { go(dragFrom + step(dx)); });
    }
    if (narrow.addEventListener) narrow.addEventListener('change', layout); else narrow.addListener(layout);

    var delay = +root.getAttribute('data-autoplay');
    if (delay && !reduce && !(mode === 'buttons' && narrow.matches)) {
      root.style.setProperty('--autoplay', delay + 'ms');
      root.classList.add('is-autoplay');
      root.addEventListener('animationend', function (e) {
        if (e.target.hasAttribute('data-slide-progress') && root.classList.contains('is-autoplay')) go(current + 1);
      });
    }
    layout();
    mark();

    return {
      // id 가 이 슬라이더의 어느 슬라이드 안에 있으면 그 슬라이드로 넘긴다. 세로로 쌓였으면 브라우저 기본 이동에 맡긴다.
      show: function (id) {
        var el = document.getElementById(id);
        if (stacked || !el || !track.contains(el)) return false;
        for (var i = 0; i < slides.length; i++) {
          if (slides[i].contains(el)) { stop(); go(i, true); return true; }
        }
        return false;
      },
      root: root
    };
  }

  /* 모바일 캐러셀. data-carousel="peek|coverflow|stack", data-carousel-max 이하 폭에서만 켜고 그 위에서는 원래 그리드로 둔다. */
  function carousel(root) {
    var mode = root.getAttribute('data-carousel');
    var mq = window.matchMedia('(max-width: ' + (+root.getAttribute('data-carousel-max') || 899) + 'px)');
    var items = slice(root.children);
    var n = items.length, current = 0, on = false, dragFrom = 0;
    var label = root.getAttribute('data-carousel-label') || '카드';

    var bar = document.createElement('div');
    bar.className = 'carousel__bar carousel__bar--' + mode;
    var dots = [], counter = null;
    function button(cls, text, aria, fn) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = cls; b.textContent = text; b.setAttribute('aria-label', aria);
      b.addEventListener('click', fn);
      bar.appendChild(b);
      return b;
    }
    if (mode === 'stack') {
      button('carousel__arrow', '←', '이전 ' + label, function () { show(current - 1); });
      counter = document.createElement('span');
      counter.className = 'carousel__count';
      counter.setAttribute('aria-live', 'polite');
      bar.appendChild(counter);
      button('carousel__arrow', '→', '다음 ' + label, function () { show(current + 1); });
    } else {
      items.forEach(function (_, i) {
        dots.push(button('carousel__dot', '', label + ' ' + (i + 1) + ' / ' + n, function () { show(i); }));
      });
    }
    root.after(bar);

    function center(el) { return el.offsetLeft + el.offsetWidth / 2; }
    function nearest() {
      var mid = root.scrollLeft + root.clientWidth / 2, best = 0;
      items.forEach(function (el, i) { if (Math.abs(center(el) - mid) < Math.abs(center(items[best]) - mid)) best = i; });
      return best;
    }
    function paint() {
      dots.forEach(function (d, i) { d.setAttribute('aria-current', i === current ? 'true' : 'false'); });
      if (counter) counter.textContent = String(current + 1).padStart(2, '0') + ' / ' + String(n).padStart(2, '0');
      if (mode === 'stack') {
        items.forEach(function (el, i) {
          var d = (i - current + n) % n;
          el.setAttribute('data-pos', d === 0 ? '0' : d === n - 1 && n > 3 ? 'out' : d <= 2 ? String(d) : 'back');
          el.toggleAttribute('inert', d !== 0);
          el.style.transform = '';
        });
      }
    }
    // coverflow: 가운데 카드는 크게, 양옆은 거리만큼 기울이고 줄인다
    function flow() {
      if (mode !== 'coverflow') return;
      var mid = root.scrollLeft + root.clientWidth / 2;
      items.forEach(function (el) {
        var o = Math.max(-1, Math.min(1, (center(el) - mid) / el.offsetWidth));
        el.style.transform = 'perspective(1000px) rotateY(' + (o * 32).toFixed(1) + 'deg) scale(' + (1 - Math.abs(o) * 0.14).toFixed(3) + ')';
        el.style.opacity = (1 - Math.abs(o) * 0.35).toFixed(2);
        el.style.zIndex = String(10 - Math.round(Math.abs(o) * 4));
      });
    }
    function show(i) {
      current = (i + n) % n;
      if (mode === 'stack') { paint(); return; }
      var el = items[current];
      root.scrollTo({ left: center(el) - root.clientWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
    }

    root.addEventListener('scroll', function () {
      if (!on || mode === 'stack') return;
      window.requestAnimationFrame(function () { current = nearest(); paint(); flow(); });
    }, { passive: true });
    if (mode !== 'stack') {
      mouseDrag(root, function () { dragFrom = current; }, function (dx) { if (on) show(dragFrom + step(dx)); });
    } else {
      // 맨 위 카드를 손가락(마우스)으로 밀어 넘긴다. 세로 스크롤은 그대로 둔다(touch-action: pan-y).
      var startX = null, dx = 0, top = null;
      root.addEventListener('pointerdown', function (e) {
        if (!on || (e.pointerType === 'mouse' && e.button !== 0)) return;
        startX = e.clientX; dx = 0; top = items[current];
      });
      window.addEventListener('pointermove', function (e) {
        if (startX === null) return;
        dx = e.clientX - startX;
        if (Math.abs(dx) < 4) return;
        root.classList.add('is-dragging');
        top.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 24).toFixed(2) + 'deg)';
      });
      var release = function () {
        if (startX === null) return;
        startX = null;
        root.classList.remove('is-dragging');
        var s = step(dx);
        if (s) show(current + s); else top.style.transform = '';
      };
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
    }

    function toggle() {
      on = mq.matches;
      root.classList.toggle('is-carousel', on);
      bar.hidden = !on;
      if (on) { paint(); flow(); return; }
      items.forEach(function (el) {
        el.removeAttribute('data-pos'); el.removeAttribute('inert');
        el.style.transform = el.style.opacity = el.style.zIndex = '';
      });
    }
    if (mq.addEventListener) mq.addEventListener('change', toggle); else mq.addListener(toggle);
    window.addEventListener('resize', flow);
    toggle();
  }

  slice(document.querySelectorAll('[data-carousel]')).forEach(carousel);
  var sliders = slice(document.querySelectorAll('[data-slider]')).map(setup).filter(Boolean);

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
